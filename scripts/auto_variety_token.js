'use strict';

/**
 * Lowkey Discord Auto Game Variety Badge CLI (Token Background Runner)
 * Chạy cày ngầm 100% bằng User Token - Tắt máy tính vẫn cày được trên VPS/Server
 *
 * Cách chạy:
 *   node scripts/auto_variety_token.js
 *   node scripts/auto_variety_token.js --token "YOUR_USER_TOKEN"
 *   npm run variety:token
 */

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const {
  validateToken,
  startVarietyFarming,
  stopVarietyFarming,
  loadProgress,
  getTierTitle
} = require('../utils/varietyTokenWorker');

const TOKEN_CACHE_PATH = path.join(__dirname, '..', 'data', 'saved_quest_token.txt');

// Màu sắc ANSI
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

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
    if (args[i].startsWith('--token=')) {
      return args[i].replace('--token=', '').trim();
    }
    if (args[i] === '--token' && args[i + 1]) {
      return args[i + 1].trim();
    }
  }
  return null;
}

async function promptToken(saved) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    if (saved) {
      console.log(`\n🔑 Đã tìm thấy Token đã lưu trước đó: [ ${maskToken(saved)} ]`);
      rl.question('👉 Nhấn [Enter] để dùng Token này, hoặc dán Token mới: ', (answer) => {
        rl.close();
        const input = answer.trim();
        if (!input) {
          resolve(saved);
        } else {
          saveToken(input);
          resolve(input);
        }
      });
    } else {
      console.log('\n📌 Mẹo lấy token: Mở Discord Web/Desktop -> F12 -> Network -> filter: api -> copy Authorization header');
      rl.question('🔑 Hãy dán Discord User Token của bạn vào đây: ', (answer) => {
        rl.close();
        const input = answer.trim();
        if (input) saveToken(input);
        resolve(input);
      });
    }
  });
}

(async () => {
  console.clear();
  console.log(`${C.cyan}${C.bold}========================================================================${C.reset}`);
  console.log(`${C.cyan}${C.bold}🎮 LOWKEY DISCORD AUTO GAME VARIETY - TOKEN BACKGROUND RUNNER${C.reset}`);
  console.log(`${C.cyan}${C.bold}🏆 CÀY NGẦM HUY HIỆU "TRÒ CHƠI ĐA DẠNG" BẰNG USER TOKEN 24/7${C.reset}`);
  console.log(`${C.cyan}${C.bold}========================================================================${C.reset}`);

  const cliToken = parseCliToken();
  const envToken = process.env.DISCORD_USER_TOKEN || process.env.USER_TOKEN;
  const savedToken = loadSavedToken();

  let token = cliToken || envToken;

  if (!token) {
    token = await promptToken(savedToken);
  }

  if (!token) {
    console.error(`${C.red}❌ Lỗi: Bạn chưa cung cấp User Token Discord.${C.reset}`);
    process.exit(1);
  }

  console.log(`\n${C.yellow}[1/3] 🔍 Đang xác thực User Token với Discord...${C.reset}`);
  const user = await validateToken(token);

  if (!user) {
    console.error(`${C.red}❌ Lỗi: Token không hợp lệ hoặc đã bị hết hạn! Vui lòng kiểm tra lại.${C.reset}`);
    process.exit(1);
  }

  console.log(`${C.green}✅ [1/3] Xác thực thành công! Người dùng: ${C.bold}${user.username}#${user.discriminator || '0'} (ID: ${user.id})${C.reset}`);

  const existingProgress = loadProgress(user.id);
  const startCount = (existingProgress.completed || []).length;

  console.log(`\n${C.yellow}[2/3] 📊 Tiến trình hiện tại: ${startCount}/100 games | Huy hiệu: ${getTierTitle(startCount)}${C.reset}`);
  console.log(`${C.yellow}[3/3] 🚀 Đang kết nối Discord Gateway dưới danh nghĩa Desktop Client...${C.reset}`);

  // Bắt Ctrl + C để ngắt an toàn
  process.on('SIGINT', () => {
    console.log(`\n\n${C.yellow}🛑 Đang dừng phiên cày ngầm và lưu tiến trình...${C.reset}`);
    stopVarietyFarming(user.id);
    setTimeout(() => {
      console.log(`${C.green}✅ Đã dừng an toàn. Tiến trình của bạn đã được lưu! Lần sau mở lại sẽ chạy tiếp.${C.reset}`);
      process.exit(0);
    }, 600);
  });

  const res = await startVarietyFarming({
    token,
    userId: user.id,
    durationPerGameMs: 20000, // 20 giây mỗi game
    targetCount: 100,
    onProgress: ({ game, count, target, tierTitle, durationMs }) => {
      const pct = Math.min(100, Math.round((count / target) * 100));
      console.log(
        `${C.green}${C.bold}[${count}/${target}] (${pct}%) 🎮 Đang giả lập chơi: ${C.white}${game.name} ${C.gray}(App ID: ${game.appId})${C.reset} | Cấp: ${C.cyan}${tierTitle}${C.reset}`
      );
    },
    onMilestone: ({ count, tier }) => {
      console.log(
        `\n${C.yellow}${C.bold}🎉 CHÚC MỪNG! BẠN ĐÃ ĐẠT MỐC ${count} GAMES - HUY HIỆU: [ ${tier.title.toUpperCase()} ]${C.reset}\n`
      );
    },
    onComplete: ({ totalGames, tierTitle }) => {
      console.log(`\n${C.green}${C.bold}========================================================================${C.reset}`);
      console.log(`${C.green}${C.bold}🏆 HOÀN TẤT 100% CẢ 100 TỰA GAME DETECTABLE!${C.reset}`);
      console.log(`${C.green}${C.bold}Huy hiệu "Trò chơi đa dạng" đã đạt cấp tối đa: ${tierTitle}!${C.reset}`);
      console.log(`${C.green}${C.bold}========================================================================${C.reset}\n`);
      process.exit(0);
    }
  });

  if (!res.success) {
    console.error(`\n${C.red}❌ ${res.message}${C.reset}`);
    process.exit(1);
  }

  console.log(`\n${C.cyan}------------------------------------------------------------------------${C.reset}`);
  console.log(`${C.green}${C.bold}⚡ TIẾN TRÌNH CÀY NGẦM ĐANG HOẠT ĐỘNG!${C.reset}`);
  console.log(`${C.cyan}💡 Chế độ Token chạy qua Gateway WebSocket không phụ thuộc vào Discord Desktop.${C.reset}`);
  console.log(`${C.cyan}👉 Bạn có thể để chạy nền trên máy hoặc treo trên VPS/Server, tắt máy vẫn cày tiếp!${C.reset}`);
  console.log(`${C.gray}👉 Nhấn Ctrl + C tại đây để dừng lại bất kỳ lúc nào.${C.reset}`);
  console.log(`${C.cyan}------------------------------------------------------------------------\n${C.reset}`);
})();
