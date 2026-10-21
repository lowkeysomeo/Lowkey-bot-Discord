'use strict';

/**
 * Lowkey Discord Auto Quest 24/7 CLI Runner (Video & Game — Auto Enroll & Complete, No-Claim)
 * Chạy ngầm 24/7 bằng User Token: liên tục kiểm tra nhiệm vụ mới mỗi 2 phút,
 * tự động nhận (Accept/Enroll) cả nhiệm vụ Video và Game và hoàn thành 100% (không tự bấm Claim).
 *
 * Cách dùng:
 *   node scripts/autoQuestToken.js                   (Chạy chế độ canh 24/7 liên tục)
 *   node scripts/autoQuestToken.js --once            (Chạy 1 lượt duy nhất rồi thoát)
 *   node scripts/autoQuestToken.js --interval 120    (Tùy chỉnh chu kỳ quét tính bằng giây, mặc định 120s)
 *   node scripts/autoQuestToken.js --token "TOKEN"
 */

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { runAutoQuestForToken } = require('../utils/questTokenWorker');

const TOKEN_CACHE_PATH = path.join(__dirname, '..', 'data', 'saved_quest_token.txt');

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
    const dataDir = path.dirname(TOKEN_CACHE_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(TOKEN_CACHE_PATH, token.trim(), 'utf8');
  } catch {}
}

function maskToken(t) {
  if (!t || t.length < 16) return '********';
  return t.slice(0, 8) + '...' + t.slice(-4);
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    token: null,
    once: false,
    intervalSeconds: Number(process.env.QUEST_POLL_SECONDS || 120),
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--once') {
      parsed.once = true;
    } else if (arg.startsWith('--token=')) {
      parsed.token = arg.replace('--token=', '').trim();
    } else if (arg === '--token' && args[i + 1]) {
      parsed.token = args[++i].trim();
    } else if (arg.startsWith('--interval=')) {
      parsed.intervalSeconds = Math.max(30, Number(arg.replace('--interval=', '')) || 120);
    } else if (arg === '--interval' && args[i + 1]) {
      parsed.intervalSeconds = Math.max(30, Number(args[++i]) || 120);
    }
  }
  return parsed;
}

async function promptToken(saved) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    if (saved) {
      console.log(`\n🔑 Đã tìm thấy Token đã lưu: [ ${maskToken(saved)} ]`);
      rl.question('👉 Nhấn [Enter] để CHẠY AUTO 24/7 NGAY, hoặc dán Token mới: ', (answer) => {
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
      console.log('\n📌 Mẹo: Mở Discord Web/Desktop -> F12 -> Network -> filter: api -> copy dòng Authorization');
      rl.question('🔑 Hãy dán Discord User Token của bạn vào đây: ', (answer) => {
        rl.close();
        const input = answer.trim();
        if (input) saveToken(input);
        resolve(input);
      });
    }
  });
}

async function runSingleCycle(token, cycleNumber) {
  const timestamp = new Date().toLocaleString('vi-VN');
  console.log(`\n==================== [CHU KỲ QUÉT #${cycleNumber} — ${timestamp}] ====================`);

  const report = await runAutoQuestForToken(token, {
    autoClaim: false, // Chỉ hoàn thành 100%, không tự động Claim
    maxPasses: 3,
    heartbeatDelayMs: 20000,
    videoStepDelayMs: 1000,
    videoStepSeconds: 12,
    onProgress: (p) => {
      if (p.step === 'auth' && cycleNumber === 1) {
        console.log(`[AUTH] ${p.message}`);
      } else if (p.step === 'quest_start') {
        const typeBadge = p.type === 'video' ? '🎬 [Video]' : '🎮 [Game]';
        console.log(`\n[QUEST] ${typeBadge} ${p.message}`);
      } else if (p.step === 'progress') {
        const typeIcon = p.type === 'video' ? '🎬' : '🎮';
        console.log(`  🔄 ${typeIcon} [Tiến độ] ${p.currentSeconds}/${p.targetSeconds}s (${p.percent}%)`);
      }
    },
  });

  console.log(`\n📊 KẾT QUẢ CHU KỲ #${cycleNumber} (${report.accountTag}):`);
  console.log(`  • Tổng Quest đang mở: ${report.totalQuests}`);
  console.log(`  • Đã tự động nhận (Enroll): ${report.enrolledCount}/${report.totalQuests}`);
  console.log(`  • Đã hoàn thành 100%: ${report.completedCount}/${report.totalQuests} (Chế độ: Không tự Claim)`);

  if (Array.isArray(report.results) && report.results.length > 0) {
    for (const [idx, r] of report.results.entries()) {
      const badge = r.type === 'video' ? '🎬 [Video]' : '🎮 [Game]';
      const statusText = r.alreadyDone
        ? '✅ Đã hoàn thành từ trước'
        : r.completed
        ? '✅ Hoàn thành 100% (Sẵn sàng vào Discord bấm Claim)'
        : `⏳ Đang xử lý (${r.progressPercent || 0}%)`;
      console.log(`    [${idx + 1}] ${badge} ${r.questName}: ${statusText}`);
    }
  }
}

(async () => {
  console.log('===============================================================');
  console.log('🔮 LOWKEY DISCORD AUTO QUEST 24/7 (VIDEO & GAME — NO AUTO-CLAIM)');
  console.log('===============================================================');

  const cli = parseCliArgs();
  const envToken =
    process.env.DISCORD_USER_TOKEN ||
    process.env.QUEST_USER_TOKENS ||
    process.env.USER_TOKEN;
  const savedToken = loadSavedToken();

  let token = cli.token || envToken;
  if (!token) {
    if (!process.stdin.isTTY && savedToken) {
      token = savedToken;
    } else {
      token = await promptToken(savedToken);
    }
  } else {
    saveToken(token);
  }

  if (!token) {
    console.error('❌ Lỗi: Bạn chưa cung cấp User Token Discord.');
    process.exit(1);
  }

  let cycle = 0;
  do {
    cycle++;
    try {
      await runSingleCycle(token, cycle);
    } catch (err) {
      console.error(`❌ Lỗi ở chu kỳ #${cycle}: ${err.message}`);
    }

    if (cli.once) break;

    console.log(`\n⏳ Đang canh ngầm 24/7... Sẽ tự động quét lại nhiệm vụ mới sau ${cli.intervalSeconds} giây.`);
    await new Promise((r) => setTimeout(r, cli.intervalSeconds * 1000));
  } while (!cli.once);
})();