'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const { isSpotifyUrl, parseSpotifyUrl, resolveSpotify, checkNewTracksInPlaylist } = require('../utils/spotifySource');
const { MusicSystem } = require('../utils/musicSystem');
const { normalizeQuery } = require('../utils/musicSource');

async function run() {
  // 1. Kiểm tra nhận dạng link Spotify
  assert.equal(isSpotifyUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'), true);
  assert.equal(isSpotifyUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'), true);
  assert.equal(isSpotifyUrl('https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3'), true);
  assert.equal(isSpotifyUrl('https://youtube.com/watch?v=123'), false);
  assert.equal(isSpotifyUrl('bài hát hay'), false);

  // 2. Kiểm tra parse URL Spotify
  const parsedTrack = parseSpotifyUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc');
  assert.equal(parsedTrack.type, 'track');
  assert.equal(parsedTrack.id, '4cOdK2wGLETKBW3PvgPWqT');

  const parsedPlaylist = parseSpotifyUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
  assert.equal(parsedPlaylist.type, 'playlist');
  assert.equal(parsedPlaylist.id, '37i9dQZF1DXcBWIGoYBM5M');

  // 3. Kiểm tra normalizeQuery không chặn link Spotify
  assert.equal(
    normalizeQuery('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'),
    'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'
  );

  // 4. Kiểm tra resolve bài hát đơn lẻ từ Spotify
  const trackData = await resolveSpotify('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
  assert.equal(trackData.isSpotify, true);
  assert.ok(trackData.title.toLowerCase().includes('never gonna give you up'));
  assert.ok(trackData.title.toLowerCase().includes('rick astley'));
  assert.ok(trackData.query.length > 0);

  // 5. Kiểm tra resolve Playlist từ Spotify
  const playlistData = await resolveSpotify('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
  assert.equal(playlistData.isCollection, true);
  assert.equal(playlistData.type, 'playlist');
  assert.ok(playlistData.name.length > 0);
  assert.ok(playlistData.tracks.length > 0);
  assert.equal(playlistData.tracks[0].isSpotify, true);

  // 6. Kiểm tra tích hợp nạp Playlist và Tự động cập nhật bài mới trong MusicSystem
  const sentMessages = [];
  const audioFixture = {
    AudioPlayerStatus: { Idle: 'idle', Playing: 'playing' },
    VoiceConnectionStatus: { Ready: 'ready', Destroyed: 'destroyed', Disconnected: 'disconnected' },
    NoSubscriberBehavior: { Pause: 'pause' },
    StreamType: { Raw: 'raw' },
    createAudioResource: stream => ({ stream }),
    createAudioPlayer() {
      const player = new EventEmitter();
      player.state = { status: 'idle' };
      player.play = () => { player.state.status = 'playing'; };
      player.stop = () => { player.state.status = 'idle'; };
      return player;
    },
    joinVoiceChannel() {
      const connection = new EventEmitter();
      connection.state = { status: 'ready' };
      connection.subscribe = () => {};
      connection.destroy = () => {};
      return connection;
    },
    async entersState(target) { return target; },
  };

  const mediaFixture = {
    async resolveTrack(q) {
      if (q.startsWith('https://open.spotify.com/playlist/')) {
        return playlistData;
      }
      return { title: q, url: 'https://audio.mock.url/sample.opus', duration: 180 };
    },
    openAudio(t) {
      const s = new PassThrough();
      return { stream: s, onError: () => {}, close: () => s.destroy() };
    },
  };

  const music = new MusicSystem({ audio: audioFixture, media: mediaFixture, idleMs: 50 });
  const mockInteraction = {
    guildId: 'guild-spotify-test',
    user: { id: 'user-001' },
    guild: {
      voiceAdapterCreator: {},
      members: { fetch: async () => ({ voice: { channelId: 'voice-sp-1' } }) },
    },
    channel: {
      send: async payload => sentMessages.push(payload.content),
    },
  };
  const voiceChannel = { id: 'voice-sp-1' };

  // Nạp playlist Spotify qua music.add (dùng lệnh /play)
  const addResult = await music.add(mockInteraction, voiceChannel, 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
  assert.equal(addResult.isPlaylist, true);
  assert.ok(addResult.addedCount > 0);
  assert.equal(addResult.playlistName, playlistData.name);

  const session = music.session('guild-spotify-test');
  assert.ok(session, 'Phải tạo phiên phát nhạc');
  assert.ok(session.spotifyPlaylist, 'Phiên nhạc phải lưu thông tin playlist Spotify');
  assert.equal(session.spotifyPlaylist.url, playlistData.url);

  // Giả lập phát hiện bài hát mới trong Playlist Spotify
  session.spotifyPlaylist.lastChecked = 0; // reset thời gian kiểm tra
  // Giả lập danh sách chỉ có vài bài đã nạp, Spotify có bài mới
  const fakeLoaded = new Set(['spotify:track:old1']);
  session.spotifyPlaylist.loadedUris = fakeLoaded;

  await music.checkSpotifyPlaylistUpdates(session);
  const updateNotice = sentMessages.find(m => m && m.includes('Đã tự động cập nhật thêm'));
  assert.ok(updateNotice, 'Bot phải gửi thông báo khi playlist Spotify có thêm bài hát mới');

  music.destroy(session);

  console.log('PASS spotify-music: isSpotifyUrl, parseSpotifyUrl, resolveTrack single & playlist, MusicSystem lazy-resolve, and auto-sync new playlist tracks.');
}

run().catch(err => {
  console.error('FAIL spotify-music:', err);
  process.exit(1);
});
