const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { MusicSystem } = require('../utils/musicSystem');
const { normalizeQuery } = require('../utils/musicSource');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const events = [];
  let blockReady = null;
  const audio = {
    AudioPlayerStatus: { Idle: 'idle', Playing: 'playing' }, VoiceConnectionStatus: { Ready: 'ready', Destroyed: 'destroyed', Disconnected: 'disconnected' },
    NoSubscriberBehavior: { Pause: 'pause' }, StreamType: { Raw: 'raw' },
    createAudioResource: stream => ({ stream }),
    createAudioPlayer() {
      const player = new EventEmitter();
      player.state = { status: 'idle' };
      player.play = resource => { player.resource = resource; player.state.status = 'playing'; };
      player.stop = () => { player.state.status = 'idle'; player.emit('idle'); };
      return player;
    },
    joinVoiceChannel() {
      const connection = new EventEmitter();
      connection.state = { status: 'ready' };
      connection.subscribe = () => {};
      connection.destroy = () => { connection.state.status = 'destroyed'; connection.emit('destroyed'); };
      return connection;
    },
    async entersState(target, status) {
      if (status === 'ready' && blockReady) await blockReady;
      return target;
    },
  };
  const media = {
    async resolveTrack(query) { return { title: query, url: 'https://youtube.com/watch?v=sample' }; },
    openAudio(track) {
      const stream = new PassThrough();
      const handle = { stream, onError(fn) { handle.fail = fn; }, close() { events.push(`closed:${track.title}`); stream.destroy(); } };
      events.push(`opened:${track.title}`);
      return handle;
    },
  };
  const music = new MusicSystem({ audio, media, idleMs: 10 });
  const channel = { id: 'voice' };
  function interaction(guildId = 'one', userId = 'user') {
    return { guildId, user: { id: userId }, guild: { members: { fetch: async () => ({ voice: { channelId: 'voice' } }) } },
      channel: { send: async payload => events.push(payload.content) } };
  }
  return { music, media, events, interaction, channel, block(promise) { blockReady = promise; } };
}

async function main() {
  assert.equal(normalizeQuery('  bài hát  '), 'scsearch1:bài hát');
  assert.equal(normalizeQuery('https://youtu.be/abc'), 'https://youtu.be/abc');
  for (const input of ['http://127.0.0.1/a', 'file:///etc/passwd', 'https://youtube.com.evil.test/a',
    'https://user:secret@youtube.com/a', 'https://youtube.com:8443/a', '', 'x'.repeat(501)]) {
    assert.throws(() => normalizeQuery(input));
  }

  const f = fixture();
  await f.music.add(f.interaction(), f.channel, 'first');
  await tick();
  const session = f.music.session('one');
  assert.equal(session.current.title, 'first');
  assert.equal((await f.music.add(f.interaction(), f.channel, 'second')).position, 1);
  await assert.rejects(f.music.add(f.interaction(), { id: 'other' }, 'wrong channel'), /kênh voice khác/);
  await f.music.add(f.interaction('two'), f.channel, 'server two');
  f.music.skip(session);
  await tick();
  assert.equal(session.current.title, 'second');
  assert(f.events.includes('closed:first'));
  assert.equal(f.music.session('two').current.title, 'server two');
  // Error callbacks from a cancelled source cannot skip the replacement track.
  f.music.fail(session, { title: 'first' });
  assert.equal(session.current.title, 'second');
  session.current.audio.fail(new Error('stream failed'));
  await tick();
  assert.equal(session.current, null);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(f.music.session('one'), undefined);
  f.music.destroy(f.music.session('two'));
  assert(f.events.includes('closed:server two'));

  // Stop while connection or metadata is pending must not resurrect audio/voice.
  const g = fixture();
  let ready;
  g.block(new Promise(resolve => { ready = resolve; }));
  await g.music.add(g.interaction(), g.channel, 'pending');
  const pending = g.music.session('one');
  g.music.destroy(pending);
  ready();
  await tick();
  assert(!g.events.includes('opened:pending'));

  const h = fixture();
  await h.music.add(h.interaction(), h.channel, 'current');
  let resolve;
  h.media.resolveTrack = () => new Promise(done => { resolve = done; });
  const request = h.music.add(h.interaction(), h.channel, 'search');
  await assert.rejects(h.music.add(h.interaction(), h.channel, 'duplicate'), /đang tìm/);
  h.music.destroy(h.music.session('one'));
  resolve({ title: 'search', url: 'https://youtube.com/watch?v=sample' });
  await assert.rejects(request, /dừng phiên nhạc/);
  assert.equal(h.music.session('one'), undefined);
  assert.equal(h.music.requests.size, 0);

  const { loadCommands } = require('../utils/loadCommands');
  const commands = loadCommands();
  for (const name of ['play', 'queue', 'skip', 'stop', 'pause', 'resume']) {
    assert.equal(commands.get(name).execute.length, 1);
  }
  assert.equal(commands.get('play').data.options[0].required, true);
  console.log('Music tests passed: isolation, queue, errors, cancellation, URL restrictions, command integration.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
