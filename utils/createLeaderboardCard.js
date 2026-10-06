const {
  createCanvas,
  fontFamily,
  roundedRect,
  drawBackground,
  drawCircularAvatar,
  fitText,
  formatNumber,
} = require('./canvasCommon');

async function createLeaderboardCard(entries, monthLabel) {
  const width = 1200;
  const height = 1040;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, width, height);

  ctx.font = `700 44px "${fontFamily()}"`;
  ctx.fillStyle = '#ffd869';
  ctx.fillText('CHAT LEADERBOARD', 70, 90);

  ctx.font = `500 23px "${fontFamily()}"`;
  ctx.fillStyle = '#f8e8c0';
  ctx.fillText(`BXH XP THÁNG • ${monthLabel}`, 72, 128);

  const startY = 165;
  const rowH = 78;

  for (let i = 0; i < 10; i += 1) {
    const entry = entries[i];
    const y = startY + (i * rowH);

    ctx.fillStyle = i < 3
      ? 'rgba(74, 17, 20, 0.92)'
      : 'rgba(24, 5, 8, 0.70)';
    roundedRect(ctx, 62, y, 1076, 66, 18);
    ctx.fill();

    const rankColor = ['#ffd54d', '#d8d8d8', '#d38b54'][i] || '#f0c355';
    ctx.font = `700 28px "${fontFamily()}"`;
    ctx.fillStyle = rankColor;
    ctx.fillText(`#${i + 1}`, 88, y + 43);

    if (!entry) {
      ctx.font = `500 21px "${fontFamily()}"`;
      ctx.fillStyle = '#9f8387';
      ctx.fillText('Chưa có dữ liệu', 180, y + 42);
      continue;
    }

    await drawCircularAvatar(ctx, entry.avatarUrl, 145, y + 8, 50, 3);

    const nameSize = fitText(ctx, entry.username, 510, 24, 16, 700);
    ctx.font = `700 ${nameSize}px "${fontFamily()}"`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(entry.username, 220, y + 30);

    ctx.font = `500 17px "${fontFamily()}"`;
    ctx.fillStyle = '#dcbf9a';
    ctx.fillText(`Level ${entry.level}`, 220, y + 53);

    ctx.textAlign = 'right';
    ctx.font = `700 24px "${fontFamily()}"`;
    ctx.fillStyle = '#ffd869';
    ctx.fillText(`${formatNumber(entry.score)} XP`, 1098, y + 40);
    ctx.textAlign = 'left';
  }

  return canvas.toBuffer('image/png');
}

module.exports = { createLeaderboardCard };
