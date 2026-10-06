const { getDb } = require('./database');

function database() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS confession_config (
      guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS confession_posts (
      guild_id TEXT NOT NULL, number INTEGER NOT NULL,
      channel_id TEXT NOT NULL, message_id TEXT,
      PRIMARY KEY (guild_id, number)
    );
    CREATE TABLE IF NOT EXISTS confession_likes (
      guild_id TEXT NOT NULL, number INTEGER NOT NULL, user_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, number, user_id),
      FOREIGN KEY (guild_id, number) REFERENCES confession_posts(guild_id, number)
    );
  `);
  return db;
}

function getConfig(guildId) {
  return database().prepare('SELECT * FROM confession_config WHERE guild_id = ?').get(guildId);
}

function setChannel(guildId, channelId) {
  database().prepare(`INSERT INTO confession_config (guild_id, channel_id) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id`).run(guildId, channelId);
}

function reserveNumber(guildId, channelId) {
  const db = database();
  return db.transaction(() => {
    const row = db.prepare(`UPDATE confession_config SET counter = counter + 1
      WHERE guild_id = ? RETURNING counter`).get(guildId);
    if (!row) throw new Error('Confession channel is not configured');
    db.prepare('INSERT INTO confession_posts (guild_id, number, channel_id) VALUES (?, ?, ?)')
      .run(guildId, row.counter, channelId);
    return row.counter;
  }).immediate();
}

function attachMessage(guildId, number, messageId) {
  database().prepare('UPDATE confession_posts SET message_id = ? WHERE guild_id = ? AND number = ?')
    .run(messageId, guildId, number);
}

function getPost(guildId, number) {
  return database().prepare('SELECT * FROM confession_posts WHERE guild_id = ? AND number = ?')
    .get(guildId, number);
}

function toggleLike(guildId, number, userId) {
  const db = database();
  return db.transaction(() => {
    const removed = db.prepare('DELETE FROM confession_likes WHERE guild_id = ? AND number = ? AND user_id = ?')
      .run(guildId, number, userId).changes;
    if (!removed) db.prepare('INSERT INTO confession_likes VALUES (?, ?, ?)').run(guildId, number, userId);
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM confession_likes WHERE guild_id = ? AND number = ?')
      .get(guildId, number);
    return { liked: !removed, count };
  }).immediate();
}

module.exports = { getConfig, setChannel, reserveNumber, attachMessage, getPost, toggleLike };
