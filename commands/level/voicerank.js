const {
  SlashCommandBuilder,
  AttachmentBuilder,
} = require('discord.js');

const {
  getVoiceProfile,
  getVoiceRankPosition,
} = require('../../utils/voiceLevelSystem');

const { createVoiceRankCard } = require('../../utils/createVoiceRankCard');

module.exports.data = new SlashCommandBuilder()
  .setName('voicerank')
  .setDescription('Xem Voice Rank của bạn hoặc thành viên khác')
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('Thành viên muốn xem')
      .setRequired(false),
  );

module.exports.execute = async (interaction) => {
  await interaction.deferReply();

  const user = interaction.options.getUser('user') || interaction.user;

  let member;
  try {
    member = await interaction.guild.members.fetch(user.id);
  } catch {
    return interaction.editReply('Không tìm thấy thành viên này trong server.');
  }

  const profile = getVoiceProfile(interaction.guild.id, user.id);
  const rank = getVoiceRankPosition(interaction.guild.id, user.id, 'total');

  const buffer = await createVoiceRankCard({
    member,
    profile,
    rank,
  });

  const attachment = new AttachmentBuilder(buffer, {
    name: 'vnl-voice-rank.png',
  });

  return interaction.editReply({ files: [attachment] });
};
