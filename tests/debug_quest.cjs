/**
 * Script debug nhanh — test heartbeat + video-progress với token thật
 * Chạy: node tests/debug_quest.cjs YOUR_TOKEN_HERE
 * 
 * Không claim, chỉ test xem Discord trả gì khi nhận heartbeat
 */
'use strict';

const token = process.argv[2] || process.env.DISCORD_TOKEN;
if (!token || token.length < 30) {
  console.error('❌ Cần truyền Discord Token: node tests/debug_quest.cjs TOKEN_CUA_BAN');
  process.exit(1);
}

// Patch fetch nếu cần (Node 18+ có sẵn globalThis.fetch)
if (!globalThis.fetch) {
  try {
    const nodeFetch = require('node-fetch');
    global.fetch = nodeFetch;
    global.Headers = nodeFetch.Headers;
  } catch (e) {
    console.error('❌ Không có fetch. Cần Node 18+ hoặc npm install node-fetch');
    process.exit(1);
  }
}

const {
  fetchUserInfo,
  fetchQuests,
  sendHeartbeat,
  sendVideoProgress,
  getUserIdFromToken,
} = require('../utils/questTokenWorker');

async function main() {
  console.log('🔍 Đang kết nối tài khoản...');
  let user;
  try {
    user = await fetchUserInfo(token);
    console.log(`✅ Tài khoản: ${user.global_name || user.username} (@${user.username}) | ID: ${user.id}`);
  } catch (e) {
    console.error(`❌ Token không hợp lệ: ${e.message}`);
    process.exit(1);
  }

  const userId = user.id || getUserIdFromToken(token);

  console.log('\n🔍 Đang tải danh sách Quest...');
  let quests;
  try {
    quests = await fetchQuests(token);
    console.log(`✅ Tìm thấy ${quests.length} quest`);
  } catch (e) {
    console.error(`❌ Không lấy được quests: ${e.message}`);
    process.exit(1);
  }

  if (quests.length === 0) {
    console.log('⚠️ Không có quest nào khả dụng.');
    return;
  }

  // In thông tin từng quest
  for (const q of quests) {
    const name = q.config?.messages?.quest_name || q.config?.messages?.game_title || `Quest #${q.id}`;
    const tasks = { ...(q.config?.task_config?.tasks || {}), ...(q.config?.task_config_v2?.tasks || {}) };
    const taskKeys = Object.keys(tasks);
    const isVideo = taskKeys.some(k => k.includes('WATCH_VIDEO'));
    const enrolled = q.user_status?.enrolled_at ? '✅ Enrolled' : '❌ Not enrolled';
    const completed = q.user_status?.completed_at ? '✅ Completed' : '⏳ Pending';
    console.log(`\n📋 ${name} (${q.id})`);
    console.log(`   Tasks: ${taskKeys.join(', ') || 'N/A'} | Type: ${isVideo ? 'VIDEO' : 'GAME'}`);
    console.log(`   ${enrolled} | ${completed}`);
    if (q.user_status?.progress) {
      console.log(`   Progress: ${JSON.stringify(q.user_status.progress)}`);
    }
  }

  // Chọn quest đầu tiên chưa hoàn thành để test heartbeat
  const pending = quests.find(q => !q.user_status?.completed_at && !q.user_status?.claimed_at);
  if (!pending) {
    console.log('\n✅ Tất cả quest đã hoàn thành hoặc đã nhận thưởng!');
    return;
  }

  const pendingName = pending.config?.messages?.quest_name || pending.config?.messages?.game_title || `Quest #${pending.id}`;
  const pendingTasks = { ...(pending.config?.task_config?.tasks || {}), ...(pending.config?.task_config_v2?.tasks || {}) };
  const isVideoQuest = Object.keys(pendingTasks).some(k => k.includes('WATCH_VIDEO'));

  console.log(`\n🧪 Test heartbeat cho: ${pendingName} (${pending.id})`);
  console.log(`   Type: ${isVideoQuest ? 'VIDEO' : 'GAME'}`);

  if (isVideoQuest) {
    console.log('\n📹 Thử gửi video-progress (timestamp=5)...');
    try {
      const res = await sendVideoProgress(token, pending.id, 5);
      console.log('✅ video-progress response:', JSON.stringify(res, null, 2));
    } catch (e) {
      console.error('❌ video-progress error:', e.message);
    }
  } else {
    // Lấy appId
    let appId = null;
    for (const t of Object.values(pendingTasks)) {
      if (Array.isArray(t?.applications) && t.applications[0]?.id) {
        appId = String(t.applications[0].id);
        break;
      }
    }
    if (!appId) appId = pending.config?.application?.id ? String(pending.config.application.id) : null;

    console.log(`   AppId: ${appId || 'N/A'} | UserId: ${userId}`);
    console.log('\n💓 Thử gửi heartbeat (test 1 lần)...');
    try {
      const hbRes = await sendHeartbeat(token, pending.id, { applicationId: appId, terminal: false, userId });
      console.log('✅ heartbeat response:', JSON.stringify(hbRes, null, 2));
    } catch (e) {
      console.error('❌ heartbeat error:', e.message);
    }
  }

  console.log('\n✅ Debug hoàn tất!');
}

main().catch(e => {
  console.error('Lỗi không xác định:', e);
  process.exit(1);
});
