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
  const canvas = createCanvas(1600, 1040), ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 1600, 1040);
  bg.addColorStop(0, '#230d18'); bg.addColorStop(0.55, '#141420'); bg.addColorStop(1, '#0b1020');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1600, 1040);
  ctx.strokeStyle = '#ffffff08'; ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(1270, 80, 90 + i * 35, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = color; ctx.fillRect(40, 30, 6, 112);
  text(ctx, serverName, 62, 58, 1220, 23, '#d5b77b');
  text(ctx, 'BẢNG VÀNG HOẠT ĐỘNG THÁNG', 62, 109, 1480, 43, '#fff6e6', 800);
  text(ctx, month, 62, 144, 1000, 23, '#a9abba');
  ctx.fillStyle = '#d5b77b70'; ctx.fillRect(799, 174, 2, 790);
  const groups = [{ title: 'TOP 10 CHAT', subtitle: 'Những cuộc trò chuyện tạo nên cộng đồng', entries: chat, x: 40 },
    { title: 'TOP 10 VOICE', subtitle: 'Những giọng nói giữ lửa kết nối', entries: voice, x: 820 }];
  const images = await Promise.all([...chat.slice(0, 10), ...voice.slice(0, 10)].map(entry => avatar(entry.avatarUrl)));
  let imageIndex = 0;
  for (const group of groups) {
    text(ctx, group.title, group.x + 12, 195, 710, 29, '#f4d38a', 800);
    text(ctx, group.subtitle, group.x + 12, 221, 710, 17, '#a9abba');
    for (let rank = 0; rank < 10; rank++) {
      const y = 237 + rank * 74, entry = group.entries[rank];
      const medal = ['#efc971', '#b9c4d8', '#d49c78'][rank] || '#8796b1';
      box(ctx, group.x, y, 740, 66, '#ffffff06', rank < 3 ? `${medal}70` : '#ffffff15');
      box(ctx, group.x + 12, y + 18, 34, 30, medal);
      text(ctx, String(rank + 1), group.x + (rank === 9 ? 17 : 22), y + 40, 30, 20, '#181820', 800);
      const ax = group.x + 60, ay = y + 8;
      ctx.save(); ctx.beginPath(); ctx.arc(ax + 25, ay + 25, 25, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#343346'; ctx.fillRect(ax, ay, 50, 50);
      const image = entry ? images[imageIndex++] : null;
      if (image) ctx.drawImage(image, ax, ay, 50, 50);
      else text(ctx, entry?.username?.slice(0, 1).toUpperCase() || '—', ax + 15, ay + 35, 30, 26, medal);
      ctx.restore();
      text(ctx, entry?.username || 'Chưa có người xếp hạng', group.x + 126, y + 29, 385, 24, '#f6f4fa', 700);
      text(ctx, entry ? `${Number(entry.score || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} XP` : '—', group.x + 536, y + 38, 190, 24, medal, 700);
      const reward = !entry ? 'Vị trí đang chờ bạn' : rank >= 3 ? 'Ghi nhận đóng góp cho cộng đồng' : !rolesEnabled ? 'Trao role tháng đang tắt' : `Role: ${entry.rewardRole || 'Chưa cấu hình role thưởng'}`;
      text(ctx, reward, group.x + 126, y + 52, 385, 17, '#a9abba');
    }
  }
  ctx.fillStyle = '#d5b77b60'; ctx.fillRect(40, 986, 1520, 1);
  text(ctx, 'CẢM ƠN BẠN ĐÃ GIỮ NGỌN LỬA CỘNG ĐỒNG LUÔN RỰC SÁNG', 62, 1020, 1480, 19, '#d5b77b');
  return canvas.toBuffer('image/png');
}
module.exports = { createMonthlyRankCard };
