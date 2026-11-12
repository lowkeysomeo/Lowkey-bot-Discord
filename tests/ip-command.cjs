'use strict';

const assert = require('node:assert/strict');
const ipCommand = require('../commands/fun/ip');

async function runTests() {
  console.log('[TEST] Kiểm tra lệnh /ip và tin nhắn !ip...');

  assert.equal(ipCommand.data.name, 'ip');
  assert.ok(ipCommand.data.description);
  assert.equal(typeof ipCommand.execute, 'function');

  const EXPECTED_TEXT = '<:Partnered_Blurple:1555223539253121066> IP Server : legacymc.io.vn\n\n<:Partnered_Blurple:1555223539253121066> Port PE : 19132';

  assert.equal(ipCommand.IP_MESSAGE, EXPECTED_TEXT);

  // Test slash command execution
  let repliedContent = null;
  const mockInteraction = {
    reply: async (options) => {
      repliedContent = options.content;
    }
  };

  await ipCommand.execute(mockInteraction);
  assert.equal(repliedContent, EXPECTED_TEXT, 'Nội dung trả lời slash command phải đúng định dạng');

  // Test chat prefix matching
  const testCases = [
    { input: '!ip', match: true },
    { input: '!IP', match: true },
    { input: '  !ip  ', match: true },
    { input: '!ip sv', match: true },
    { input: '!ip\nMinecraft', match: true },
    { input: '!iphone', match: false },
    { input: 'hello !ip', match: false },
  ];

  for (const tc of testCases) {
    const isMatch = /^!ip(\s|$)/i.test((tc.input || '').trim());
    assert.equal(isMatch, tc.match, `Trường hợp "${tc.input}" kỳ vọng match=${tc.match}`);
  }

  console.log('[PASS] Tất cả kiểm tra IP Command thành công!');
}

runTests().catch(err => {
  console.error('[FAIL]', err);
  process.exit(1);
});
