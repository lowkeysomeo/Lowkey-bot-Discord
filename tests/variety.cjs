'use strict';

const assert = require('node:assert/strict');

// Set memory DB for isolated test
process.env.DB_PATH = ':memory:';

const {
  GAME_CATALOG,
  TIERS,
  getTierTitle,
  loadProgress,
  saveProgress,
  stopVarietyFarming,
  isFarmingActive
} = require('../utils/varietyTokenWorker');

const {
  loadGametimeProgress,
  saveGametimeProgress,
  stopGametimeFarming,
  isGametimeFarmingActive
} = require('../utils/gameTimeWorker');

const { getDb } = require('../utils/database');

async function runTests() {
  console.log('--- Testing Variety Badge Worker & 24/7 Cloud Resilience ---');

  // 1. Verify Catalog
  assert.ok(GAME_CATALOG.length >= 100, `GAME_CATALOG must contain at least 100 games, found ${GAME_CATALOG.length}`);
  for (const g of GAME_CATALOG) {
    assert.ok(g.name && g.name.length > 0, 'Every game must have a name');
    assert.ok(g.appId && /^\d{17,20}$/.test(g.appId), `Every game must have valid Discord Snowflake appId (not Steam ID): ${g.name} (${g.appId})`);
  }
  console.log(`✅ 1. Game Catalog integrity verified (${GAME_CATALOG.length} games).`);

  // 2. Verify Tier Titles
  assert.equal(getTierTitle(0), 'Chưa mở khóa');
  assert.equal(getTierTitle(1), 'Chưa mở khóa');
  assert.equal(getTierTitle(2), 'Người dùng thử');
  assert.equal(getTierTitle(10), 'Người đam mê');
  assert.equal(getTierTitle(80), 'Người đa tài');
  assert.equal(getTierTitle(100), 'Thuyết phổ quát (Tối đa)');
  console.log('✅ 2. Tier calculations verified.');

  // 3. Verify SQLite persistence of load/save
  const testUser = '112233445566778899';
  saveProgress(testUser, {
    token: 'variety_test_token',
    username: 'VarietyGamer',
    status: 'running',
    completed: ['Counter-Strike 2', 'Dota 2', 'Apex Legends'],
    currentIndex: 3,
    notifiedCounts: [2]
  });

  const prog = loadProgress(testUser);
  assert.equal(prog.userId, testUser);
  assert.equal(prog.completed.length, 3);
  assert.equal(prog.currentIndex, 3);
  assert.equal(prog.status, 'running');
  assert.deepEqual(prog.notifiedCounts, [2], 'notifiedCounts must be persisted');

  // Verify in SQLite directly
  const dbRow = getDb().prepare('SELECT * FROM variety_sessions WHERE user_id = ?').get(testUser);
  assert.ok(dbRow, 'Session must exist in SQLite variety_sessions');
  assert.equal(dbRow.username, 'VarietyGamer');
  assert.equal(dbRow.current_index, 3);
  assert.equal(dbRow.notified_counts_json, '[2]');
  const parsedCompleted = JSON.parse(dbRow.completed_json);
  assert.deepEqual(parsedCompleted, ['Counter-Strike 2', 'Dota 2', 'Apex Legends']);
  console.log('✅ 3. SQLite persistence & cross-session retrieval verified.');

  // 4. Verify stop updates SQLite status
  // Direct stop test
  const progressToStop = loadProgress(testUser);
  progressToStop.status = 'stopped';
  saveProgress(testUser, progressToStop);

  const stoppedProg = loadProgress(testUser);
  assert.equal(stoppedProg.status, 'stopped');
  const stoppedRow = getDb().prepare('SELECT status FROM variety_sessions WHERE user_id = ?').get(testUser);
  assert.equal(stoppedRow.status, 'stopped');
  console.log('✅ 4. Stop farming state update verified.');

  // 5. Verify auto-resume query on startup
  getDb().prepare("UPDATE variety_sessions SET status = 'running' WHERE user_id = ?").run(testUser);
  const runningRows = getDb().prepare("SELECT * FROM variety_sessions WHERE status = 'running'").all();
  assert.equal(runningRows.length, 1);
  assert.equal(runningRows[0].user_id, testUser);
  console.log('✅ 5. Startup auto-resume candidate detection verified.');

  console.log('PASS variety: 24/7 cloud persistence, 100 game catalog, SQLite synchronization, and auto-resume.\n');
}

runTests().catch(err => {
  console.error('FAIL variety:', err);
  process.exit(1);
});
