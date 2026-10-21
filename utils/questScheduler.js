'use strict';

/**
 * Lowkey Discord Bot — 24/7 Quest Scheduler (Auto Enroll + Complete All Video & Game Quests, No-Claim)
 * Quét liên tục 24/7 với chu kỳ ngắn (mặc định 2 phút/lần), tự động nhận và hoàn thành 100%
 * mọi nhiệm vụ Video & Game mới ra mà không bị sót, không tự bấm Claim.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const {
  runAutoQuestForToken,
  getUserIdFromToken,
} = require('./questTokenWorker');

let dbModule = null;
function getDb() {
  if (!dbModule) {
    try {
      dbModule = require('./database');
    } catch {
      const Database = require('better-sqlite3');
      const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'vietnam-legacy.sqlite');
      const rawDb = new Database(dbPath);
      dbModule = { db: rawDb, getDb: () => rawDb, getDatabase: () => rawDb };
    }
  }
  if (dbModule) {
    if (typeof dbModule.getDb === 'function') return dbModule.getDb();
    if (typeof dbModule.getDatabase === 'function') return dbModule.getDatabase();
    if (dbModule.db) return dbModule.db;
  }
  return dbModule;
}

let questAuthModule = null;
function getQuestAuth() {
  if (!questAuthModule) {
    try {
      questAuthModule = require('./questAuth');
    } catch {
      questAuthModule = {
        isOwner: (id) => String(id) === '604729446649298963',
        isApproved: () => true,
      };
    }
  }
  return questAuthModule;
}

const TOKEN_CACHE_PATH = path.join(__dirname, '..', 'data', 'saved_quest_token.txt');
// Giảm chu kỳ quét mặc định xuống 2 phút để bắt ngay nhiệm vụ Video & Game vừa mới ra mắt
const DEFAULT_INTERVAL_MINUTES = 2;
const USER_DELAY_MS = 1500;
const JOB_TIMEOUT_MS = 45 * 60 * 1000; // 45 phút chống treo job

let schedulerTimer = null;
let isScanning = false;
let discordClientRef = null;
const activeUserJobs = new Map();

function ensureTables() {
  const db = getDb();
  if (!db || typeof db.exec !== 'function') return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_subscribers (
      user_id TEXT PRIMARY KEY,
      token TEXT,
      username TEXT,
      auto_claim INTEGER DEFAULT 0,
      notify_dm INTEGER DEFAULT 1,
      enabled INTEGER DEFAULT 1,
      package_type TEXT DEFAULT 'monthly',
      expires_at TEXT,
      created_at TEXT,
      updated_at TEXT,
      last_checked_at INTEGER,
      last_quests_json TEXT
    );

    CREATE TABLE IF NOT EXISTS quest_notified_completions (
      user_id TEXT,
      quest_id TEXT,
      notified_at INTEGER,
      PRIMARY KEY (user_id, quest_id)
    );
  `);

  // Đảm bảo tương thích ngược nếu bảng cũ thiếu cột
  const columnsToEnsure = [
    ['username', 'TEXT'],
    ['auto_claim', 'INTEGER DEFAULT 0'],
    ['notify_dm', 'INTEGER DEFAULT 1'],
    ['enabled', 'INTEGER DEFAULT 1'],
    ['package_type', "TEXT DEFAULT 'monthly'"],
    ['expires_at', 'TEXT'],
    ['created_at', 'TEXT'],
    ['updated_at', 'TEXT'],
    ['last_checked_at', 'INTEGER'],
    ['last_quests_json', 'TEXT'],
  ];

  for (const [colName, colType] of columnsToEnsure) {
    try {
      db.exec(`ALTER TABLE quest_subscribers ADD COLUMN ${colName} ${colType}`);
    } catch {}
  }
}

function getIntervalMs() {
  const raw = Number(process.env.QUEST_SCAN_INTERVAL_MINUTES || DEFAULT_INTERVAL_MINUTES);
  const minutes = Number.isFinite(raw) && raw >= 1 ? raw : DEFAULT_INTERVAL_MINUTES;
  return Math.round(minutes * 60 * 1000);
}

function isQuestNotified(userId, questId) {
  ensureTables();
  const db = getDb();
  const row = db
    .prepare('SELECT 1 FROM quest_notified_completions WHERE user_id = ? AND quest_id = ?')
    .get(String(userId), String(questId));
  return Boolean(row);
}

function markQuestNotified(userId, questId) {
  ensureTables();
  const db = getDb();
  db.prepare(
    'INSERT OR REPLACE INTO quest_notified_completions (user_id, quest_id, notified_at) VALUES (?, ?, ?)'
  ).run(String(userId), String(questId), Date.now());
}

function autoEnrollLocalToken() {
  ensureTables();
  try {
    let localToken =
      process.env.DISCORD_USER_TOKEN ||
      process.env.QUEST_USER_TOKENS ||
      process.env.USER_TOKEN ||
      null;

    if (!localToken && fs.existsSync(TOKEN_CACHE_PATH)) {
      localToken = fs.readFileSync(TOKEN_CACHE_PATH, 'utf8').trim();
    }

    if (!localToken || localToken.length < 20) return null;
    const uid = getUserIdFromToken(localToken) || '604729446649298963';
    return registerSubscriber(uid, localToken, 'OwnerAutoToken', 1, 'lifetime', null);
  } catch {
    return null;
  }
}

function getSubscriber(userId) {
  ensureTables();
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM quest_subscribers WHERE user_id = ?')
    .get(String(userId));

  if (row) return row;

  const auth = getQuestAuth();
  if (auth.isOwner && auth.isOwner(String(userId)) && fs.existsSync(TOKEN_CACHE_PATH)) {
    const cached = fs.readFileSync(TOKEN_CACHE_PATH, 'utf8').trim();
    if (cached && cached.length > 20) {
      return registerSubscriber(String(userId), cached, 'BotOwner', 1, 'lifetime', null);
    }
  }
  return null;
}

function getAllSubscribers() {
  ensureTables();
  const db = getDb();
  return db.prepare('SELECT * FROM quest_subscribers').all();
}

function listSubscribers(onlyEnabled = true) {
  ensureTables();
  const all = getAllSubscribers();
  if (!onlyEnabled) return all;

  const auth = getQuestAuth();
  const now = Date.now();

  return all.filter((sub) => {
    if (!sub || !sub.token) return false;
    if (sub.enabled !== undefined && Number(sub.enabled) === 0) return false;

    const isOwner = auth.isOwner ? auth.isOwner(String(sub.user_id)) : false;
    if (isOwner) return true;

    if (auth.isApproved && !auth.isApproved(String(sub.user_id))) {
      return false;
    }

    if (sub.expires_at) {
      const expMs = new Date(sub.expires_at).getTime();
      if (!Number.isNaN(expMs) && expMs <= now) return false;
    }

    return true;
  });
}

function registerSubscriber(
  userId,
  token,
  username = null,
  notifyDm = 1,
  packageType = 'monthly',
  expiresAt = null
) {
  ensureTables();
  const db = getDb();
  const nowIso = new Date().toISOString();
  const existing = db
    .prepare('SELECT * FROM quest_subscribers WHERE user_id = ?')
    .get(String(userId));

  const cleanToken = String(token || existing?.token || '').trim();
  const finalUsername = username ?? existing?.username ?? null;
  const finalNotify = notifyDm !== undefined ? (notifyDm ? 1 : 0) : existing?.notify_dm ?? 1;
  const finalPkg = packageType || existing?.package_type || 'monthly';
  const finalExpires = expiresAt !== undefined ? expiresAt : existing?.expires_at ?? null;
  const createdAt = existing?.created_at || nowIso;

  db.prepare(
    `INSERT OR REPLACE INTO quest_subscribers (
      user_id, token, username, auto_claim, notify_dm, enabled, package_type, expires_at, created_at, updated_at, last_checked_at, last_quests_json
    ) VALUES (?, ?, ?, 0, ?, 1, ?, ?, ?, ?, ?, ?)`
  ).run(
    String(userId),
    cleanToken,
    finalUsername,
    finalNotify,
    finalPkg,
    finalExpires,
    createdAt,
    nowIso,
    existing?.last_checked_at || null,
    existing?.last_quests_json || null
  );

  return getSubscriber(userId);
}

function upsertSubscriber(userId, token, autoClaim = 0, notifyDm = 1) {
  return registerSubscriber(userId, token, null, notifyDm, 'monthly', null);
}

function removeSubscriber(userId) {
  ensureTables();
  const db = getDb();
  db.prepare('DELETE FROM quest_subscribers WHERE user_id = ?').run(String(userId));
  return true;
}

function toggleSubscriber(userId, enabled) {
  ensureTables();
  const db = getDb();
  const val = enabled ? 1 : 0;
  db.prepare('UPDATE quest_subscribers SET enabled = ?, updated_at = ? WHERE user_id = ?').run(
    val,
    new Date().toISOString(),
    String(userId)
  );
  return getSubscriber(userId);
}

function toggleNotifyDm(userId, notifyDm) {
  ensureTables();
  const db = getDb();
  const val = notifyDm ? 1 : 0;
  db.prepare('UPDATE quest_subscribers SET notify_dm = ?, updated_at = ? WHERE user_id = ?').run(
    val,
    new Date().toISOString(),
    String(userId)
  );
  return getSubscriber(userId);
}

function isUserJobRunning(userId) {
  const key = String(userId);
  const job = activeUserJobs.get(key);
  if (!job) return false;
  if (Date.now() - job.startTime > JOB_TIMEOUT_MS) {
    activeUserJobs.delete(key);
    return false;
  }
  return true;
}

/**
 * Quét và hoàn thành 100% toàn bộ nhiệm vụ Video + Game cho 1 người dùng (Không tự động Claim)
 */
async function scanUserQuests(subscriberOrUserId, clientOrOptions = null, maybeOptions = {}) {
  ensureTables();
  let subscriber = null;
  let client = null;
  let options = {};

  if (typeof subscriberOrUserId === 'string' || typeof subscriberOrUserId === 'number') {
    subscriber = getSubscriber(String(subscriberOrUserId));
    if (
      clientOrOptions &&
      typeof clientOrOptions === 'object' &&
      !clientOrOptions.users &&
      !clientOrOptions.channels
    ) {
      options = clientOrOptions;
      client = (maybeOptions && (maybeOptions.users || maybeOptions.channels)) ? maybeOptions : discordClientRef;
    } else {
      client = clientOrOptions || discordClientRef;
      options = maybeOptions || {};
    }
  } else if (subscriberOrUserId && typeof subscriberOrUserId === 'object') {
    subscriber = subscriberOrUserId;
    if (
      clientOrOptions &&
      typeof clientOrOptions === 'object' &&
      !clientOrOptions.users &&
      !clientOrOptions.channels
    ) {
      options = clientOrOptions;
      client = (maybeOptions && (maybeOptions.users || maybeOptions.channels)) ? maybeOptions : discordClientRef;
    } else {
      client = clientOrOptions || discordClientRef;
      options = maybeOptions || {};
    }
  }

  if (!subscriber || !subscriber.token) {
    return {
      success: false,
      error: 'Chưa đăng ký User Token cho chế độ Auto Quest 24/7.',
    };
  }

  const userId = String(subscriber.user_id);
  if (isUserJobRunning(userId) && !options.force) {
    return {
      success: false,
      busy: true,
      error: 'Tiến trình làm Quest của tài khoản này đang chạy.',
    };
  }

  activeUserJobs.set(userId, { startTime: Date.now() });

  try {
    // Luôn ép autoClaim = false để chỉ hoàn thành 100% nhiệm vụ mà không tự bấm Claim
    const report = await runAutoQuestForToken(subscriber.token, {
      ...options,
      autoClaim: false,
      maxPasses: options.fastTest ? 1 : 3,
    });

    const db = getDb();
    db.prepare(
      'UPDATE quest_subscribers SET last_checked_at = ?, last_quests_json = ?, updated_at = ? WHERE user_id = ?'
    ).run(
      Date.now(),
      JSON.stringify(report.results || []),
      new Date().toISOString(),
      userId
    );

    // Gửi thông báo DM nếu hoàn thành nhiệm vụ mới (chưa từng thông báo)
    if (client && Number(subscriber.notify_dm ?? 1) !== 0 && Array.isArray(report.results)) {
      const newlyCompleted = report.results.filter(
        (r) => r.completed && !r.alreadyDone && !isQuestNotified(userId, r.questId)
      );

      if (newlyCompleted.length > 0) {
        for (const item of newlyCompleted) {
          markQuestNotified(userId, item.questId);
        }
        try {
          const discordUser = await client.users.fetch(userId);
          if (discordUser) {
            const lines = newlyCompleted.map((item, idx) => {
              const badge = item.type === 'video' ? '🎬 [Video]' : '🎮 [Game]';
              return `**${idx + 1}.** ${badge} **${item.questName}** — ✅ Hoàn thành 100% *(Vào Discord để bấm Nhận thưởng/Claim)*`;
            });
            const embed = new EmbedBuilder()
              .setColor(0x2ecc71)
              .setTitle('🎉 Auto Quest 24/7 — Đã hoàn thành nhiệm vụ mới!')
              .setDescription(lines.join('\n'))
              .setFooter({ text: `Tài khoản: ${report.accountTag || userId}` })
              .setTimestamp();

            await discordUser.send({ embeds: [embed] });
          }
        } catch {}
      }
    }

    return report;
  } catch (err) {
    return {
      success: false,
      userId,
      error: err.message,
    };
  } finally {
    activeUserJobs.delete(userId);
  }
}

async function scanAll(clientOrOptions = null, maybeOptions = {}) {
  if (isScanning) {
    return { skipped: true, reason: 'Đang trong chu kỳ quét' };
  }

  let client = discordClientRef;
  let options = {};
  if (
    clientOrOptions &&
    typeof clientOrOptions === 'object' &&
    !clientOrOptions.users &&
    !clientOrOptions.channels
  ) {
    options = clientOrOptions;
  } else {
    client = clientOrOptions || discordClientRef;
    options = maybeOptions || {};
  }

  isScanning = true;
  try {
    autoEnrollLocalToken();
    const subscribers = listSubscribers(true);
    const summaries = [];

    for (const sub of subscribers) {
      const res = await scanUserQuests(sub, client, options);
      summaries.push({
        userId: sub.user_id,
        success: Boolean(res?.success),
        totalQuests: res?.totalQuests || 0,
        completedCount: res?.completedCount || 0,
      });
      if (!options.fastTest && subscribers.length > 1) {
        await new Promise((r) => setTimeout(r, USER_DELAY_MS));
      }
    }

    return {
      success: true,
      scannedUsers: summaries.length,
      summaries,
    };
  } finally {
    isScanning = false;
  }
}

async function buildAutoStatusPayload(userId) {
  ensureTables();
  const sub = getSubscriber(userId);
  const running = isUserJobRunning(userId);
  const intervalMin = Math.round(getIntervalMs() / 60000);

  const embed = new EmbedBuilder()
    .setColor(sub?.enabled ? 0x2ecc71 : 0xe67e22)
    .setTitle('🤖 Trạng thái Auto Quest 24/7 (Video & Game)')
    .setDescription(
      sub
        ? [
            `- **Trạng thái chạy ngầm:** ${sub.enabled ? '🟢 Đang bật 24/7' : '🔴 Đang tạm dừng'}`,
            `- **Tiến trình hiện tại:** ${running ? '⚡ Đang xử lý nhiệm vụ...' : '⏳ Đang chờ chu kỳ quét tiếp theo'}`,
            `- **Chu kỳ tự động quét:** Mỗi **${intervalMin} phút/lần** (Nhận & hoàn thành 100% Video + Game, không tự Claim)`,
            `- **Thông báo DM:** ${sub.notify_dm ? '🔔 Bật' : '🔕 Tắt'}`,
            `- **Lần kiểm tra gần nhất:** ${
              sub.last_checked_at ? `<t:${Math.floor(Number(sub.last_checked_at) / 1000)}:R>` : 'Chưa quét'
            }`,
          ].join('\n')
        : 'Bạn chưa lưu User Token vào hệ thống Auto Quest 24/7.'
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('quest_scan_now')
      .setLabel('Quét & Làm Ngay')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('quest_toggle_auto')
      .setLabel(sub?.enabled ? 'Tạm dừng 24/7' : 'Bật Auto 24/7')
      .setStyle(sub?.enabled ? ButtonStyle.Danger : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('quest_toggle_dm')
      .setLabel(sub?.notify_dm ? 'Tắt thông báo DM' : 'Bật thông báo DM')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function start(client) {
  discordClientRef = client || discordClientRef;
  ensureTables();
  autoEnrollLocalToken();

  if (schedulerTimer) {
    clearInterval(schedulerTimer);
  }

  const intervalMs = getIntervalMs();
  schedulerTimer = setInterval(() => {
    scanAll(discordClientRef).catch((err) => {
      console.warn('[QUEST SCHEDULER] Lỗi khi quét định kỳ:', err.message);
    });
  }, intervalMs);

  if (typeof schedulerTimer.unref === 'function') {
    schedulerTimer.unref();
  }

  // Quét ngay sau khi khởi động 5 giây để không bỏ lỡ nhiệm vụ mới
  const initTimer = setTimeout(() => {
    scanAll(discordClientRef).catch((err) => {
      console.warn('[QUEST SCHEDULER] Lỗi ở lượt quét khởi động:', err.message);
    });
  }, 5000);

  if (typeof initTimer.unref === 'function') {
    initTimer.unref();
  }

  return true;
}

function stop() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

module.exports = {
  start,
  stop,
  scanAll,
  scanUserQuests,
  getSubscriber,
  getAllSubscribers,
  listSubscribers,
  registerSubscriber,
  upsertSubscriber,
  removeSubscriber,
  toggleSubscriber,
  toggleNotifyDm,
  isQuestNotified,
  markQuestNotified,
  buildAutoStatusPayload,
  isUserJobRunning,
};