const fs = require('fs');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

let fontFamily = 'sans-serif';

function registerFonts() {
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    'C:\\Windows\\Fonts\\arial.ttf',
  ];

  for (const fontPath of candidates) {
    if (!fs.existsSync(fontPath)) continue;

    try {
      GlobalFonts.registerFromPath(fontPath, 'VNL Sans');
      fontFamily = 'VNL Sans';
      return;
    } catch (error) {
      console.warn('[CANVAS] Không đăng ký được font:', error.message);
    }
  }
}

registerFonts();

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#3a0508');
  gradient.addColorStop(0.5, '#8b1018');
  gradient.addColorStop(1, '#2a0205');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#ffd65a';

  for (let x = -height; x < width + height; x += 180) {
    ctx.save();
    ctx.translate(x, 0);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(0, -height, 18, height * 3);
    ctx.restore();
  }

  ctx.restore();

  ctx.strokeStyle = '#e7b642';
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 18, width - 36, height - 36);
}

async function fetchImage(url) {
  if (!url) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return await loadImage(Buffer.from(arrayBuffer));
  } catch {
    return null;
  }
}

async function drawCircularAvatar(ctx, url, x, y, size, borderWidth = 4) {
  const image = await fetchImage(url);

  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();

  ctx.fillStyle = '#3b1114';
  ctx.fill();

  if (image) {
    ctx.clip();
    ctx.drawImage(image, x, y, size, size);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#f1c453';
    ctx.lineWidth = borderWidth;
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.strokeStyle = '#f1c453';
  ctx.lineWidth = borderWidth;
  ctx.stroke();
  ctx.restore();
}

function fitText(ctx, text, maxWidth, startSize, minSize = 18, weight = 700) {
  let size = startSize;
  const value = String(text || 'Unknown');

  while (size > minSize) {
    ctx.font = `${weight} ${size}px "${fontFamily}"`;
    if (ctx.measureText(value).width <= maxWidth) break;
    size -= 1;
  }

  return size;
}

function formatNumber(value) {
  const rounded = Math.round((Number(value) || 0) * 10) / 10;
  return Number.isInteger(rounded)
    ? rounded.toLocaleString('vi-VN')
    : rounded.toLocaleString('vi-VN', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
}

function formatVoiceTime(minutes) {
  const total = Math.max(0, Math.floor(Number(minutes) || 0));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;

  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

module.exports = {
  createCanvas,
  fontFamily: () => fontFamily,
  roundedRect,
  drawBackground,
  drawCircularAvatar,
  fitText,
  formatNumber,
  formatVoiceTime,
};
