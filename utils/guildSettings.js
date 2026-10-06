const { getDb } = require('./database');

function table() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT NOT NULL, setting_key TEXT NOT NULL, value TEXT NOT NULL,
    PRIMARY KEY (guild_id, setting_key)
  )`);
  return db;
}

function getGuildSetting(guildId, key) {
  if (!guildId) return null;
  const row = table().prepare('SELECT value FROM guild_settings WHERE guild_id = ? AND setting_key = ?').get(guildId, key);
  if (row) return row.value || null;
  // Existing Railway/.env settings belong only to the original server.
  return guildId === process.env.GUILD_ID ? process.env[key] || null : null;
}

function setGuildSetting(guildId, key, value) {
  table().prepare(`INSERT INTO guild_settings VALUES (?, ?, ?)
    ON CONFLICT(guild_id, setting_key) DO UPDATE SET value = excluded.value`)
    .run(guildId, key, value || '');
}

module.exports = { getGuildSetting, setGuildSetting };
