'use strict';

const voice = require('@discordjs/voice');
const source = require('./musicSource');

function label(track) {
  return String(track.title).replace(/[@`*_~|<>\[\]\\]/g, '').slice(0, 160);
}

class MusicSystem {
  constructor({ audio = voice, media = source, idleMs = 60_000 } = {}) {
    this.audio = audio;
    this.media = media;
    this.idleMs = idleMs;
    this.sessions = new Map();
    this.requests = new Set();
    this.revisions = new Map();
  }

  session(guildId) { return this.sessions.get(guildId); }

  async add(interaction, channel, query) {
    if (Array.isArray(query)) {
      return this.addMultiple(interaction, channel, query);
    }
    const guildId = interaction.guildId;
    const requestId = `${guildId}:${interaction.user.id}`;
    const revision = this.revisions.get(guildId) || 0;
    if (this.requests.has(requestId)) throw new Error('Bạn đang tìm một bài hát. Hãy chờ yêu cầu trước hoàn tất.');
    const before = this.session(guildId);
    if (before && before.channelId !== channel.id) throw new Error('Bot đang phát ở kênh voice khác. Hãy vào cùng kênh với bot.');
    if (before?.queue.length >= 50) throw new Error('Hàng chờ đã đủ 50 bài.');
    this.requests.add(requestId);
    try {
      const track = await this.media.resolveTrack(query);
      // Kiểm tra lại kênh voice vì thành viên có thể đã chuyển kênh trong lúc tìm bài.
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if ((this.revisions.get(guildId) || 0) !== revision) throw new Error('Bạn đã dừng phiên nhạc. Hãy dùng /play lại.');
      if (member.voice.channelId !== channel.id) throw new Error('Bạn đã rời kênh voice. Vào lại kênh rồi dùng /play.');
      if (before && this.session(guildId) !== before) throw new Error('Phiên nhạc đã dừng. Hãy dùng /play lại.');
      let session = this.session(guildId);
      if (session && session.channelId !== channel.id) throw new Error('Bot đang phát ở kênh voice khác.');
      if (session?.queue.length >= 50) throw new Error('Hàng chờ đã đủ 50 bài.');
      if (!session) {
        const player = this.audio.createAudioPlayer({ behaviors: { noSubscriber: this.audio.NoSubscriberBehavior.Pause } });
        const connection = this.audio.joinVoiceChannel({ channelId: channel.id, guildId,
          adapterCreator: interaction.guild.voiceAdapterCreator, selfDeaf: true });
        session = { guildId, channelId: channel.id, connection, player, queue: [], current: null,
          textChannel: interaction.channel, timer: null, recovering: false };
        this.sessions.set(guildId, session);
        connection.subscribe(player);
        player.on(this.audio.AudioPlayerStatus.Idle, () => {
          if (!session.current) return;
          session.current.audio?.close();
          session.current = null;
          void this.next(session);
        });
        player.on('error', () => this.fail(session, session.current));
        connection.on('error', () => this.destroy(session));
        connection.on(this.audio.VoiceConnectionStatus.Destroyed, () => this.destroy(session));
        connection.on(this.audio.VoiceConnectionStatus.Disconnected, async () => {
          if (session.recovering || !this.active(session)) return;
          session.recovering = true;
          try { await this.audio.entersState(connection, this.audio.VoiceConnectionStatus.Ready, 15_000); }
          catch { this.destroy(session); }
          finally { session.recovering = false; }
        });
      }
      clearTimeout(session.timer);

      // Nếu là Playlist / Album Spotify: nạp danh sách và kích hoạt tự động theo dõi
      if (track?.isCollection && Array.isArray(track.tracks)) {
        session.spotifyPlaylist = {
          url: track.url,
          name: track.name,
          loadedUris: new Set(track.tracks.map(t => t.uri)),
          lastChecked: Date.now(),
        };
        let addedCount = 0;
        for (const t of track.tracks) {
          if (session.queue.length >= 50) break;
          session.queue.push({ ...t, requestedBy: interaction.user.id });
          addedCount++;
        }
        void this.next(session);
        return { isPlaylist: true, playlistName: track.name, addedCount };
      }

      session.queue.push({ ...track, requestedBy: interaction.user.id });
      const position = session.current ? session.queue.length : 0;
      void this.next(session);
      return { track, position };
    } finally { this.requests.delete(requestId); }
  }

  async addMultiple(interaction, channel, tracks) {
    if (!Array.isArray(tracks) || !tracks.length) throw new Error('Danh sách bài hát trống.');
    const guildId = interaction.guildId;
    const before = this.session(guildId);
    if (before && before.channelId !== channel.id) throw new Error('Bot đang phát ở kênh voice khác. Hãy vào cùng kênh với bot.');
    let session = this.session(guildId);
    if (!session) {
      const player = this.audio.createAudioPlayer({ behaviors: { noSubscriber: this.audio.NoSubscriberBehavior.Pause } });
      const connection = this.audio.joinVoiceChannel({ channelId: channel.id, guildId,
        adapterCreator: interaction.guild.voiceAdapterCreator, selfDeaf: true });
      session = { guildId, channelId: channel.id, connection, player, queue: [], current: null,
        textChannel: interaction.channel, timer: null, recovering: false };
      this.sessions.set(guildId, session);
      connection.subscribe(player);
      player.on(this.audio.AudioPlayerStatus.Idle, () => {
        if (!session.current) return;
        session.current.audio?.close();
        session.current = null;
        void this.next(session);
      });
      player.on('error', () => this.fail(session, session.current));
      connection.on('error', () => this.destroy(session));
      connection.on(this.audio.VoiceConnectionStatus.Destroyed, () => this.destroy(session));
      connection.on(this.audio.VoiceConnectionStatus.Disconnected, async () => {
        if (session.recovering || !this.active(session)) return;
        session.recovering = true;
        try { await this.audio.entersState(connection, this.audio.VoiceConnectionStatus.Ready, 15_000); }
        catch { this.destroy(session); }
        finally { session.recovering = false; }
      });
    }
    clearTimeout(session.timer);
    let addedCount = 0;
    for (const track of tracks) {
      if (session.queue.length >= 50) break;
      session.queue.push({ ...track, requestedBy: interaction.user.id });
      addedCount++;
    }
    void this.next(session);
    return { addedCount, totalInQueue: session.queue.length };
  }

  active(session) { return this.sessions.get(session.guildId) === session; }

  async tell(session, content) {
    if (!this.active(session)) return;
    await session.textChannel?.send({ content, allowedMentions: { parse: [] } }).catch(() => {});
  }

  async checkSpotifyPlaylistUpdates(session) {
    if (!this.active(session) || !session.spotifyPlaylist) return;
    if (Date.now() - (session.spotifyPlaylist.lastChecked || 0) < 15_000) return;
    session.spotifyPlaylist.lastChecked = Date.now();
    try {
      const { checkNewTracksInPlaylist } = require('./spotifySource');
      const newTracks = await checkNewTracksInPlaylist(
        session.spotifyPlaylist.url,
        session.spotifyPlaylist.loadedUris
      );
      if (newTracks.length > 0 && this.active(session)) {
        let addedCount = 0;
        for (const t of newTracks) {
          if (session.queue.length >= 50) break;
          session.spotifyPlaylist.loadedUris.add(t.uri);
          session.queue.push({ ...t, requestedBy: 'auto-sync' });
          addedCount++;
        }
        if (addedCount > 0) {
          await this.tell(session, `🔔 Đã tự động cập nhật thêm **${addedCount} bài hát mới** từ playlist Spotify **${session.spotifyPlaylist.name}** vào hàng chờ!`);
        }
      }
    } catch (err) {
      console.warn('[SPOTIFY AUTO UPDATE ERROR]', err.message);
    }
  }

  async next(session) {
    if (!this.active(session) || session.current) return;
    clearTimeout(session.timer);
    if (!session.queue.length) {
      session.timer = setTimeout(() => this.destroy(session), this.idleMs);
      session.timer.unref?.();
      return;
    }
    const track = session.queue.shift();
    session.current = track;

    // Tự động kiểm tra và cập nhật bài hát mới từ Playlist Spotify nếu hàng chờ sắp hết
    if (session.spotifyPlaylist && session.queue.length <= 4) {
      void this.checkSpotifyPlaylistUpdates(session);
    }

    try {
      await this.audio.entersState(session.connection, this.audio.VoiceConnectionStatus.Ready, 20_000);
      if (!this.active(session) || session.current !== track) return;

      // Nếu track từ Spotify chưa có direct audio url, tìm ngay trước khi phát
      if (track.isSpotify && !track.url) {
        try {
          const resolvedAudio = await this.media.resolveTrack(track.query || track.title);
          track.url = resolvedAudio.url;
          if (!track.duration) track.duration = resolvedAudio.duration;
        } catch (resolveErr) {
          this.fail(session, track, resolveErr);
          return;
        }
      }

      track.audio = this.media.openAudio(track);
      track.audio.onError(error => this.fail(session, track, error));
      const resource = this.audio.createAudioResource(track.audio.stream, { inputType: this.audio.StreamType.Raw });
      session.player.play(resource);
      await this.audio.entersState(session.player, this.audio.AudioPlayerStatus.Playing, 25_000);
      if (this.active(session) && session.current === track) await this.tell(session, `🎶 Đang phát: **${label(track)}**`);
    } catch (error) {
      if (session.connection.state.status !== this.audio.VoiceConnectionStatus.Ready && this.active(session)) {
        await this.tell(session, '❌ Không kết nối được voice. Kiểm tra quyền Kết nối/Nói của bot và thử lại.');
        this.destroy(session);
      } else this.fail(session, track, error);
    }
  }

  fail(session, track, error) {
    if (!track || !this.active(session) || session.current !== track) return;
    void this.tell(session, `❌ Không phát được **${label(track)}**. ${source.sourceErrorMessage(error)}`);
    this.skip(session);
  }

  skip(session) {
    const track = session.current;
    session.current = null;
    track?.audio?.close();
    session.player.stop(true);
    void this.next(session);
  }

  destroy(session) {
    if (!this.active(session)) return;
    this.sessions.delete(session.guildId);
    this.revisions.set(session.guildId, (this.revisions.get(session.guildId) || 0) + 1);
    clearTimeout(session.timer);
    session.queue = [];
    session.current?.audio?.close();
    session.current = null;
    session.player.stop(true);
    if (session.connection.state.status !== this.audio.VoiceConnectionStatus.Destroyed) session.connection.destroy();
  }

  handleVoiceState(oldState, newState) {
    const session = this.session(newState.guild.id);
    if (!session) return;
    if (newState.id === newState.client.user.id && newState.channelId !== session.channelId) {
      this.destroy(session);
      return;
    }
    const channel = newState.guild.channels.cache.get(session.channelId);
    if (channel && !channel.members.some(member => !member.user.bot)) this.destroy(session);
  }
}

const music = new MusicSystem();
module.exports = { MusicSystem, music, label };
