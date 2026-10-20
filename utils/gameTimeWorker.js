'use strict';

/**
 * Lowkey Game Time Badge Token Worker
 * Cày tích lũy giờ chơi cho Huy hiệu "Thời gian chơi" (Game Time / Dedicated) 100% tự động bằng User Token
 * Chạy ngầm 24/7 trên Cloud/Railway — Tắt máy tính vẫn tiếp tục cày giờ chơi liên tục không ngắt quãng
 */

const fs = require('node:fs');
const path = require('node:path');
let WebSocketImpl = globalThis.WebSocket;
try {
  WebSocketImpl = require('ws');
} catch (e) {}

const PROGRESS_FILE = path.join(__dirname, '..', 'data', 'gametime_progress.json');

// Danh sách các tựa game với Discord Snowflake Application ID chính thức từ Discord Database
const SUPPORTED_GAMES = [
  {
    id: 'cs2',
    name: 'Counter-Strike 2',
    appId: '1158877933042143272', // Discord Snowflake ID chính thức
    exe: 'cs2.exe'
  },
  {
    id: 'valorant',
    name: 'VALORANT',
    appId: '700136079562375258',
    exe: 'VALORANT-Win64-Shipping.exe'
  },
  {
    id: 'dota2',
    name: 'Dota 2',
    appId: '356875988589740042',
    exe: 'dota2.exe'
  },
  {
    id: 'gtav',
    name: 'Grand Theft Auto V',
    appId: '1402418714716143646',
    exe: 'GTA5.exe'
  },
  {
    id: 'lol',
    name: 'League of Legends',
    appId: '1402418696126992445',
    exe: 'League of Legends.exe'
  }
];

const DEFAULT_GAME = SUPPORTED_GAMES[0];

const TIERS = [
  { hours: 1, title: 'Giải Trí' },
  { hours: 5, title: 'Giải trí' },
  { hours: 20, title: 'Gắn bó' },
  { hours: 75, title: 'Tâm huyết' },
  { hours: 150, title: 'Nghiêm túc' },
  { hours: 300, title: 'Tận hiến' },
  { hours: 500, title: 'Lão luyện' },
  { hours: 1000, title: 'Sắt đá' },
  { hours: 2000, title: 'Kiên định' },
  { hours: 5000, title: 'Vĩnh cửu' }
];

function getTierTitle(hours) {
  let title = 'Chưa mở khóa';
  for (const t of TIERS) {
    if (hours >= t.hours) title = t.title;
  }
  return title;
}

function loadGametimeProgress(userId) {
  const uid = String(userId || '');
  // 1. Ưu tiên đọc từ SQLite database bền vững
  try {
    const { getDb } = require('./database');
    const db = getDb();
    const row = db.prepare('SELECT * FROM gametime_sessions WHERE user_id = ?').get(uid);
    if (row) {
      let notifiedHours = [];
      try { notifiedHours = JSON.parse(row.notified_hours_json || '[]') || []; } catch {}
      return {
        userId: uid,
        accumulatedSeconds: row.accumulated_seconds || 0,
        currentSessionSeconds: row.current_session_seconds || 0,
        status: row.status || 'idle',
        gameName: row.game_name || DEFAULT_GAME.name,
        notifiedHours,
        updatedAt: row.updated_at || Date.now()
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
          notifiedHours: data[uid].notifiedHours || []
        };
      }
    }
  } catch (_) {}

  return {
    userId: uid,
    accumulatedSeconds: 0,
    currentSessionSeconds: 0,
    status: 'idle',
    notifiedHours: [],
    updatedAt: Date.now()
  };
}

function saveGametimeProgress(userId, progress) {
  const uid = String(userId || '');
  // 1. Lưu vào SQLite database bền vững
  try {
    const { getDb } = require('./database');
    const db = getDb();
    const existing = db.prepare('SELECT user_id, token, started_at, username FROM gametime_sessions WHERE user_id = ?').get(uid);
    const startedAt = progress.startedAt || existing?.started_at || Date.now();
    const token = progress.token || existing?.token || '';
    const username = progress.username || existing?.username || null;
    const gameName = progress.game?.name || progress.gameName || DEFAULT_GAME.name;
    const appId = String(progress.game?.appId || progress.appId || DEFAULT_GAME.appId);
    const exeName = progress.game?.exe || progress.exeName || DEFAULT_GAME.exe;
    const notifiedHoursJson = JSON.stringify(progress.notifiedHours || []);

    db.prepare(`
      INSERT INTO gametime_sessions (
        user_id, token, username, game_name, app_id, exe_name,
        status, started_at, updated_at, accumulated_seconds, current_session_seconds, last_heartbeat_at,
        notified_hours_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        token = CASE WHEN excluded.token != '' THEN excluded.token ELSE gametime_sessions.token END,
        username = COALESCE(excluded.username, gametime_sessions.username),
        game_name = COALESCE(excluded.game_name, gametime_sessions.game_name),
        app_id = COALESCE(excluded.app_id, gametime_sessions.app_id),
        exe_name = COALESCE(excluded.exe_name, gametime_sessions.exe_name),
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
      gameName,
      appId,
      exeName,
      progress.status || 'running',
      startedAt,
      Date.now(),
      progress.accumulatedSeconds || 0,
      progress.currentSessionSeconds || 0,
      progress.lastHeartbeatAt || Date.now(),
      notifiedHoursJson
    );
  } catch (e) {
    console.warn('[GAMETIME WORKER] DB saveProgress error:', e.message);
  }

  // 2. Ghi ra JSON mirror cho tương thích ngược
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
      updatedAt: Date.now()
    };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('[GAMETIME WORKER] JSON saveProgress error:', e.message);
  }
}

class GametimeGatewayClient {
  constructor(token, game = DEFAULT_GAME, startedAt = Date.now()) {
    this.token = token.trim().replace(/^['"]|['"]$/g, '');
    this.game = game;
    this.ws = null;
    this.heartbeatTimer = null;
    this.presenceTimer = null;
    this.reconnectTimer = null;
    this.sequence = null;
    this.sessionId = null;
    this.resumeGatewayUrl = null;
    this.connected = false;
    this.isReady = false;
    this.startedAt = startedAt;
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.lastHeartbeatAck = Date.now();
    this.onReadyCallback = null;
    this.onCloseCallback = null;
  }

  buildActivity() {
    return {
      name: this.game.name,
      type: 0, // Playing
      application_id: String(this.game.appId),
      timestamps: {
        start: this.startedAt
      },
      flags: 1
    };
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
      if (timeoutTimer && typeof timeoutTimer.unref === 'function') {
        timeoutTimer.unref();
      }

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

          // Op 10: Hello -> Bắt đầu Heartbeat & (Resume hoặc Identify)
          if (op === 10) {
            const interval = d?.heartbeat_interval || 41250;
            this.startHeartbeat(interval);

            if (this.sessionId && this.sequence != null) {
              // Gửi Op 6: Resume để khôi phục phiên kết nối
              this.send({
                op: 6,
                d: {
                  token: this.token,
                  session_id: this.sessionId,
                  seq: this.sequence
                }
              });
            } else {
              // Gửi gói tin Identify chuẩn Discord Windows Desktop Client
              const identifyPayload = {
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
                    system_locale: 'vi-VN'
                  },
                  presence: {
                    status: 'online',
                    since: 0,
                    activities: [this.buildActivity()],
                    afk: false
                  }
                }
              };
              this.send(identifyPayload);
            }
          }

          // Op 1: Heartbeat request từ Discord
          if (op === 1) {
            this.send({ op: 1, d: this.sequence });
          }

          // Op 11: Heartbeat ACK
          if (op === 11) {
            this.lastHeartbeatAck = Date.now();
          }

          // Op 7: Reconnect request từ Discord
          if (op === 7) {
            this.reconnect(500);
          }

          // Op 9: Invalid Session
          if (op === 9) {
            const resumable = Boolean(d);
            if (!resumable) {
              this.sessionId = null;
              this.sequence = null;
            }
            this.reconnect(resumable ? 1000 : 2500);
          }

          // Op 0: Dispatch READY
          if (op === 0 && t === 'READY') {
            this.isReady = true;
            this.sessionId = d?.session_id || this.sessionId;
            this.resumeGatewayUrl = d?.resume_gateway_url || null;
            this.reconnectAttempts = 0;
            clearTimeout(timeoutTimer);
            this.sendPresence();
            this.startPresenceRefresh();
            resolve(d?.user);
            if (typeof this.onReadyCallback === 'function') {
              this.onReadyCallback(d?.user);
            }
          }

          // Op 0: Dispatch RESUMED
          if (op === 0 && t === 'RESUMED') {
            this.isReady = true;
            this.reconnectAttempts = 0;
            clearTimeout(timeoutTimer);
            this.sendPresence();
            this.startPresenceRefresh();
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
        this.stopPresenceRefresh();
        this.connected = false;
        this.isReady = false;

        if (!this.shouldReconnect) {
          if (typeof this.onCloseCallback === 'function') {
            this.onCloseCallback({ code });
          }
          return;
        }

        // Nếu mã 4004 (Authentication Failed - token không hợp lệ), không thử lại
        if (code === 4004) {
          this.shouldReconnect = false;
          if (typeof this.onCloseCallback === 'function') {
            this.onCloseCallback({ code, tokenExpired: true });
          }
          return;
        }

        // Tự động kết nối lại 24/7 với backoff
        const delay = Math.min(30000, 2000 * Math.pow(1.5, Math.min(this.reconnectAttempts++, 6)));
        this.scheduleReconnect(delay);
      });
    });
  }

  sendPresence() {
    if (!this.isReady) return;
    this.send({
      op: 3,
      d: {
        since: 0,
        activities: [this.buildActivity()],
        status: 'online',
        afk: false
      }
    });
  }

  startPresenceRefresh() {
    this.stopPresenceRefresh();
    // Gửi lại Presence mỗi 5 phút để giữ kết nối trạng thái game không bị Discord dọn dẹp cache
    this.presenceTimer = setInterval(() => {
      this.sendPresence();
    }, 5 * 60 * 1000);
    if (this.presenceTimer && typeof this.presenceTimer.unref === 'function') {
      this.presenceTimer.unref();
    }
  }

  stopPresenceRefresh() {
    if (this.presenceTimer) {
      clearInterval(this.presenceTimer);
      this.presenceTimer = null;
    }
  }

  startHeartbeat(interval) {
    this.stopHeartbeat();
    this.lastHeartbeatAck = Date.now();
    this.heartbeatTimer = setInterval(() => {
      // Zombie socket check: Nếu sau 2.5 nhịp heartbeat Discord không gửi ACK, socket đã chết
      if (Date.now() - this.lastHeartbeatAck > interval * 2.5) {
        console.warn('[GAMETIME WORKER] Gateway zombie socket (Heartbeat ACK missing). Đang tự động kết nối lại...');
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
          console.warn('[GAMETIME WORKER] Thử kết nối lại thất bại:', e.message);
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
    this.stopPresenceRefresh();
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
      try {
        this.ws.send(JSON.stringify(data));
      } catch (_) {}
    }
  }

  disconnect(permanent = true) {
    if (permanent) {
      this.shouldReconnect = false;
    }
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.stopPresenceRefresh();
    if (this.ws) {
      try {
        this.ws.close(1000, 'Normal closure');
      } catch (_) {}
      this.ws = null;
    }
    this.connected = false;
    this.isReady = false;
  }
}

// Map quản lý các phiên cày đang hoạt động theo userId
const activeSessions = new Map();

async function startGametimeFarming({
  token,
  userId,
  game = DEFAULT_GAME,
  accumulatedSeconds = null,
  onTick = null,
  onMilestone = null
}) {
  const uid = String(userId || '');
  if (!uid) return { success: false, message: 'Thiếu userId.' };

  if (activeSessions.has(uid)) {
    return { success: false, message: 'Tài khoản của bạn đã có một phiên cày giờ chơi đang chạy.' };
  }

  const { validateToken } = require('./varietyTokenWorker');
  const userProfile = await validateToken(token);
  if (!userProfile) {
    return {
      success: false,
      message: 'Token Discord không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại token!'
    };
  }

  const progress = loadGametimeProgress(uid);
  if (accumulatedSeconds !== null && Number.isFinite(accumulatedSeconds)) {
    progress.accumulatedSeconds = accumulatedSeconds;
  }
  const startedAt = Date.now();
  const client = new GametimeGatewayClient(token, game, startedAt);

  const session = {
    userId: uid,
    username: userProfile.username,
    token,
    client,
    running: true,
    startedAt,
    timer: null,
    game,
    onMilestone
  };

  activeSessions.set(uid, session);

  client.onCloseCallback = ({ tokenExpired } = {}) => {
    if (tokenExpired) {
      console.warn(`[GAMETIME WORKER] Token của User ${uid} đã hết hạn. Dừng phiên cày.`);
      stopGametimeFarming(uid);
      try {
        const { getDb } = require('./database');
        getDb().prepare("UPDATE gametime_sessions SET status = 'token_expired' WHERE user_id = ?").run(uid);
      } catch (_) {}
    }
  };

  try {
    await client.connect();
  } catch (err) {
    activeSessions.delete(uid);
    client.disconnect(true);
    return { success: false, message: `Không thể kết nối Gateway: ${err.message}` };
  }

  progress.status = 'running';
  progress.startedAt = startedAt;
  progress.currentSessionSeconds = 0;
  progress.game = game;
  progress.username = userProfile.username;
  progress.token = token;
  saveGametimeProgress(uid, progress);

  // Cập nhật thời gian mỗi 1 phút
  session.timer = setInterval(() => {
    if (!session.running) return;

    const currentElapsedSec = Math.floor((Date.now() - session.startedAt) / 1000);
    progress.currentSessionSeconds = currentElapsedSec;
    progress.totalSeconds = (progress.accumulatedSeconds || 0) + currentElapsedSec;
    progress.lastHeartbeatAt = Date.now();
    saveGametimeProgress(uid, progress);

    const totalHours = Math.floor(progress.totalSeconds / 3600);
    const tier = TIERS.find((t) => t.hours === totalHours);
    if (!Array.isArray(progress.notifiedHours)) {
      progress.notifiedHours = [];
    }
    if (tier && !progress.notifiedHours.includes(tier.hours)) {
      progress.notifiedHours.push(tier.hours);
      saveGametimeProgress(uid, progress);
      if (typeof onMilestone === 'function') {
        try {
          onMilestone({ totalHours, tier });
        } catch (_) {}
      }
    }

    if (typeof onTick === 'function') {
      try {
        onTick({
          sessionSeconds: currentElapsedSec,
          totalSeconds: progress.totalSeconds,
          gameName: game.name
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
    gameName: game.name,
    message: `Đã kết nối Gateway thành công và bắt đầu cày giờ chơi game ${game.name}!`
  };
}

function stopGametimeFarming(userId) {
  const uid = String(userId || '');
  const session = activeSessions.get(uid);
  const progress = loadGametimeProgress(uid);

  if (session) {
    session.running = false;
    if (session.timer) {
      clearInterval(session.timer);
      session.timer = null;
    }
    session.client.disconnect(true);
    activeSessions.delete(uid);

    const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
    progress.accumulatedSeconds = (progress.accumulatedSeconds || 0) + elapsed;
    progress.currentSessionSeconds = 0;
  }

  progress.status = 'stopped';
  saveGametimeProgress(uid, progress);

  return true;
}

function isGametimeFarmingActive(userId) {
  return activeSessions.has(String(userId || ''));
}

function getGametimeSession(userId) {
  return activeSessions.get(String(userId || '')) || null;
}

/**
 * Tự động khôi phục các phiên cày giờ chơi 24/7 khi bot khởi động lại (trên Railway / Cloud)
 */
async function initGametimeAutoResume(client) {
  try {
    const { getDb } = require('./database');
    const db = getDb();
    const rows = db.prepare("SELECT * FROM gametime_sessions WHERE status = 'running'").all();
    if (!rows || rows.length === 0) return;

    console.log(`[GAMETIME WORKER] 🔄 Phát hiện ${rows.length} phiên cày giờ chơi 24/7 cần khôi phục sau khi bot khởi động...`);

    // Chờ 5 giây để kết nối Gateway của Discord Bot hoàn toàn ổn định
    setTimeout(async () => {
      for (const row of rows) {
        try {
          const uid = row.user_id;
          if (activeSessions.has(uid)) continue;

          // Lấy token mới nhất (nếu có cập nhật trong quest_subscribers)
          let token = row.token;
          const sub = db.prepare('SELECT token FROM quest_subscribers WHERE user_id = ?').get(uid);
          if (sub && sub.token) token = sub.token;

          if (!token || token.length < 20) {
            db.prepare("UPDATE gametime_sessions SET status = 'token_expired' WHERE user_id = ?").run(uid);
            continue;
          }

          const game = {
            name: row.game_name || DEFAULT_GAME.name,
            appId: row.app_id || DEFAULT_GAME.appId,
            exe: row.exe_name || DEFAULT_GAME.exe
          };

          const prevAccumulated = (row.accumulated_seconds || 0) + (row.current_session_seconds || 0);

          const res = await startGametimeFarming({
            token,
            userId: uid,
            game,
            accumulatedSeconds: prevAccumulated,
            onMilestone: async ({ totalHours, tier }) => {
              try {
                if (client && typeof client.users?.fetch === 'function') {
                  const user = await client.users.fetch(uid);
                  await user.send(`🎉 **Đạt mốc Huy hiệu Thời gian chơi!** Bạn đã tích lũy **${totalHours} giờ** — Cấp: **${tier.title}**!`);
                }
              } catch (_) {}
            }
          });

          if (res.success) {
            console.log(`[GAMETIME WORKER] ✅ Đã tự động khôi phục cày giờ chơi 24/7 cho User ${uid} (${game.name}).`);
          } else {
            console.warn(`[GAMETIME WORKER] ⚠️ Không thể khôi phục User ${uid}: ${res.message}`);
            if (res.message && res.message.includes('Token Discord không hợp lệ')) {
              db.prepare("UPDATE gametime_sessions SET status = 'token_expired' WHERE user_id = ?").run(uid);
            }
          }
        } catch (e) {
          console.error(`[GAMETIME WORKER] Lỗi khôi phục User ${row.user_id}:`, e.message);
        }
      }
    }, 5000);
  } catch (err) {
    console.error('[GAMETIME WORKER] initGametimeAutoResume error:', err.message);
  }
}

module.exports = {
  TIERS,
  SUPPORTED_GAMES,
  DEFAULT_GAME,
  getTierTitle,
  loadGametimeProgress,
  saveGametimeProgress,
  startGametimeFarming,
  stopGametimeFarming,
  isGametimeFarmingActive,
  getGametimeSession,
  initGametimeAutoResume
};
