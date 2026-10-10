const { getDb } = require('./database');
const {
  profileFromTotalXp,
  totalXpForLevel,
  roundXp,
} = require('./levelMath');

function ensureChatProfile(guildId, userId) {
  const db = getDb();

  db.prepare(`
    INSERT OR IGNORE INTO chat_levels
      (guild_id, user_id, level, xp, total_xp, monthly_xp, updated_at)
    VALUES (?, ?, 1, 0, 0, 0, ?)
  `).run(guildId, userId, Date.now());
}

function mapRow(row) {
  if (!row) return null;
  return {
    guildId: row.guild_id,
    userId: row.user_id,
    level: row.level,
    xp: row.xp,
    totalXp: row.total_xp,
    monthlyXp: row.monthly_xp,
  };
}

function getChatProfile(guildId, userId) {
  ensureChatProfile(guildId, userId);
  const row = getDb()
    .prepare('SELECT * FROM chat_levels WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId);

  return mapRow(row);
}

function addChatXp(guildId, userId, amount, options = {}) {
  const safeAmount = Math.max(0, Number(amount) || 0);
  const countMonthly = options.countMonthly !== false;

  const before = getChatProfile(guildId, userId);
  const newTotal = roundXp(before.totalXp + safeAmount);
  const newMonthly = roundXp(before.monthlyXp + (countMonthly ? safeAmount : 0));
  const derived = profileFromTotalXp(newTotal);

  getDb().prepare(`
    UPDATE chat_levels
    SET level = ?, xp = ?, total_xp = ?, monthly_xp = ?, updated_at = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(
    derived.level,
    roundXp(derived.xp),
    newTotal,
    newMonthly,
    Date.now(),
    guildId,
    userId,
  );

  return {
    profile: getChatProfile(guildId, userId),
    gainedXp: safeAmount,
    oldLevel: before.level,
    newLevel: derived.level,
    leveledUp: derived.level > before.level,
  };
}

function removeChatXp(guildId, userId, amount, options = {}) {
  const safeAmount = Math.max(0, Number(amount) || 0);
  const affectMonthly = options.affectMonthly === true;

  const before = getChatProfile(guildId, userId);
  const newTotal = roundXp(Math.max(0, before.totalXp - safeAmount));
  const newMonthly = affectMonthly
    ? roundXp(Math.max(0, before.monthlyXp - safeAmount))
    : before.monthlyXp;

  const derived = profileFromTotalXp(newTotal);

  getDb().prepare(`
    UPDATE chat_levels
    SET level = ?, xp = ?, total_xp = ?, monthly_xp = ?, updated_at = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(
    derived.level,
    roundXp(derived.xp),
    newTotal,
    newMonthly,
    Date.now(),
    guildId,
    userId,
  );

  return getChatProfile(guildId, userId);
}

function setChatLevel(guildId, userId, level) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  ensureChatProfile(guildId, userId);

  getDb().prepare(`
    UPDATE chat_levels
    SET level = ?, xp = 0, total_xp = ?, updated_at = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(
    safeLevel,
    totalXpForLevel(safeLevel),
    Date.now(),
    guildId,
    userId,
  );

  return getChatProfile(guildId, userId);
}

function getChatLeaderboard(guildId, type = 'monthly', limit = 50) {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 50)));
  const column = type === 'total' ? 'total_xp' : 'monthly_xp';

  return getDb().prepare(`
    SELECT *
    FROM chat_levels
    WHERE guild_id = ? AND ${column} > 0
    ORDER BY ${column} DESC, total_xp DESC, user_id ASC
    LIMIT ?
  `).all(guildId, safeLimit).map(mapRow);
}

function getChatRankPosition(guildId, userId, type = 'total') {
  const profile = getChatProfile(guildId, userId);
  const column = type === 'monthly' ? 'monthly_xp' : 'total_xp';
  const value = type === 'monthly' ? profile.monthlyXp : profile.totalXp;

  const row = getDb().prepare(`
    SELECT COUNT(*) + 1 AS rank
    FROM chat_levels
    WHERE guild_id = ? AND ${column} > ?
  `).get(guildId, value);

  return row.rank;
}

function resetChatMonthlyXp(guildId) {
  return getDb().prepare(`
    UPDATE chat_levels
    SET monthly_xp = 0, updated_at = ?
    WHERE guild_id = ?
  `).run(Date.now(), guildId);
}

// Giữ tên hàm cũ cho các tệp chưa chuyển sang cách gọi mới.
const getProfile = getChatProfile;
const addXp = addChatXp;
const removeXp = removeChatXp;
const setLevel = setChatLevel;

module.exports = {
  getChatProfile,
  addChatXp,
  removeChatXp,
  setChatLevel,
  getChatLeaderboard,
  getChatRankPosition,
  resetChatMonthlyXp,
  getProfile,
  addXp,
  removeXp,
  setLevel,
};
