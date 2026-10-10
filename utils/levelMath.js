function xpNeededForLevel(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  return 100 + ((safeLevel - 1) * 50);
}

function totalXpForLevel(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const steps = safeLevel - 1;
  return (steps * 100) + (25 * steps * (steps - 1));
}

function profileFromTotalXp(totalXp) {
  let remaining = Math.max(0, Number(totalXp) || 0);
  let level = 1;

  while (remaining + 1e-9 >= xpNeededForLevel(level)) {
    remaining -= xpNeededForLevel(level);
    level += 1;

    // Dừng vòng lặp nếu dữ liệu lỗi hoặc XP quá lớn.
    if (level > 100000) break;
  }

  return {
    level,
    xp: Math.max(0, remaining),
    xpNeeded: xpNeededForLevel(level),
  };
}

function roundXp(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function formatXp(value) {
  const rounded = roundXp(value);
  return Number.isInteger(rounded)
    ? rounded.toLocaleString('vi-VN')
    : rounded.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

module.exports = {
  xpNeededForLevel,
  totalXpForLevel,
  profileFromTotalXp,
  roundXp,
  formatXp,
};
