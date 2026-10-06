const {
  createCanvas,
  fontFamily,
  roundedRect,
  drawBackground,
  fitText,
  formatNumber,
} = require('./canvasCommon');

function drawColumn(ctx, x, width, title, entries, type) {
  // Tiêu đề cột được hạ xuống để không đè subtitle
  ctx.font = `700 34px "${fontFamily()}"`;
  ctx.fillStyle = '#ffd869';
  ctx.fillText(title, x, 172);

  // Hạ hàng #1 xuống để tạo khoảng cách đẹp hơn
  const startY = 200;
  const rowH = 66;

  for (let i = 0; i < 10; i += 1) {
    const entry = entries[i];
    const y = startY + (i * rowH);

    ctx.fillStyle = i < 3
      ? 'rgba(75, 15, 20, 0.92)'
      : 'rgba(23, 5, 7, 0.70)';

    roundedRect(ctx, x, y, width, 54, 14);
    ctx.fill();

    const rankColor =
      ['#ffd54d', '#d8d8d8', '#d38b54'][i] || '#f0c355';

    ctx.font = `700 22px "${fontFamily()}"`;
    ctx.fillStyle = rankColor;
    ctx.fillText(`#${i + 1}`, x + 18, y + 35);

    if (!entry) {
      ctx.font = `500 17px "${fontFamily()}"`;
      ctx.fillStyle = '#9f8387';
      ctx.fillText(
        'Chưa có dữ liệu',
        x + 78,
        y + 34
      );

      continue;
    }

    const nameSize = fitText(
      ctx,
      entry.username,
      width - 260,
      20,
      14,
      700
    );

    ctx.font = `700 ${nameSize}px "${fontFamily()}"`;
    ctx.fillStyle = '#ffffff';

    ctx.fillText(
      entry.username,
      x + 78,
      y + 24
    );

    ctx.font = `500 14px "${fontFamily()}"`;
    ctx.fillStyle = '#dcbf9a';

    ctx.fillText(
      `Level ${entry.level}`,
      x + 78,
      y + 44
    );

    ctx.textAlign = 'right';

    ctx.font = `700 18px "${fontFamily()}"`;
    ctx.fillStyle = '#ffd869';

    ctx.fillText(
      `${formatNumber(entry.score)} XP`,
      x + width - 18,
      y + 33
    );

    ctx.textAlign = 'left';
  }

  ctx.font = `500 15px "${fontFamily()}"`;
  ctx.fillStyle = '#d5b9a0';

  ctx.fillText(
    type === 'chat'
      ? 'Xếp theo tổng Chat XP tích lũy.'
      : 'Xếp theo tổng Voice XP tích lũy.',
    x,
    910
  );
}

async function createTotalLeaderboardCard(
  chatEntries,
  voiceEntries
) {
  const width = 1600;
  const height = 950;

  const canvas = createCanvas(
    width,
    height
  );

  const ctx = canvas.getContext('2d');

  drawBackground(
    ctx,
    width,
    height
  );

  // ==============================
  // HEADER
  // ==============================

  ctx.font = `700 48px "${fontFamily()}"`;
  ctx.fillStyle = '#ffd869';

  ctx.fillText(
    'VIETNAM LEGACY • TOTAL LEADERBOARD',
    70,
    80
  );

  // Subtitle nằm riêng một dòng
  ctx.font = `500 22px "${fontFamily()}"`;
  ctx.fillStyle = '#f8e8c0';

  ctx.fillText(
    'Tổng XP tích lũy • Không reset theo tháng',
    72,
    120
  );

  // ==============================
  // CHAT / VOICE
  // ==============================

  drawColumn(
    ctx,
    70,
    700,
    'CHAT • TỔNG XP',
    chatEntries,
    'chat'
  );

  drawColumn(
    ctx,
    830,
    700,
    'VOICE • TỔNG XP',
    voiceEntries,
    'voice'
  );

  return canvas.toBuffer(
    'image/png'
  );
}

module.exports = {
  createTotalLeaderboardCard,
};