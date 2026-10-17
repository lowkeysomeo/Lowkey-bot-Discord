const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let db;
let databasePath;

function resolveDatabasePath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;

  const railwayDataDir = '/data';
  if (fs.existsSync(railwayDataDir)) {
    return path.join(railwayDataDir, 'vietnam-legacy.sqlite');
  }

  const localDataDir = path.join(process.cwd(), 'data');
  fs.mkdirSync(localDataDir, { recursive: true });
  return path.join(localDataDir, 'vietnam-legacy.sqlite');
}

function initializeDatabase() {
  if (db) return db;

  databasePath = resolveDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_levels (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      xp REAL NOT NULL DEFAULT 0,
      total_xp REAL NOT NULL DEFAULT 0,
      monthly_xp REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS voice_levels (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      xp REAL NOT NULL DEFAULT 0,
      total_xp REAL NOT NULL DEFAULT 0,
      monthly_xp REAL NOT NULL DEFAULT 0,
      minutes INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS monthly_state (
      guild_id TEXT PRIMARY KEY,
      current_month TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS monthly_results (
      guild_id TEXT NOT NULL,
      month_key TEXT NOT NULL,
      chat_json TEXT NOT NULL,
      voice_json TEXT NOT NULL,
      announcement_message_id TEXT,
      roles_assigned INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, month_key)
    );

    CREATE TABLE IF NOT EXISTS monthly_role_holders (
      guild_id TEXT NOT NULL,
      role_key TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, role_key)
    );

    CREATE INDEX IF NOT EXISTS idx_chat_monthly
      ON chat_levels (guild_id, monthly_xp DESC);

    CREATE INDEX IF NOT EXISTS idx_chat_total
      ON chat_levels (guild_id, total_xp DESC);

    CREATE INDEX IF NOT EXISTS idx_voice_monthly
      ON voice_levels (guild_id, monthly_xp DESC);

    CREATE INDEX IF NOT EXISTS idx_voice_total
      ON voice_levels (guild_id, total_xp DESC);

    CREATE TABLE IF NOT EXISTS quest_subscribers (
      user_id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      username TEXT,
      notify_dm INTEGER NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_checked_at INTEGER NOT NULL DEFAULT 0,
      last_quests_json TEXT,
      created_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quest_permissions (
      user_id TEXT PRIMARY KEY,
      username TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at INTEGER NOT NULL DEFAULT 0,
      approved_at INTEGER NOT NULL DEFAULT 0,
      approved_by TEXT
    );
  `);

  migrateLegacyJsonIfNeeded();
  repairLegacyUserIds(db);
  return db;
}

function getDb() {
  return initializeDatabase();
}

function getDatabasePath() {
  initializeDatabase();
  return databasePath;
}

function looksLikeProfile(value) {
  return value
    && typeof value === 'object'
    && !Array.isArray(value)
    && (
      Object.prototype.hasOwnProperty.call(value, 'level')
      || Object.prototype.hasOwnProperty.call(value, 'xp')
      || Object.prototype.hasOwnProperty.call(value, 'totalXp')
      || Object.prototype.hasOwnProperty.call(value, 'total_xp')
    );
}

function extractLegacyRows(data, fallbackGuildId) {
  const rows = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return rows;

  const topEntries = Object.entries(data);
  if (topEntries.length === 0) return rows;

  // Dữ liệu cũ theo người dùng: { "userId": { level, xp, totalXp } } hoặc { "guildId:userId": { ... } }
  if (topEntries.every(([, value]) => looksLikeProfile(value))) {
    for (const [key, profile] of topEntries) {
      const parts = key.split(':');
      const targetGuildId = parts.length > 1 ? parts[0] : fallbackGuildId;
      const targetUserId = parts.length > 1 ? parts[1] : parts[0];

      if (!targetGuildId) {
        console.warn('[DB MIGRATION] Không có GUILD_ID nên bỏ qua JSON dạng userId -> profile.');
        return rows;
      }

      rows.push({ guildId: targetGuildId, userId: targetUserId, profile });
    }
    return rows;
  }

  // Dữ liệu cũ theo server: { "guildId": { "userId": { ... } } }
  for (const [guildId, users] of topEntries) {
    if (!users || typeof users !== 'object' || Array.isArray(users)) continue;

    for (const [userId, profile] of Object.entries(users)) {
      if (looksLikeProfile(profile)) {
        rows.push({ guildId, userId, profile });
      }
    }
  }

  return rows;
}

function readJsonSafely(filePath) {
  if (!fs.existsSync(filePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`[DB MIGRATION] Không đọc được ${filePath}:`, error);
    return null;
  }
}

function migrateLegacyJsonIfNeeded() {
  const database = db;
  const chatCount = database.prepare('SELECT COUNT(*) AS count FROM chat_levels').get().count;
  const voiceCount = database.prepare('SELECT COUNT(*) AS count FROM voice_levels').get().count;

  const fallbackGuildId = process.env.GUILD_ID || null;
  const chatFile = path.join(process.cwd(), 'data', 'levels.json');
  const voiceFile = path.join(process.cwd(), 'data', 'voiceLevels.json');

  if (chatCount === 0) {
    const chatData = readJsonSafely(chatFile);
    const chatRows = extractLegacyRows(chatData, fallbackGuildId);

    if (chatRows.length > 0) {
      const insert = database.prepare(`
        INSERT OR IGNORE INTO chat_levels
          (guild_id, user_id, level, xp, total_xp, monthly_xp, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, ?)
      `);

      const tx = database.transaction((rows) => {
        const now = Date.now();
        for (const row of rows) {
          const p = row.profile || {};
          insert.run(
            row.guildId,
            row.userId,
            Math.max(1, Math.floor(Number(p.level) || 1)),
            Math.max(0, Number(p.xp) || 0),
            Math.max(0, Number(p.totalXp ?? p.total_xp) || 0),
            now,
          );
        }
      });

      tx(chatRows);
      console.log(`[DB MIGRATION] Đã migrate ${chatRows.length} Chat profile từ levels.json.`);
    }
  }

  if (voiceCount === 0) {
    const voiceData = readJsonSafely(voiceFile);
    const voiceRows = extractLegacyRows(voiceData, fallbackGuildId);

    if (voiceRows.length > 0) {
      const insert = database.prepare(`
        INSERT OR IGNORE INTO voice_levels
          (guild_id, user_id, level, xp, total_xp, monthly_xp, minutes, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?)
      `);

      const tx = database.transaction((rows) => {
        const now = Date.now();
        for (const row of rows) {
          const p = row.profile || {};
          insert.run(
            row.guildId,
            row.userId,
            Math.max(1, Math.floor(Number(p.level) || 1)),
            Math.max(0, Number(p.xp) || 0),
            Math.max(0, Number(p.totalXp ?? p.total_xp) || 0),
            Math.max(0, Math.floor(Number(p.minutes) || 0)),
            now,
          );
        }
      });

      tx(voiceRows);
      console.log(`[DB MIGRATION] Đã migrate ${voiceRows.length} Voice profile từ voiceLevels.json.`);
    }
  }
}

function repairLegacyUserIds(database) {
  const { profileFromTotalXp } = require('./levelMath');

  // 1. Sửa chat_levels nếu user_id chứa dấu hai chấm ':'
  const badChatRows = database.prepare("SELECT * FROM chat_levels WHERE user_id LIKE '%:%'").all();
  if (badChatRows.length > 0) {
    const tx = database.transaction((rows) => {
      for (const r of rows) {
        const parts = r.user_id.split(':');
        const targetGuildId = parts.length > 1 ? parts[0] : r.guild_id;
        const targetUserId = parts.length > 1 ? parts[1] : parts[0];

        const existing = database.prepare(
          'SELECT * FROM chat_levels WHERE guild_id = ? AND user_id = ?'
        ).get(targetGuildId, targetUserId);

        if (existing) {
          const mergedTotal = Math.max(0, (Number(existing.total_xp) || 0) + (Number(r.total_xp) || 0));
          const mergedMonthly = Math.max(0, (Number(existing.monthly_xp) || 0) + (Number(r.monthly_xp) || 0));
          const derived = profileFromTotalXp(mergedTotal);

          database.prepare(`
            UPDATE chat_levels
            SET level = ?, xp = ?, total_xp = ?, monthly_xp = ?, updated_at = ?
            WHERE guild_id = ? AND user_id = ?
          `).run(
            derived.level,
            derived.xp,
            mergedTotal,
            mergedMonthly,
            Math.max(existing.updated_at, r.updated_at),
            targetGuildId,
            targetUserId
          );

          database.prepare(
            'DELETE FROM chat_levels WHERE guild_id = ? AND user_id = ?'
          ).run(r.guild_id, r.user_id);
        } else {
          database.prepare(
            'UPDATE chat_levels SET guild_id = ?, user_id = ? WHERE guild_id = ? AND user_id = ?'
          ).run(targetGuildId, targetUserId, r.guild_id, r.user_id);
        }
      }
    });

    tx(badChatRows);
    console.log(`[DB MIGRATION] Đã sửa và gộp ${badChatRows.length} bản ghi chat_levels có user_id lỗi.`);
  }

  // 2. Sửa voice_levels nếu user_id chứa dấu hai chấm ':'
  const badVoiceRows = database.prepare("SELECT * FROM voice_levels WHERE user_id LIKE '%:%'").all();
  if (badVoiceRows.length > 0) {
    const tx = database.transaction((rows) => {
      for (const r of rows) {
        const parts = r.user_id.split(':');
        const targetGuildId = parts.length > 1 ? parts[0] : r.guild_id;
        const targetUserId = parts.length > 1 ? parts[1] : parts[0];

        const existing = database.prepare(
          'SELECT * FROM voice_levels WHERE guild_id = ? AND user_id = ?'
        ).get(targetGuildId, targetUserId);

        if (existing) {
          const mergedTotal = Math.max(0, (Number(existing.total_xp) || 0) + (Number(r.total_xp) || 0));
          const mergedMonthly = Math.max(0, (Number(existing.monthly_xp) || 0) + (Number(r.monthly_xp) || 0));
          const mergedMinutes = Math.max(0, (Number(existing.minutes) || 0) + (Number(r.minutes) || 0));
          const derived = profileFromTotalXp(mergedTotal);

          database.prepare(`
            UPDATE voice_levels
            SET level = ?, xp = ?, total_xp = ?, monthly_xp = ?, minutes = ?, updated_at = ?
            WHERE guild_id = ? AND user_id = ?
          `).run(
            derived.level,
            derived.xp,
            mergedTotal,
            mergedMonthly,
            mergedMinutes,
            Math.max(existing.updated_at, r.updated_at),
            targetGuildId,
            targetUserId
          );

          database.prepare(
            'DELETE FROM voice_levels WHERE guild_id = ? AND user_id = ?'
          ).run(r.guild_id, r.user_id);
        } else {
          database.prepare(
            'UPDATE voice_levels SET guild_id = ?, user_id = ? WHERE guild_id = ? AND user_id = ?'
          ).run(targetGuildId, targetUserId, r.guild_id, r.user_id);
        }
      }
    });

    tx(badVoiceRows);
    console.log(`[DB MIGRATION] Đã sửa và gộp ${badVoiceRows.length} bản ghi voice_levels có user_id lỗi.`);
  }
}

module.exports = {
  initializeDatabase,
  getDb,
  getDatabasePath,
  repairLegacyUserIds,
};
