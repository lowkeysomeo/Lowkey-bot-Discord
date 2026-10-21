'use strict';

/**
 * Lowkey Discord Auto Stream Time Badge CLI (Token Background Runner)
 * Cày tích lũy giờ stream 100% tự động bằng User Token
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
  console.log('====================================================');
  console.log('📺 LOWKEY DISCORD AUTO STREAM BADGE - 100% AUTOMATED');
  console.log('   Cày Huy hiệu "Stream cho người khác" (1h -> 5000h)');
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
    process.exit(1);
  }

  saveToken(token);

  console.log('\n[1/3] 🔄 Đang xác thực tài khoản...');
  const userProfile = await validateToken(token);
  if (!userProfile) {
    console.error('❌ Lỗi: Token Discord không hợp lệ hoặc đã hết hạn.');
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

  if (!channelId) {
    console.log('📌 Nhập thông tin kênh Voice để tài khoản vào stream:');
    guildId = await promptInput('👉 Nhập Server ID (Guild ID) [Enter để tự động tìm]: ');
    channelId = await promptInput('👉 Nhập Voice Channel ID [Enter để tự động tìm]: ');
  }

  console.log('\n[3/3] 🚀 Đang kết nối Gateway và phát tín hiệu Stream...');
  const res = await startTokenStreamFarming({
    token,
    userId: userProfile.id,
    guildId: guildId || undefined,
    channelId: channelId || undefined,
    onMilestone: ({ totalHours, tier }) => {
      console.log(`\n🎉🎉🎉 CHÚC MỪNG! Bạn đã đạt mốc ${totalHours} giờ stream — Lên cấp: ${tier.title.toUpperCase()}! 🎉🎉🎉\n`);
    },
    onTick: ({ sessionSeconds, totalSeconds }) => {
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      process.stdout.write(`\r📺 [Streaming 24/7] Phiên hiện tại: ${Math.floor(sessionSeconds / 60)}m ${sessionSeconds % 60}s | Tổng: ${h}h ${m}m ${s}s | Cấp: ${getTierTitle(h)}   `);
    },
  });

  if (!res.success) {
    console.error(`❌ Không thể bắt đầu: ${res.message}`);
    process.exit(1);
  }

  console.log(`✅ ${res.message}`);
  console.log('💡 Tiến trình đang chạy nền. Nhấn Ctrl+C để dừng và lưu thời gian.\n');

  process.on('SIGINT', () => {
    console.log('\n\n🛑 Đang dừng cày stream và lưu kết quả...');
    stopStreamFarming(userProfile.id);
    console.log('✅ Đã lưu toàn bộ số giờ stream thành công. Hẹn gặp lại!');
    process.exit(0);
  });
})();
