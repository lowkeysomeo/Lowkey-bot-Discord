const {
  SlashCommandBuilder,
  AttachmentBuilder,
} = require('discord.js');

const { getChatLeaderboard } = require('../../utils/levelSystem');
const { getVoiceLeaderboard } = require('../../utils/voiceLevelSystem');
const { resolveLeaderboardEntries } = require('../../utils/leaderboardHelpers');
const { createTotalLeaderboardCard } = require('../../utils/createTotalLeaderboardCard');

module.exports.data = new SlashCommandBuilder()
  .setName('totalleaderboard')
  .setDescription('Xem bảng tổng XP Chat và Voice tích lũy');

module.exports.execute = async (interaction) => {
  await interaction.deferReply();

  const chatRows = getChatLeaderboard(interaction.guild.id, 'total', 100);
  const voiceRows = getVoiceLeaderboard(interaction.guild.id, 'total', 100);

  const [chatEntries, voiceEntries] = await Promise.all([
    resolveLeaderboardEntries(
      interaction.guild,
      chatRows,
      'totalXp',
      10,
    ),
    resolveLeaderboardEntries(
      interaction.guild,
      voiceRows,
      'totalXp',
      10,
    ),
  ]);

  const buffer = await createTotalLeaderboardCard(
    chatEntries,
    voiceEntries,
  );

  const attachment = new AttachmentBuilder(buffer, {
    name: 'vnl-total-leaderboard.png',
  });

  return interaction.editReply({ files: [attachment] });
};
