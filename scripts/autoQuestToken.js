'use strict';

/**
 * Lowkey Discord Auto Quest CLI Runner
 * Chạy tự động 100% bằng User Token mà không cần mở Discord hoặc thao tác tay
 *
 * Cách dùng:
 *   node scripts/autoQuestToken.js
 *   node scripts/autoQuestToken.js --token "YOUR_USER_TOKEN"
 *   Hoặc bật trực tiếp từ file shortcut trên Desktop!
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

async function promptToken(saved) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    if (saved) {
      console.log(`\n🔑 Đã tìm thấy Token đã lưu: [ ${maskToken(saved)} ]`);
      rl.question('👉 Nhấn [Enter] để CHẠY NGAY, hoặc dán Token mới: ', (answer) => {
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

async function waitExitPrompt() {
  if (!process.stdin.isTTY) return;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question('\n👉 Nhấn phím [Enter] để đóng cửa sổ...', () => {
      rl.close();
      resolve();
    });
  });
}

(async () => {
  console.log('====================================================');
  console.log('🔮 LOWKEY DISCORD AUTO QUEST & ORB - 100% AUTOMATED');
  console.log('====================================================');

  const cliToken = parseCliToken();
  const envToken =
    process.env.DISCORD_USER_TOKEN ||
    process.env.QUEST_USER_TOKENS ||
    process.env.USER_TOKEN;
  const savedToken = loadSavedToken();

  let token = cliToken || envToken;

  if (!token) {
    token = await promptToken(savedToken);
  }

  if (!token) {
    console.error('❌ Lỗi: Bạn chưa cung cấp User Token Discord.');
    await waitExitPrompt();
    process.exit(1);
  }

  console.log('\n[1/3] 🔄 Đang khởi tạo và kết nối tới Discord API...');

  try {
    const report = await runAutoQuestForToken(token, {
      heartbeatDelayMs: 1200,
      onProgress: (p) => {
        if (p.step === 'auth') {
          console.log(`[AUTH] ${p.message}`);
        } else if (p.step === 'fetch') {
          console.log(`[INFO] ${p.message}`);
        } else if (p.step === 'quest_start') {
          console.log(`\n----------------------------------------------------`);
          console.log(`[QUEST] ${p.message}`);
        } else if (p.step === 'progress') {
          console.log(`  ↪ [Tiến độ] ${p.currentSeconds}/${p.targetSeconds}s (${p.percent}%)`);
        }
      },
    });

    console.log('\n====================================================');
    console.log('🎉 TỔNG KẾT AUTO QUEST DISCORD');
    console.log('====================================================');
    console.log(`👤 Tài khoản: ${report.accountTag} (ID: ${report.user.id})`);
    console.log(`📋 Tổng số Quest khả dụng: ${report.totalQuests}`);
    console.log(`🎯 Đã tự động nhận (Accept): ${report.enrolledCount || 0}/${report.totalQuests} nhiệm vụ`);
    console.log(`✅ Hoàn thành 100%: ${report.completedCount}/${report.totalQuests} nhiệm vụ`);
    console.log(`🎁 Đã nhận thưởng: ${report.claimedCount} phần quà/ORB`);

    if (report.results && report.results.length > 0) {
      console.log('\nChi tiết từng nhiệm vụ:');
      report.results.forEach((r, idx) => {
        if (r.success) {
          if (r.alreadyDone) {
            console.log(`  [${idx + 1}] ${r.questName}: ✅ Đã làm và nhận thưởng trước đó`);
          } else if (r.completed) {
            console.log(`  [${idx + 1}] ${r.questName}: ✅ Hoàn thành 100% (Vào Discord bấm Claim)`);
          } else if (r.enrolled) {
            console.log(`  [${idx + 1}] ${r.questName}: 🎯 Đã tự động nhận (Accept) trên tài khoản`);
          }
        } else {
          console.log(`  [${idx + 1}] ${r.questName}: ❌ Thất bại (${r.error})`);
        }
      });
    }

    if (report.completedCount > 0) {
      console.log('\n----------------------------------------------------');
      console.log('🎁 HƯỚNG DẪN NHẬN QUÀ:');
      console.log('Nhiệm vụ đã được bot hoàn thành 100%!');
      console.log('Vui lòng vào Cài đặt -> Quests trên Discord để tự bấm Claim nhận quà.');
    }

    console.log('\n✨ Đã xử lý xong! Kiểm tra mục Cài đặt -> Nhiệm vụ (Quests) trên Discord để xem chi tiết.');
  } catch (err) {
    console.error(`\n❌ LỖI AUTO QUEST: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await waitExitPrompt();
  }
})();
