const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { Collection, PermissionFlagsBits: P } = require('discord.js');
process.env.DB_PATH = ':memory:';
const { getDb } = require('../utils/database');
const cinema = require('../utils/cinema');
const { createDashboard } = require('../dashboard/server');
const { deployCommands } = require('../utils/deployCommands');
const env = { CLIENT_ID: '999', DISCORD_CLIENT_SECRET: 'test-secret', DASHBOARD_URL: 'http://localhost:3000',
  CINEMA_ENABLED: 'true', CINEMA_MEDIA_ORIGIN: 'https://media.example.com', BOT_OWNER_ID: '444' };
let permissions = '8', viewerAdmin = false, viewerRoles = new Set(), isMember = true;
const roles = new Collection([['777', { id: '777', name: 'Cinema' }]]);
const guild = { id: '111', roles: { fetch: async () => roles }, members: { fetch: async options => {
  assert.deepEqual(options, { user: '444', force: true });
  if (!isMember) throw Object.assign(new Error('Unknown member'), { code: 10007 });
  return { user: { bot: false }, permissions: { has: flag => flag === P.Administrator && viewerAdmin }, roles: { cache: viewerRoles } };
} } };
const client = { isReady: () => true, guilds: { cache: new Collection([['111', guild]]) } };
const fetchApi = async (url, options) => {
  if (url.endsWith('/oauth2/token')) {
    assert.equal(options.body.get('client_secret'), env.DISCORD_CLIENT_SECRET);
    return { ok: true, json: async () => ({ access_token: 'user-oauth', expires_in: 3600 }) };
  }
  if (url.endsWith('/users/@me')) return { ok: true, json: async () => ({ id: '444', username: 'Tester' }) };
  if (url.includes('/users/@me/guilds')) return { ok: true, json: async () => [{ id: '111', permissions, owner: false }] };
  throw new Error(`Unexpected Discord request ${url}`);
};
// Exercise the actual HTTP request handler in-process, without listening on a network port.
function transport(server) {
  return async (url, options = {}) => {
    const req = Readable.from(options.body === undefined ? [] : [Buffer.from(options.body)]);
    Object.assign(req, { url, method: options.method || 'GET', headers: options.headers || {}, socket: { remoteAddress: '127.0.0.1' } });
    const headers = new Map(); let status = 200, text = '';
    const res = { headersSent: false, setHeader: (k, v) => headers.set(k.toLowerCase(), v), removeHeader: k => headers.delete(k.toLowerCase()),
      writeHead: (code, extra = {}) => { status = code; res.headersSent = true; for (const [k, v] of Object.entries(extra)) headers.set(k.toLowerCase(), v); },
      end: value => { text = value == null ? '' : value.toString(); } };
    await server.listeners('request')[0](req, res);
    return { status, headers, text, json: () => JSON.parse(text) };
  };
}
const sample = () => ({ enabled: true, title: 'VNL Cinema', description: '<script>plain text only</script>', audience: 'members', roleIds: [], rightsConfirmed: true, revision: 0,
  shows: [{ title: 'Phim hợp pháp', source: 'https://media.example.com/film.mp4', startsAt: '2030-01-01T12:00:00Z', endsAt: '2030-01-01T14:00:00Z' }] });
async function main() {
  assert.equal(cinema.mediaOrigin({ CINEMA_MEDIA_ORIGIN: 'http://localhost' }), null);
  assert.equal(cinema.mediaOrigin({ CINEMA_MEDIA_ORIGIN: 'https://127.0.0.1' }), null);
  for (const source of ['http://media.example.com/a.mp4', 'https://evil.example/a.mp4', 'https://media.example.com@evil.example/a.mp4', 'javascript:alert(1)', 'https://media.example.com/a.mp4?token=secret', 'https://media.example.com/movie.html']) {
    const data = sample(); data.shows[0].source = source;
    assert.throws(() => cinema.validate(data, roles, env));
  }
  const overlap = sample(); overlap.shows.push({ ...overlap.shows[0] });
  assert.throws(() => cinema.validate(overlap, roles, env), /trùng giờ/);
  assert.throws(() => cinema.validate({ ...sample(), rightsConfirmed: false }, roles, env));
  assert.throws(() => cinema.validate({ ...sample(), audience: 'roles' }, roles, env));
  assert.equal(cinema.validate({ ...sample(), categoryId: '888' }, roles, env).categoryId, '888');
  assert.throws(() => cinema.validate({ ...sample(), categoryId: '999999' }, roles, env, new Map([['888', {}]])), /Danh mục Cinema/);
  assert.equal(cinema.validate({ ...sample(), notifyRoleId: '777' }, roles, env).notifyRoleId, '777');
  assert.equal(cinema.validate({ ...sample(), notifyRoleId: 'everyone' }, roles, env).notifyRoleId, 'everyone');
  assert.equal(cinema.validate({ ...sample(), notifyRoleId: 'here' }, roles, env).notifyRoleId, 'here');
  assert.throws(() => cinema.validate({ ...sample(), notifyRoleId: '999999' }, roles, env), /Role thông báo/);
  assert.equal(cinema.validate({ ...sample(), notifyMessage: 'Thông báo: {phim}' }, roles, env).notifyMessage, 'Thông báo: {phim}');
  // Test deleting all shows / ongoing shows while Cinema remains enabled
  assert.deepEqual(cinema.validate({ ...sample(), shows: [] }, roles, env).shows, []);
  assert.equal(cinema.validate({ ...sample(), shows: [] }, roles, env).enabled, true);

  const mockGuild = {
    channels: {
      cache: new Collection([
        ['cat-1', { id: 'cat-1', name: '╭─ VNL Cinema ─╮', type: 4, isCategory: () => true }],
        ['voice-1', { id: 'voice-1', name: '🎬 ・。-:*・。VNL Cinema 1', parentId: 'cat-1', type: 2, isVoiceBased: () => true }],
        ['voice-2', { id: 'voice-2', name: '🎬 ・。-:*・。VNL Cinema 2', parentId: 'cat-1', type: 2, isVoiceBased: () => true }],
        ['voice-outside', { id: 'voice-outside', name: 'Phòng tán gẫu', parentId: 'cat-other', type: 2, isVoiceBased: () => true }],
        ['text-1', { id: 'text-1', name: '📢 ・。-・。thông-báo-cinema', parentId: 'cat-1', type: 0, isVoiceBased: () => false }],
      ])
    }
  };
  assert.equal(cinema.getCinemaCategory(mockGuild, {}).id, 'cat-1');
  assert.equal(cinema.isAllowedCinemaVoiceChannel(mockGuild.channels.cache.get('voice-1'), mockGuild, {}), true);
  assert.equal(cinema.isAllowedCinemaVoiceChannel(mockGuild.channels.cache.get('voice-outside'), mockGuild, {}), false);
  const cinemaVoices = cinema.getCinemaVoiceChannels(mockGuild, {});
  assert.equal(cinemaVoices.size, 2);

  assert.equal(cinema.isShowAnnounced('111', 'show-key-test'), false);
  cinema.markShowAnnounced('111', 'show-key-test');
  assert.equal(cinema.isShowAnnounced('111', 'show-key-test'), true);
  const request = transport(createDashboard(client, { env, fetch: fetchApi }));
  const activityPage = await request('/activity/');
  if (require('node:fs').existsSync(require('node:path').join(__dirname, '../activity/dist/index.html'))) {
    assert.equal(activityPage.status, 200);
    assert.equal(activityPage.headers.has('x-frame-options'), false);
    assert.match(activityPage.headers.get('content-security-policy'), /frame-ancestors https:\/\/discord.com/);
    assert.equal((await request('/activity/main.js')).status, 200);
    assert.equal((await request('/activity/../package.json')).status, 404);
  } else assert.equal(activityPage.status, 503, 'Unbuilt Activity fails closed');
  assert.match((await request('/')).headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const route = '/api/guilds/111/premium/cinema';
  assert.equal((await request(route)).status, 401);
  assert.equal((await request('/premium/guilds/111/cinema')).status, 401);
  const auth = await request('/auth/discord');
  const state = new URL(auth.headers.get('location')).searchParams.get('state');
  const callback = await request(`/auth/callback?state=${state}&code=fake`, { headers: { cookie: auth.headers.get('set-cookie').split(';')[0] } });
  const cookie = callback.headers.get('set-cookie')[0].split(';')[0];
  const info = (await request('/api/session', { headers: { cookie } })).json();
  const headers = { cookie, origin: env.DASHBOARD_URL, 'content-type': 'application/json', 'x-csrf-token': info.csrf };
  assert.equal(info.isOwner, true, 'Test bot owner must still be checked against guild permissions');
  assert.equal((await request(route, { headers })).status, 200);
  assert.equal((await request('/premium/guilds/111/cinema', { headers })).status, 200);
  assert.equal((await request('/api/guilds/222/premium/cinema', { headers })).status, 403);
  const post = input => request(route, { method: 'POST', headers, body: JSON.stringify(input) });
  assert.equal((await request(route, { method: 'POST', headers: { cookie }, body: JSON.stringify(sample()) })).status, 403);
  assert.equal((await request(route, { method: 'POST', headers: { ...headers, origin: 'https://evil.example' }, body: JSON.stringify(sample()) })).status, 403);
  assert.equal((await post(sample())).status, 200);
  assert.equal(cinema.getConfig('111').revision, 1);
  assert.equal(cinema.getConfig('222').enabled, false);
  assert.equal((await post(sample())).status, 409, 'Stale admin edit rejected');
  const time = Date.parse('2030-01-01T12:05:00Z');
  const view = await cinema.viewerState(guild, '444', env, time);
  assert.equal(view.show.position, 300);
  assert.equal(view.show.mediaPath, '/.proxy/media/film.mp4');
  assert.equal((await cinema.viewerState(guild, '444', env, time - 600000)).show, null);
  assert.equal((await cinema.viewerState(guild, '444', env, Date.parse('2030-01-01T14:00:00Z'))).show, null);
  for (const denied of ['0', '32']) {
    permissions = denied;
    assert.equal((await request(route, { headers })).status, 403, 'Bot owner/ManageGuild is insufficient');
    assert.equal((await post({ ...sample(), revision: 1 })).status, 403);
    assert.equal((await request('/premium/guilds/111/cinema', { headers })).status, 403);
  }
  permissions = '8';
  assert.equal((await post({ ...sample(), audience: 'roles', roleIds: ['777'], revision: 1 })).status, 200);
  await assert.rejects(cinema.viewerState(guild, '444', env, time), { status: 403 });
  viewerRoles.add('777');
  assert.equal((await cinema.viewerState(guild, '444', env, time)).show.position, 300);
  viewerRoles.clear(); viewerAdmin = true;
  await cinema.viewerState(guild, '444', env, time);
  viewerAdmin = false; isMember = false;
  await assert.rejects(cinema.viewerState(guild, '444', env, time), { status: 403 });
  isMember = true;
  assert.equal((await request('/cinema-api/session', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{"code":"fake"}' })).status, 403);
  const login = (await request('/cinema-api/session', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://999.discordsays.com' }, body: '{"code":"fake"}' })).json();
  assert.equal(login.access_token, 'user-oauth'); assert(!JSON.stringify(login).includes('test-secret'));
  const viewerHeaders = { authorization: `Bearer ${login.session}` };
  assert.equal((await request(route, { headers: viewerHeaders })).status, 401, 'Viewer token cannot manage');
  assert.equal((await request('/cinema-api/guilds/111/state', { headers: { cookie } })).status, 401, 'Dashboard cookie is not a viewer token');
  assert.equal((await request('/cinema-api/guilds/111/state', { headers: viewerHeaders })).status, 403);
  viewerRoles.add('777');
  const activeShowConfig = { ...sample(), audience: 'roles', roleIds: ['777'], revision: cinema.getConfig('111').revision, shows: [{ title: 'Đang chiếu', source: 'https://media.example.com/film.mp4', startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString() }] };
  assert.equal((await post(activeShowConfig)).status, 200);
  assert.equal((await request('/cinema-api/guilds/111/seek', { method: 'POST', headers: { ...viewerHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ position: 600 }) })).status, 403, 'Non-staff cannot seek');
  viewerAdmin = true;
  const seekRes = await request('/cinema-api/guilds/111/seek', { method: 'POST', headers: { ...viewerHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ position: 600 }) });
  assert.equal(seekRes.status, 200, 'Staff can seek');
  assert.equal(seekRes.json().position, 600);
  viewerAdmin = false;
  assert.equal((await post({ ...activeShowConfig, enabled: false, revision: cinema.getConfig('111').revision })).status, 200);
  assert.equal((await request('/cinema-api/guilds/111/state', { headers: viewerHeaders })).status, 403);
  const disabled = transport(createDashboard(client, { env: { ...env, CINEMA_ENABLED: 'false' }, fetch: fetchApi }));
  assert.equal((await disabled('/activity/')).status, 503);
  process.env.CINEMA_ENABLED = 'true'; process.env.CLIENT_ID = '999'; process.env.TOKEN = 'fake'; delete process.env.GUILD_ID;
  let deployed;
  await deployCommands([{ data: { name: 'existing', description: 'Existing command' } }], { put: async (_, { body }) => { deployed = body; } });
  assert.equal(deployed.length, 2); assert.equal(deployed[0].name, 'existing'); assert.equal(deployed[1].type, 4); assert.equal(deployed[1].handler, 2);
  console.log('PASS Cinema: validation, schedule synchronization, guild isolation, admin revocation, direct page/API authorization, CSRF, viewer role revocation, session separation, disabled state and entry point. In-process transport; no live Discord/network.');
  getDb().close();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
