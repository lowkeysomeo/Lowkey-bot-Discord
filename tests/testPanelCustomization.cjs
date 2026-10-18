'use strict';

const assert = require('node:assert/strict');
const { Collection, ChannelType } = require('discord.js');
process.env.DB_PATH = ':memory:';

const { createDashboard } = require('../dashboard/server');
const { getDb } = require('../utils/database');
const {
  getBankConfig,
  setBankConfig,
  buildShopPanelPayload,
  ensureShopPanel,
  DEFAULT_PANEL_TITLE,
  DEFAULT_PANEL_DESCRIPTION,
} = require('../utils/questShop');

const OWNER_ID = '604729446649298963';
let currentUser = { id: OWNER_ID, username: 'BossOwner' };

let lastSentPayload = null;
let lastEditedPayload = null;

const channel = {
  id: '1561060424491737118',
  name: 'auto-quest-shop',
  type: ChannelType.GuildText,
  isTextBased: () => true,
  permissionsFor: () => ({ has: () => true }),
  send: async (p) => {
    lastSentPayload = p;
    return {
      id: 'msg-pinned-123',
      pin: async () => true,
      edit: async (ep) => { lastEditedPayload = ep; return true; },
    };
  },
  messages: {
    fetch: async (id) => ({
      id,
      edit: async (ep) => { lastEditedPayload = ep; return true; },
    }),
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
  if (url.includes('/oauth2/token')) {
    return { ok: true, status: 200, json: async () => ({ access_token: 'acc-tok' }) };
  }
  if (url.includes('/users/@me') && !url.includes('/guilds')) {
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

async function runTests() {
  console.log('--- TEST 1: Default Panel Config & Build ---');
  const initialCfg = getBankConfig();
  assert.equal(initialCfg.panelTitle, DEFAULT_PANEL_TITLE);
  assert.equal(initialCfg.panelColor, '#5865f2');
  assert.equal(initialCfg.panelDescription, DEFAULT_PANEL_DESCRIPTION);

  const defaultPayload = buildShopPanelPayload();
  assert.equal(defaultPayload.embeds[0].data.title, DEFAULT_PANEL_TITLE);
  assert.match(defaultPayload.embeds[0].data.description, /Gói Tùy Chọn Quest Lẻ/);
  assert.equal(defaultPayload.components.length, 1);
  assert.equal(defaultPayload.components[0].components.length, 4, 'Chỉ còn 4 nút cho khách, ẩn dòng cài đặt ngân hàng');

  console.log('--- TEST 2: Custom Panel Config via API ---');
  const server = createDashboard(client, { env, fetch: mockFetch });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, options) => fetch(base + route, { redirect: 'manual', ...options });

  try {
    const ownerCookie = await loginAs({ id: OWNER_ID, username: 'BossOwner' }, base, request);
    const ownerHeaders = { cookie: ownerCookie };
    const ownerSession = await (await request('/api/session', { headers: ownerHeaders })).json();
    assert.equal(ownerSession.isOwner, true);

    const ownerPostHeaders = {
      ...ownerHeaders,
      'Content-Type': 'application/json',
      origin: env.DASHBOARD_URL,
      'X-CSRF-Token': ownerSession.csrf,
    };

    const customTitle = '✨ TIỆM AUTO QUEST VIP CỰC KỲ UY TÍN';
    const customDesc = 'Chào bạn! Giá lẻ: **{single_price}**. Giá tháng: **{monthly_price}**. Uy tín 100%!';
    const customFooter = 'Lowkey VIP Shop 2026';
    const customColor = '#ff0055';

    const postRes = await request('/api/quest-shop/config', {
      method: 'POST',
      headers: ownerPostHeaders,
      body: JSON.stringify({
        singleQuestPrice: 5000,
        monthlyPackagePrice: 50000,
        panelTitle: customTitle,
        panelDescription: customDesc,
        panelFooter: customFooter,
        panelColor: customColor,
      }),
    });

    assert.equal(postRes.status, 200);
    const postJson = await postRes.json();
    assert.equal(postJson.ok, true);
    assert.equal(postJson.config.panelTitle, customTitle);
    assert.equal(postJson.config.panelColor, customColor);
    assert.equal(postJson.config.panelFooter, customFooter);
    assert.equal(postJson.config.panelDescription, customDesc);

    console.log('--- TEST 3: Verify Rendered Discord Embed with Dynamic Variables ---');
    const updatedPayload = buildShopPanelPayload();
    const embed = updatedPayload.embeds[0].data;

    assert.equal(embed.title, customTitle);
    assert.equal(embed.footer.text, customFooter);
    assert.equal(embed.color, 0xff0055);
    assert.match(embed.description, /5\.000 đ/, 'Phải tự thay thế {single_price} thành 5.000 đ');
    assert.match(embed.description, /50\.000 đ/, 'Phải tự thay thế {monthly_price} thành 50.000 đ');

    console.log('--- TEST 4: Live Auto-Sync to Discord ---');
    assert(lastEditedPayload || lastSentPayload, 'Bảng Discord phải được tự động đồng bộ khi lưu cấu hình');

    console.log('ALL PANEL CUSTOMIZATION TESTS PASSED SUCCESSFULLY! ✅');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
