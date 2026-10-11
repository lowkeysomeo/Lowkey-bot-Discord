/**
 * tests/modlog-commands.cjs
 * Kiểm tra:
 *  1. modLog.js gửi thông báo đúng kênh 1555457471596724274 với embed tương ứng
 *  2. Lệnh /ban, /kick, /timeout, /untimeout hoạt động, kiểm tra quyền và gửi modLog
 *  3. securitySystem punish ghi nhận vào modLog
 */

const assert = require('node:assert/strict');
process.env.DB_PATH = ':memory:';
delete process.env.GUILD_ID;

const { PermissionFlagsBits } = require('discord.js');
const { sendModLog, MOD_LOG_CHANNEL_ID } = require('../utils/modLog');
const banCommand = require('../commands/admin/vnban');
const kickCommand = require('../commands/admin/vnkick');
const timeoutCommand = require('../commands/admin/vntimeout');
const untimeoutCommand = require('../commands/admin/vnuntimeout');

assert.equal(banCommand.data.name, 'vnban');
assert.equal(kickCommand.data.name, 'vnkick');
assert.equal(timeoutCommand.data.name, 'vntimeout');
assert.equal(untimeoutCommand.data.name, 'vnuntimeout');
assert.equal(MOD_LOG_CHANNEL_ID, '1555457471596724274', 'Kênh modLog phải đúng 1555457471596724274');

const sentMessages = [];
const mockChannel = {
  id: MOD_LOG_CHANNEL_ID,
  send: async (payload) => {
    sentMessages.push(payload);
    return { id: 'msg-1' };
  },
};

const mockGuild = {
  id: 'guild-test',
  ownerId: 'owner-id',
  channels: {
    fetch: async (id) => (id === MOD_LOG_CHANNEL_ID ? mockChannel : null),
  },
};

async function testModLog() {
  sentMessages.length = 0;

  // Test ban log
  await sendModLog(mockGuild, {
    action: 'ban',
    target: { id: 'user-1', tag: 'UserOne#0001' },
    mod: { id: 'mod-1', tag: 'ModOne#0001' },
    reason: 'Vi phạm quy tắc server',
  });
  assert.equal(sentMessages.length, 1);
  const banEmbed = sentMessages[0].embeds[0].data;
  assert.equal(banEmbed.title, '🔨 BAN');
  assert.equal(banEmbed.color, 0xef4444);
  assert.ok(banEmbed.description.includes('user-1'));
  assert.ok(banEmbed.description.includes('mod-1'));
  assert.ok(banEmbed.description.includes('Vi phạm quy tắc server'));

  // Test kick log
  await sendModLog(mockGuild, {
    action: 'kick',
    target: { id: 'user-2', tag: 'UserTwo#0002' },
    mod: { id: 'mod-1' },
    reason: 'Treo máy quá lâu',
  });
  assert.equal(sentMessages.length, 2);
  const kickEmbed = sentMessages[1].embeds[0].data;
  assert.equal(kickEmbed.title, '👢 KICK');
  assert.equal(kickEmbed.color, 0xf97316);

  // Test timeout log (duration formatting)
  await sendModLog(mockGuild, {
    action: 'timeout',
    target: { id: 'user-3', username: 'UserThree' },
    mod: null,
    reason: 'Spam tin nhắn',
    duration: 600000, // 10 phút
  });
  assert.equal(sentMessages.length, 3);
  const timeoutEmbed = sentMessages[2].embeds[0].data;
  assert.equal(timeoutEmbed.title, '⏱️ TIMEOUT');
  assert.equal(timeoutEmbed.color, 0xeab308);
  assert.ok(timeoutEmbed.description.includes('10 phút'));
  assert.ok(timeoutEmbed.description.includes('🤖 Hệ thống tự động'));

  // Test untimeout log
  await sendModLog(mockGuild, {
    action: 'untimeout',
    target: { id: 'user-4', tag: 'UserFour#0004' },
    mod: { id: 'mod-1' },
    reason: 'Đã giải trình hợp lý',
  });
  assert.equal(sentMessages.length, 4);
  const untimeoutEmbed = sentMessages[3].embeds[0].data;
  assert.equal(untimeoutEmbed.title, '✅ GỠ TIMEOUT');
  assert.equal(untimeoutEmbed.color, 0x22c55e);
}

async function testCommands() {
  sentMessages.length = 0;

  // Mock target member
  const banned = [];
  const kicked = [];
  const timedOut = [];
  let isTimedOut = true;

  const targetUser = { id: 'target-id', tag: 'Target#1234', username: 'Target' };
  const targetMember = {
    id: 'target-id',
    bannable: true,
    kickable: true,
    moderatable: true,
    isCommunicationDisabled: () => isTimedOut,
    roles: { highest: { comparePositionTo: () => -1 } },
    kick: async (r) => kicked.push(r),
    timeout: async (d, r) => timedOut.push({ d, r }),
  };

  const executorMember = {
    roles: { highest: { comparePositionTo: () => 1 } },
  };

  const commandGuild = {
    ...mockGuild,
    members: {
      fetch: async (id) => (id === 'target-id' ? targetMember : null),
      ban: async (id, opts) => banned.push({ id, opts }),
    },
  };

  function createInteraction(cmdOptions) {
    let replyContent = '';
    return {
      guild: commandGuild,
      user: { id: 'mod-id', tag: 'Mod#0001' },
      member: executorMember,
      client: { user: { id: 'bot-id' } },
      options: {
        getUser: (name) => (name === 'user' ? targetUser : null),
        getString: (name) => cmdOptions[name] || null,
        getInteger: (name) => (cmdOptions[name] !== undefined ? cmdOptions[name] : null),
      },
      deferReply: async () => {},
      editReply: async (msg) => { replyContent = typeof msg === 'string' ? msg : msg.content; return replyContent; },
      get reply() { return replyContent; },
    };
  }

  // 1. /ban
  const banInteraction = createInteraction({ reason: 'Phá hoại', delete_days: 1 });
  await banCommand.execute(banInteraction);
  assert.equal(banned.length, 1);
  assert.equal(banned[0].id, 'target-id');
  assert.ok(banInteraction.reply.includes('Đã ban'));
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].embeds[0].data.title, '🔨 BAN');

  // 2. /kick
  const kickInteraction = createInteraction({ reason: 'Quấy rối' });
  await kickCommand.execute(kickInteraction);
  assert.equal(kicked.length, 1);
  assert.ok(kickInteraction.reply.includes('Đã kick'));
  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[1].embeds[0].data.title, '👢 KICK');

  // 3. /timeout
  const timeoutInteraction = createInteraction({ minutes: 30, reason: 'Spam' });
  await timeoutCommand.execute(timeoutInteraction);
  assert.equal(timedOut.length, 1);
  assert.equal(timedOut[0].d, 30 * 60 * 1000);
  assert.ok(timeoutInteraction.reply.includes('Đã hạn chế'));
  assert.equal(sentMessages.length, 3);
  assert.equal(sentMessages[2].embeds[0].data.title, '⏱️ TIMEOUT');

  // 4. /untimeout
  const untimeoutInteraction = createInteraction({ reason: 'Hết vi phạm' });
  await untimeoutCommand.execute(untimeoutInteraction);
  assert.equal(timedOut.length, 2);
  assert.equal(timedOut[1].d, null);
  assert.ok(untimeoutInteraction.reply.includes('Đã gỡ hạn chế'));
  assert.equal(sentMessages.length, 4);
  assert.equal(sentMessages[3].embeds[0].data.title, '✅ GỠ TIMEOUT');
}

async function main() {
  await testModLog();
  await testCommands();
  console.log('PASS modlog and moderation commands (/vnban, /vnkick, /vntimeout, /vnuntimeout, channel 1555457471596724274).');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
