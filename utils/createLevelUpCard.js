const {
  createCanvas,
  loadImage,
  GlobalFonts,
} = require("@napi-rs/canvas");
const path = require("path");
const fs = require("fs");

function registerFonts() {
  const possiblePaths = [
    path.join(__dirname, "..", "assets", "fonts", "DejaVuSans.ttf"),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
  ];

  for (const fontPath of possiblePaths) {
    try {
      if (fs.existsSync(fontPath)) {
        GlobalFonts.registerFromPath(fontPath, "VNLFont");
        return "VNLFont";
      }
    } catch (err) {}
  }

  return "sans-serif";
}

const FONT_FAMILY = registerFonts();

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCircleImage(ctx, image, x, y, size) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, x, y, size, size);
  ctx.restore();
}

function drawStar(ctx, x, y, radius, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const outerAngle = (Math.PI / 180) * (i * 72 - 90);
    const innerAngle = (Math.PI / 180) * (i * 72 + 36 - 90);

    const outerX = x + Math.cos(outerAngle) * radius;
    const outerY = y + Math.sin(outerAngle) * radius;
    const innerX = x + Math.cos(innerAngle) * (radius * 0.45);
    const innerY = y + Math.sin(innerAngle) * (radius * 0.45);

    if (i === 0) ctx.moveTo(outerX, outerY);
    else ctx.lineTo(outerX, outerY);

    ctx.lineTo(innerX, innerY);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function fitText(ctx, text, maxWidth, startSize, minSize = 18) {
  let fontSize = startSize;
  while (fontSize >= minSize) {
    ctx.font = `700 ${fontSize}px "${FONT_FAMILY}"`;
    if (ctx.measureText(text).width <= maxWidth) return fontSize;
    fontSize--;
  }
  return minSize;
}

function formatNumber(num) {
  return Number(num || 0).toLocaleString("en-US", {
    maximumFractionDigits: 1,
  });
}

async function createLevelUpCard({
  avatarUrl,
  username,
  level,
  totalXp,
  type = "chat", // Loại hoạt động: "chat" hoặc "voice"
  minutes = 0,
  title: customTitle,
  accentColor = '#ffd54d',
  serverName = 'VietNam Legacy',
}) {
  const width = 1100;
  const height = 360;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Nền ảnh
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#2b0010");
  bg.addColorStop(0.5, "#410014");
  bg.addColorStop(1, "#190009");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Các vòng tròn trang trí
  ctx.strokeStyle = "rgba(255, 215, 100, 0.12)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(930, 180, 70 + i * 18, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Dải màu bên trái
  const accent = ctx.createLinearGradient(0, 0, 0, height);
  accent.addColorStop(0, "#ff2b45");
  accent.addColorStop(1, "#ff9f1a");
  ctx.fillStyle = accent;
  roundRect(ctx, 20, 20, 12, height - 40, 10);
  ctx.fill();

  // Khung nội dung chính
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  roundRect(ctx, 45, 20, width - 65, height - 40, 24);
  ctx.fill();

  // Các ngôi sao trang trí
  drawStar(ctx, 930, 85, 18, "#ffd54d", 0.25);
  drawStar(ctx, 985, 120, 12, "#ffd54d", 0.22);
  drawStar(ctx, 875, 145, 10, "#ffd54d", 0.18);
  drawStar(ctx, 960, 250, 16, "#ffd54d", 0.14);

  // Ảnh đại diện
  const avatar = await loadImage(avatarUrl);
  drawCircleImage(ctx, avatar, 80, 90, 140);

  // Viền ảnh đại diện
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(150, 160, 76, 0, Math.PI * 2);
  ctx.stroke();

  // Tên server
  ctx.fillStyle = accentColor;
  ctx.font = `700 28px "${FONT_FAMILY}"`;
  ctx.fillText(serverName, 250, 75, 700);

  // Tiêu đề
  const title = customTitle || (type === "voice" ? "VOICE LEVEL UP!" : "CHAT LEVEL UP!");
  const icon = type === "voice" ? "🎙️" : "🎉";
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 42px "${FONT_FAMILY}"`;
  ctx.fillText(`${icon} ${title}`, 250, 125, 510);

  // Tên thành viên
  const safeName = username || "Unknown User";
  const nameSize = fitText(ctx, safeName, 420, 34, 22);
  ctx.font = `700 ${nameSize}px "${FONT_FAMILY}"`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(safeName, 250, 180);

  ctx.font = `500 24px "${FONT_FAMILY}"`;
  ctx.fillStyle = "#ffd7dc";
  ctx.fillText("đã đạt mốc mới trong hệ thống hoạt động của server!", 250, 214);

  // Huy hiệu cấp độ
  const badgeX = 775;
  const badgeY = 78;
  roundRect(ctx, badgeX, badgeY, 240, 92, 22);
  ctx.fillStyle = "rgba(255, 213, 77, 0.12)";
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 213, 77, 0.55)";
  ctx.lineWidth = 2;
  roundRect(ctx, badgeX, badgeY, 240, 92, 22);
  ctx.stroke();

  ctx.font = `700 22px "${FONT_FAMILY}"`;
  ctx.fillStyle = "#ffd54d";
  ctx.fillText("LEVEL HIỆN TẠI", badgeX + 26, badgeY + 32);

  ctx.font = `800 40px "${FONT_FAMILY}"`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`LEVEL ${level}`, badgeX + 26, badgeY + 72);

  // Ô thông tin
  roundRect(ctx, 250, 240, 765, 82, 20);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fill();

  ctx.font = `700 22px "${FONT_FAMILY}"`;
  ctx.fillStyle = "#ffd54d";
  ctx.fillText(type === "voice" ? "TỔNG VOICE XP" : "TỔNG XP", 280, 273);

  ctx.font = `800 28px "${FONT_FAMILY}"`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`${formatNumber(totalXp)} XP`, 280, 305);

  if (type === "voice") {
    ctx.font = `700 22px "${FONT_FAMILY}"`;
    ctx.fillStyle = "#ffd54d";
    ctx.fillText("THỜI GIAN VOICE", 600, 273);

    ctx.font = `800 28px "${FONT_FAMILY}"`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${formatNumber(minutes)} phút`, 600, 305);
  } else {
    ctx.font = `700 22px "${FONT_FAMILY}"`;
    ctx.fillStyle = "#ffd54d";
    ctx.fillText("THÔNG ĐIỆP", 600, 273);

    ctx.font = `700 24px "${FONT_FAMILY}"`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Tiếp tục hoạt động để chinh phục các mốc cao hơn!", 600, 305);
  }

  return canvas.toBuffer("image/png");
}

module.exports = { createLevelUpCard };
