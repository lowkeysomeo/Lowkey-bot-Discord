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
    } catch (error) {
      // Bỏ qua: đã rời server (10007), bị ban (40014), hoặc lỗi mạng tạm thời trên Railway.
      // Không throw để tránh crash toàn bộ leaderboard.
      const code = Number(error.code);
      if (code === 10007 || code === 40014 || code === 50013) continue;
      console.warn(`[LEADERBOARD] Bỏ qua ${row.userId}: ${error.message}`);
    }
  }

  return entries;
}


module.exports = {
  resolveLeaderboardEntries,
};
