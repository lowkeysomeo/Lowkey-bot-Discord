'use strict';

/**
 * Lowkey Game Time Badge Token Worker
 * Cày tích lũy giờ chơi cho Huy hiệu "Thời gian chơi" (Game Time) 100% tự động bằng User Token
 * Chạy ngầm 24/7 trên Server/Railway, máy tính tắt vẫn tiếp tục cày giờ chơi
 */

const fs = require('node:fs');
const path = require('node:path');
let WebSocketImpl = globalThis.WebSocket;
try {
  WebSocketImpl = require('ws');
} catch (e) {}

const PROGRESS_FILE = path.join(__dirname, '..', 'data', 'gametime_progress.json');

const DEFAULT_GAME = {
  name: 'Counter-Strike 2',
  appId: '730',
  exe: 'cs2.exe'
};

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
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      if (data && data[userId]) return data[userId];
    }
  } catch {}
  return {
    userId,
    accumulatedSeconds: 0,
    currentSessionSeconds: 0,
    status: 'idle',
    updatedAt: Date.now()
  };
}

function saveGametimeProgress(userId, progress) {
  try {
    const dir = path.dirname(PROGRESS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let data = {};
    if (fs.existsSync(PROGRESS_FILE)) {
      try {
        data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')) || {};
      } catch {}
    }
    data[userId] = {
      ...progress,
      updatedAt: Date.now()
    };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('[GAMETIME WORKER] saveProgress error:', e.message);
  }
}

class GametimeGatewayClient {
  constructor(token, game = DEFAULT_GAME) {
    this.token = token.trim().replace(/^['"]|['"]$/g, '');
    this.game = game;
    this.ws = null;
    this.heartbeatTimer = null;
    this.sequence = null;
    this.connected = false;
    this.isReady = false;
    this.startedAt = Date.now();
    this.onReadyCallback = null;
    this.onCloseCallback = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.disconnect();

      const timeoutTimer = setTimeout(() => {
        if (!this.isReady) {
          this.disconnect();
          reject(new Error('Hết thời gian chờ kết nối Gateway (Timeout 15s).'));
        }
      }, 15000);

      try {
        this.ws = new WebSocketImpl('wss://gateway.discord.gg/?v=9&encoding=json');
      } catch (e) {
        clearTimeout(timeoutTimer);
        return reject(e);
      }

      this.ws.on('open', () => {
        this.connected = true;
      });

      this.ws.on('message', (raw) => {
        try {
          const payload = JSON.parse(raw.toString());
          const { op, d, s, t } = payload;
          if (s != null) this.sequence = s;

          if (op === 10) {
            const interval = d?.heartbeat_interval || 41250;
            this.startHeartbeat(interval);

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

          if (op === 1) {
            this.send({ op: 1, d: this.sequence });
          }

          if (op === 0 && t === 'READY') {
            this.isReady = true;
            clearTimeout(timeoutTimer);
            this.sendPresence();
            resolve(d?.user);
            if (typeof this.onReadyCallback === 'function') {
              this.onReadyCallback(d?.user);
            }
          }
        } catch (_) {}
      });

      this.ws.on('error', (err) => {
        if (!this.isReady) {
          clearTimeout(timeoutTimer);
          reject(err);
        }
      });

      this.ws.on('close', () => {
        this.stopHeartbeat();
        this.connected = false;
        this.isReady = false;
        if (typeof this.onCloseCallback === 'function') {
          this.onCloseCallback();
        }
      });
    });
  }

  buildActivity() {
    return {
      name: this.game.name,
      type: 0, // Playing
      application_id: String(this.game.appId),
      timestamps: {
        start: this.startedAt
      }
    };
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

  startHeartbeat(interval) {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
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

  send(data) {
    if (this.ws && (this.ws.readyState === 1 || this.ws.readyState === WebSocketImpl?.OPEN)) {
      try {
        this.ws.send(JSON.stringify(data));
      } catch (_) {}
    }
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
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
  const client = new GametimeGatewayClient(token, game);

  const session = {
    userId: uid,
    username: userProfile.username,
    client,
    running: true,
    startedAt: Date.now(),
    timer: null,
    game
  };

  activeSessions.set(uid, session);

  try {
    await client.connect();
  } catch (err) {
    activeSessions.delete(uid);
    client.disconnect();
    return { success: false, message: `Không thể kết nối Gateway: ${err.message}` };
  }

  progress.status = 'running';
  saveGametimeProgress(uid, progress);

  // Cập nhật thời gian mỗi 1 phút
  session.timer = setInterval(() => {
    if (!session.running) return;

    const currentElapsedSec = Math.floor((Date.now() - session.startedAt) / 1000);
    progress.currentSessionSeconds = currentElapsedSec;
    progress.totalSeconds = (progress.accumulatedSeconds || 0) + currentElapsedSec;
    saveGametimeProgress(uid, progress);

    const totalHours = Math.floor(progress.totalSeconds / 3600);
    const tier = TIERS.find((t) => t.hours === totalHours);
    if (tier && typeof onMilestone === 'function') {
      try {
        onMilestone({ totalHours, tier });
      } catch (_) {}
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
  if (!session) return false;

  session.running = false;
  if (session.timer) {
    clearInterval(session.timer);
    session.timer = null;
  }
  session.client.disconnect();
  activeSessions.delete(uid);

  const progress = loadGametimeProgress(uid);
  const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
  progress.accumulatedSeconds = (progress.accumulatedSeconds || 0) + elapsed;
  progress.currentSessionSeconds = 0;
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

module.exports = {
  TIERS,
  DEFAULT_GAME,
  getTierTitle,
  loadGametimeProgress,
  saveGametimeProgress,
  startGametimeFarming,
  stopGametimeFarming,
  isGametimeFarmingActive,
  getGametimeSession
};
