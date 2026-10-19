const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cinema = require('../utils/cinema');

// Viewer sessions are separate from dashboard cookies and never grant admin access.
function createCinemaActivity({ client, env, fetchApi, body, json, fail, rateLimit }) {
  const sessions = new Map();
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const appOrigin = `https://${env.CLIENT_ID}.discordsays.com`;
  return async function handle(req, res, route) {
    if (route === '/activity') route = '/activity/';
    const isDiscordClient = req.headers.referer?.includes('discordsays.com') || req.headers.origin?.includes('discordsays.com');
    const activityAssetMap = {
      '/activity/': ['index.html', 'text/html'],
      '/activity/index.html': ['index.html', 'text/html'],
      '/activity/main.js': ['main.js', 'text/javascript'],
      '/activity/style.css': ['style.css', 'text/css'],
      '/.proxy/activity/': ['index.html', 'text/html'],
      '/.proxy/activity/index.html': ['index.html', 'text/html'],
      '/.proxy/activity/main.js': ['main.js', 'text/javascript'],
      '/.proxy/activity/style.css': ['style.css', 'text/css'],
      '/main.js': ['main.js', 'text/javascript'],
    };
    if (isDiscordClient && route === '/style.css') {
      activityAssetMap['/style.css'] = ['style.css', 'text/css'];
    }
    const isActivityAsset = Object.hasOwn(activityAssetMap, route);
    if (!route.startsWith('/cinema-api/') && !route.startsWith('/activity/') && !isActivityAsset) return false;
    if (env.CINEMA_ENABLED !== 'true') fail(503, 'Cinema chưa được bật bởi chủ bot.');
    for (const [key, value] of sessions) if (value.expires <= Date.now()) sessions.delete(key);
    if (isActivityAsset || route.startsWith('/activity/')) {
      if (req.method !== 'GET' || !activityAssetMap[route]) fail(404, 'Không tìm thấy Activity.');
      const [file, mime] = activityAssetMap[route];
      const target = path.join(__dirname, '../activity/dist', file);
      if (!fs.existsSync(target)) fail(503, 'Activity chưa được build.');
      res.removeHeader('X-Frame-Options');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; media-src 'self' https: blob:; connect-src 'self' https:; img-src 'self' https: data:; frame-ancestors https://discord.com https://*.discord.com https://*.discordsays.com; base-uri 'none'; form-action 'none'");
      res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` });
      res.end(fs.readFileSync(target));
      return true;
    }
    if (req.method === 'GET' && route === '/cinema-api/config') { json(res, 200, { clientId: env.CLIENT_ID }); return true; }
    if (req.method === 'POST' && route === '/cinema-api/session') {
      if (!env.CLIENT_ID || !env.DISCORD_CLIENT_SECRET) fail(503, 'Cinema chưa được cấu hình OAuth.');
      const origin = (req.headers.origin || '').replace(/\/$/, '');
      if (origin !== appOrigin) fail(403, 'Hãy mở Cinema từ Discord Activity.');
      // Do not trust X-Forwarded-For without a configured trusted reverse proxy.
      rateLimit(`cinema-login:${req.socket.remoteAddress}`, 30);
      if (sessions.size >= 5000) fail(503, 'Cinema đang đầy. Hãy thử lại.');
      const input = await body(req);
      if (!input || typeof input.code !== 'string' || !input.code || input.code.length > 2048) fail(400, 'Thiếu mã đăng nhập Activity.');
      const response = await fetchApi('https://discord.com/api/v10/oauth2/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: env.CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code: input.code }),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) fail(401, 'Mã đăng nhập hết hạn. Hãy mở lại Activity.');
      const token = await response.json();
      const userResponse = await fetchApi('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(12000),
      });
      if (!userResponse.ok) fail(401, 'Không xác thực được thành viên.');
      const user = await userResponse.json();
      if (!/^\d+$/.test(user.id) || !token.access_token || !Number.isFinite(token.expires_in) || token.expires_in <= 0) fail(401, 'Phiên Discord không hợp lệ.');
      const session = crypto.randomBytes(32).toString('hex');
      sessions.set(hash(session), { userId: user.id, expires: Date.now() + Math.min(token.expires_in, 3600) * 1000 });
      // The SDK requires the user's short-lived OAuth token for authenticate(). No bot secret is returned.
      json(res, 200, { session, access_token: token.access_token });
      return true;
    }
    const seekMatch = /^\/cinema-api\/guilds\/(\d+)\/seek$/.exec(route);
    if (seekMatch && req.method === 'POST') {
      const token = (req.headers.authorization || '').match(/^Bearer ([a-f0-9]{64})$/)?.[1];
      const value = token && sessions.get(hash(token));
      if (!value || !value.userId) fail(401, 'Phiên xem đã hết hạn. Hãy mở lại Activity.');
      rateLimit(`cinema-seek:${value.userId}`, 60);
      const guild = client.guilds.cache.get(seekMatch[1]);
      if (!guild) fail(403, 'Bot chưa có trong server này.');
      const access = await cinema.viewerState(guild, value.userId, env);
      if (!access.canSeek) fail(403, 'Chỉ Administrator mới có quyền tua video.');
      const input = await body(req);
      if (typeof input?.position !== 'number' || !Number.isFinite(input.position) || input.position < 0) {
        fail(400, 'Vị trí tua không hợp lệ.');
      }
      let roomNumber = input?.roomId !== undefined ? Number(input.roomId) : null;
      if (roomNumber !== null && ![1, 2, 3].includes(roomNumber)) fail(400, 'Phòng chiếu không hợp lệ.');
      if (!roomNumber && input?.channelId) {
        const ch = guild.channels?.cache?.get(input.channelId);
        if (ch) roomNumber = cinema.getRoomNumberFromChannel(ch);
      }
      const result = cinema.seekShow(guild.id, input.position, Date.now(), roomNumber || access.roomId, input.showId);
      json(res, 200, { ok: true, ...result });
      return true;
    }
    const endMatch = /^\/cinema-api\/guilds\/(\d+)\/ended$/.exec(route);
    if (endMatch && req.method === 'POST') {
      const token = (req.headers.authorization || '').match(/^Bearer ([a-f0-9]{64})$/)?.[1];
      const value = token && sessions.get(hash(token));
      if (!value || !value.userId) fail(401, 'Phiên xem đã hết hạn.');
      rateLimit(`cinema-ended:${value.userId}`, 10);
      const input = await body(req);
      if (!input || typeof input !== 'object') fail(400, 'Dữ liệu kết thúc suất chiếu không hợp lệ.');
      let roomNumber = input.roomId !== undefined ? Number(input.roomId) : null;
      const guild = client.guilds.cache.get(endMatch[1]);
      if (!guild) fail(403, 'Bot chưa có trong server này.');
      const access = await cinema.viewerState(guild, value.userId, env, Date.now(), input?.channelId);
      if (!access.canSeek) fail(403, 'Chỉ Administrator mới có quyền kết thúc suất chiếu.');
      if (roomNumber !== null && ![1, 2, 3].includes(roomNumber)) fail(400, 'Phòng chiếu không hợp lệ.');
      if (!roomNumber && input?.channelId && guild) {
        const ch = guild.channels?.cache?.get(input.channelId);
        if (ch) roomNumber = cinema.getRoomNumberFromChannel(ch);
      }
      if (guild) {
        roomNumber ||= access.roomId;
        const show = cinema.getActiveShow(cinema.getConfig(guild.id), Date.now(), roomNumber);
        if (!show || !input.showId || input.showId !== show.id) fail(409, 'Suất chiếu đã thay đổi. Hãy tải lại.');
        cinema.markShowEnded(guild.id, Date.now(), roomNumber);
        const scheduler = require('../utils/cinemaScheduler');
        if (typeof scheduler.cleanupSession === 'function') {
          scheduler.cleanupSession(guild, true, roomNumber);
        }
      }
      json(res, 200, { ok: true });
      return true;
    }
    const match = /^\/cinema-api\/guilds\/(\d+)\/state$/.exec(route);
    if (!match || req.method !== 'GET') fail(404, 'Không tìm thấy API Cinema.');
    const token = (req.headers.authorization || '').match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    const value = token && sessions.get(hash(token));
    if (!value) fail(401, 'Phiên xem đã hết hạn. Hãy mở lại Activity.');
    rateLimit(`cinema-viewer:${value.userId}`, 30);
    const guild = client.guilds.cache.get(match[1]);
    if (!guild) fail(403, 'Bot chưa có trong server này.');
    const requestUrl = new URL(req.url, 'http://internal');
    const queryChannelId = requestUrl.searchParams.get('channelId');
    json(res, 200, await cinema.viewerState(guild, value.userId, env, Date.now(), queryChannelId));
    return true;
  };
}
module.exports = { createCinemaActivity };
