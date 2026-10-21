'use strict';

/**
 * Lowkey Discord Auto Stream Time Badge CLI (Token Background Runner)
 * Cày tích lũy giờ stream 100% tự động bằng User Token 24/7
 *
 * Cách chạy:
 *   node scripts/auto_stream_token.js
 *   node scripts/auto_stream_token.js --token "YOUR_USER_TOKEN"
 */

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const {
  TIERS,
  getTierTitle,
  getTierInfo,
  loadStreamProgress,
  saveStreamProgress,
  startTokenStreamFarming,
  stopStreamFarming,
} = require('../utils/streamTimeWorker');
const { validateToken } = require('../utils/varietyTokenWorker');

const TOKEN_CACHE_PATH = path.join(__dirname, '..', 'data', 'saved_quest_token.txt');
const CHANNEL_CACHE_PATH = path.join(__dirname, '..', 'data', 'saved_stream_channel.json');

// Đăng ký bảo vệ tiến trình, ngăn crash đột ngột khi gặp lỗi mạng/socket
process.on('uncaughtException', (err) => {
  console.warn('\n⚠️ [STREAM EXCEPTION] Bỏ qua lỗi bất thường để duy trì kết nối 24/7:', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.warn('\n⚠️ [STREAM REJECTION] Bỏ qua promise reject để duy trì kết nối 24/7:', reason?.message || reason);
});

function maskToken(t) {
  if (!t || t.length < 16) return '********';
  return t.slice(0, 8) + '...' + t.slice(-4);
}

function loadSavedToken() {
  try {
    if (fs.existsSync(TOKEN_CACHE_PATH)) {
      const data = fs.readFileSync(TOKEN_CACHE_PATH, 'utf8').trim();
      if (data && data.length > 20) return data;
    }
  } catch {}
  return null;
}

function saveToken(token) {
  try {
    const dir = path.dirname(TOKEN_CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TOKEN_CACHE_PATH, token.trim(), 'utf8');
  } catch {}
}

function loadSavedChannelConfig() {
  try {
    if (fs.existsSync(CHANNEL_CACHE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(CHANNEL_CACHE_PATH, 'utf8'));
      if (parsed && (parsed.channelId || parsed.guildId)) return parsed;
    }
  } catch {}
  return null;
}

function saveChannelConfig(guildId, channelId) {
  try {
    const dir = path.dirname(CHANNEL_CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CHANNEL_CACHE_PATH, JSON.stringify({ guildId, channelId }, null, 2), 'utf8');
  } catch {}
}

function parseCliToken() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--token=')) return args[i].replace('--token=', '').trim();
    if (args[i] === '--token' && args[i + 1]) return args[i + 1].trim();
  }
  return null;
}

async function promptInput(promptText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

(async () => {
  // Giữ tiến trình Node.js luôn sống trong Event Loop 24/7
  const keepAlive = setInterval(() => {}, 1000);

  console.log('====================================================');
  console.log('📺 LOWKEY DISCORD AUTO STREAM BADGE - 100% AUTOMATED');
  console.log('   Cày Huy hiệu "Stream cho người khác" (1h -> 5000h)');
  console.log('   Chạy ngầm 24/7 qua Token Gateway • Tự động Reconnect');
  console.log('====================================================\n');

  const cliToken = parseCliToken();
  const envToken = process.env.DISCORD_USER_TOKEN || process.env.QUEST_USER_TOKENS || process.env.USER_TOKEN;
  const savedToken = loadSavedToken();

  let token = cliToken || envToken;
  if (!token) {
    if (savedToken) {
      console.log(`🔑 Tìm thấy Token đã lưu: [ ${maskToken(savedToken)} ]`);
      const ans = await promptInput('👉 Nhấn [Enter] để dùng Token này, hoặc dán Token mới: ');
      token = ans || savedToken;
    } else {
      token = await promptInput('🔑 Dán Discord User Token của bạn vào đây: ');
    }
  }

  if (!token) {
    console.error('❌ Lỗi: Bạn chưa cung cấp User Token Discord.');
    clearInterval(keepAlive);
    process.exit(1);
  }

  saveToken(token);

  console.log('\n[1/3] 🔄 Đang xác thực tài khoản...');
  const userProfile = await validateToken(token);
  if (!userProfile) {
    console.error('❌ Lỗi: Token Discord không hợp lệ hoặc đã hết hạn.');
    clearInterval(keepAlive);
    process.exit(1);
  }

  console.log(`✅ Xác thực thành công: ${userProfile.username}#${userProfile.discriminator || '0'} (ID: ${userProfile.id})`);

  const prog = loadStreamProgress(userProfile.id);
  const totalSeconds = (prog.accumulatedSeconds || 0) + (prog.currentSessionSeconds || 0);
  const totalHours = Math.floor(totalSeconds / 3600);
  const info = getTierInfo(totalHours);

  console.log('\n[2/3] 📊 TIẾN TRÌNH HUY HIỆU STREAM HIỆN TẠI:');
  console.log(`  • Cấp hiện tại: ${info.currentTier.icon} [ ${info.currentTier.title.toUpperCase()} ]`);
  console.log(`  • Tổng thời gian đã stream: ${totalHours} giờ`);
  console.log(`  • Mục tiêu tiếp theo: ${info.nextTier ? `${info.nextTier.title} (${info.nextTier.hours}h) — Còn ${info.hoursRemaining} giờ nữa` : 'Đã đạt cấp tối đa!'}`);
  console.log(`  • Tiến trình: [${info.progressBar}] ${info.percent}%\n`);

  let guildId = process.env.DEFAULT_STREAM_GUILD_ID || null;
  let channelId = process.env.DEFAULT_STREAM_CHANNEL_ID || null;

  const savedChannel = loadSavedChannelConfig();
  if (!channelId && savedChannel && (savedChannel.channelId || savedChannel.guildId)) {
    console.log(`📌 Tìm thấy Kênh Voice đã lưu:`);
    console.log(`   • Server ID : [ ${savedChannel.guildId || 'Tự động'} ]`);
    console.log(`   • Channel ID: [ ${savedChannel.channelId || 'Tự động'} ]`);
    const ans = await promptInput('👉 Nhấn [Enter] để dùng ngay kênh này, hoặc gõ [new] để đổi kênh khác: ');
    if (!ans || ans.toLowerCase() !== 'new') {
      guildId = savedChannel.guildId;
      channelId = savedChannel.channelId;
    }
  }

  if (!channelId) {
    console.log('📌 Nhập thông tin kênh Voice để tài khoản vào stream:');
    guildId = await promptInput('👉 Nhập Server ID (Guild ID) [Enter để tự động tìm]: ');
    channelId = await promptInput('👉 Nhập Voice Channel ID: ');
    if (channelId) {
      saveChannelConfig(guildId || null, channelId);
    }
  }

  console.log('\n[3/3] 🚀 Đang kết nối Gateway và phát tín hiệu Stream 24/7...');
  const res = await startTokenStreamFarming({
    token,
    userId: userProfile.id,
    guildId: guildId || undefined,
    channelId: channelId || undefined,
    onMilestone: ({ totalHours, tier }) => {
      console.log(`\n🎉🎉🎉 CHÚC MỪNG! Bạn đã đạt mốc ${totalHours} giờ stream — Lên cấp: ${tier.title.toUpperCase()}! 🎉🎉🎉\n`);
    },
    onTick: ({ sessionSeconds, totalSeconds: currentTotal }) => {
      const h = Math.floor(currentTotal / 3600);
      const m = Math.floor((currentTotal % 3600) / 60);
      const s = currentTotal % 60;
      process.stdout.write(`\r📺 [Streaming 24/7] Phiên hiện tại: ${Math.floor(sessionSeconds / 60)}m ${sessionSeconds % 60}s | Tổng: ${h}h ${m}m ${s}s | Cấp: ${getTierTitle(h)}   `);
    },
  });

  if (!res.success) {
    console.error(`❌ Không thể bắt đầu: ${res.message}`);
    clearInterval(keepAlive);
    process.exit(1);
  }

  console.log(`✅ ${res.message}`);
  console.log('💡 Tiến trình đang chạy ngầm 24/7. Nhấn Ctrl+C để dừng và lưu thời gian.\n');

  process.on('SIGINT', () => {
    console.log('\n\n🛑 Đang dừng cày stream và lưu kết quả...');
    clearInterval(keepAlive);
    stopStreamFarming(userProfile.id, 'Người dùng nhấn Ctrl+C');
    const finalProg = loadStreamProgress(userProfile.id);
    const finalTotal = finalProg.accumulatedSeconds || 0;
    const finalH = Math.floor(finalTotal / 3600);
    const finalM = Math.floor((finalTotal % 3600) / 60);
    console.log(`✅ Đã lưu toàn bộ số giờ stream: ${finalH} giờ ${finalM} phút — Cấp: ${getTierTitle(finalH)}.`);
    console.log('👋 Hẹn gặp lại bạn!');
    process.exit(0);
  });
})();
