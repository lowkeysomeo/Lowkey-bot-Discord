'use strict';

const assert = require('node:assert/strict');
const { Collection, ChannelType } = require('discord.js');
process.env.DB_PATH = ':memory:';

const { createDashboard } = require('../dashboard/server');
const { getDb } = require('../utils/database');
const { getBankConfig, createOrder, setBankConfig } = require('../utils/questShop');

const OWNER_ID = '604729446649298963';
const NON_OWNER_ID = '123456789012345678';

let currentUser = { id: NON_OWNER_ID, username: 'RegularUser' };

const channel = {
  id: '1561060424491737118',
  name: 'auto-quest-shop',
  type: ChannelType.GuildText,
  guildId: '111',
  isTextBased: () => true,
  permissionsFor: () => ({ has: () => true }),
  send: async (payload) => ({ id: 'msg-panel-999', channelId: '1561060424491737118', pin: async () => true, edit: async () => true }),
  messages: {
    fetch: async (id) => ({ id, edit: async () => true }),
  },
};

const guild = {
  id: '111',
  name: 'VietNam Legacy',
  memberCount: 50,
  ownerId: OWNER_ID,
  channels: {
    cache: new Collection([['1561060424491737118', channel]]),
    fetch: async (id) => (id === '1561060424491737118' ? channel : null),
  },
};

const client = {
  isReady: () => true,
  guilds: {
    cache: new Collection([['111', guild]]),
  },
  channels: {
    fetch: async (id) => (id === '1561060424491737118' ? channel : null),
  },
  users: {
    fetch: async (id) => ({ id, send: async () => true, username: `User_${id}` }),
  },
};

const env = {
  CLIENT_ID: '999',
  DISCORD_CLIENT_SECRET: 'test-secret',
  DASHBOARD_URL: 'http://127.0.0.1:3000',
  BOT_OWNER_ID: OWNER_ID,
};

const mockFetch = async (url) => {
  if (url.endsWith('/oauth2/token')) {
    return { ok: true, status: 200, json: async () => ({ access_token: 'test-token', expires_in: 3600 }) };
  }
  if (url.endsWith('/users/@me')) {
    return { ok: true, status: 200, json: async () => currentUser };
  }
  if (url.includes('/users/@me/guilds')) {
    return { ok: true, status: 200, json: async () => [{ id: '111', name: 'VietNam Legacy', owner: true, permissions: '8' }] };
  }
  throw new Error(`Unexpected url ${url}`);
};

async function loginAs(user, base, request) {
  currentUser = user;
  const auth = await request('/auth/discord');
  const authUrl = new URL(auth.headers.get('location'));
  const loginCookie = auth.headers.get('set-cookie').split(';')[0];
  const callback = `/auth/callback?state=${authUrl.searchParams.get('state')}&code=code`;
  const result = await request(callback, { headers: { cookie: loginCookie } });
  return result.headers.getSetCookie().find(v => v.startsWith('vnl_session=')).split(';')[0];
}

(async () => {
  const db = getDb();
  const server = createDashboard(client, { env, fetch: mockFetch });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, options) => fetch(base + route, { redirect: 'manual', ...options });

  try {
    // 1. Kiểm tra session của Non-Owner
    const nonOwnerCookie = await loginAs({ id: NON_OWNER_ID, username: 'Member' }, base, request);
    const nonOwnerHeaders = { cookie: nonOwnerCookie };
    const nonOwnerSession = await (await request('/api/session', { headers: nonOwnerHeaders })).json();
    assert.equal(nonOwnerSession.isOwner, false, 'Non-owner isOwner must be false');

    // 2. Non-owner bị chặn 403 khi gọi /api/quest-shop
    const nonOwnerRes = await request('/api/quest-shop/data', { headers: nonOwnerHeaders });
    assert.equal(nonOwnerRes.status, 403, 'Non-owner must receive 403 on /api/quest-shop/data');
    const nonOwnerErr = await nonOwnerRes.json();
    assert.match(nonOwnerErr.error, /người sở hữu bot/i);

    // 3. Đăng nhập với tư cách Bot Owner (ID 604729446649298963)
    const ownerCookie = await loginAs({ id: OWNER_ID, username: 'BossOwner' }, base, request);
    const ownerHeaders = { cookie: ownerCookie };
    const ownerSession = await (await request('/api/session', { headers: ownerHeaders })).json();
    assert.equal(ownerSession.isOwner, true, 'Owner isOwner must be true');

    const ownerPostHeaders = {
      ...ownerHeaders,
      'Content-Type': 'application/json',
      origin: env.DASHBOARD_URL,
      'X-CSRF-Token': ownerSession.csrf,
    };

    // 4. Owner lấy dữ liệu cấu hình /api/quest-shop/data
    const dataRes = await request('/api/quest-shop/data', { headers: ownerHeaders });
    assert.equal(dataRes.status, 200, 'Owner can fetch quest shop data');
    const qData = await dataRes.json();
    assert(qData.config, 'Must return config');
    assert(qData.banks, 'Must return banks');
    assert(qData.stats, 'Must return stats');
    assert(Array.isArray(qData.orders), 'Must return orders array');
    assert(Array.isArray(qData.subscribers), 'Must return subscribers array');

    // 5. Cập nhật cấu hình ngân hàng & giá cước qua /api/quest-shop/config
    const updateConfigRes = await request('/api/quest-shop/config', {
      method: 'POST',
      headers: ownerPostHeaders,
      body: JSON.stringify({
        bankId: 'VCB',
        bankAccount: '9988776655',
        bankName: 'LE HOANG LONG',
        sepayApiKey: 'TEST_SEPAY_API_KEY_123',
        singleQuestPrice: 5000,
        monthlyPackagePrice: 45000,
        channelId: '1561060424491737118',
      }),
    });
    assert.equal(updateConfigRes.status, 200);
    const updatedCfg = (await updateConfigRes.json()).config;
    assert.equal(updatedCfg.bankId, 'VCB');
    assert.equal(updatedCfg.bankAccount, '9988776655');
    assert.equal(updatedCfg.bankName, 'LE HOANG LONG');
    assert.equal(updatedCfg.singleQuestPrice, 5000);
    assert.equal(updatedCfg.monthlyPackagePrice, 45000);

    // 6. Test quản lý Đơn Hàng (Order Action)
    const testOrder = createOrder({
      userId: '777888999',
      username: 'BuyerOne',
      token: 'fake-discord-user-token-1234567890',
      packageType: 'single',
      questCount: 2,
      amount: 10000,
    });
    assert.equal(testOrder.status, 'pending');

    // Hủy đơn qua dashboard
    const rejectRes = await request('/api/quest-shop/order-action', {
      method: 'POST',
      headers: ownerPostHeaders,
      body: JSON.stringify({ orderId: testOrder.order_id, action: 'reject' }),
    });
    assert.equal(rejectRes.status, 200);
    const orderAfterReject = db.prepare('SELECT status FROM quest_orders WHERE order_id = ?').get(testOrder.order_id);
    assert.equal(orderAfterReject.status, 'rejected');

    // 7. Test quản lý Subscribers (Subscriber Action)
    db.prepare(`
      INSERT INTO quest_subscribers (user_id, token, username, enabled, expires_at, created_at)
      VALUES (?, ?, ?, 1, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET enabled = 1
    `).run('888999111', 'sub-token-abc', 'SubUser', Date.now() + 86400000, Date.now());

    // Toggle tắt subscriber
    const toggleRes = await request('/api/quest-shop/subscriber-action', {
      method: 'POST',
      headers: ownerPostHeaders,
      body: JSON.stringify({ userId: '888999111', action: 'toggle' }),
    });
    assert.equal(toggleRes.status, 200);
    let subRow = db.prepare('SELECT enabled FROM quest_subscribers WHERE user_id = ?').get('888999111');
    assert.equal(subRow.enabled, 0);

    // Gia hạn subscriber
    const extendRes = await request('/api/quest-shop/subscriber-action', {
      method: 'POST',
      headers: ownerPostHeaders,
      body: JSON.stringify({ userId: '888999111', action: 'extend' }),
    });
    assert.equal(extendRes.status, 200);
    subRow = db.prepare('SELECT enabled, expires_at FROM quest_subscribers WHERE user_id = ?').get('888999111');
    assert.equal(subRow.enabled, 1);
    assert(subRow.expires_at > Date.now() + 20 * 86400000);

    // Trừ thời gian subscriber (-10 ngày)
    const prevExpiry = subRow.expires_at;
    const reduceRes = await request('/api/quest-shop/subscriber-action', {
      method: 'POST',
      headers: ownerPostHeaders,
      body: JSON.stringify({ userId: '888999111', action: 'reduce', days: 10 }),
    });
    assert.equal(reduceRes.status, 200);
    subRow = db.prepare('SELECT expires_at FROM quest_subscribers WHERE user_id = ?').get('888999111');
    assert.equal(subRow.expires_at, prevExpiry - (10 * 86400000), 'Phải trừ đúng 10 ngày');

    // Tùy chỉnh cộng/trừ ngày (action: custom)
    const customAddRes = await request('/api/quest-shop/subscriber-action', {
      method: 'POST',
      headers: ownerPostHeaders,
      body: JSON.stringify({ userId: '888999111', action: 'custom', days: 5 }),
    });
    assert.equal(customAddRes.status, 200);
    const customMinusRes = await request('/api/quest-shop/subscriber-action', {
      method: 'POST',
      headers: ownerPostHeaders,
      body: JSON.stringify({ userId: '888999111', action: 'custom', days: -3 }),
    });
    assert.equal(customMinusRes.status, 200);

    // Chặn thành viên thông thường không được set gói Vô thời hạn (403)
    const rejectUnlimitedRes = await request('/api/quest-shop/subscriber-action', {
      method: 'POST',
      headers: ownerPostHeaders,
      body: JSON.stringify({ userId: '888999111', action: 'set_unlimited' }),
    });
    assert.equal(rejectUnlimitedRes.status, 403, 'User thường không được dùng gói Vô thời hạn');

    // Admin/Owner được phép set gói Vô thời hạn
    db.prepare(`
      INSERT INTO quest_subscribers (user_id, token, username, notify_dm, enabled, package_type, expires_at, created_at)
      VALUES (?, 'adm-tok', 'AdminUser', 1, 1, 'monthly', 12345, ?)
      ON CONFLICT(user_id) DO UPDATE SET enabled = 1
    `).run(OWNER_ID, Date.now());
    const acceptUnlimitedRes = await request('/api/quest-shop/subscriber-action', {
      method: 'POST',
      headers: ownerPostHeaders,
      body: JSON.stringify({ userId: OWNER_ID, action: 'set_unlimited' }),
    });
    assert.equal(acceptUnlimitedRes.status, 200);
    const adminSub = db.prepare('SELECT expires_at FROM quest_subscribers WHERE user_id = ?').get(OWNER_ID);
    assert.equal(adminSub.expires_at, 0, 'Admin được phép sở hữu gói vô thời hạn (expires_at = 0)');

    // 8. Test quản lý Phê duyệt (Admin duyệt người dùng thì chỉ được gói 10 ngày)
    const approvePermRes = await request('/api/quest-shop/permission-action', {
      method: 'POST',
      headers: ownerPostHeaders,
      body: JSON.stringify({ userId: '555666777', action: 'approve', username: 'AllowedGuy' }),
    });
    assert.equal(approvePermRes.status, 200);
    const permRow = db.prepare('SELECT status, username, expires_at FROM quest_permissions WHERE user_id = ?').get('555666777');
    assert.equal(permRow.status, 'approved');
    assert.equal(permRow.username, 'AllowedGuy');
    assert(permRow.expires_at >= Date.now() + 9 * 86400000 && permRow.expires_at <= Date.now() + 11 * 86400000, 'Duyệt thành viên thường phải được gói 10 ngày');

    // 9. Test đăng / publish panel
    const pubRes = await request('/api/quest-shop/publish-panel', {
      method: 'POST',
      headers: ownerPostHeaders,
      body: JSON.stringify({ channelId: '1561060424491737118' }),
    });
    // 10. Test matchTransactionWithOrder with data.data schema and formatted memo
    const { matchTransactionWithOrder } = require('../utils/questShop');
    const dummyOrder = { order_id: 'LQM98765', amount: 40000 };
    const dummyTransactions = [
      { id: 1, transaction_content: 'MBVCB.123.LQM98765 chuyen tien', amount_in: '40000.00' },
      { id: 2, transaction_content: 'Khong lien quan', amount_in: '50000' },
    ];
    const match = matchTransactionWithOrder(dummyTransactions, dummyOrder);
    assert(match, 'Phải khớp được đơn hàng LQM98765');
    assert.equal(match.id, 1);

    // 11. Test SePay Webhook
    db.prepare(`
      INSERT INTO quest_orders (order_id, user_id, username, token, package_type, amount, status, created_at)
      VALUES ('LQM98765', '111222', 'Tester', 'tok', 'monthly', 40000, 'pending', ?)
    `).run(Date.now());

    const webhookRes = await request('/api/sepay/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 9999,
        gateway: 'MBBank',
        amountIn: 40000,
        transactionContent: 'LQM98765 Thanh toan quest thang',
      }),
    });
    assert.equal(webhookRes.status, 200);
    const webhookJson = await webhookRes.json();
    assert.equal(webhookJson.success, true);
    assert.equal(webhookJson.order_id, 'LQM98765');

    // 12. Test GET /api/quest-shop/test-sepay
    const testSepayRes = await request('/api/quest-shop/test-sepay', {
      headers: ownerHeaders,
    });
    assert.equal(testSepayRes.status, 200);

    // 13. Test 10-Minute Expiration & Button Disable on Repeated Click
    const { buildPaymentPayload, handleShopInteraction, getOrder } = require('../utils/questShop');

    // Tạo đơn hàng hết hạn (> 10 phút)
    const elevenMinutesAgo = Date.now() - 11 * 60 * 1000;
    db.prepare(`
      INSERT INTO quest_orders (order_id, user_id, username, token, package_type, amount, status, created_at)
      VALUES ('LQEXP999', '111222', 'OldUser', 'tok', 'single', 4000, 'pending', ?)
    `).run(elevenMinutesAgo);

    const expiredOrder = getOrder('LQEXP999');
    const expiredPayload = await buildPaymentPayload(expiredOrder);
    assert.equal(expiredPayload.components.length, 0, 'Đơn hết hạn không được hiển thị nút thanh toán');
    assert.match(expiredPayload.embeds[0].data.title, /HẾT HẠN/i);

    const mockInteraction = (customId, extra = {}) => ({
      isButton: () => true,
      isModalSubmit: () => false,
      isStringSelectMenu: () => false,
      customId,
      user: { id: '111222' },
      ...extra,
    });

    // Xử lý interaction khi đơn đã hết hạn
    let expiredRepliedMsg = '';
    await handleShopInteraction(mockInteraction('qshop:check_pay:LQEXP999', {
      reply: async (opts) => { expiredRepliedMsg = opts.content; },
    }), client);
    assert.match(expiredRepliedMsg, /hết hạn \(quá 10 phút\)/i);

    // Tạo đơn hàng mới còn trong 10 phút
    db.prepare(`
      INSERT INTO quest_orders (order_id, user_id, username, token, package_type, amount, status, created_at, check_count)
      VALUES ('LQACT001', '111222', 'ActiveUser', 'tok', 'single', 4000, 'pending', ?, 0)
    `).run(Date.now());

    let actOrder = getOrder('LQACT001');
    const activePayload = await buildPaymentPayload(actOrder);
    assert.equal(activePayload.components.length, 1);
    const payBtn = activePayload.components[0].components[0];
    assert.equal(payBtn.data.disabled, false);

    // Lần 1: Bấm đã chuyển tiền (chưa nhận được tiền trên mock SePay)
    let replyContent1 = '';
    let deferred = false;
    await handleShopInteraction(mockInteraction('qshop:check_pay:LQACT001', {
      message: { editable: false },
      deferReply: async () => { deferred = true; },
      editReply: async (opts) => { replyContent1 = opts.content; },
    }), client);
    assert(deferred);
    assert.match(replyContent1, /ĐÃ GHI NHẬN YÊU CẦU/i);

    actOrder = getOrder('LQACT001');
    assert.equal(actOrder.check_count, 1, 'check_count phải được tăng lên 1');

    // Kiểm tra payload hiển thị sau khi đã bấm 1 lần: nút phải disabled
    const checkingPayload = await buildPaymentPayload(actOrder);
    assert.equal(checkingPayload.components[0].components[0].data.disabled, true);
    assert.match(checkingPayload.components[0].components[0].data.label, /Đang Đợi SePay/i);

    // Lần 2: Bấm tiếp -> Bị chặn không cho bấm liên tục
    let replyContent2 = '';
    await handleShopInteraction(mockInteraction('qshop:check_pay:LQACT001', {
      reply: async (opts) => { replyContent2 = opts.content; },
    }), client);
    assert.match(replyContent2, /Bạn đã gửi yêu cầu xác nhận đơn hàng/i);
    assert.match(replyContent2, /không bấm liên tục/i);

    console.log('PASS quest-shop-dashboard: Owner gate, config, pricing, orders, SePay matching, Webhooks, 10-min expiry, anti-spam check.');
  } finally {
    server.close();
  }
})();
