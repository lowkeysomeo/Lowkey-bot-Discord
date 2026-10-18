/**
 * Script debug — test heartbeat VỚI Gateway connection (giống luồng thật của bot)
 * Chạy: node C:\Users\Administrator\Documents\GitHub\Lowkey-bot-Discord\tests\debug_quest.cjs TOKEN_CUA_BAN
 */
'use strict';

const token = process.argv[2] || process.env.DISCORD_TOKEN;
if (!token || token.length < 30) {
  console.log('ℹ️ debug_quest.cjs chỉ dùng kiểm tra thủ công với Discord Token. Bỏ qua trong kiểm thử tự động.');
  process.exit(0);
}

if (!globalThis.fetch) {
  try {
    const nodeFetch = require('node-fetch');
    global.fetch = nodeFetch;
  } catch (e) {
    console.error('❌ Cần Node 18+ hoặc npm install node-fetch');
    process.exit(1);
  }
}

const {
  fetchUserInfo,
  fetchQuests,
  sendHeartbeat,
  sendVideoProgress,
  getUserIdFromToken,
  DiscordUserGateway,
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
    if (q.user_status?.progress && Object.keys(q.user_status.progress).length > 0) {
      console.log(`   Progress: ${JSON.stringify(q.user_status.progress)}`);
    }
  }

  // Chọn quest đầu tiên chưa hoàn thành để test
  const pending = quests.find(q => !q.user_status?.completed_at && !q.user_status?.claimed_at);
  if (!pending) {
    console.log('\n✅ Tất cả quest đã hoàn thành hoặc đã nhận thưởng!');
    return;
  }

  const pendingName = pending.config?.messages?.quest_name || pending.config?.messages?.game_title || `Quest #${pending.id}`;
  const pendingTasks = { ...(pending.config?.task_config?.tasks || {}), ...(pending.config?.task_config_v2?.tasks || {}) };
  const isVideoQuest = Object.keys(pendingTasks).some(k => k.includes('WATCH_VIDEO'));

  // Lấy appId
  let appId = null;
  let appName = pendingName;
  for (const t of Object.values(pendingTasks)) {
    if (Array.isArray(t?.applications) && t.applications[0]?.id) {
      appId = String(t.applications[0].id);
      if (t.applications[0].name) appName = t.applications[0].name;
      break;
    }
  }
  if (!appId) {
    appId = pending.config?.application?.id ? String(pending.config.application.id) : null;
    appName = pending.config?.application?.name || appName;
  }

  console.log(`\n🧪 Test quest: ${pendingName} (${pending.id})`);
  console.log(`   Type: ${isVideoQuest ? 'VIDEO' : 'GAME'} | AppId: ${appId} | UserId: ${userId}`);

  if (isVideoQuest) {
    console.log('\n📹 Thử gửi video-progress (timestamp=5)...');
    try {
      const res = await sendVideoProgress(token, pending.id, 5);
      console.log('✅ video-progress THÀNH CÔNG:', JSON.stringify(res, null, 2));
    } catch (e) {
      console.error('❌ video-progress lỗi:', e.message);
    }
    return;
  }

  // --- GAME QUEST: Test VỚI Gateway ---
  console.log('\n🌐 Bước 1: Kết nối Gateway và đăng ký Rich Presence...');
  const activity = {
    name: appName,
    type: 0,
    application_id: appId,
    timestamps: { start: Date.now() },
  };

  let gateway = null;
  try {
    gateway = new DiscordUserGateway(token, { device: 'desktop' });
    await gateway.connect(activity);
    console.log('✅ Gateway connected! Đợi 8 giây để Discord sync...');
    await new Promise(r => setTimeout(r, 8000));
    console.log('✅ Sync xong. Bắt đầu test heartbeat...');
  } catch (e) {
    console.warn(`⚠️ Gateway error: ${e.message} — tiếp tục test heartbeat không có gateway`);
  }

  // Lấy stream_key từ DM channel thật
  let streamKey = null;
  try {
    const dmRes = await fetch('https://discord.com/api/v9/users/@me/channels', {
      headers: { Authorization: token }
    });
    if (dmRes.ok) {
      const dms = await dmRes.json();
      if (Array.isArray(dms) && dms.length > 0) {
        streamKey = `call:${dms[0].id}:${userId}`;
        console.log(`✅ Lấy được stream_key DM: ${streamKey}`);
      }
    }
  } catch (e) {
    console.warn('⚠️ Không lấy được DM channel:', e.message);
  }

  console.log('\n💓 Bước 2: Gửi heartbeat (test 1 lần với gateway active)...');
  try {
    const hbRes = await sendHeartbeat(token, pending.id, {
      streamKey,
      applicationId: appId,
      terminal: false,
      userId,
    });
    console.log('✅ Heartbeat THÀNH CÔNG! Response:');
    console.log(JSON.stringify(hbRes, null, 2));
  } catch (e) {
    console.error('❌ Heartbeat lỗi:', e.message);

    if (e.message.includes('404')) {
      console.log('\n⚠️ Phân tích: 404 = Discord không tìm thấy quest session');
      console.log('   → Discord yêu cầu game client thật, không thể làm qua API');
      console.log('   → Giải pháp: Dùng script F12 trong Discord web/desktop');
    } else if (e.message.includes('401')) {
      console.log('\n⚠️ Phân tích: 401 = Token hết hạn');
    } else if (e.message.includes('400')) {
      console.log('\n⚠️ Phân tích: 400 = Request không hợp lệ (stream_key hoặc format sai)');
    }
  }

  if (gateway) {
    gateway.disconnect();
    console.log('\n🔌 Gateway đã ngắt kết nối');
  }

  console.log('\n✅ Debug hoàn tất!');
}

main().catch(e => {
  console.error('Lỗi không xác định:', e);
  process.exit(1);
});
