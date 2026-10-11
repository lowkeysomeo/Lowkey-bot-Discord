const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const filename = path.resolve(__dirname, '../commands/fun/invites.js');
const localRequire = createRequire(filename);
let configured = '1555190082795868191';
let reads = 0;
const sandbox = { module: { exports: {} }, require(name) {
  if (name === '../../utils/customization') return { getOptions: () => ({ inviteChannel: configured }) };
  if (name === '../../utils/inviteSystem') return { count: () => { reads++; return 50; } };
  return localRequire(name);
} };
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
const command = sandbox.module.exports;
async function main() {
  for (const channelId of ['wrong', 'thread-under-invite', null]) {
    let reply;
    await command.execute({ inGuild: () => true, guildId: 'server', channelId,
      memberPermissions: { has: () => true },
      get options() { assert.fail('Không đọc thành viên hay số lượt trước khi chặn kênh sai'); },
      reply: async payload => { reply = payload; },
    });
    assert.equal(reads, 0);
    assert.equal(reply.flags, 64);
    assert(reply.content.includes('<#1555190082795868191>'));
    assert.equal(reply.files, undefined);
    assert.equal(reply.embeds, undefined);
    assert.equal(reply.allowedMentions.parse.length, 0);
  }
  await assert.rejects(command.execute({ inGuild: () => true, guildId: 'server', channelId: 'wrong',
    reply: async () => { throw Error('Không trả lời được'); } }), /Không trả lời được/);
  for (const channelId of ['1555190082795868191', 'another-server-channel']) {
    configured = channelId;
    let reply;
    await command.execute({ inGuild: () => true, guildId: 'server', channelId,
      options: { getUser: () => null }, user: { id: 'user' }, reply: async payload => { reply = payload; } });
    assert(reply.content.includes('50 thành viên mới'));
    assert.equal(reply.flags, 64);
  }
  assert.equal(reads, 2);
  configured = '';
  await command.execute({ inGuild: () => true, guildId: 'server', reply: async payload => {
    assert(payload.content.includes('chưa chọn kênh invite')); assert.equal(payload.flags, 64);
  } });
  await command.execute({ inGuild: () => false, reply: async payload => { assert.equal(payload.flags, 64); } });
  assert.equal(reads, 2);
  console.log('Đạt: /invites chặn kênh sai trước khi đọc số lượt, trả lời riêng, đúng kênh hoạt động và tách cấu hình server.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
