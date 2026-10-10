const { getDb } = require('./database');
const {
  profileFromTotalXp,
  totalXpForLevel,
  roundXp,
} = require('./levelMath');

function ensureVoiceProfile(guildId, userId) {
  const db = getDb();

  db.prepare(`
    INSERT OR IGNORE INTO voice_levels
      (guild_id, user_id, level, xp, total_xp, monthly_xp, minutes, updated_at)
    VALUES (?, ?, 1, 0, 0, 0, 0, ?)
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
    minutes: row.minutes,
  };
}

function getVoiceProfile(guildId, userId) {
  ensureVoiceProfile(guildId, userId);
  const row = getDb()
    .prepare('SELECT * FROM voice_levels WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId);

  return mapRow(row);
}

function addVoiceXp(guildId, userId, amount, options = {}) {
  const safeAmount = Math.max(0, Number(amount) || 0);
  const countMonthly = options.countMonthly !== false;
  const minutesToAdd = Math.max(0, Math.floor(Number(options.minutes) || 0));

  const before = getVoiceProfile(guildId, userId);
  const newTotal = roundXp(before.totalXp + safeAmount);
  const newMonthly = roundXp(before.monthlyXp + (countMonthly ? safeAmount : 0));
  const newMinutes = before.minutes + minutesToAdd;
  const derived = profileFromTotalXp(newTotal);

  getDb().prepare(`
    UPDATE voice_levels
    SET level = ?, xp = ?, total_xp = ?, monthly_xp = ?, minutes = ?, updated_at = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(
    derived.level,
    roundXp(derived.xp),
    newTotal,
    newMonthly,
    newMinutes,
    Date.now(),
    guildId,
    userId,
  );

  return {
    profile: getVoiceProfile(guildId, userId),
    gainedXp: safeAmount,
    oldLevel: before.level,
    newLevel: derived.level,
    leveledUp: derived.level > before.level,
  };
}

function removeVoiceXp(guildId, userId, amount, options = {}) {
  const safeAmount = Math.max(0, Number(amount) || 0);
  const affectMonthly = options.affectMonthly === true;

  const before = getVoiceProfile(guildId, userId);
  const newTotal = roundXp(Math.max(0, before.totalXp - safeAmount));
  const newMonthly = affectMonthly
    ? roundXp(Math.max(0, before.monthlyXp - safeAmount))
    : before.monthlyXp;

  const derived = profileFromTotalXp(newTotal);

  getDb().prepare(`
    UPDATE voice_levels
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

  return getVoiceProfile(guildId, userId);
}

function setVoiceLevel(guildId, userId, level) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  ensureVoiceProfile(guildId, userId);

  getDb().prepare(`
    UPDATE voice_levels
    SET level = ?, xp = 0, total_xp = ?, updated_at = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(
    safeLevel,
    totalXpForLevel(safeLevel),
    Date.now(),
    guildId,
    userId,
  );

  return getVoiceProfile(guildId, userId);
}

function getVoiceLeaderboard(guildId, type = 'monthly', limit = 50) {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 50)));
  const column = type === 'total' ? 'total_xp' : 'monthly_xp';

  return getDb().prepare(`
    SELECT *
    FROM voice_levels
    WHERE guild_id = ? AND ${column} > 0
    ORDER BY ${column} DESC, total_xp DESC, user_id ASC
    LIMIT ?
  `).all(guildId, safeLimit).map(mapRow);
}

function getVoiceRankPosition(guildId, userId, type = 'total') {
  const profile = getVoiceProfile(guildId, userId);
  const column = type === 'monthly' ? 'monthly_xp' : 'total_xp';
  const value = type === 'monthly' ? profile.monthlyXp : profile.totalXp;

  const row = getDb().prepare(`
    SELECT COUNT(*) + 1 AS rank
    FROM voice_levels
    WHERE guild_id = ? AND ${column} > ?
  `).get(guildId, value);

  return row.rank;
}

function resetVoiceMonthlyXp(guildId) {
  return getDb().prepare(`
    UPDATE voice_levels
    SET monthly_xp = 0, updated_at = ?
    WHERE guild_id = ?
  `).run(Date.now(), guildId);
}

// Giữ tên hàm cũ để các lệnh trước đây vẫn dùng được.
const addXp = addVoiceXp;
const setLevel = setVoiceLevel;

module.exports = {
  getVoiceProfile,
  addVoiceXp,
  removeVoiceXp,
  setVoiceLevel,
  getVoiceLeaderboard,
  getVoiceRankPosition,
  resetVoiceMonthlyXp,
  addXp,
  setLevel,
};
