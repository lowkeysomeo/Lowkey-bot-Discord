const {
  SlashCommandBuilder,
  AttachmentBuilder,
} = require('discord.js');

const {
  getChatProfile,
  getChatRankPosition,
} = require('../../utils/levelSystem');

const { createRankCard } = require('../../utils/createRankCard');

module.exports.data = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('Xem Chat Rank của bạn hoặc thành viên khác')
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

  const profile = getChatProfile(interaction.guild.id, user.id);
  const rank = getChatRankPosition(interaction.guild.id, user.id, 'total');

  const buffer = await createRankCard({
    member,
    profile,
    rank,
  });

  const attachment = new AttachmentBuilder(buffer, {
    name: 'vnl-rank.png',
  });

  return interaction.editReply({ files: [attachment] });
};
