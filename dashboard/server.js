const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PermissionFlagsBits: P, ChannelType } = require('discord.js');
const { getDb } = require('../utils/database');
const { getGuildSetting, setGuildSetting } = require('../utils/guildSettings');
const confession = require('../utils/confessionStore');
const { CHAT_ROLE_LEVELS } = require('../utils/levelRoles');
const { VOICE_ROLE_LEVELS } = require('../utils/voiceRoles');
const { customizationData, validateCustomization } = require('./customization');
const { getOptions, saveOptions, saveRewards, updateLegacyReward } = require('../utils/customization');
const { replaceXpExclusions } = require('../utils/xpExclusions');

const fields = [
  ['LEVEL_CHANNEL_ID', 'Kênh thông báo lên level', 'channel'],
  ['MONTHLY_RANK_CHANNEL_ID', 'Kênh tổng kết tháng', 'channel'],
  ['VNL_BOOSTER_ROLE_ID', 'Role Booster', 'role'],
  ...CHAT_ROLE_LEVELS.map(level => [`LEVEL_ROLE_${level}`, `Chat · Level ${level}`, 'role']),
  ...VOICE_ROLE_LEVELS.map(level => [`VOICE_ROLE_${level}`, `Voice · Level ${level}`, 'role']),
  ...['CHAT', 'VOICE'].flatMap(type => [1, 2, 3].map(rank => [`MONTHLY_${type}_TOP${rank}_ROLE_ID`, `${type} · Top ${rank} tháng`, 'role'])),
];
const random = () => crypto.randomBytes(32).toString('hex');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const canManage = guild => guild.owner || (BigInt(guild.permissions || 0) & P.Administrator) !== 0n;
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function cookie(req, name) {
  return (req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}
async function body(req) {
  if (!String(req.headers['content-type']).startsWith('application/json')) fail(415, 'Dữ liệu gửi lên không hợp lệ.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) fail(413, 'Dữ liệu quá lớn.');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(text); } catch { fail(400, 'Dữ liệu không hợp lệ.'); }
}

function createDashboard(client, options = {}) {
  const env = options.env || process.env;
  const fetchApi = options.fetch || fetch;
  const sessions = new Map();
  const states = new Map();
  const limits = new Map();
  const origin = env.DASHBOARD_URL ? new URL(env.DASHBOARD_URL).origin : '';
  const secure = origin.startsWith('https:');
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const configured = Boolean(env.DISCORD_CLIENT_SECRET && env.CLIENT_ID && (secure || local));
  const setCookie = (name, value, seconds) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure ? '; Secure' : ''}`;
  function prune() {
    const now = Date.now();
    for (const map of [sessions, states, limits]) for (const [key, value] of map) if (value.expires <= now) map.delete(key);
  }
  function rateLimit(key, max) {
    const entry = limits.get(key) || { count: 0, expires: Date.now() + 60000 };
    if (++entry.count > max || limits.size > 10000) fail(429, 'Bạn thao tác quá nhanh. Hãy thử lại sau một phút.');
    limits.set(key, entry);
  }
  async function discord(route, token) {
    const response = await fetchApi(`https://discord.com/api/v10${route}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000),
    });
    if (response.status === 401) fail(401, 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
    if (!response.ok) fail(502, 'Discord chưa phản hồi. Vui lòng thử lại.');
    return response.json();
  }
  async function userGuilds(token) {
    const result = [];
    let after = '';
    for (let page = 0; page < 10; page++) {
      const rows = await discord(`/users/@me/guilds?limit=200${after ? `&after=${after}` : ''}`, token);
      result.push(...rows);
      if (rows.length < 200) break;
      after = rows[rows.length - 1].id;
    }
    return result.filter(canManage);
  }
  function session(req) {
    const value = sessions.get(hash(cookie(req, 'vnl_session')));
    if (!value || value.expires <= Date.now()) fail(401, 'Hãy đăng nhập bằng Discord.');
    return value;
  }
  function csrf(req, value) {
    if (req.headers.origin !== origin || req.headers['x-csrf-token'] !== value.csrf) fail(403, 'Yêu cầu không hợp lệ. Hãy tải lại trang.');
  }
  async function managedGuild(id, value) {
    const guilds = await userGuilds(value.token);
    if (!guilds.some(guild => guild.id === id)) fail(403, 'Bạn cần quyền Administrator hoặc là chủ server để quản lý.');
    const guild = client.guilds.cache.get(id);
    if (!guild) fail(404, 'Hãy mời bot vào server này trước.');
    return guild;
  }
  const invite = id => `https://discord.com/oauth2/authorize?client_id=${env.CLIENT_ID || ''}&scope=bot%20applications.commands&permissions=309506198528&integration_type=0${id ? `&guild_id=${id}` : ''}`;
  function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
  function redirect(res, location, cookies) {
    res.writeHead(302, { Location: location, ...(cookies ? { 'Set-Cookie': cookies } : {}) }); res.end();
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://cdn.discordapp.com https://media.discordapp.net; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      prune();
      const url = new URL(req.url, 'http://internal');
      const route = url.pathname;
      if (req.method === 'GET' && route === '/health') return json(res, 200, { ok: true });
      if (req.method === 'GET' && route === '/auth/discord') {
        if (!configured) fail(503, 'Đăng nhập Discord chưa được cấu hình.');
        rateLimit(`login:${req.socket.remoteAddress}`, 30);
        if (states.size > 5000) fail(503, 'Hãy thử lại sau.');
        const state = random();
        const browserKey = random();
        states.set(hash(state), { browser: hash(browserKey), expires: Date.now() + 600000 });
        const params = new URLSearchParams({ client_id: env.CLIENT_ID, response_type: 'code', scope: 'identify guilds',
          redirect_uri: `${origin}/auth/callback`, state });
        return redirect(res, `https://discord.com/oauth2/authorize?${params}`, setCookie('vnl_oauth', browserKey, 600));
      }
      if (req.method === 'GET' && route === '/auth/callback') {
        const key = hash(url.searchParams.get('state') || '');
        const pending = states.get(key);
        states.delete(key);
        if (!configured || !pending || pending.browser !== hash(cookie(req, 'vnl_oauth'))) fail(400, 'Phiên đăng nhập không hợp lệ. Hãy thử lại từ trang chủ.');
        if (url.searchParams.has('error')) return redirect(res, '/?login=cancelled', setCookie('vnl_oauth', '', 0));
        const code = url.searchParams.get('code');
        if (!code) fail(400, 'Thiếu mã đăng nhập.');
        const response = await fetchApi('https://discord.com/api/v10/oauth2/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: env.CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code', code, redirect_uri: `${origin}/auth/callback` }), signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) fail(401, 'Không thể đăng nhập. Hãy thử lại.');
        const tokens = await response.json();
        const user = await discord('/users/@me', tokens.access_token);
        if (sessions.size > 5000) fail(503, 'Hãy thử lại sau.');
        const sid = random();
        sessions.delete(hash(cookie(req, 'vnl_session')));
        sessions.set(hash(sid), { token: tokens.access_token, csrf: random(), user: { id: user.id, name: user.global_name || user.username },
          expires: Date.now() + Math.min(Number(tokens.expires_in) || 3600, 3600) * 1000 });
        return redirect(res, '/', [setCookie('vnl_session', sid, 3600), setCookie('vnl_oauth', '', 0)]);
      }
      if (req.method === 'GET' && route === '/api/session') {
        let value;
        try { value = session(req); } catch { /* visitor */ }
        return json(res, 200, { user: value?.user || null, csrf: value?.csrf, configured, ready: client.isReady(), invite: invite() });
      }
      if (route.startsWith('/api/')) {
        const value = session(req);
        rateLimit(`session:${hash(cookie(req, 'vnl_session'))}`, 90);
        if (req.method !== 'GET') csrf(req, value);
        if (req.method === 'POST' && route === '/api/logout') {
          sessions.delete(hash(cookie(req, 'vnl_session')));
          res.setHeader('Set-Cookie', setCookie('vnl_session', '', 0));
          return json(res, 200, { ok: true });
        }
        if (!client.isReady()) fail(503, 'Bot đang kết nối. Vui lòng thử lại sau.');
        if (req.method === 'GET' && route === '/api/guilds') {
          return json(res, 200, (await userGuilds(value.token)).map(guild => ({ id: guild.id, name: guild.name,
            icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : null,
            installed: client.guilds.cache.has(guild.id), invite: invite(guild.id) })));
        }
        const match = /^\/api\/guilds\/(\d+)\/(settings|leaderboard)$/.exec(route);
        if (!match) fail(404, 'Không tìm thấy trang.');
        const guild = await managedGuild(match[1], value);
        if (match[2] === 'leaderboard' && req.method === 'GET') {
          const rows = getDb().prepare(`SELECT user_id, SUM(chat_xp) AS chatXp, SUM(voice_xp) AS voiceXp,
            SUM(chat_xp + voice_xp) AS totalXp FROM (
              SELECT user_id, total_xp AS chat_xp, 0 AS voice_xp FROM chat_levels WHERE guild_id = ?
              UNION ALL SELECT user_id, 0, total_xp FROM voice_levels WHERE guild_id = ?
            ) WHERE length(user_id) BETWEEN 17 AND 20 AND user_id NOT GLOB '*[^0-9]*'
            GROUP BY user_id ORDER BY totalXp DESC, user_id LIMIT 20`).all(guild.id, guild.id);
          const members = await Promise.all(rows.map(async row => {
            const member = await guild.members.fetch(row.user_id).catch(() => null);
            return { ...row, name: member?.displayName || `Thành viên ${row.user_id}`, bot: member?.user.bot || false };
          }));
          return json(res, 200, members.filter(member => !member.bot));
        }
        if (match[2] !== 'settings') fail(405, 'Thao tác không được hỗ trợ.');
        const [channels, roles] = await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
        const me = await guild.members.fetchMe();
        if (req.method === 'GET') {
          const current = Object.fromEntries(fields.map(([key]) => [key, getGuildSetting(guild.id, key)]));
          const conf = confession.getConfig(guild.id);
          const count = getDb().prepare("SELECT COUNT(DISTINCT user_id) AS count FROM (SELECT user_id FROM chat_levels WHERE guild_id = ? UNION SELECT user_id FROM voice_levels WHERE guild_id = ?) WHERE length(user_id) BETWEEN 17 AND 20 AND user_id NOT GLOB '*[^0-9]*'").get(guild.id, guild.id).count;
          return json(res, 200, { settings: current, fields, ...customizationData(guild, channels), confessionChannel: conf?.channel_id || null,
            stats: { members: guild.memberCount, tracked: count, confessions: conf?.counter || 0 },
            channels: [...channels.values()].filter(channel => channel && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)).map(channel => ({ id: channel.id, name: channel.name, type: channel.type })),
            roles: [...roles.values()].filter(role => role.id !== guild.id).map(role => ({ id: role.id, name: role.name, managed: role.managed,
              editable: !role.managed && me.permissions.has(P.ManageRoles) && me.roles.highest.comparePositionTo(role) > 0 })) });
        }
        if (req.method !== 'POST') fail(405, 'Thao tác không được hỗ trợ.');
        const input = await body(req);
        if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Dữ liệu không hợp lệ.');
        const optionsPatch = validateCustomization(input, guild, channels, roles, me);
        const changes = input.settings || {};
        if (typeof changes !== 'object' || Array.isArray(changes)) fail(400, 'Cấu hình không hợp lệ.');
        for (const [key, id] of Object.entries(changes)) {
          const field = fields.find(field => field[0] === key);
          if (!field || (id !== null && (typeof id !== 'string' || !/^\d+$/.test(id)))) fail(400, 'Mục cấu hình không hợp lệ.');
          if (id === null) continue;
          if (field[2] === 'channel') {
            const channel = channels.get(id);
            if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type) || channel.guildId !== guild.id) fail(400, 'Kênh không thuộc server này.');
            if (!channel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles])) fail(400, `Bot thiếu quyền gửi thông báo trong #${channel.name}.`);
          } else {
            const role = roles.get(id);
            if (!role || role.id === guild.id) fail(400, 'Role không thuộc server này.');
            if (key !== 'VNL_BOOSTER_ROLE_ID' && (role.managed || !me.permissions.has(P.ManageRoles) || me.roles.highest.comparePositionTo(role) <= 0)) fail(400, `Bot không thể cấp role ${role.name}. Hãy đặt role bot cao hơn và cấp Manage Roles.`);
          }
        }
        if (Object.hasOwn(input, 'confessionChannel')) {
          const channel = channels.get(input.confessionChannel);
          if (!channel || channel.type !== ChannelType.GuildText || channel.guildId !== guild.id) fail(400, 'Hãy chọn kênh confession của server này.');
          const custom = { ...getOptions(guild.id), ...optionsPatch };
          if (!channel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks, ...(custom.confessionThreads ? [P.CreatePublicThreads] : [])])) fail(400, 'Bot thiếu quyền gửi bài hoặc tạo luồng trong kênh confession.');
        }
        // Initialize tables before the transaction, then persist all validated changes together.
        getGuildSetting(guild.id, 'LEVEL_CHANNEL_ID'); confession.getConfig(guild.id);
        getDb().transaction(() => {
          for (const [key, id] of Object.entries(changes)) {
            setGuildSetting(guild.id, key, id);
            updateLegacyReward(guild.id, key, id);
          }
          if (Object.hasOwn(input, 'confessionChannel')) confession.setChannel(guild.id, input.confessionChannel);
          if (input.options !== undefined) saveOptions(guild.id, optionsPatch);
          if (input.rewards !== undefined) for (const [type, entries] of Object.entries(input.rewards)) saveRewards(guild.id, type, entries);
          if (input.exclusions !== undefined) replaceXpExclusions(guild.id, input.exclusions.map(id => ({ id, type: channels.get(id).type === ChannelType.GuildCategory ? 'category' : 'channel' })), getDb());
        })();
        return json(res, 200, { ok: true });
      }
      const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
      if (req.method === 'GET' && Object.hasOwn(assets, route)) {
        const [file, type] = assets[route];
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
        return res.end(fs.readFileSync(path.join(__dirname, 'public', file)));
      }
      fail(404, 'Không tìm thấy trang.');
    } catch (error) {
      if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại.' });
      else res.end();
      if (!error.status) console.error('[DASHBOARD] Request failed:', error.name);
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}

function startDashboard(client) {
  if (process.env.DASHBOARD_ENABLED !== 'true') return;
  let server;
  try { server = createDashboard(client); }
  catch { console.error('[DASHBOARD] Invalid DASHBOARD_URL. Bot continues without dashboard.'); return; }
  server.on('error', error => console.error('[DASHBOARD] Server error:', error.code));
  server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('[DASHBOARD] Web server ready.'));
  return server;
}
module.exports = { createDashboard, startDashboard, canManage };
