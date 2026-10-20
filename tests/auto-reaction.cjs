'use strict';

const assert = require('node:assert/strict');
process.env.DB_PATH = ':memory:';

const autoReaction = require('../utils/autoReaction');
const command = require('../commands/admin/autoreact');

async function testAutoReaction() {
  const guildId = 'test-guild-autoreact';
  const quoteChannelId = '123456789012345678';
  const generalChannelId = '987654321098765432';

  // Test 1: parseEmojis
  const parsed1 = autoReaction.parseEmojis('🌙 ✨ 🤍 💌');
  assert.deepEqual(parsed1, ['🌙', '✨', '🤍', '💌'], 'Must parse unicode emojis');

  const parsed2 = autoReaction.parseEmojis('<:star_custom:111222333444555666> ❤️ 🌸');
  assert.deepEqual(parsed2, ['<:star_custom:111222333444555666>', '❤️', '🌸'], 'Must parse mixed custom and unicode emojis');

  const parsedEmpty = autoReaction.parseEmojis('');
  assert.deepEqual(parsedEmpty, [], 'Must handle empty string');

  // Test 2: Auto-detect quote channel by name
  const quoteChannelName = '꒰৯🌙໒꒱：quotes';
  const detected = autoReaction.getChannelReaction(guildId, quoteChannelId, quoteChannelName);
  assert(detected, 'Must detect quotes channel');
  assert.equal(detected.enabled, true, 'Must be enabled by default for quotes channel');
  assert.deepEqual(detected.emojis, autoReaction.DEFAULT_QUOTE_EMOJIS, 'Must have default quote emojis');

  // General channel has no reaction by default
  const generalDetected = autoReaction.getChannelReaction(guildId, generalChannelId, 'tán-gẫu');
  assert.equal(generalDetected, null, 'Must be null for non-quote channel');

  // Test 3: setChannelReaction
  const customEmojis = ['🔥', '👏', '⭐'];
  autoReaction.setChannelReaction(guildId, generalChannelId, customEmojis);
  const generalConfig = autoReaction.getChannelReaction(guildId, generalChannelId, 'tán-gẫu');
  assert(generalConfig, 'Must have config after set');
  assert.equal(generalConfig.enabled, true);
  assert.deepEqual(generalConfig.emojis, customEmojis, 'Must have custom emojis');

  // Test 4: listChannelReactions
  const list = autoReaction.listChannelReactions(guildId);
  assert.equal(list.length, 1, 'Must list 1 configured channel');
  assert.equal(list[0].channelId, generalChannelId);

  // Test 5: removeChannelReaction
  autoReaction.removeChannelReaction(guildId, quoteChannelId);
  const disabledQuote = autoReaction.getChannelReaction(guildId, quoteChannelId, quoteChannelName);
  assert.equal(disabledQuote.enabled, false, 'Must be disabled after removeChannelReaction');

  // Test 6: handleMessage
  const reacted = [];
  const mockMessage = {
    guild: { id: guildId },
    channel: { id: generalChannelId, name: 'tán-gẫu' },
    author: { bot: false },
    react: async (emoji) => {
      reacted.push(emoji);
    },
  };

  await autoReaction.handleMessage(mockMessage);
  assert.deepEqual(reacted, customEmojis, 'Must react with custom emojis on message');

  // Bot message ignored
  reacted.length = 0;
  await autoReaction.handleMessage({ ...mockMessage, author: { bot: true } });
  assert.equal(reacted.length, 0, 'Must ignore bot messages');

  // Test 7: Slash command /autoreact execution
  let replyPayload = null;
  const mockInteraction = {
    inGuild: () => true,
    guildId,
    channel: { id: generalChannelId, name: 'tán-gẫu' },
    memberPermissions: { has: () => true },
    options: {
      getSubcommand: () => 'caidat',
      getChannel: () => null,
      getString: () => '💖 🕊️ 🌸 🌙',
    },
    reply: async (p) => { replyPayload = p; },
  };

  await command.execute(mockInteraction);
  assert(replyPayload.embeds && replyPayload.embeds[0].data.title.includes('Đã bật Auto Reaction'), 'Must confirm caidat');

  const updatedConfig = autoReaction.getChannelReaction(guildId, generalChannelId);
  assert.deepEqual(updatedConfig.emojis, ['💖', '🕊️', '🌸', '🌙']);

  // Command sub danhsach
  mockInteraction.options.getSubcommand = () => 'danhsach';
  replyPayload = null;
  await command.execute(mockInteraction);
  assert(replyPayload.embeds && replyPayload.embeds[0].data.title.includes('Danh Sách Kênh'), 'Must list channels');

  // Command sub tat
  mockInteraction.options.getSubcommand = () => 'tat';
  replyPayload = null;
  await command.execute(mockInteraction);
  assert(replyPayload.embeds && replyPayload.embeds[0].data.title.includes('Đã tắt Auto Reaction'), 'Must confirm tat');

  console.log('PASS auto-reaction: quote channel auto-detection, custom emoji parsing, SQLite persistence, reaction loop, and /autoreact command.');
}

testAutoReaction().catch(err => {
  console.error(err);
  process.exit(1);
});
