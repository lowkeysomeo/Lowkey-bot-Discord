const { getDb } = require('./database');

const exclusionCache = new Map();

function ensureTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS xp_exclusions (
      guild_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT 'channel',
      created_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, target_id)
    );
  `);
}

function loadGuildCache(guildId) {
  ensureTable();

  const rows = getDb()
    .prepare(`
      SELECT target_id
      FROM xp_exclusions
      WHERE guild_id = ?
    `)
    .all(guildId);

  const set = new Set(
    rows.map((row) => row.target_id)
  );

  exclusionCache.set(
    guildId,
    set
  );

  return set;
}

function getGuildCache(guildId) {
  if (!exclusionCache.has(guildId)) {
    return loadGuildCache(guildId);
  }

  return exclusionCache.get(guildId);
}

function addXpExclusion(
  guildId,
  targetId,
  targetType = 'channel'
) {
  ensureTable();

  const result = getDb()
    .prepare(`
      INSERT OR IGNORE INTO xp_exclusions
        (
          guild_id,
          target_id,
          target_type,
          created_at
        )
      VALUES (?, ?, ?, ?)
    `)
    .run(
      guildId,
      targetId,
      targetType,
      Date.now()
    );

  getGuildCache(guildId).add(
    targetId
  );

  return result.changes > 0;
}

function removeXpExclusion(
  guildId,
  targetId
) {
  ensureTable();

  const result = getDb()
    .prepare(`
      DELETE FROM xp_exclusions
      WHERE guild_id = ?
        AND target_id = ?
    `)
    .run(
      guildId,
      targetId
    );

  getGuildCache(guildId).delete(
    targetId
  );

  return result.changes > 0;
}

function listXpExclusions(guildId) {
  ensureTable();

  return getDb()
    .prepare(`
      SELECT
        target_id AS targetId,
        target_type AS targetType,
        created_at AS createdAt
      FROM xp_exclusions
      WHERE guild_id = ?
      ORDER BY created_at ASC
    `)
    .all(guildId);
}

function getChannelHierarchy(channel) {
  const ids = [];
  const visited = new Set();

  let current = channel;

  while (
    current &&
    !visited.has(current.id)
  ) {
    visited.add(current.id);

    ids.push(
      current.id
    );

    if (!current.parentId) {
      break;
    }

    current =
      current.guild?.channels?.cache?.get(
        current.parentId
      ) || null;
  }

  return ids;
}

function isXpExcluded(
  guildId,
  channel
) {
  if (
    !guildId ||
    !channel
  ) {
    return false;
  }

  const excluded =
    getGuildCache(guildId);

  const hierarchy =
    getChannelHierarchy(channel);

  return hierarchy.some(
    (id) =>
      excluded.has(id)
  );
}

module.exports = {
  addXpExclusion,
  removeXpExclusion,
  listXpExclusions,
  isXpExcluded,
};