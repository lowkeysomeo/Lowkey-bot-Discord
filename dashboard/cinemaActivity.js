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
    if (!route.startsWith('/cinema-api/') && !route.startsWith('/activity/')) return false;
    if (env.CINEMA_ENABLED !== 'true') fail(503, 'Cinema chưa được bật bởi chủ bot.');
    for (const [key, value] of sessions) if (value.expires <= Date.now()) sessions.delete(key);
    if (route.startsWith('/activity/')) {
      const files = { '/activity/': ['index.html', 'text/html'], '/activity/main.js': ['main.js', 'text/javascript'], '/activity/style.css': ['style.css', 'text/css'] };
      if (req.method !== 'GET' || !files[route]) fail(404, 'Không tìm thấy Activity.');
      const [file, mime] = files[route];
      const target = path.join(__dirname, '../activity/dist', file);
      if (!fs.existsSync(target)) fail(503, 'Activity chưa được build.');
      res.removeHeader('X-Frame-Options');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors https://discord.com https://*.discord.com https://*.discordsays.com; base-uri 'none'; form-action 'none'");
      res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` });
      res.end(fs.readFileSync(target));
      return true;
    }
    if (req.method === 'GET' && route === '/cinema-api/config') { json(res, 200, { clientId: env.CLIENT_ID }); return true; }
    if (req.method === 'POST' && route === '/cinema-api/session') {
      if (!env.CLIENT_ID || !env.DISCORD_CLIENT_SECRET) fail(503, 'Cinema chưa được cấu hình OAuth.');
      if (req.headers.origin !== appOrigin) fail(403, 'Hãy mở Cinema từ Discord Activity.');
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
    const match = /^\/cinema-api\/guilds\/(\d+)\/state$/.exec(route);
    if (!match || req.method !== 'GET') fail(404, 'Không tìm thấy API Cinema.');
    const token = (req.headers.authorization || '').match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    const value = token && sessions.get(hash(token));
    if (!value) fail(401, 'Phiên xem đã hết hạn. Hãy mở lại Activity.');
    rateLimit(`cinema-viewer:${value.userId}`, 30);
    const guild = client.guilds.cache.get(match[1]);
    if (!guild) fail(403, 'Bot chưa có trong server này.');
    json(res, 200, await cinema.viewerState(guild, value.userId, env));
    return true;
  };
}
module.exports = { createCinemaActivity };
