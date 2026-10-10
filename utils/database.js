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
  `);

  migrateLegacyJsonIfNeeded();
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

  // Dữ liệu cũ theo người dùng: { "userId": { level, xp, totalXp } }
  if (topEntries.every(([, value]) => looksLikeProfile(value))) {
    if (!fallbackGuildId) {
      console.warn('[DB MIGRATION] Không có GUILD_ID nên bỏ qua JSON dạng userId -> profile.');
      return rows;
    }

    for (const [userId, profile] of topEntries) {
      rows.push({ guildId: fallbackGuildId, userId, profile });
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

module.exports = {
  initializeDatabase,
  getDb,
  getDatabasePath,
};
