'use strict';

/**
 * Lowkey Discord Auto Quest CLI Runner
 * Chạy tự động 100% bằng User Token mà không cần mở Discord hoặc thao tác tay
 *
 * Cách dùng:
 *   node scripts/autoQuestToken.js
 *   node scripts/autoQuestToken.js --token "YOUR_USER_TOKEN"
 *   Hoặc đặt DISCORD_USER_TOKEN="YOUR_USER_TOKEN" trong file .env
 */

require('dotenv').config();
const readline = require('node:readline');
const { runAutoQuestForToken } = require('../utils/questTokenWorker');

async function promptToken() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('\n🔑 Nhập Discord User Token của bạn: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
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

(async () => {
  console.log('====================================================');
  console.log('🔮 LOWKEY DISCORD AUTO QUEST & ORB - 100% AUTOMATED');
  console.log('====================================================');

  let token =
    parseCliToken() ||
    process.env.DISCORD_USER_TOKEN ||
    process.env.QUEST_USER_TOKENS ||
    process.env.USER_TOKEN;

  if (!token) {
    token = await promptToken();
  }

  if (!token) {
    console.error('❌ Lỗi: Bạn chưa cung cấp User Token Discord.');
    process.exit(1);
  }

  console.log('\n[1/3] 🔄 Đang khởi tạo và kết nối tới Discord API...');

  try {
    const report = await runAutoQuestForToken(token, {
      heartbeatDelayMs: 1500,
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
    console.log(`📋 Tổng số Quest: ${report.totalQuests}`);
    console.log(`✅ Hoàn thành: ${report.completedCount}/${report.totalQuests}`);
    console.log(`🎁 Đã nhận thưởng: ${report.claimedCount} phần quà/ORB`);

    if (report.results && report.results.length > 0) {
      console.log('\nChi tiết từng nhiệm vụ:');
      report.results.forEach((r, idx) => {
        if (r.success) {
          const statusText = r.alreadyDone
            ? 'Đã làm trước đó'
            : 'Đã hoàn thành và nhận thưởng';
          console.log(`  [${idx + 1}] ${r.questName}: ✅ ${statusText}`);
        } else {
          console.log(`  [${idx + 1}] ${r.questName}: ❌ Thất bại (${r.error})`);
        }
      });
    }

    console.log('\n✨ Đã xong! Bạn có thể kiểm tra Điểm ORB và Kho quà tặng trong Discord.');
  } catch (err) {
    console.error(`\n❌ LỖI AUTO QUEST: ${err.message}`);
    process.exitCode = 1;
  }
})();
