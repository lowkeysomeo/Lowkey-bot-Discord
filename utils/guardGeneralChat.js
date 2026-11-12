'use strict';

const { MessageFlags } = require('discord.js');

const LEVEL_COMMAND_CHANNEL_ID = '1556699295212896289';

function isGeneralChatChannel(channel) {
  if (!channel) return false;
  if (channel.id === LEVEL_COMMAND_CHANNEL_ID) return false;

  const rawName = String(channel.name || '').toLowerCase();
  const normalized = rawName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');

  const generalKeywords = [
    'chatchung',
    'trochuyen',
    'general',
    'thaoluan',
    'chemgio',
    'giaoluu',
    'tamsu',
    'chaomung',
    'mainchat',
    'sanhchinh',
    'kenhchat',
  ];

  return generalKeywords.some((kw) => normalized.includes(kw));
}

async function guardGeneralChat(interaction, actionDesc = 'sử dụng lệnh này') {
  if (!interaction || !interaction.inGuild?.()) return false;
  const channel = interaction.channel;
  if (!channel) return false;

  if (isGeneralChatChannel(channel)) {
    const message = {
      content:
        `⚠️ **Không được ${actionDesc} tại kênh Chat Chung!**\n` +
        `Kênh này chỉ dành riêng cho trò chuyện cộng đồng.\n` +
        `👉 Vui lòng sử dụng tại kênh dành cho bot: <#${LEVEL_COMMAND_CHANNEL_ID}>\n` +
        `👉 Hoặc **nhắn tin trực tiếp (DM)** riêng với bot để thao tác an toàn và bảo mật!`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    };

    if (interaction.deferred) {
      await interaction.editReply(message);
    } else if (typeof interaction.reply === 'function') {
      await interaction.reply(message);
    }
    return true;
  }

  return false;
}

module.exports = {
  LEVEL_COMMAND_CHANNEL_ID,
  isGeneralChatChannel,
  guardGeneralChat,
};
