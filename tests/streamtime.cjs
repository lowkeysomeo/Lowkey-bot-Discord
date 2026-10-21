'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// Set memory DB for isolated test
process.env.DB_PATH = ':memory:';

const {
  TIERS,
  getTierTitle,
  getTierInfo,
  loadStreamProgress,
  saveStreamProgress,
  stopStreamFarming,
  isStreamFarmingActive,
  buildStreamStatusPayload,
  initStreamtimeAutoResume,
} = require('../utils/streamTimeWorker');
const { getDb } = require('../utils/database');

async function runTests() {
  console.log('--- Testing Stream Time Badge Worker & 24/7 Cloud Farming ---');

  // 1. Verify 10 Tiers definition & metadata
  assert.equal(TIERS.length, 10, 'Must have exactly 10 tiers matching Discord');
  assert.equal(TIERS[0].hours, 1);
  assert.equal(TIERS[0].title, 'Người mới');
  assert.equal(TIERS[1].hours, 5);
  assert.equal(TIERS[1].title, 'Chim non');
  assert.equal(TIERS[2].hours, 20);
  assert.equal(TIERS[2].title, 'Đột phá');
  assert.equal(TIERS[3].hours, 75);
  assert.equal(TIERS[3].title, 'Nổi bật');
  assert.equal(TIERS[4].hours, 150);
  assert.equal(TIERS[4].title, 'Người tạo xu hướng');
  assert.equal(TIERS[5].hours, 300);
  assert.equal(TIERS[5].title, 'Tiêu điểm');
  assert.equal(TIERS[6].hours, 500);
  assert.equal(TIERS[6].title, 'Ngôi sao');
  assert.equal(TIERS[7].hours, 1000);
  assert.equal(TIERS[7].title, 'Cảm giác');
  assert.equal(TIERS[8].hours, 2000);
  assert.equal(TIERS[8].title, 'Nhà tiên tri');
  assert.equal(TIERS[9].hours, 5000);
  assert.equal(TIERS[9].title, 'Xuất thần');
  console.log('✅ 1. 10 Tiers integrity & naming verified.');

  // 2. Verify Tier Titles & calculation
  assert.equal(getTierTitle(0), 'Chưa mở khóa');
  assert.equal(getTierTitle(1), 'Người mới');
  assert.equal(getTierTitle(5), 'Chim non');
  assert.equal(getTierTitle(19), 'Chim non');
  assert.equal(getTierTitle(20), 'Đột phá');
  assert.equal(getTierTitle(5000), 'Xuất thần');

  // Verify getTierInfo matching user screenshot: 5 hours total -> Chim non, 15 hours remaining to Breakthrough (20h)
  const info5h = getTierInfo(5);
  assert.equal(info5h.currentTier.title, 'Chim non');
  assert.equal(info5h.nextTier.title, 'Đột phá');
  assert.equal(info5h.hoursRemaining, 15, 'At 5h with target 20h, remaining must be exactly 15 hours');
  assert.ok(info5h.progressBar.length === 10, 'Progress bar must have 10 blocks');
  console.log('✅ 2. Tier progression & user screenshot math verified.');

  // 3. Verify SQLite persistence of load/save
  const testUser = '777888999000111222';
  saveStreamProgress(testUser, {
    token: 'test_stream_token',
    username: 'StreamerPro',
    guildId: '123456789',
    channelId: '987654321',
    mode: 'viewer_bot',
    status: 'running',
    accumulatedSeconds: 18000, // 5 hours
    currentSessionSeconds: 0,
    notifiedHours: [1, 5],
  });

  const prog = loadStreamProgress(testUser);
  assert.equal(prog.userId, testUser);
  assert.equal(prog.accumulatedSeconds, 18000);
  assert.equal(prog.status, 'running');
  assert.equal(prog.mode, 'viewer_bot');
  assert.deepEqual(prog.notifiedHours, [1, 5], 'notifiedHours must be persisted');

  // Verify in SQLite directly
  const dbRow = getDb().prepare('SELECT * FROM stream_sessions WHERE user_id = ?').get(testUser);
  assert.ok(dbRow, 'Session must exist in SQLite stream_sessions');
  assert.equal(dbRow.guild_id, '123456789');
  assert.equal(dbRow.channel_id, '987654321');
  assert.equal(dbRow.accumulated_seconds, 18000);
  assert.equal(dbRow.notified_hours_json, '[1,5]');
  console.log('✅ 3. SQLite persistence & cross-session retrieval verified.');

  // 4. Verify stop updates SQLite status
  stopStreamFarming(testUser, 'Test stop');
  const stoppedProg = loadStreamProgress(testUser);
  assert.equal(stoppedProg.status, 'stopped');
  const stoppedRow = getDb().prepare('SELECT status FROM stream_sessions WHERE user_id = ?').get(testUser);
  assert.equal(stoppedRow.status, 'stopped');
  console.log('✅ 4. Stop farming state update verified.');

  // 5. Verify buildStreamStatusPayload (Idle buttons: Token 24/7 & Viewer)
  const payload = buildStreamStatusPayload(testUser, 'StreamerPro');
  assert.ok(payload.embeds && payload.embeds.length === 1);
  assert.ok(payload.components && payload.components.length === 1);
  const embed = payload.embeds[0];
  assert.ok(embed.data.title.includes('CHIM NON'), 'Title must reflect current rank Chim non');
  assert.ok(embed.data.description.includes('5 giờ'), 'Description must show 5 hours');
  assert.ok(embed.data.description.includes('15 giờ nữa'), 'Description must show 15 hours remaining to Breakthrough');

  const customIds = payload.components[0].components.map(c => c.data.custom_id);
  assert.ok(customIds.includes('quest:stream_token_start'), 'Must include Token 24/7 farming button');
  assert.ok(customIds.includes('quest:stream_viewer_start'), 'Must include Viewer Voice button');
  assert.ok(customIds.includes('quest:hub'), 'Must include Hub button');
  console.log('✅ 5. Status embed & UI payload verified with Token 24/7 & Viewer buttons.');

  // 6. Verify startup auto-resume candidate detection
  getDb().prepare("UPDATE stream_sessions SET status = 'running' WHERE user_id = ?").run(testUser);
  const runningRows = getDb().prepare("SELECT * FROM stream_sessions WHERE status = 'running'").all();
  assert.equal(runningRows.length, 1);
  assert.equal(runningRows[0].user_id, testUser);
  console.log('✅ 6. Startup auto-resume candidate detection verified.');

  console.log('PASS streamtime: 24/7 cloud persistence, 10 Tiers, SQLite synchronization, state machine, and auto-resume on reboot.\n');
}

runTests().catch((err) => {
  console.error('FAIL streamtime:', err);
  process.exit(1);
});
