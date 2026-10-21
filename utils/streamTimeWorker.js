'use strict';

/**
 * Lowkey Stream Time Badge Worker (Huy hiệu Phát trực tiếp / Stream cho người khác)
 * Tự động cày tích lũy giờ phát trực tiếp (Stream / Go Live / Chia sẻ màn hình)
 * Hỗ trợ 2 chế độ:
 *   1. Chế độ Trợ lý Treo Voice 24/7 (AFK Stream Viewer Bot) — Không cần token, bot vào làm khán giả 24/7
 *   2. Chế độ Cày ngầm bằng User Token (Token Gateway Streamer) — 24/7 trên Cloud, tắt máy vẫn stream
 * Tích hợp tự động khôi phục (Auto-Resume) khi khởi động lại máy chủ / Cloud.
 */

const fs = require('node:fs');
const path = require('node:path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
let voice = null;
try {
  voice = require('@discordjs/voice');
} catch (e) {}

let WebSocketImpl = globalThis.WebSocket;
try {
  WebSocketImpl = require('ws');
} catch (e) {}

let voiceAdapter = voice;
function setVoiceAdapter(adapter) {
  voiceAdapter = adapter || voice;
}

function resolveProgressFilePath() {
  const railwayDataDir = '/data';
  if (fs.existsSync(railwayDataDir)) {
    return path.join(railwayDataDir, 'stream_progress.json');
  }
  return path.join(__dirname, '..', 'data', 'stream_progress.json');
}

const PROGRESS_FILE = resolveProgressFilePath();

// 10 Cấp bậc chính thức của Huy hiệu Stream Discord (đúng 100% giao diện tiếng Việt)
const TIERS = [
  { hours: 1, title: 'Người mới', color: 0x99AAB5, icon: '🖥️', badgeName: 'Newcomer' },
  { hours: 5, title: 'Chim non', color: 0x57F287, icon: '🟩', badgeName: 'Fledgling' },
  { hours: 20, title: 'Đột phá', color: 0x248046, icon: '🌲', badgeName: 'Breakout' },
  { hours: 75, title: 'Nổi bật', color: 0x00A8FC, icon: '🔷', badgeName: 'Standout' },
  { hours: 150, title: 'Người tạo xu hướng', color: 0x5865F2, icon: '🟦', badgeName: 'Trendsetter' },
  { hours: 300, title: 'Tiêu điểm', color: 0x3C45A5, icon: '🌌', badgeName: 'Headliner' },
  { hours: 500, title: 'Ngôi sao', color: 0x9B59B6, icon: '⭐', badgeName: 'Star' },
  { hours: 1000, title: 'Cảm giác', color: 0xEB459E, icon: '🔮', badgeName: 'Sensation' },
  { hours: 2000, title: 'Nhà tiên tri', color: 0xED4245, icon: '👑', badgeName: 'Oracle' },
  { hours: 5000, title: 'Xuất thần', color: 0xFEE75C, icon: '⚡', badgeName: 'Ascended' },
];

function getTierTitle(hours) {
  let title = 'Chưa mở khóa';
  for (const t of TIERS) {
    if (hours >= t.hours) title = t.title;
  }
  return title;
}

function getTierInfo(totalHours) {
  let currentTier = { hours: 0, title: 'Chưa mở khóa', color: 0x99AAB5, icon: '🖥️' };
  let nextTier = TIERS[0];

  for (let i = 0; i < TIERS.length; i++) {
    if (totalHours >= TIERS[i].hours) {
      currentTier = TIERS[i];
      nextTier = TIERS[i + 1] || null;
    }
  }

  let percent = 100;
  let hoursRemaining = 0;
  if (nextTier) {
    const range = nextTier.hours - currentTier.hours;
    const progress = Math.max(0, totalHours - currentTier.hours);
    percent = Math.min(100, Math.max(0, Math.round((progress / range) * 100)));
    hoursRemaining = Math.max(1, nextTier.hours - totalHours);
  }

  const filled = Math.min(10, Math.floor(percent / 10));
  const empty = Math.max(0, 10 - filled);
  const progressBar = '█'.repeat(filled) + '░'.repeat(empty);

  return {
    currentTier,
    nextTier,
    percent,
    hoursRemaining,
    progressBar,
  };
}

function loadStreamProgress(userId) {
  const uid = String(userId || '');
  // 1. Ưu tiên đọc từ SQLite database bền vững
  try {
    const { getDb } = require('./database');
    const db = getDb();
    const row = db.prepare('SELECT * FROM stream_sessions WHERE user_id = ?').get(uid);
    if (row) {
      let notifiedHours = [];
      try { notifiedHours = JSON.parse(row.notified_hours_json || '[]') || []; } catch {}
      return {
        userId: uid,
        accumulatedSeconds: row.accumulated_seconds || 0,
        currentSessionSeconds: row.current_session_seconds || 0,
        status: row.status || 'idle',
        mode: row.mode || 'viewer_bot',
        guildId: row.guild_id || null,
        channelId: row.channel_id || null,
        notifiedHours,
        updatedAt: row.updated_at || Date.now(),
      };
    }
  } catch (_) {}

  // 2. Dự phòng đọc từ file JSON nếu database chưa có
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      if (data && data[uid]) {
        return {
          ...data[uid],
          notifiedHours: data[uid].notifiedHours || [],
        };
      }
    }
  } catch (_) {}

  return {
    userId: uid,
    accumulatedSeconds: 0,
    currentSessionSeconds: 0,
    status: 'idle',
    mode: 'viewer_bot',
    notifiedHours: [],
    updatedAt: Date.now(),
  };
}

function saveStreamProgress(userId, progress) {
  const uid = String(userId || '');
  // 1. Lưu vào SQLite database bền vững
  try {
    const { getDb } = require('./database');
    const db = getDb();
    const existing = db.prepare('SELECT user_id, token, started_at, username, guild_id, channel_id, mode FROM stream_sessions WHERE user_id = ?').get(uid);
    const startedAt = progress.startedAt || existing?.started_at || Date.now();
    const token = progress.token || existing?.token || '';
    const username = progress.username || existing?.username || null;
    const guildId = progress.guildId || existing?.guild_id || null;
    const channelId = progress.channelId || existing?.channel_id || null;
    const mode = progress.mode || existing?.mode || 'viewer_bot';
    const notifiedHoursJson = JSON.stringify(progress.notifiedHours || []);

    db.prepare(`
      INSERT INTO stream_sessions (
        user_id, token, username, guild_id, channel_id, mode,
        status, started_at, updated_at, accumulated_seconds, current_session_seconds, last_heartbeat_at,
        notified_hours_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        token = CASE WHEN excluded.token != '' THEN excluded.token ELSE stream_sessions.token END,
        username = COALESCE(excluded.username, stream_sessions.username),
        guild_id = COALESCE(excluded.guild_id, stream_sessions.guild_id),
        channel_id = COALESCE(excluded.channel_id, stream_sessions.channel_id),
        mode = excluded.mode,
        status = excluded.status,
        started_at = excluded.started_at,
        updated_at = excluded.updated_at,
        accumulated_seconds = excluded.accumulated_seconds,
        current_session_seconds = excluded.current_session_seconds,
        last_heartbeat_at = excluded.last_heartbeat_at,
        notified_hours_json = excluded.notified_hours_json
    `).run(
      uid,
      token,
      username,
      guildId,
      channelId,
      mode,
      progress.status || 'running',
      startedAt,
      Date.now(),
      progress.accumulatedSeconds || 0,
      progress.currentSessionSeconds || 0,
      progress.lastHeartbeatAt || Date.now(),
      notifiedHoursJson
    );
  } catch (e) {
    console.warn('[STREAM WORKER] DB saveProgress error:', e.message);
  }

  // 2. Ghi ra JSON mirror cho tương thích
  try {
    const dir = path.dirname(PROGRESS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let data = {};
    if (fs.existsSync(PROGRESS_FILE)) {
      try {
        data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')) || {};
      } catch {}
    }
    data[uid] = {
      ...progress,
      updatedAt: Date.now(),
    };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('[STREAM WORKER] JSON saveProgress error:', e.message);
  }
}

// Map quản lý các phiên cày Stream đang hoạt động theo userId
const activeSessions = new Map();

/**
 * CHẾ ĐỘ 1: Bắt đầu cày Stream bằng cách cho Bot vào làm Khán giả (Viewer) 24/7
 */
async function startViewerStreamFarming(member, textChannel, { onMilestone = null } = {}) {
  if (!member.guild) throw new Error('Chỉ có thể dùng trong server.');
  const voiceChannel = member.voice?.channel;
  if (!voiceChannel) {
    throw new Error('Bạn cần tham gia vào một kênh Voice trước khi gọi bot vào hỗ trợ stream!');
  }

  const userId = member.id;
  const guildId = member.guild.id;

  if (activeSessions.has(userId)) {
    const current = activeSessions.get(userId);
    return {
      alreadyRunning: true,
      message: `Tài khoản của bạn đã có một phiên cày stream đang chạy trong kênh <#${current.channelId}>!`,
    };
  }

  if (!voiceAdapter) {
    throw new Error('Thư viện @discordjs/voice chưa sẵn sàng.');
  }

  const connection = voiceAdapter.joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: member.guild.voiceAdapterCreator,
    selfDeaf: false, // Để bot nghe và làm viewer chân thực
    selfMute: true,
  });

  const progress = loadStreamProgress(userId);
  progress.status = 'running';
  progress.mode = 'viewer_bot';
  progress.guildId = guildId;
  progress.channelId = voiceChannel.id;
  progress.username = member.user?.tag || member.displayName;
  progress.currentSessionSeconds = 0;
  saveStreamProgress(userId, progress);

  const startedAt = Date.now();
  let streamingSeconds = 0;

  // Lắng nghe trạng thái Voice & Stream định kỳ mỗi 30s
  const timer = setInterval(async () => {
    try {
      const currentMember = await member.guild.members.fetch(userId).catch(() => null);
      if (!currentMember || !currentMember.voice?.channelId || currentMember.voice.channelId !== voiceChannel.id) {
        // Người dùng tạm rời phòng voice
        return;
      }

      // Kiểm tra người dùng có đang phát trực tiếp (Stream) hay không
      const isStreaming = Boolean(currentMember.voice?.streaming || currentMember.voice?.selfVideo);

      // Cập nhật thời gian: Nếu người dùng đang stream, tăng 30s
      if (isStreaming) {
        streamingSeconds += 30;
        progress.currentSessionSeconds = streamingSeconds;
        progress.lastHeartbeatAt = Date.now();
        saveStreamProgress(userId, progress);

        const totalHours = Math.floor(((progress.accumulatedSeconds || 0) + streamingSeconds) / 3600);
        if (!Array.isArray(progress.notifiedHours)) progress.notifiedHours = [];

        for (const tier of TIERS) {
          if (totalHours >= tier.hours && !progress.notifiedHours.includes(tier.hours)) {
            progress.notifiedHours.push(tier.hours);
            saveStreamProgress(userId, progress);

            // Gửi thông báo chúc mừng lên cấp
            if (typeof onMilestone === 'function') {
              try { onMilestone({ totalHours: tier.hours, tier }); } catch (_) {}
            }

            if (textChannel && typeof textChannel.send === 'function') {
              const congratsEmbed = new EmbedBuilder()
                .setColor(tier.color)
                .setTitle(`🎉 CHÚC MỪNG BẠN ĐÃ LÊN CẤP HUY HIỆU STREAM DISCORD!`)
                .setDescription(
                  `Xin chúc mừng <@${userId}>!\n\n` +
                  `Bạn vừa đạt mốc **${tier.hours} giờ** phát trực tiếp cho người khác!\n` +
                  `🏅 Cấp độ mới: **${tier.title}** (${tier.badgeName})\n\n` +
                  `*Bot vẫn đang tiếp tục làm Viewer trong kênh ${voiceChannel.name} để cày cấp tiếp theo cho bạn.*`
                )
                .setFooter({ text: 'Lowkey Stream Helper • 24/7 Viewer Companion' })
                .setTimestamp();

              textChannel.send({ content: `<@${userId}>`, embeds: [congratsEmbed] }).catch(() => {});
            }
          }
        }
      }
    } catch (e) {
      console.warn('[STREAM WORKER] Viewer tick error:', e.message);
    }
  }, 30 * 1000);

  if (timer && typeof timer.unref === 'function') timer.unref();

  const session = {
    userId,
    username: member.user?.tag || member.displayName,
    mode: 'viewer_bot',
    guildId,
    channelId: voiceChannel.id,
    connection,
    timer,
    startedAt,
    running: true,
  };

  activeSessions.set(userId, session);

  return {
    alreadyRunning: false,
    channelName: voiceChannel.name,
    message: `Bot đã tham gia kênh **${voiceChannel.name}** làm Viewer 24/7. Hãy bấm **Chia sẻ màn hình (Stream)** để bắt đầu tính giờ nhé!`,
  };
}

/**
 * CHẾ ĐỘ 2: Bắt đầu cày Stream bằng User Token qua Gateway (Chạy ngầm 24/7 Cloud)
 */
class StreamGatewayClient {
  constructor(token, { guildId, channelId } = {}) {
    this.token = token.trim().replace(/^['"]|['"]$/g, '');
    this.guildId = guildId;
    this.channelId = channelId;
    this.ws = null;
    this.heartbeatTimer = null;
    this.streamTimer = null;
    this.reconnectTimer = null;
    this.sequence = null;
    this.sessionId = null;
    this.resumeGatewayUrl = null;
    this.connected = false;
    this.isReady = false;
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.lastHeartbeatAck = Date.now();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.clearReconnectTimer();

      if (this.ws) {
        try {
          if (typeof this.ws.terminate === 'function') this.ws.terminate();
          else if (typeof this.ws.close === 'function') this.ws.close();
        } catch (_) {}
        this.ws = null;
      }

      let isInitialConnect = !this.isReady;
      const timeoutTimer = setTimeout(() => {
        if (!this.isReady && isInitialConnect) {
          isInitialConnect = false;
          this.disconnect(false);
          reject(new Error('Hết thời gian chờ kết nối Gateway (Timeout 15s).'));
        }
      }, 15000);
      if (timeoutTimer && typeof timeoutTimer.unref === 'function') timeoutTimer.unref();

      try {
        const endpoint = (this.resumeGatewayUrl && this.sessionId)
          ? `${this.resumeGatewayUrl.replace(/\/$/, '')}/?v=9&encoding=json`
          : 'wss://gateway.discord.gg/?v=9&encoding=json';
        this.ws = new WebSocketImpl(endpoint);
      } catch (e) {
        clearTimeout(timeoutTimer);
        return reject(e);
      }

      this.ws.on('open', () => {
        this.connected = true;
        this.lastHeartbeatAck = Date.now();
      });

      this.ws.on('message', (raw) => {
        try {
          const payload = JSON.parse(raw.toString());
          const { op, d, s, t } = payload;
          if (s != null) this.sequence = s;

          if (op === 10) {
            const interval = d?.heartbeat_interval || 41250;
            this.startHeartbeat(interval);

            if (this.sessionId && this.sequence != null) {
              this.send({
                op: 6,
                d: {
                  token: this.token,
                  session_id: this.sessionId,
                  seq: this.sequence,
                },
              });
            } else {
              this.send({
                op: 2,
                d: {
                  token: this.token,
                  capabilities: 16381,
                  properties: {
                    os: 'Windows',
                    browser: 'Discord Client',
                    release_channel: 'stable',
                    client_version: '1.0.9168',
                    os_version: '10.0.19045',
                    os_arch: 'x64',
                    system_locale: 'vi-VN',
                  },
                  presence: {
                    status: 'online',
                    since: 0,
                    activities: [],
                    afk: false,
                  },
                },
              });
            }
          }

          if (op === 1) this.send({ op: 1, d: this.sequence });
          if (op === 11) this.lastHeartbeatAck = Date.now();
          if (op === 7) this.reconnect(500);
          if (op === 9) {
            const resumable = Boolean(d);
            if (!resumable) {
              this.sessionId = null;
              this.sequence = null;
            }
            this.reconnect(resumable ? 1000 : 2500);
          }

          if (op === 0 && t === 'READY') {
            this.isReady = true;
            this.sessionId = d?.session_id || this.sessionId;
            this.resumeGatewayUrl = d?.resume_gateway_url || null;
            this.reconnectAttempts = 0;
            clearTimeout(timeoutTimer);
            this.startStreamBroadcast();
            resolve(d?.user);
          }

          if (op === 0 && t === 'RESUMED') {
            this.isReady = true;
            this.reconnectAttempts = 0;
            clearTimeout(timeoutTimer);
            this.startStreamBroadcast();
            if (isInitialConnect) {
              isInitialConnect = false;
              resolve({ resumed: true });
            }
          }
        } catch (_) {}
      });

      this.ws.on('error', (err) => {
        if (!this.isReady && isInitialConnect) {
          isInitialConnect = false;
          clearTimeout(timeoutTimer);
          reject(err);
        }
      });

      this.ws.on('close', (code) => {
        this.stopHeartbeat();
        this.stopStreamBroadcast();
        this.connected = false;
        this.isReady = false;

        if (!this.shouldReconnect) return;
        if (code === 4004) {
          this.shouldReconnect = false;
          return;
        }

        const delay = Math.min(30000, 2000 * Math.pow(1.5, Math.min(this.reconnectAttempts++, 6)));
        this.scheduleReconnect(delay);
      });
    });
  }

  startStreamBroadcast() {
    this.stopStreamBroadcast();
    if (!this.guildId || !this.channelId) return;

    // 1. Gửi Opcode 4: Voice State Update (tham gia phòng voice và bật video/stream)
    this.send({
      op: 4,
      d: {
        guild_id: this.guildId,
        channel_id: this.channelId,
        self_mute: false,
        self_deaf: false,
        self_video: true,
      },
    });

    // 2. Gửi Opcode 18: Stream Create (bắt đầu phát sóng stream màn hình)
    this.send({
      op: 18,
      d: {
        type: 'guild',
        guild_id: this.guildId,
        channel_id: this.channelId,
        preferred_region: null,
      },
    });

    // Định kỳ gửi lại tín hiệu stream để giữ stream sống 24/7
    this.streamTimer = setInterval(() => {
      if (this.isReady) {
        this.send({
          op: 18,
          d: {
            type: 'guild',
            guild_id: this.guildId,
            channel_id: this.channelId,
            preferred_region: null,
          },
        });
      }
    }, 60 * 1000);

    if (this.streamTimer && typeof this.streamTimer.unref === 'function') {
      this.streamTimer.unref();
    }
  }

  stopStreamBroadcast() {
    if (this.streamTimer) {
      clearInterval(this.streamTimer);
      this.streamTimer = null;
    }
  }

  startHeartbeat(interval) {
    this.stopHeartbeat();
    this.lastHeartbeatAck = Date.now();
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastHeartbeatAck > interval * 2.5) {
        this.reconnect(500);
        return;
      }
      this.send({ op: 1, d: this.sequence });
    }, interval);
    if (this.heartbeatTimer && typeof this.heartbeatTimer.unref === 'function') {
      this.heartbeatTimer.unref();
    }
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  scheduleReconnect(delayMs) {
    this.clearReconnectTimer();
    if (!this.shouldReconnect) return;
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect().catch((e) => {
          console.warn('[STREAM GATEWAY] Reconnect error:', e.message);
        });
      }
    }, delayMs);
    if (this.reconnectTimer && typeof this.reconnectTimer.unref === 'function') {
      this.reconnectTimer.unref();
    }
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  reconnect(delayMs = 1000) {
    this.stopHeartbeat();
    this.stopStreamBroadcast();
    if (this.ws) {
      try {
        if (typeof this.ws.terminate === 'function') this.ws.terminate();
        else if (typeof this.ws.close === 'function') this.ws.close(4000, 'Reconnecting');
      } catch (_) {}
      this.ws = null;
    }
    this.connected = false;
    this.isReady = false;
    this.scheduleReconnect(delayMs);
  }

  send(data) {
    if (this.ws && (this.ws.readyState === 1 || this.ws.readyState === WebSocketImpl?.OPEN)) {
      try { this.ws.send(JSON.stringify(data)); } catch (_) {}
    }
  }

  disconnect(permanent = true) {
    if (permanent) this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.stopStreamBroadcast();
    if (this.ws) {
      try { this.ws.close(1000, 'Normal closure'); } catch (_) {}
      this.ws = null;
    }
    this.connected = false;
    this.isReady = false;
  }
}

async function startTokenStreamFarming({
  token,
  userId,
  guildId,
  channelId,
  onMilestone = null,
  onTick = null,
}) {
  const uid = String(userId || '');
  if (!uid) return { success: false, message: 'Thiếu userId.' };

  if (activeSessions.has(uid)) {
    return { success: false, message: 'Tài khoản của bạn đã có một phiên cày stream đang chạy.' };
  }

  const { validateToken } = require('./varietyTokenWorker');
  const userProfile = await validateToken(token);
  if (!userProfile) {
    return {
      success: false,
      message: 'Token Discord không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại token!',
    };
  }

  const progress = loadStreamProgress(uid);
  progress.status = 'running';
  progress.mode = 'token_gateway';
  progress.token = token;
  progress.username = userProfile.username;
  progress.guildId = guildId;
  progress.channelId = channelId;
  progress.currentSessionSeconds = 0;
  saveStreamProgress(uid, progress);

  const client = new StreamGatewayClient(token, { guildId, channelId });
  const startedAt = Date.now();

  const session = {
    userId: uid,
    username: userProfile.username,
    token,
    mode: 'token_gateway',
    guildId,
    channelId,
    client,
    running: true,
    startedAt,
    timer: null,
  };

  activeSessions.set(uid, session);

  try {
    await client.connect();
  } catch (err) {
    activeSessions.delete(uid);
    client.disconnect(true);
    return { success: false, message: `Không thể kết nối Gateway: ${err.message}` };
  }

  session.timer = setInterval(() => {
    if (!session.running) return;
    const elapsedSec = Math.floor((Date.now() - session.startedAt) / 1000);
    progress.currentSessionSeconds = elapsedSec;
    progress.lastHeartbeatAt = Date.now();
    saveStreamProgress(uid, progress);

    const totalHours = Math.floor(((progress.accumulatedSeconds || 0) + elapsedSec) / 3600);
    if (!Array.isArray(progress.notifiedHours)) progress.notifiedHours = [];

    for (const tier of TIERS) {
      if (totalHours >= tier.hours && !progress.notifiedHours.includes(tier.hours)) {
        progress.notifiedHours.push(tier.hours);
        saveStreamProgress(uid, progress);
        if (typeof onMilestone === 'function') {
          try { onMilestone({ totalHours: tier.hours, tier }); } catch (_) {}
        }
      }
    }

    if (typeof onTick === 'function') {
      try {
        onTick({
          sessionSeconds: elapsedSec,
          totalSeconds: (progress.accumulatedSeconds || 0) + elapsedSec,
        });
      } catch (_) {}
    }
  }, 60 * 1000);

  if (session.timer && typeof session.timer.unref === 'function') {
    session.timer.unref();
  }

  return {
    success: true,
    username: userProfile.username,
    message: 'Đã kết nối Gateway thành công và bắt đầu cày stream ngầm 24/7!',
  };
}

function stopStreamFarming(userId, reason = 'Người dùng kết thúc') {
  const uid = String(userId || '');
  const session = activeSessions.get(uid);
  const progress = loadStreamProgress(uid);

  if (session) {
    session.running = false;
    if (session.timer) {
      clearInterval(session.timer);
      session.timer = null;
    }

    if (session.connection && typeof session.connection.destroy === 'function') {
      try { session.connection.destroy(); } catch (_) {}
    }

    if (session.client && typeof session.client.disconnect === 'function') {
      try { session.client.disconnect(true); } catch (_) {}
    }

    activeSessions.delete(uid);

    const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
    progress.accumulatedSeconds = (progress.accumulatedSeconds || 0) + elapsed;
    progress.currentSessionSeconds = 0;
  }

  progress.status = 'stopped';
  saveStreamProgress(uid, progress);
  return true;
}

function isStreamFarmingActive(userId) {
  return activeSessions.has(String(userId || ''));
}

function getStreamSession(userId) {
  return activeSessions.get(String(userId || '')) || null;
}

/**
 * Xây dựng Embed hiển thị chi tiết tiến trình Huy hiệu Stream (đúng 100% hình ảnh Discord)
 */
function buildStreamStatusPayload(userId, userTag = 'Bạn') {
  const uid = String(userId || '');
  const progress = loadStreamProgress(uid);
  const isRunning = isStreamFarmingActive(uid);
  const totalSeconds = (progress.accumulatedSeconds || 0) + (progress.currentSessionSeconds || 0);
  const totalHours = Math.floor(totalSeconds / 3600);
  const totalMinutes = Math.floor((totalSeconds % 3600) / 60);

  const { currentTier, nextTier, percent, hoursRemaining, progressBar } = getTierInfo(totalHours);

  const embed = new EmbedBuilder()
    .setColor(currentTier.color || 0x57F287)
    .setTitle(`Stream — ${currentTier.title.toUpperCase()}`)
    .setDescription(
      `**${totalHours} giờ** đã stream cho người khác • Đang cày tự động 24/7\n\n` +
      `**Tiến trình của bạn**\n` +
      `${currentTier.icon} **${nextTier ? `${hoursRemaining} giờ nữa` : 'Đã đạt cấp tối đa!'}** ${nextTier ? nextTier.icon : '👑'}\n` +
      `\`${progressBar}\` **${percent}%**\n\n` +
      `*Stream thêm nhiều giờ cho người dùng khác để tăng cấp độ huy hiệu này.*`
    )
    .setFooter({ text: 'Lowkey Stream Badge Assistant • 24/7 Cloud Farming' })
    .setTimestamp();

  // Tạo danh sách 10 cấp bậc với trạng thái Đạt / Đang cày / Khóa
  let tierListText = '';
  TIERS.forEach((t) => {
    let statusMarker = '🔒';
    if (totalHours >= t.hours) {
      statusMarker = '✅';
    } else if (nextTier && t.hours === nextTier.hours) {
      statusMarker = '🎯';
    }
    tierListText += `${statusMarker} ${t.icon} **${t.title}** — \`${t.hours.toLocaleString('vi-VN')} giờ\`\n`;
  });

  embed.addFields(
    {
      name: '🏅 Danh sách Cấp độ Huy hiệu',
      value: tierListText,
      inline: false,
    },
    {
      name: '⚡ Trạng thái hoạt động',
      value: isRunning
        ? `🟢 **Đang cày hoạt động** (${progress.mode === 'viewer_bot' ? 'Trợ lý Viewer phòng Voice' : 'Token Gateway ngầm 24/7'})`
        : `🔴 **Đang tạm dừng** (Đã lưu **${totalHours}h ${totalMinutes}m**)`,
      inline: false,
    }
  );

  const row = new ActionRowBuilder().addComponents(
    isRunning
      ? new ButtonBuilder()
          .setCustomId('quest:stream_stop')
          .setLabel('Dừng Cày Stream')
          .setEmoji('⏹️')
          .setStyle(ButtonStyle.Danger)
      : new ButtonBuilder()
          .setCustomId('quest:stream_start')
          .setLabel('Bắt Đầu Cày Stream')
          .setEmoji('📺')
          .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('quest:hub')
      .setLabel('Về Bảng Điều Khiển')
      .setEmoji('🔮')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Tự động khôi phục các phiên cày Stream khi bot khởi động lại (trên Railway / Cloud)
 */
async function initStreamtimeAutoResume(client) {
  try {
    const { getDb } = require('./database');
    const db = getDb();
    const rows = db.prepare("SELECT * FROM stream_sessions WHERE status = 'running'").all();
    if (!rows || rows.length === 0) return;

    console.log(`[STREAM WORKER] 🔄 Phát hiện ${rows.length} phiên cày Stream cần khôi phục sau khi bot khởi động...`);

    setTimeout(async () => {
      for (const row of rows) {
        try {
          const uid = row.user_id;
          if (activeSessions.has(uid)) continue;

          if (row.mode === 'token_gateway' && row.token && row.guild_id && row.channel_id) {
            await startTokenStreamFarming({
              token: row.token,
              userId: uid,
              guildId: row.guild_id,
              channelId: row.channel_id,
              onMilestone: async ({ totalHours, tier }) => {
                try {
                  const user = await client.users.fetch(uid);
                  await user.send(`🎉 **Đạt mốc Huy hiệu Stream!** Bạn đã tích lũy **${totalHours} giờ** — Cấp: **${tier.title}**!`);
                } catch (_) {}
              },
            });
            console.log(`[STREAM WORKER] ✅ Đã khôi phục cày Stream Gateway cho User ${uid}.`);
          } else if (row.guild_id && row.channel_id) {
            const guild = client.guilds.cache.get(row.guild_id);
            if (guild) {
              const voiceChannel = guild.channels.cache.get(row.channel_id);
              if (voiceChannel && voiceAdapter) {
                const connection = voiceAdapter.joinVoiceChannel({
                  channelId: voiceChannel.id,
                  guildId: guild.id,
                  adapterCreator: guild.voiceAdapterCreator,
                  selfDeaf: false,
                  selfMute: true,
                });
                const session = {
                  userId: uid,
                  username: row.username || 'User',
                  mode: 'viewer_bot',
                  guildId: guild.id,
                  channelId: voiceChannel.id,
                  connection,
                  startedAt: Date.now(),
                  running: true,
                };
                activeSessions.set(uid, session);
                console.log(`[STREAM WORKER] ✅ Đã khôi phục Viewer Bot trong kênh ${voiceChannel.name} cho User ${uid}.`);
              }
            }
          }
        } catch (e) {
          console.error(`[STREAM WORKER] Lỗi khôi phục User ${row.user_id}:`, e.message);
        }
      }
    }, 6000);
  } catch (err) {
    console.error('[STREAM WORKER] initStreamtimeAutoResume error:', err.message);
  }
}

module.exports = {
  TIERS,
  getTierTitle,
  getTierInfo,
  loadStreamProgress,
  saveStreamProgress,
  startViewerStreamFarming,
  startTokenStreamFarming,
  stopStreamFarming,
  isStreamFarmingActive,
  getStreamSession,
  buildStreamStatusPayload,
  initStreamtimeAutoResume,
  setVoiceAdapter,
  activeSessions,
};
