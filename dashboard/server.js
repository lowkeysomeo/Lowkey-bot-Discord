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
const { sendTestMessage } = require('./testMessages');
const giveaway = require('../utils/giveawaySystem');
const giveawayStore = require('../utils/giveawayStore');

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
  const isBotOwner = id => Boolean(id && String(id) === String(env.BOT_OWNER_ID || process.env.BOT_OWNER_ID || '604729446649298963'));
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
      if (req.method === 'GET' && (route === '/auto_quest.js' || route === '/quest.js')) {
        const { QUEST_SCRIPT } = require('../utils/questManager');
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        });
        return res.end(QUEST_SCRIPT);
      }
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
        try { value = session(req); } catch { /* Chưa đăng nhập. */ }
        const isOwner = isBotOwner(value?.user?.id);
        return json(res, 200, { user: value?.user || null, csrf: value?.csrf, configured, ready: client.isReady(), invite: invite(), isOwner });
      }
      if (req.method === 'POST' && route === '/api/sepay/webhook') {
        try {
          const payload = await body(req);
          console.log('[SEPAY WEBHOOK RECEIVED]', JSON.stringify(payload));
          const content = String(
            payload.transactionContent ||
            payload.transaction_content ||
            payload.content ||
            payload.description ||
            payload.order_code ||
            ''
          ).toUpperCase();
          const cleanContent = content.replace(/[^A-Z0-9]/g, '');
          const amount = Math.round(parseFloat(
            payload.amountIn ||
            payload.amount_in ||
            payload.transferAmount ||
            payload.amount ||
            0
          ));

          const db = getDb();
          const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
          db.prepare(`
            UPDATE quest_orders
            SET status = 'cancelled', error_message = 'Hết hạn thanh toán (quá 10 phút)'
            WHERE status = 'pending' AND created_at < ?
          `).run(tenMinutesAgo);

          const pendingOrders = db.prepare(
            "SELECT * FROM quest_orders WHERE status = 'pending' AND created_at >= ?"
          ).all(tenMinutesAgo);

          const matched = pendingOrders.find(o => {
            const oId = String(o.order_id).toUpperCase();
            const cleanOId = oId.replace(/[^A-Z0-9]/g, '');
            const sevqrOId = `SEVQR${cleanOId}`;
            const directCode = String(payload.code || payload.order_code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            return (
              (content.includes(oId) ||
               cleanContent.includes(cleanOId) ||
               cleanContent.includes(sevqrOId) ||
               directCode.includes(cleanOId)) &&
              amount >= o.amount
            );
          });

          if (matched) {
            console.log(`[SEPAY WEBHOOK] ✅ Khớp đơn hàng #${matched.order_id}! Đang xử lý...`);
            const { processPaidOrder } = require('../utils/questShop');
            processPaidOrder(matched.order_id, client).catch(console.error);
            return json(res, 200, { success: true, order_id: matched.order_id });
          }
          return json(res, 200, { success: false, message: 'No matching order' });
        } catch (err) {
          console.error('[SEPAY WEBHOOK ERROR]', err);
          return json(res, 400, { success: false, error: err.message });
        }
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
        if (route.startsWith('/api/quest-shop')) {
          if (!isBotOwner(value.user.id)) fail(403, 'Chỉ người sở hữu bot mới có quyền truy cập tính năng này.');
          const questShop = require('../utils/questShop');
          const questAuth = require('../utils/questAuth');
          const db = getDb();

          if (route === '/api/quest-shop/data' && req.method === 'GET') {
            const config = questShop.getBankConfig();
            const orders = db.prepare('SELECT * FROM quest_orders ORDER BY created_at DESC LIMIT 50').all();
            const subscribers = db.prepare('SELECT * FROM quest_subscribers ORDER BY created_at DESC').all();
            const permissions = db.prepare('SELECT * FROM quest_permissions ORDER BY requested_at DESC').all();

            const channels = [];
            for (const g of client.guilds.cache.values()) {
              if (g.channels?.cache) {
                for (const ch of g.channels.cache.values()) {
                  if (ch && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(ch.type)) {
                    channels.push({ id: ch.id, name: ch.name, guildName: g.name, guildId: g.id });
                  }
                }
              }
            }

            const stats = {
              totalOrders: db.prepare('SELECT COUNT(*) AS c FROM quest_orders').get()?.c || 0,
              pendingOrders: db.prepare("SELECT COUNT(*) AS c FROM quest_orders WHERE status = 'pending'").get()?.c || 0,
              activeSubscribers: db.prepare("SELECT COUNT(*) AS c FROM quest_subscribers WHERE enabled = 1 AND (expires_at = 0 OR expires_at > ?)").get(Date.now())?.c || 0,
              totalApproved: db.prepare("SELECT COUNT(*) AS c FROM quest_permissions WHERE status = 'approved'").get()?.c || 0,
            };

            return json(res, 200, {
              config,
              banks: questShop.BANK_NAMES,
              channels,
              stats,
              orders: orders.map(o => {
                let qIds = [];
                let qNames = [];
                try { if (o.quest_ids_json) qIds = JSON.parse(o.quest_ids_json); } catch {}
                try { if (o.quest_names_json) qNames = JSON.parse(o.quest_names_json); } catch {}
                return {
                  ...o,
                  token: o.token ? `••••••••${o.token.slice(-4)}` : '',
                  quest_ids: qIds,
                  quest_names: qNames,
                };
              }),
              subscribers: subscribers.map(s => ({
                ...s,
                token: s.token ? `••••••••${s.token.slice(-4)}` : '',
              })),
              permissions,
            });
          }

          if (route === '/api/quest-shop/config' && req.method === 'POST') {
            const input = await body(req);
            if (!input || typeof input !== 'object') fail(400, 'Dữ liệu không hợp lệ.');

            if (input.bankId) questShop.setBankConfig('bank_id', String(input.bankId).trim().toUpperCase());
            if (input.bankAccount !== undefined) questShop.setBankConfig('bank_account', String(input.bankAccount).trim());
            if (input.bankName !== undefined) questShop.setBankConfig('bank_name', String(input.bankName).trim().toUpperCase());
            if (input.sepayApiKey !== undefined) questShop.setBankConfig('sepay_api_key', String(input.sepayApiKey).trim());
            if (input.channelId !== undefined) questShop.setBankConfig('channel_id', String(input.channelId).trim());
            if (input.singleQuestPrice !== undefined) {
              const p = Math.max(0, parseInt(input.singleQuestPrice, 10) || 0);
              questShop.setBankConfig('single_quest_price', p);
            }
            if (input.monthlyPackagePrice !== undefined) {
              const p = Math.max(0, parseInt(input.monthlyPackagePrice, 10) || 0);
              questShop.setBankConfig('monthly_package_price', p);
            }
            if (input.panelTitle !== undefined) questShop.setBankConfig('panel_title', String(input.panelTitle).trim());
            if (input.panelColor !== undefined) questShop.setBankConfig('panel_color', String(input.panelColor).trim());
            if (input.panelDescription !== undefined) questShop.setBankConfig('panel_description', String(input.panelDescription).trim());
            if (input.panelFooter !== undefined) questShop.setBankConfig('panel_footer', String(input.panelFooter).trim());

            // Tự động đồng bộ cập nhật bảng trên Discord nếu đã ghim
            questShop.ensureShopPanel(client).catch(() => {});

            return json(res, 200, { ok: true, config: questShop.getBankConfig() });
          }

          if (route === '/api/quest-shop/test-sepay' && req.method === 'GET') {
            rateLimit(`questshop_test:${value.user.id}`, 10);
            const cfg = questShop.getBankConfig();
            if (!cfg.sepayApiKey) {
              return json(res, 200, { success: false, error: 'Chưa cài đặt API Token SePay!' });
            }
            const result = await questShop.fetchSePayTransactions(cfg.sepayApiKey);
            if (!result.success) {
              return json(res, 200, {
                success: false,
                error: `Không thể kết nối SePay: ${result.error || `HTTP ${result.status}`}`,
                status: result.status,
              });
            }
            const preview = (result.transactions || []).slice(0, 5).map(t => ({
              id: t.id,
              date: t.transaction_date || t.transactionDate,
              amount_in: t.amount_in || t.amountIn || t.transferAmount || t.amount,
              content: t.transaction_content || t.description || t.content,
              account: t.account_number ? String(t.account_number).slice(-4).padStart(String(t.account_number).length, '*') : null,
            }));
            return json(res, 200, {
              success: true,
              status: result.status,
              endpoint: result.endpoint,
              authType: result.authType,
              totalTransactions: result.transactions.length,
              recentTransactions: preview,
            });
          }

          if (route === '/api/quest-shop/publish-panel' && req.method === 'POST') {
            const input = await body(req).catch(() => ({}));
            if (input.channelId) {
              questShop.setBankConfig('channel_id', String(input.channelId).trim());
            }
            const msg = await questShop.ensureShopPanel(client);
            if (!msg) fail(400, 'Không thể gửi bảng cửa hàng. Hãy kiểm tra lại kênh và quyền bot.');
            return json(res, 200, { ok: true, messageId: msg.id, channelId: msg.channelId });
          }

          if (route === '/api/quest-shop/order-action' && req.method === 'POST') {
            const input = await body(req);
            const { orderId, action } = input || {};
            if (!orderId || !action) fail(400, 'Thiếu thông tin đơn hàng hoặc thao tác.');

            const order = questShop.getOrder(orderId);
            if (!order) fail(404, 'Không tìm thấy đơn hàng.');

            if (action === 'approve') {
              const resApprove = await questShop.processPaidOrder(orderId, client);
              if (!resApprove.success) fail(400, resApprove.error || 'Lỗi khi kích hoạt đơn hàng.');
              return json(res, 200, { ok: true, message: `Đã xác nhận thanh toán & bắt đầu chạy đơn ${orderId}!` });
            } else if (action === 'reject') {
              questShop.updateOrderStatus(orderId, 'rejected', { error: 'Admin hủy đơn trên Dashboard' });
              return json(res, 200, { ok: true, message: `Đã hủy đơn ${orderId}.` });
            }
            fail(400, 'Thao tác không hỗ trợ.');
          }

          if (route === '/api/quest-shop/subscriber-action' && req.method === 'POST') {
            const input = await body(req);
            const { userId, action } = input || {};
            if (!userId || !action) fail(400, 'Thiếu thông tin thành viên hoặc thao tác.');

            const row = db.prepare('SELECT * FROM quest_subscribers WHERE user_id = ?').get(String(userId));
            if (!row) fail(404, 'Không tìm thấy thành viên đăng ký.');

            if (action === 'extend') {
              const currentExpiry = (row.expires_at && row.expires_at > Date.now()) ? row.expires_at : Date.now();
              const newExpiry = currentExpiry + (30 * 24 * 60 * 60 * 1000);
              db.prepare('UPDATE quest_subscribers SET expires_at = ?, enabled = 1 WHERE user_id = ?').run(newExpiry, String(userId));
              return json(res, 200, { ok: true, message: `Đã gia hạn thêm 30 ngày cho user ${userId}!` });
            } else if (action === 'toggle') {
              const newEnabled = row.enabled ? 0 : 1;
              db.prepare('UPDATE quest_subscribers SET enabled = ? WHERE user_id = ?').run(newEnabled, String(userId));
              return json(res, 200, { ok: true, message: `Đã ${newEnabled ? 'kích hoạt' : 'tạm dừng'} gói của user ${userId}.` });
            } else if (action === 'delete') {
              db.prepare('DELETE FROM quest_subscribers WHERE user_id = ?').run(String(userId));
              return json(res, 200, { ok: true, message: `Đã xóa user ${userId} khỏi danh sách subscribers.` });
            }
            fail(400, 'Thao tác không hỗ trợ.');
          }

          if (route === '/api/quest-shop/permission-action' && req.method === 'POST') {
            const input = await body(req);
            const { userId, action, username } = input || {};
            if (!userId || !action) fail(400, 'Thiếu thông tin người dùng hoặc thao tác.');

            if (action === 'approve') {
              await questAuth.approveUser(userId, value.user.id, client);
              if (username) {
                db.prepare('UPDATE quest_permissions SET username = ? WHERE user_id = ?').run(String(username), String(userId));
              }
              return json(res, 200, { ok: true, message: `Đã phê duyệt quyền Auto Quest cho user ${userId}!` });
            } else if (action === 'reject') {
              await questAuth.rejectUser(userId, value.user.id, client);
              return json(res, 200, { ok: true, message: `Đã từ chối quyền Auto Quest cho user ${userId}.` });
            } else if (action === 'delete') {
              db.prepare('DELETE FROM quest_permissions WHERE user_id = ?').run(String(userId));
              return json(res, 200, { ok: true, message: `Đã xóa user ${userId} khỏi danh sách kiểm duyệt.` });
            }
            fail(400, 'Thao tác không hỗ trợ.');
          }

          fail(404, 'Không tìm thấy API Quest Shop.');
        }
        if (req.method === 'GET' && route === '/api/guilds') {
          return json(res, 200, (await userGuilds(value.token)).map(guild => ({ id: guild.id, name: guild.name,
            icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : null,
            installed: client.guilds.cache.has(guild.id), invite: invite(guild.id) })));
        }
        const match = /^\/api\/guilds\/(\d+)\/(settings|leaderboard|test|giveaways|confession-panel|reaction-roles|ticket)$/.exec(route);
        if (!match) fail(404, 'Không tìm thấy trang.');
        const guild = await managedGuild(match[1], value);
        if (match[2] === 'ticket') {
          const ticketSystem = require('../utils/ticketSystem');
          if (req.method === 'GET') {
            const allChannels = await guild.channels.fetch();
            const categories = [...allChannels.values()]
              .filter(c => c && c.type === ChannelType.GuildCategory)
              .map(c => ({ id: c.id, name: c.name }));
            const textChannels = [...allChannels.values()]
              .filter(c => c && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type))
              .map(c => ({ id: c.id, name: c.name, type: c.type }));
            return json(res, 200, {
              config: ticketSystem.getConfig(guild.id),
              categories,
              channels: textChannels,
            });
          }
          if (req.method !== 'POST') fail(405, 'Thao tác không được hỗ trợ.');
          rateLimit(`ticket:${guild.id}:${value.user.id}`, 6);
          const input = await body(req);
          if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Dữ liệu không hợp lệ.');
          if (Array.isArray(input.config?.options)) {
            await guild.roles.fetch();
            for (const option of input.config.options) {
              for (const id of [option.handlerRoleId, option.grantRoleId]) {
                if (id && (id === guild.id || !guild.roles.cache.has(id))) fail(400, 'Role ticket không tồn tại hoặc là @everyone. Hãy chọn lại role.');
              }
            }
          }
          if (input.action === 'save') {
            const previous = ticketSystem.getConfig(guild.id);
            const saved = ticketSystem.saveConfig(guild.id, input.config || {});
            const refreshed = await ticketSystem.refreshOpenTickets(guild, previous, saved);
            return json(res, 200, { ok: true, config: saved, refreshed });
          }
          if (input.action === 'publish') {
            if (!input.channelId) fail(400, 'Hãy chọn kênh trước khi đăng bảng Ticket.');
            const saved = ticketSystem.saveConfig(guild.id, input.config || {});
            const resPublish = await ticketSystem.sendTicketPanel(guild, input.channelId, saved);
            return json(res, 200, {
              ok: true,
              config: resPublish.config || ticketSystem.getConfig(guild.id),
              messageUrl: `https://discord.com/channels/${guild.id}/${input.channelId}/${resPublish.messageId}`,
            });
          }
          fail(400, 'Thao tác không hợp lệ.');
        }
        if (match[2] === 'reaction-roles') {
          const rr=require('../utils/reactionRoles');
          if(req.method==='GET')return json(res,200,rr.list(guild.id));
          if(req.method!=='POST')fail(405,'Thao tác không được hỗ trợ.');
          rateLimit(`reaction-roles:${guild.id}:${value.user.id}`,6);
          const input=await body(req);
          if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Dữ liệu không hợp lệ.');
          if(input.action==='create')return json(res,200,await rr.create(guild,input));
          if(input.action==='disable'&&typeof input.id==='string')return json(res,200,await rr.disable(guild,input.id));
          fail(400,'Thao tác không hợp lệ.');
        }
        if (match[2] === 'confession-panel') {
          if (req.method !== 'POST') fail(405,'Thao tác không được hỗ trợ.');
          rateLimit(`confession-panel:${guild.id}:${value.user.id}`,3);
          try { return json(res,200,await require('../utils/confessionPanel').publishPanel(guild)); }
          catch(error) { fail(400,error.message); }
        }
        if (match[2] === 'giveaways') {
          if (req.method === 'GET') return json(res, 200, giveawayStore.list(guild.id).map(row => ({
            ...row, participants: giveawayStore.count(row.id), winners: JSON.parse(row.winners),
            messageUrl: row.message_id ? `https://discord.com/channels/${guild.id}/${row.channel_id}/${row.message_id}` : null,
          })));
          if (req.method !== 'POST') fail(405, 'Thao tác không được hỗ trợ.');
          rateLimit(`giveaway:${guild.id}:${value.user.id}`, 6);
          const input = await body(req);
          if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Dữ liệu không hợp lệ.');
          if (input.action === 'create' || input.action === 'test') return json(res, 200, await giveaway.create(guild,value.user.id,input,input.action === 'test'));
          if (typeof input.id !== 'string' || !/^[a-f0-9]{16}$/.test(input.id)) fail(400, 'ID giveaway không hợp lệ.');
          const result = await giveaway.act(guild,input.id,input.action);
          return json(res, 200, {ok:true,warning:result.last_error || (result.notice_state === 'uncertain' ? 'Kết quả đã lưu; chưa xác nhận gửi tin tag người thắng.' : null)});
        }
        if (match[2] === 'test') {
          if (req.method !== 'POST') fail(405, 'Thao tác không được hỗ trợ.');
          rateLimit(`test:${guild.id}:${value.user.id}`, 6);
          return json(res, 200, await sendTestMessage(guild, value.user.id, await body(req)));
        }
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
            emojis: [...(guild.emojis?.cache?.values() || [])].filter(e=>e.available!==false).map(e=>({id:e.id,name:e.name,animated:Boolean(e.animated)})),
            stats: { members: guild.memberCount, tracked: count, confessions: conf?.counter || 0 },
            channels: [...channels.values()].filter(channel => channel && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)).map(channel => ({ id: channel.id, name: channel.name, type: channel.type })),
            roles: [...roles.values()].filter(role => role.id !== guild.id).map(role => ({ id: role.id, name: role.name, managed: role.managed,
              editable: !role.managed && me.permissions.has(P.ManageRoles) && me.roles.highest.comparePositionTo(role) > 0 })) });
        }
        if (req.method !== 'POST') fail(405, 'Thao tác không được hỗ trợ.');
        const input = await body(req);
        if (input.options && Object.keys(input.options).some(key => key.startsWith('security') || key.startsWith('chatMod') || key === 'modLogChannel' || key === 'channelGuardEnabled') && value.user.id !== guild.ownerId) fail(403, 'Chỉ chủ server được thay đổi bảo vệ và kiểm duyệt.');
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
        if (optionsPatch.roleNoticeEnabled === true && !getOptions(guild.id).roleNoticeEnabled) {
          // Có trạng thái role ban đầu trước khi bắt đầu theo dõi thay đổi.
          try { await guild.members.fetch(); }
          catch { fail(503, 'Chưa tải được thành viên. Hãy bật Server Members Intent cho bot và thử lại.'); }
        }
        if(optionsPatch.inviteEnabled === true && !getOptions(guild.id).inviteEnabled) {
          try { await require('../utils/inviteSystem').prime(guild); }
          catch { fail(503,'Bot cần quyền Quản lý server và Server Members Intent để theo dõi lời mời.'); }
        }
        // Tạo bảng trước, rồi lưu các thay đổi hợp lệ trong cùng một giao dịch.
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
      const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'], '/quest.js': ['quest.js', 'text/javascript'] };
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
