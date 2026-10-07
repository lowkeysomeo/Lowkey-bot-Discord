const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('node:fs');
const path = require('node:path');

for (const font of [path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans.ttf'), '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'C:\\Windows\\Fonts\\arial.ttf']) {
  if (fs.existsSync(font)) { GlobalFonts.registerFromPath(font, 'MonthlyFont'); break; }
}
function text(ctx, value, x, y, width, size, color, weight = 600) {
  const clean = String(value || '').replace(/[\r\n]/g, ' ');
  ctx.font = `${weight} ${size}px MonthlyFont, sans-serif`;
  let label = clean;
  while (label.length && ctx.measureText(label).width > width) label = label.slice(0, -1);
  if (label !== clean) label = label.slice(0, -1) + '…';
  ctx.fillStyle = color; ctx.fillText(label, x, y);
}
function box(ctx, x, y, w, h, fill, stroke) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 20);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}
async function avatar(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(parsed.hostname)) return null;
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    return await loadImage(Buffer.from(await response.arrayBuffer()));
  } catch { return null; }
}
async function createMonthlyRankCard({ serverName, month, chat = [], voice = [], color = '#c31822', rolesEnabled = true }) {
  const canvas = createCanvas(1400, 1960), ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 1400, 1960);
  bg.addColorStop(0, '#230d18'); bg.addColorStop(0.55, '#141420'); bg.addColorStop(1, '#0b1020');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1400, 1960);
  ctx.strokeStyle = '#ffffff08'; ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(1270, 80, 90 + i * 35, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = color; ctx.fillRect(48, 42, 6, 140);
  text(ctx, serverName, 76, 74, 1120, 24, '#d5b77b');
  text(ctx, 'BẢNG VÀNG HOẠT ĐỘNG THÁNG', 76, 132, 1230, 46, '#fff6e6', 800);
  text(ctx, month, 76, 175, 1000, 25, '#a9abba');
  const groups = [{ title: 'TOP 10 CHAT', subtitle: 'Những cuộc trò chuyện tạo nên cộng đồng', entries: chat, x: 48 },
    { title: 'TOP 10 VOICE', subtitle: 'Những giọng nói giữ lửa kết nối', entries: voice, x: 718 }];
  const images = await Promise.all([...chat.slice(0, 10), ...voice.slice(0, 10)].map(entry => avatar(entry.avatarUrl)));
  let imageIndex = 0;
  for (const group of groups) {
    text(ctx, group.title, group.x + 16, 250, 590, 29, '#f4d38a', 800);
    text(ctx, group.subtitle, group.x + 16, 283, 590, 18, '#a9abba');
    for (let rank = 0; rank < 10; rank++) {
      const y = 309 + rank * 158, entry = group.entries[rank];
      const medal = ['#efc971', '#b9c4d8', '#d49c78'][rank] || '#8796b1';
      box(ctx, group.x, y, 634, 150, '#ffffff06', rank === 0 ? '#d5b77b80' : '#ffffff15');
      box(ctx, group.x + 20, y + 19, 44, 36, medal);
      text(ctx, String(rank + 1), group.x + (rank === 9 ? 26 : 34), y + 45, 38, 23, '#181820', 800);
      const ax = group.x + 82, ay = y + 28;
      ctx.save(); ctx.beginPath(); ctx.arc(ax + 42, ay + 42, 42, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#343346'; ctx.fillRect(ax, ay, 84, 84);
      const image = entry ? images[imageIndex++] : null;
      if (image) ctx.drawImage(image, ax, ay, 84, 84);
      else text(ctx, entry?.username?.slice(0, 1).toUpperCase() || '—', ax + 27, ay + 56, 50, 34, medal);
      ctx.restore();
      text(ctx, entry?.username || 'Chưa có người xếp hạng', group.x + 188, y + 48, 420, 26, '#f6f4fa', 700);
      text(ctx, entry ? `${Number(entry.score || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} XP tháng` : 'Vị trí đang chờ bạn', group.x + 188, y + 82, 420, 22, medal);
      const reward = !entry ? '' : rank >= 3 ? 'Ghi nhận đóng góp cho cộng đồng' : !rolesEnabled ? 'Trao role tháng đang tắt' : `Role: ${entry.rewardRole || 'Chưa cấu hình role thưởng'}`;
      text(ctx, reward, group.x + 188, y + 115, 420, 18, '#a9abba');
    }
  }
  ctx.fillStyle = '#d5b77b60'; ctx.fillRect(64, 1895, 1272, 1);
  text(ctx, 'CẢM ƠN BẠN ĐÃ GIỮ NGỌN LỬA CỘNG ĐỒNG LUÔN RỰC SÁNG', 76, 1930, 1230, 19, '#d5b77b');
  return canvas.toBuffer('image/png');
}
module.exports = { createMonthlyRankCard };
