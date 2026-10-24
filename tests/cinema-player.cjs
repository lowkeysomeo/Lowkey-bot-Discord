const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function element() {
  return { hidden: true, style: { setProperty() {} }, classList: { add() {}, remove() {}, contains() { return false; } },
    textContent: '', src: '', paused: false, ended: false, readyState: 1, currentTime: 0, duration: 7200, loads: 0,
    addEventListener() {}, pause() { this.paused = true; }, play: async function () { this.paused = false; },
    removeAttribute(name) { if (name === 'src') this.src = ''; }, load() { this.loads++; }, replaceChildren() {}, append() {} };
}
const nodes = new Map();
const node = selector => { if (!nodes.has(selector)) nodes.set(selector, element()); return nodes.get(selector); };
let clock = 1000, response = null, fetchCalls = [], networkError = null;
const context = vm.createContext({
  document: { querySelector: node, createElement: element, body: element(), documentElement: element() },
  window: { addEventListener() {}, crypto: { randomUUID: () => 'state' } },
  console: { log() {}, warn() {} }, Date, JSON, Math, Boolean, Number, String, Error, Promise, encodeURIComponent,
  performance: { now: () => clock }, AbortSignal, setTimeout() {}, clearTimeout() {},
  fetch: async (url, options) => { fetchCalls.push({ url, options }); if (networkError) throw networkError; return { ok: response.status === 200, status: response.status, text: async () => JSON.stringify(response.data) }; },
});
let source = fs.readFileSync(path.join(__dirname, '../activity/src/main.js'), 'utf8');
source = source.replace(/^import .*\n/, '').replace(/\nstart\(\);\s*$/, '\n');
vm.runInContext(source, context);
const run = code => vm.runInContext(code, context);
const show = { id: 'a', title: 'Movie', roomId: 2, startsAt: '2030-01-01T12:00:00Z', endsAt: '2030-01-01T14:00:00Z', mediaPath: '/.proxy/media/movie.mp4', position: 300 };
function prime() {
  run(`guildId='111'; channelId='222'; session='test'; stopped=false; hasStarted=true; lastStateAt=1000; endedShowId=null; current=${JSON.stringify({ ...show, receivedAt: 1000 })}`);
  Object.assign(node('#video'), { src: show.mediaPath, paused: false, loads: 0 });
}
async function main() {
  prime(); response = { status: 403, data: { error: 'Role revoked' } };
  await run('poll()'); assert.equal(node('#video').src, '', 'Authorization failure unloads media immediately');
  assert.equal(run('hasStarted'), false);
  prime(); response = { status: 401, data: { error: 'Phiên xem đã hết hạn' } };
  await run('poll()'); assert.equal(node('#video').src, show.mediaPath, '401 session expiration does not interrupt playback');
  assert.equal(run('hasStarted'), true, '401 maintains hasStarted true');
  prime(); networkError = new Error('Temporary network error');
  await run('poll()'); assert.equal(node('#video').src, show.mediaPath, 'Brief outages do not interrupt playback');
  clock = 32000; await run('poll()'); assert.equal(node('#video').src, '', 'Long outages fail closed');
  clock = 1000; networkError = null; prime(); fetchCalls = [];
  await run('handleMovieEnded()'); assert.equal(fetchCalls.length, 0, 'Local end does not mutate the guild schedule');
  response = { status: 200, data: { title: 'Cinema', description: '', canSeek: false, show, shows: [], upcoming: [] } };
  await run('poll()'); assert.equal(node('#video').src, '', 'Polling does not reload the same completed file');
  prime(); response.data.show = { ...show, position: 600 };
  await run('poll()'); assert.equal(node('#video').loads, 0, 'Seek synchronization does not reload media');
  assert.equal(node('#video').currentTime, 600);

  // Smooth adaptive rate sync (eliminates buffer drop & stutter on minor drift)
  prime();
  node('#video').currentTime = 300;
  node('#video').playbackRate = 1.0;
  response.data.show = { ...show, position: 302 };
  await run('poll()');
  assert.equal(node('#video').currentTime, 300, 'Minor drift does not trigger hard seek/buffer drop');
  assert.equal(node('#video').playbackRate > 1.0, true, 'Minor lag speeds up playbackRate smoothly');

  // Deadband (in-sync drift <= 0.8s keeps rate at 1.0)
  response.data.show = { ...show, position: 300.3 };
  await run('poll()');
  assert.equal(node('#video').currentTime, 300, 'In-sync drift keeps currentTime untouched');
  assert.equal(node('#video').playbackRate, 1.0, 'In-sync drift maintains normal 1.0x playback speed');

  // Background reauth updates session token without reloading media
  prime();
  run(`
    currentClientId = '999';
    discordSdk = {
      commands: {
        authorize: async () => ({ code: 'new-auth-code' }),
        authenticate: async () => ({})
      }
    };
  `);
  response = { status: 200, data: { session: 'refreshed-session-token', access_token: 'new-oauth' } };
  await run('tryReauth()');
  assert.equal(run('session'), 'refreshed-session-token', 'tryReauth successfully updates session token');
  assert.equal(node('#video').src, show.mediaPath, 'tryReauth keeps video src intact');

  console.log('PASS Cinema player: permission loss, 401 session resilience, transient vs prolonged network outage, local-ended isolation, no reload on seek, and smooth adaptive-rate sync.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
