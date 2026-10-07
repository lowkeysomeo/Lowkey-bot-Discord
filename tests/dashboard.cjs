const assert = require('node:assert/strict');
const { Collection, ChannelType } = require('discord.js');
process.env.DB_PATH = ':memory:';
const { createDashboard } = require('../dashboard/server');
const { getGuildSetting } = require('../utils/guildSettings');
const { getDb } = require('../utils/database');
const confession = require('../utils/confessionStore');
let owner = true;
const channel = { id: '333', name: 'level', type: ChannelType.GuildText, guildId: '111', permissionsFor: () => ({ has: () => true }) };
const guild = { id: '111', memberCount: 20, channels: { fetch: async () => new Collection([['333', channel]]) },
  roles: { fetch: async () => new Collection([['777', { id: '777', name: 'Reward', managed: false }], ['888', { id: '888', name: 'Managed', managed: true }]]) }, members: {
    fetch: async id => ({ displayName: `Member ${id}`, user: { bot: false } }),
    fetchMe: async () => ({ permissions: { has: () => true }, roles: { highest: { comparePositionTo: () => 1 } } }),
  } };
const client = { isReady: () => true, guilds: { cache: new Collection([['111', guild]]) } };
const env = { CLIENT_ID: '999', DISCORD_CLIENT_SECRET: 'test-only-secret', DASHBOARD_URL: 'http://127.0.0.1:3000' };
const mockFetch = async url => {
  let data;
  if (url.endsWith('/oauth2/token')) data = { access_token: 'private-test-token', expires_in: 3600 };
  else if (url.endsWith('/users/@me')) data = { id: '444', username: 'Admin' };
  else if (url.includes('/users/@me/guilds')) data = [{ id: '111', name: '<script>unsafe</script>', owner, permissions: '0' }];
  else throw new Error(`Unexpected request ${url}`);
  return { ok: true, status: 200, json: async () => data };
};
async function main() {
  const server = createDashboard(client, { env, fetch: mockFetch });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, options) => fetch(base + route, { redirect: 'manual', ...options });
  try {
    assert.equal((await request('/api/guilds')).status, 401);
    assert.equal((await request('/api/guilds/111/settings', { method: 'POST' })).status, 401);
    assert.equal((await request('/auth/callback?state=wrong&code=code')).status, 400);
    const auth = await request('/auth/discord');
    const authUrl = new URL(auth.headers.get('location'));
    assert.equal(authUrl.searchParams.get('scope'), 'identify guilds');
    assert(!authUrl.href.includes('test-only-secret'));
    const loginCookie = auth.headers.get('set-cookie').split(';')[0];
    const callback = `/auth/callback?state=${authUrl.searchParams.get('state')}&code=fake-code`;
    const result = await request(callback, { headers: { cookie: loginCookie } });
    assert.equal(result.status, 302);
    const sessionCookie = result.headers.getSetCookie().find(value => value.startsWith('vnl_session=')).split(';')[0];
    assert.equal((await request(callback, { headers: { cookie: loginCookie } })).status, 400, 'OAuth state is single-use');
    const headers = { cookie: sessionCookie };
    const info = await (await request('/api/session', { headers })).json();
    assert.equal(info.user.name, 'Admin');
    assert(!JSON.stringify(info).includes('private-test-token'));
    assert(!JSON.stringify(info).includes('test-only-secret'));
    const data = await (await request('/api/guilds/111/settings', { headers })).json();
    assert.equal(data.channels[0].id, '333');
    const userId = '123456789012345678';
    getDb().prepare('INSERT INTO chat_levels (guild_id, user_id, total_xp) VALUES (?, ?, ?)').run('111', userId, 50);
    getDb().prepare('INSERT INTO voice_levels (guild_id, user_id, total_xp) VALUES (?, ?, ?)').run('111', userId, 25);
    getDb().prepare('INSERT INTO chat_levels (guild_id, user_id, total_xp) VALUES (?, ?, ?)').run('222', userId, 999999);
    const insertLegacy = getDb().prepare('INSERT INTO chat_levels (guild_id, user_id, total_xp) VALUES (?, ?, ?)');
    for (let i = 0; i < 21; i++) insertLegacy.run('111', `222:${userId}${i}`, 100000);
    const ranked = await (await request('/api/guilds/111/leaderboard', { headers })).json();
    assert.equal(ranked.length, 1, 'Malformed legacy IDs are excluded before applying the top-20 limit');
    assert.equal(ranked[0].user_id, userId);
    assert.equal(ranked[0].totalXp, 75, 'Chat/Voice totals remain isolated by server');
    const refreshed = await (await request('/api/guilds/111/settings', { headers })).json();
    assert.equal(refreshed.stats.tracked, 1, 'Legacy keys do not inflate tracked member counts');
    const postHeaders = { ...headers, 'Content-Type': 'application/json', origin: env.DASHBOARD_URL, 'X-CSRF-Token': info.csrf };
    const payload = JSON.stringify({ settings: { LEVEL_CHANNEL_ID: '333' }, confessionChannel: '333' });
    assert.equal((await request('/api/guilds/111/settings', { method: 'POST', headers, body: payload })).status, 403);
    assert.equal((await request('/api/guilds/111/settings', { method: 'POST', headers: { ...postHeaders, origin: 'https://evil.example' }, body: payload })).status, 403);
    assert.equal((await request('/api/guilds/222/settings', { headers })).status, 403);
    assert.equal((await request('/api/guilds/111/settings', { method: 'POST', headers: postHeaders, body: JSON.stringify({ settings: { LEVEL_CHANNEL_ID: '99999' } }) })).status, 400);
    assert.equal((await request('/api/guilds/111/settings', { method: 'POST', headers: postHeaders, body: payload })).status, 200);
    assert.equal(getGuildSetting('111', 'LEVEL_CHANNEL_ID'), '333');
    assert.equal(getGuildSetting('222', 'LEVEL_CHANNEL_ID'), null);
    assert.equal(confession.getConfig('111').channel_id, '333');
    const customPost = async body => request('/api/guilds/111/settings', { method: 'POST', headers: postHeaders, body: JSON.stringify(body) });
    for (const bad of [
      { options: { chatMin: 30, chatMax: 10 } }, { options: { chatEnabled: 'yes' } },
      { options: { chatCooldown: 0 } }, { options: { noticeColor: 'red' } },
      { options: { unknownSetting: true } }, { options: { chatNoticeChannel: '999' } },
      { rewards: { chat: [{ level: 5, roleId: '888' }] } },
      { rewards: { chat: [{ level: 0, roleId: '777' }] } },
      { rewards: { chat: [{ level: 5, roleId: '777' }, { level: 5, roleId: '777' }] } },
      { exclusions: ['999'] },
    ]) assert.equal((await customPost(bad)).status, 400, JSON.stringify(bad));
    assert.equal((await customPost({ options: { chatMin: 7, chatMax: 7, chatNoticeText: 'Xin chào {user} — cấp {level}', chatNoticeStyle: 'text' },
      rewards: { chat: [{ level: 25, roleId: '777' }], voice: [] }, exclusions: ['333'] })).status, 200);
    const savedCustom = await (await request('/api/guilds/111/settings', { headers })).json();
    assert.equal(savedCustom.options.chatMin, 7);
    assert.equal(savedCustom.options.chatNoticeText, 'Xin chào {user} — cấp {level}');
    assert.deepEqual(savedCustom.rewards.chat, [{ level: 25, roleId: '777' }]);
    assert.deepEqual(savedCustom.rewards.voice, []);
    assert.deepEqual(savedCustom.exclusions, ['333']);
    assert.equal(require('../utils/customization').getOptions('222').chatMin, 10);
    assert.equal((await customPost({ options: { chatMin: 99 }, exclusions: ['999'] })).status, 400);
    assert.equal(require('../utils/customization').getOptions('111').chatMin, 7, 'Invalid batch cannot partially change settings');
    owner = false;
    assert.equal((await request('/api/guilds/111/settings', { method: 'POST', headers: postHeaders, body: payload })).status, 403, 'Permissions are checked again after revocation');
    assert.equal((await request('/api/logout', { method: 'POST', headers: postHeaders, body: '{}' })).status, 200);
    assert.equal((await request('/api/guilds', { headers })).status, 401);
    const html = await request('/');
    assert.match(html.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(html.status, 200);
    console.log('PASS: OAuth state/cookie binding, state replay rejection, session privacy, CSRF/origin checks, per-server authorization, permission revocation, config validation/persistence, leaderboard legacy filtering and isolation, logout, security headers');
  } finally { await new Promise(resolve => server.close(resolve)); getDb().close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
