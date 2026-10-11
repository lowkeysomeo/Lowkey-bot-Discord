/**
 * tests/chat-moderation.cjs
 * Kiểm tra các lệnh moderation gõ trực tiếp trong chat (không cần dấu /):
 *   - vnban @user [lý do]
 *   - vnkick @user [lý do]
 *   - vntimeout @user [thời gian] [lý do]
 *   - vnuntimeout @user [lý do]
 */

const assert = require('node:assert/strict');
process.env.DB_PATH = ':memory:';
delete process.env.GUILD_ID;

const { PermissionFlagsBits: P } = require('discord.js');
const { handleChatModeration, parseDuration } = require('../utils/chatModeration');
const { MOD_LOG_CHANNEL_ID } = require('../utils/modLog');

// 1. Kiểm tra parseDuration
assert.equal(parseDuration('10').minutes, 10);
assert.equal(parseDuration('15m').minutes, 15);
assert.equal(parseDuration('2h').minutes, 120);
assert.equal(parseDuration('1d').minutes, 1440);
assert.equal(parseDuration('hello').isDuration, false);

const sentModLogs = [];
const mockChannel = {
  id: MOD_LOG_CHANNEL_ID,
  send: async (payload) => {
    sentModLogs.push(payload);
    return { id: 'msg-1' };
  },
};

const kicked = [];
const banned = [];
const timedOut = [];
let isTimedOut = true;

const TARGET_ID = '123456789012345678';
const targetMember = {
  id: TARGET_ID,
  bannable: true,
  kickable: true,
  moderatable: true,
  user: { id: TARGET_ID, tag: 'Target#0001' },
  isCommunicationDisabled: () => isTimedOut,
  roles: { highest: { comparePositionTo: () => -1 } },
  kick: async (r) => kicked.push(r),
  timeout: async (d, r) => timedOut.push({ d, r }),
};

const authorMember = {
  id: 'mod-id',
  permissions: {
    has: (p) => [P.BanMembers, P.KickMembers, P.ModerateMembers].includes(p),
  },
  roles: { highest: { comparePositionTo: () => 1 } },
};

const mockGuild = {
  id: 'guild-test',
  ownerId: 'owner-id',
  members: {
    fetch: async (id) => {
      if (id === TARGET_ID) return targetMember;
      if (id === 'mod-id') return authorMember;
      return null;
    },
    ban: async (id, opts) => banned.push({ id, opts }),
  },
  channels: {
    fetch: async (id) => (id === MOD_LOG_CHANNEL_ID ? mockChannel : null),
  },
};

function createMessage(content) {
  let replyContent = '';
  return {
    content,
    guild: mockGuild,
    author: { id: 'mod-id', tag: 'Mod#0001', bot: false },
    member: authorMember,
    client: { user: { id: 'bot-id' } },
    reply: async (msg) => {
      replyContent = msg;
      return { id: 'reply-1' };
    },
    get lastReply() {
      return replyContent;
    },
  };
}

async function testChatCommands() {
  // Tin nhắn thường không bị chặn
  const normalMsg = createMessage('xin chào server');
  assert.equal(await handleChatModeration(normalMsg), false);

  // vnkick thiếu user
  const noArgKick = createMessage('vnkick');
  assert.equal(await handleChatModeration(noArgKick), true);
  assert.ok(noArgKick.lastReply.includes('Thiếu người dùng'));

  // vnkick thành công
  sentModLogs.length = 0;
  const kickMsg = createMessage(`vnkick <@${TARGET_ID}> spam link`);
  assert.equal(await handleChatModeration(kickMsg), true);
  assert.equal(kicked.length, 1);
  assert.ok(kickMsg.lastReply.includes('Đã kick'));
  assert.equal(sentModLogs.length, 1);
  assert.equal(sentModLogs[0].embeds[0].data.title, '👢 KICK');

  // vnban thành công (dùng raw ID không cần tag)
  const banMsg = createMessage(`vnban ${TARGET_ID} phá hoại kênh`);
  assert.equal(await handleChatModeration(banMsg), true);
  assert.equal(banned.length, 1);
  assert.equal(banned[0].id, TARGET_ID);
  assert.ok(banMsg.lastReply.includes('Đã ban'));
  assert.equal(sentModLogs.length, 2);
  assert.equal(sentModLogs[1].embeds[0].data.title, '🔨 BAN');

  // vntimeout thành công với thời gian 1h
  const timeoutMsg = createMessage(`vntimeout <@${TARGET_ID}> 1h ngôn từ thù địch`);
  assert.equal(await handleChatModeration(timeoutMsg), true);
  assert.equal(timedOut.length, 1);
  assert.equal(timedOut[0].d, 60 * 60 * 1000); // 1 giờ
  assert.ok(timeoutMsg.lastReply.includes('60 phút'));
  assert.equal(sentModLogs.length, 3);
  assert.equal(sentModLogs[2].embeds[0].data.title, '⏱️ TIMEOUT');

  // vnuntimeout thành công
  const untimeoutMsg = createMessage(`vnuntimeout <@${TARGET_ID}> đã xin lỗi`);
  assert.equal(await handleChatModeration(untimeoutMsg), true);
  assert.equal(timedOut.length, 2);
  assert.equal(timedOut[1].d, null);
  assert.ok(untimeoutMsg.lastReply.includes('Đã gỡ hạn chế'));
  assert.equal(sentModLogs.length, 4);
  assert.equal(sentModLogs[3].embeds[0].data.title, '✅ GỠ TIMEOUT');

  // Kiểm tra tùy chỉnh cú pháp chat qua Dashboard options
  const { saveOptions } = require('../utils/customization');
  saveOptions('guild-test', {
    chatModKickCmd: '!kick',
    chatModBanCmd: '!ban',
  });

  // Lệnh cũ vnkick không còn tác dụng
  assert.equal(await handleChatModeration(createMessage(`vnkick <@${TARGET_ID}> lý do`)), false);

  // Lệnh mới !kick hoạt động
  const customKick = createMessage(`!kick <@${TARGET_ID}> vi phạm luật mới`);
  assert.equal(await handleChatModeration(customKick), true);
  assert.equal(kicked.length, 2);
  assert.ok(customKick.lastReply.includes('Đã kick'));

  // Khi tắt chatModEnabled: false thì không nhận lệnh
  saveOptions('guild-test', { chatModEnabled: false });
  assert.equal(await handleChatModeration(createMessage(`!kick <@${TARGET_ID}> lý do`)), false);
}

async function main() {
  await testChatCommands();
  console.log('PASS chat moderation commands (vnkick, vnban, vntimeout, vnuntimeout, and custom syntax from Dashboard).');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
}).finally(() => {
  try { require('../utils/database').getDb().close(); } catch {}
});
