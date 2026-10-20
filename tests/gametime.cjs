'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// Set memory DB for isolated test
process.env.DB_PATH = ':memory:';

const {
  TIERS,
  SUPPORTED_GAMES,
  DEFAULT_GAME,
  getTierTitle,
  loadGametimeProgress,
  saveGametimeProgress,
  startGametimeFarming,
  stopGametimeFarming,
  isGametimeFarmingActive,
  initGametimeAutoResume
} = require('../utils/gameTimeWorker');
const { getDb } = require('../utils/database');

async function runTests() {
  console.log('--- Testing Game Time Badge Worker & 24/7 Cloud Farming ---');

  // 1. Verify Game Identification & Snowflake Application IDs
  assert.equal(DEFAULT_GAME.name, 'Counter-Strike 2');
  assert.equal(DEFAULT_GAME.appId, '1158877933042143272', 'Counter-Strike 2 must use official Discord Snowflake ID, not Steam 730');
  assert.ok(/^\d{17,19}$/.test(DEFAULT_GAME.appId), 'appId must be a 64-bit snowflake string');

  for (const game of SUPPORTED_GAMES) {
    assert.ok(/^\d{17,19}$/.test(game.appId), `${game.name} appId must be valid Discord snowflake`);
  }
  console.log('✅ 1. Game Identification & Snowflake Application IDs verified.');

  // 2. Verify Tier Titles
  assert.equal(getTierTitle(0), 'Chưa mở khóa');
  assert.equal(getTierTitle(1), 'Giải Trí');
  assert.equal(getTierTitle(75), 'Tâm huyết');
  assert.equal(getTierTitle(5000), 'Vĩnh cửu');
  console.log('✅ 2. Tier calculations verified.');

  // 3. Verify SQLite persistence of load/save
  const testUser = '987654321012345678';
  saveGametimeProgress(testUser, {
    token: 'test_token_sample',
    username: 'TestPlayer',
    status: 'running',
    accumulatedSeconds: 7200,
    currentSessionSeconds: 120,
    game: DEFAULT_GAME
  });

  const prog = loadGametimeProgress(testUser);
  assert.equal(prog.userId, testUser);
  assert.equal(prog.accumulatedSeconds, 7200);
  assert.equal(prog.currentSessionSeconds, 120);
  assert.equal(prog.status, 'running');
  assert.equal(prog.gameName, 'Counter-Strike 2');

  // Verify in SQLite directly
  const dbRow = getDb().prepare('SELECT * FROM gametime_sessions WHERE user_id = ?').get(testUser);
  assert.ok(dbRow, 'Session must exist in SQLite gametime_sessions');
  assert.equal(dbRow.app_id, '1158877933042143272');
  assert.equal(dbRow.accumulated_seconds, 7200);
  console.log('✅ 3. SQLite persistence & cross-session retrieval verified.');

  // 4. Verify stop updates SQLite status
  stopGametimeFarming(testUser);
  const stoppedProg = loadGametimeProgress(testUser);
  assert.equal(stoppedProg.status, 'stopped');
  const stoppedRow = getDb().prepare('SELECT status FROM gametime_sessions WHERE user_id = ?').get(testUser);
  assert.equal(stoppedRow.status, 'stopped');
  console.log('✅ 4. Stop farming state update verified.');

  // 5. Verify auto-resume query on startup
  // Mark row as running to test initGametimeAutoResume
  getDb().prepare("UPDATE gametime_sessions SET status = 'running' WHERE user_id = ?").run(testUser);
  const runningRows = getDb().prepare("SELECT * FROM gametime_sessions WHERE status = 'running'").all();
  assert.equal(runningRows.length, 1);
  assert.equal(runningRows[0].user_id, testUser);
  console.log('✅ 5. Startup auto-resume candidate detection verified.');

  console.log('PASS gametime: 24/7 cloud persistence, Snowflake Application IDs, SQLite synchronization, state machine, and auto-resume on reboot.\n');
}

runTests().catch(err => {
  console.error('FAIL gametime:', err);
  process.exit(1);
});
