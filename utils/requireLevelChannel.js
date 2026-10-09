const { MessageFlags } = require('discord.js');

const LEVEL_COMMAND_CHANNEL_ID = '1556699295212896289';

async function requireLevelChannel(interaction) {
  // Check the exact channel, so threads under it do not bypass the restriction.
  if (interaction.channelId === LEVEL_COMMAND_CHANNEL_ID) return true;

  await interaction.reply({
    content: `Bạn vui lòng dùng lệnh xem level và bảng xếp hạng tại <#${LEVEL_COMMAND_CHANNEL_ID}> nhé!`,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
  return false;
}

module.exports = { LEVEL_COMMAND_CHANNEL_ID, requireLevelChannel };
