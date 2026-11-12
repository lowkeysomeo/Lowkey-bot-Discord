'use strict';

const assert = require('node:assert/strict');
const {
  isGeneralChatChannel,
  guardGeneralChat,
  LEVEL_COMMAND_CHANNEL_ID,
} = require('../utils/guardGeneralChat');
const questCmd = require('../commands/fun/quest');
const autoquestCmd = require('../commands/fun/autoquest');

(async () => {
  console.log('--- Testing General Chat Guard & Ephemeral Policy ---');

  // 1. Kiểm tra nhận diện kênh chat chung
  assert.equal(isGeneralChatChannel({ name: 'chat-chung' }), true, 'Phải nhận diện chat-chung');
  assert.equal(isGeneralChatChannel({ name: '💬┃chat-chung' }), true, 'Phải nhận diện có icon chat-chung');
  assert.equal(isGeneralChatChannel({ name: 'trò-chuyện' }), true, 'Phải nhận diện trò-chuyện có dấu');
  assert.equal(isGeneralChatChannel({ name: 'general' }), true, 'Phải nhận diện general');
  assert.equal(isGeneralChatChannel({ name: 'thảo-luận' }), true, 'Phải nhận diện thảo-luận');
  assert.equal(isGeneralChatChannel({ name: 'chém-gió' }), true, 'Phải nhận diện chém-gió');
  assert.equal(isGeneralChatChannel({ name: 'chào-mừng' }), true, 'Phải nhận diện chào-mừng');

  // Kênh hợp lệ không phải chat chung
  assert.equal(isGeneralChatChannel({ name: 'lệnh-bot' }), false, 'Kênh lệnh bot không phải chat chung');
  assert.equal(isGeneralChatChannel({ name: 'bot-commands' }), false, 'Kênh bot-commands không phải chat chung');
  assert.equal(isGeneralChatChannel({ id: LEVEL_COMMAND_CHANNEL_ID, name: 'chat-chung' }), false, 'Kênh ID lệnh bot không bao giờ bị chặn');
  assert.equal(isGeneralChatChannel(null), false);

  // 2. Kiểm tra guardGeneralChat chặn khi gọi trong chat chung
  let blockedReply = null;
  const mockChatChungInteraction = {
    inGuild: () => true,
    channel: { id: 'ch-general', name: 'chat-chung' },
    reply: async (payload) => {
      blockedReply = payload;
    },
  };

  const wasBlocked = await guardGeneralChat(mockChatChungInteraction, 'dùng lệnh và xem hướng dẫn');
  assert.equal(wasBlocked, true, 'guardGeneralChat phải chặn khi ở chat chung');
  assert.equal(blockedReply.flags, 64, 'Phản hồi chặn phải là ephemeral');
  assert.match(blockedReply.content, /Không được dùng lệnh và xem hướng dẫn tại kênh Chat Chung/);

  // 3. Kiểm tra lệnh /quest trong chat chung bị chặn ngay lập tức
  let questReply = null;
  const mockQuestInteraction = {
    inGuild: () => true,
    channel: { id: 'ch-general', name: 'trò-chuyện' },
    user: { id: 'u1' },
    options: { getString: () => 'hub' },
    reply: async (p) => { questReply = p; },
  };
  await questCmd.execute(mockQuestInteraction);
  assert(questReply !== null, 'Lệnh /quest phải phản hồi cảnh báo');
  assert.equal(questReply.flags, 64, 'Cảnh báo phải là ephemeral');
  assert.match(questReply.content, /Chat Chung/);

  // 4. Kiểm tra lệnh /quest ở kênh hợp lệ phản hồi 100% ephemeral
  let allowedReply = null;
  const mockAllowedInteraction = {
    inGuild: () => true,
    guildId: 'g1',
    channel: { id: 'ch-bot', name: 'bot-commands' },
    user: { id: 'u1', username: 'testuser' },
    options: { getString: () => 'hub' },
    reply: async (p) => { allowedReply = p; },
  };
  await questCmd.execute(mockAllowedInteraction);
  assert(allowedReply !== null, 'Lệnh /quest phải phản hồi');
  assert.equal(allowedReply.flags, 64, 'Hub phải luôn luôn là ephemeral (flags: 64)');

  // 5. Kiểm tra /quest script phản hồi ephemeral
  let scriptReply = null;
  const mockScriptInteraction = {
    inGuild: () => true,
    guildId: 'g1',
    channel: { id: 'ch-bot', name: 'bot-commands' },
    user: { id: 'u1', username: 'testuser' },
    options: { getString: () => 'script' },
    reply: async (p) => { scriptReply = p; },
  };
  await questCmd.execute(mockScriptInteraction);
  assert.equal(scriptReply.flags, 64, 'Script phải luôn là ephemeral (flags: 64)');

  console.log('PASS: General Chat Guard & Ephemeral Policy verified successfully! ✅');
})();
