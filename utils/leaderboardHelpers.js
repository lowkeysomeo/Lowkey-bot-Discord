async function resolveLeaderboardEntries(guild, rows, scoreField, limit = 10) {
  const entries = [];

  for (const row of rows) {
    if (entries.length >= limit) break;

    const rawUserId = row.userId ? String(row.userId) : '';
    const cleanUserId = rawUserId.includes(':') ? rawUserId.split(':').pop() : rawUserId;

    try {
      const member = await guild.members.fetch(cleanUserId);
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
      // Bỏ qua: đã rời server (10007), không tồn tại (10013), bị ban (40014), ID sai định dạng (50035), hoặc 404
      const code = Number(error.code);
      if (code === 10007 || code === 10013 || code === 40014 || code === 50035 || error.status === 404) continue;
      // Mọi lỗi khác (50013 thiếu quyền, ECONNRESET, lỗi mạng…) throw lên để caller retry.
      throw error;
    }
  }

  return entries;
}


module.exports = {
  resolveLeaderboardEntries,
};
