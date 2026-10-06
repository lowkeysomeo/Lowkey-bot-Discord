const {
  createCanvas,
  fontFamily,
  roundedRect,
  drawBackground,
  drawCircularAvatar,
  fitText,
  formatNumber,
  formatVoiceTime,
} = require('./canvasCommon');
const { xpNeededForLevel } = require('./levelMath');

async function createVoiceRankCard({ member, profile, rank }) {
  const width = 1100;
  const height = 380;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, width, height);

  ctx.fillStyle = 'rgba(16, 3, 5, 0.66)';
  roundedRect(ctx, 45, 48, width - 90, height - 96, 28);
  ctx.fill();

  await drawCircularAvatar(
    ctx,
    member.user.displayAvatarURL({ extension: 'png', size: 256 }),
    78,
    108,
    160,
    6,
  );

  const name = member.displayName || member.user.username;
  const nameSize = fitText(ctx, name, 470, 42, 24, 700);
  ctx.font = `700 ${nameSize}px "${fontFamily()}"`;
  ctx.fillStyle = '#fff7df';
  ctx.fillText(name, 275, 118);

  ctx.font = `700 24px "${fontFamily()}"`;
  ctx.fillStyle = '#f2c34e';
  ctx.fillText(`VOICE HẠNG #${rank}`, 278, 158);

  ctx.font = `700 30px "${fontFamily()}"`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`VOICE LEVEL ${profile.level}`, 278, 212);

  ctx.font = `500 20px "${fontFamily()}"`;
  ctx.fillStyle = '#f5dfb2';
  ctx.fillText(`Tổng Voice XP: ${formatNumber(profile.totalXp)}`, 278, 248);
  ctx.fillText(`Voice XP tháng: ${formatNumber(profile.monthlyXp)}`, 278, 280);
  ctx.fillText(`Thời gian Voice: ${formatVoiceTime(profile.minutes)}`, 278, 312);

  const barX = 650;
  const barY = 185;
  const barW = 350;
  const barH = 30;
  const needed = xpNeededForLevel(profile.level);
  const progress = Math.max(0, Math.min(1, profile.xp / needed));

  ctx.fillStyle = '#2d0d10';
  roundedRect(ctx, barX, barY, barW, barH, 15);
  ctx.fill();

  if (progress > 0) {
    ctx.fillStyle = '#f1c453';
    roundedRect(ctx, barX, barY, Math.max(barH, barW * progress), barH, 15);
    ctx.fill();
  }

  ctx.font = `700 20px "${fontFamily()}"`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${formatNumber(profile.xp)} / ${formatNumber(needed)} XP`, barX, barY - 15);

  ctx.font = `700 19px "${fontFamily()}"`;
  ctx.fillStyle = '#f2c34e';
  ctx.fillText('VIETNAM LEGACY • VOICE RANK', barX, 290);

  return canvas.toBuffer('image/png');
}

module.exports = { createVoiceRankCard };
