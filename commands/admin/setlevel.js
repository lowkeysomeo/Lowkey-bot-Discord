const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const { setChatLevel } = require('../../utils/levelSystem');
const { syncLevelRole } = require('../../utils/levelRoles');
const { formatXp } = require('../../utils/levelMath');

module.exports.data = new SlashCommandBuilder()
  .setName('setlevel')
  .setDescription('Admin: đặt Chat Level cho thành viên')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('Thành viên')
      .setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName('level')
      .setDescription('Level mới')
      .setMinValue(1)
      .setRequired(true),
  );

module.exports.execute = async (interaction) => {
  const user = interaction.options.getUser('user', true);
  const level = interaction.options.getInteger('level', true);

  const member = await interaction.guild.members.fetch(user.id);
  const profile = setChatLevel(interaction.guild.id, user.id, level);

  await syncLevelRole(member, profile.level);

  return interaction.reply({
    content:
      `Đã đặt Chat Level của ${user} thành **${profile.level}**. ` +
      `Tổng XP tương ứng: **${formatXp(profile.totalXp)}**. ` +
      'XP tháng được giữ nguyên.',
    ephemeral: true,
  });
};
