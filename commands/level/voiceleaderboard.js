const { requireLevelChannel } = require('../../utils/requireLevelChannel');

const {
  SlashCommandBuilder,
  AttachmentBuilder,
} = require('discord.js');

const { getVoiceLeaderboard } = require('../../utils/voiceLevelSystem');
const { resolveLeaderboardEntries } = require('../../utils/leaderboardHelpers');
const { createVoiceLeaderboardCard } = require('../../utils/createVoiceLeaderboardCard');
const { getCurrentMonthKey, monthLabel } = require('../../utils/monthlySystem');

module.exports.data = new SlashCommandBuilder()
  .setName('voiceleaderboard')
  .setDescription('Xem bảng xếp hạng Voice của server');

module.exports.execute = async (interaction) => {
  if (!await requireLevelChannel(interaction)) return;
  await interaction.deferReply();

  const rows = getVoiceLeaderboard(interaction.guild.id, 'monthly', 100);
  const entries = await resolveLeaderboardEntries(
    interaction.guild,
    rows,
    'monthlyXp',
    10,
  );

  const buffer = await createVoiceLeaderboardCard(
    entries,
    monthLabel(getCurrentMonthKey()),
  );

  const attachment = new AttachmentBuilder(buffer, {
    name: 'vnl-voice-leaderboard.png',
  });

  return interaction.editReply({ files: [attachment] });
};
