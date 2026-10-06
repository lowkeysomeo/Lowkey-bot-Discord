const {
  SlashCommandBuilder,
  AttachmentBuilder,
} = require('discord.js');

const { getChatLeaderboard } = require('../../utils/levelSystem');
const { resolveLeaderboardEntries } = require('../../utils/leaderboardHelpers');
const { createLeaderboardCard } = require('../../utils/createLeaderboardCard');
const { getCurrentMonthKey, monthLabel } = require('../../utils/monthlySystem');

module.exports.data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Xem bảng xếp hạng hoạt động của server');

module.exports.execute = async (interaction) => {
  await interaction.deferReply();

  const rows = getChatLeaderboard(interaction.guild.id, 'monthly', 100);
  const entries = await resolveLeaderboardEntries(
    interaction.guild,
    rows,
    'monthlyXp',
    10,
  );

  const buffer = await createLeaderboardCard(
    entries,
    monthLabel(getCurrentMonthKey()),
  );

  const attachment = new AttachmentBuilder(buffer, {
    name: 'vnl-chat-leaderboard.png',
  });

  return interaction.editReply({ files: [attachment] });
};
