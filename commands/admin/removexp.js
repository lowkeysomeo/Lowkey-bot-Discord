const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const { removeChatXp } = require('../../utils/levelSystem');
const { syncLevelRole } = require('../../utils/levelRoles');
const { formatXp } = require('../../utils/levelMath');

module.exports.data = new SlashCommandBuilder()
  .setName('removexp')
  .setDescription('Admin: trừ Chat XP của thành viên')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('Thành viên')
      .setRequired(true),
  )
  .addNumberOption((option) =>
    option
      .setName('amount')
      .setDescription('Số XP muốn trừ')
      .setMinValue(0.1)
      .setRequired(true),
  )
  .addBooleanOption((option) =>
    option
      .setName('monthly')
      .setDescription('Có trừ cả XP tháng không? Mặc định: không')
      .setRequired(false),
  );

module.exports.execute = async (interaction) => {
  const user = interaction.options.getUser('user', true);
  const amount = interaction.options.getNumber('amount', true);
  const monthly = interaction.options.getBoolean('monthly') ?? false;

  const member = await interaction.guild.members.fetch(user.id);
  const profile = removeChatXp(
    interaction.guild.id,
    user.id,
    amount,
    { affectMonthly: monthly },
  );

  await syncLevelRole(member, profile.level);

  return interaction.reply({
    content:
      `Đã trừ **${formatXp(amount)} Chat XP** của ${user}. ` +
      `Tổng XP còn: **${formatXp(profile.totalXp)}**`,
    ephemeral: true,
  });
};
