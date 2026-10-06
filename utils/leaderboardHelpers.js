async function resolveLeaderboardEntries(guild, rows, scoreField, limit = 10) {
  const entries = [];

  for (const row of rows) {
    if (entries.length >= limit) break;

    try {
      const member = await guild.members.fetch(row.userId);
      if (!member || member.user.bot) continue;

      entries.push({
        userId: member.id,
        username: member.displayName || member.user.username,
        tag: member.user.tag,
        avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 128 }),
        level: row.level,
        totalXp: row.totalXp,
        monthlyXp: row.monthlyXp,
        minutes: row.minutes || 0,
        score: Number(row[scoreField]) || 0,
      });
    } catch {
      // User đã rời server hoặc Discord không trả về member.
    }
  }

  return entries;
}

module.exports = {
  resolveLeaderboardEntries,
};
