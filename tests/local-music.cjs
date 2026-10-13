'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const localMusic = require('../utils/localMusic');
const { resolveTrack, openAudio } = require('../utils/musicSource');
const { MusicSystem } = require('../utils/musicSystem');
const musiclocalCommand = require('../commands/music/musiclocal');

async function run() {
  const musicDir = localMusic.getMusicDirectory();
  assert.ok(fs.existsSync(musicDir), 'Thư mục kho nhạc phải tồn tại');

  // 1. Tạo 2 file nhạc mẫu (.mp3 và .mp4) để kiểm tra
  const testMp3 = path.join(musicDir, 'sample_song.mp3');
  const testMp4 = path.join(musicDir, 'sample_video.mp4');
  fs.writeFileSync(testMp3, Buffer.from('FAKE MP3 AUDIO CONTENT FOR TESTING'));
  fs.writeFileSync(testMp4, Buffer.from('FAKE MP4 VIDEO CONTENT FOR TESTING'));

  try {
    // 2. Kiểm tra listTracks
    const tracks = localMusic.listTracks();
    assert.ok(tracks.length >= 2, 'Kho nhạc phải có ít nhất 2 bài mẫu');
    const mp3Track = tracks.find(t => t.filename === 'sample_song.mp3');
    const mp4Track = tracks.find(t => t.filename === 'sample_video.mp4');
    assert.ok(mp3Track, 'Phải tìm thấy sample_song.mp3');
    assert.ok(mp4Track, 'Phải tìm thấy sample_video.mp4');
    assert.equal(mp3Track.ext, '.mp3');
    assert.equal(mp4Track.ext, '.mp4');

    // 3. Kiểm tra findTrack
    assert.ok(localMusic.findTrack('sample_song'));
    assert.ok(localMusic.findTrack('sample_video.mp4'));
    assert.equal(localMusic.findTrack('non_existent_track'), null);

    // 4. Kiểm tra toMusicTrack & resolveTrack
    const converted = localMusic.toMusicTrack(mp3Track);
    assert.equal(converted.isLocal, true);
    assert.equal(converted.url, 'local:sample_song.mp3');

    const resolved = await resolveTrack('local:sample_song.mp3');
    assert.equal(resolved.isLocal, true);
    assert.equal(resolved.filePath, testMp3);

    // 5. Kiểm tra openAudio cho local track
    const handle = openAudio(resolved);
    assert.ok(handle.stream, 'Phải trả về PassThrough stream');
    assert.equal(typeof handle.close, 'function', 'Phải có hàm close');
    handle.close();

    // 6. Kiểm tra autocomplete trong lệnh musiclocal
    let autocompleteResults = null;
    const mockAutocompleteInteraction = {
      options: { getFocused: () => 'sample' },
      respond: async (results) => { autocompleteResults = results; },
    };
    await musiclocalCommand.autocomplete(mockAutocompleteInteraction);
    assert.ok(autocompleteResults.length >= 2, 'Autocomplete phải gợi ý 2 bài');
    assert.ok(autocompleteResults.some(r => r.value === 'sample_song.mp3'));

    // 7. Kiểm tra tích hợp với MusicSystem
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
      async resolveTrack(q) { return resolveTrack(q); },
      openAudio(t) {
        const s = new PassThrough();
        return { stream: s, onError: () => {}, close: () => s.destroy() };
      },
    };

    const musicSystem = new MusicSystem({ audio: audioFixture, media: mediaFixture, idleMs: 50 });
    const mockInteraction = {
      guildId: 'guild-local-test',
      user: { id: 'user-001' },
      guild: {
        voiceAdapterCreator: {},
        members: { fetch: async () => ({ voice: { channelId: 'voice-ch-1' } }) },
      },
      channel: { send: async () => {} },
    };
    const voiceChannel = { id: 'voice-ch-1' };

    // Thêm 1 bài vào phát
    const addResult = await musicSystem.add(mockInteraction, voiceChannel, 'local:sample_song.mp3');
    assert.equal(addResult.position, 0, 'Bài đầu tiên phải phát ngay');
    assert.equal(addResult.track.isLocal, true);

    // Thêm danh sách nhiều bài (Play All)
    const multiTracks = [localMusic.toMusicTrack(mp3Track), localMusic.toMusicTrack(mp4Track)];
    const multiRes = await musicSystem.addMultiple(mockInteraction, voiceChannel, multiTracks);
    assert.equal(multiRes.addedCount, 2, 'Phải thêm đủ 2 bài vào queue');

    // Dọn dẹp phiên nhạc
    musicSystem.destroy(musicSystem.session('guild-local-test'));

    // 8. Kiểm tra xóa bài
    const deleted = localMusic.deleteTrack('sample_song.mp3');
    assert.ok(deleted, 'Phải xóa bài thành công');
    assert.equal(fs.existsSync(testMp3), false, 'File mp3 phải bị xóa');

  } finally {
    // Dọn file mẫu test nếu còn sót
    if (fs.existsSync(testMp3)) fs.unlinkSync(testMp3);
    if (fs.existsSync(testMp4)) fs.unlinkSync(testMp4);
  }

  console.log('PASS local-music: directory scanning, mp3/mp4 support, resolveTrack, FFmpeg decoder, autocomplete, MusicSystem integration and track deletion.');
}

run().catch(err => {
  console.error('FAIL local-music:', err);
  process.exit(1);
});
