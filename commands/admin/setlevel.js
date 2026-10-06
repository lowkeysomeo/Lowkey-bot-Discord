const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const {
  getChatProfile,
  setChatLevel,
} = require('../../utils/levelSystem');

const {
  syncLevelRole,
} = require('../../utils/levelRoles');

const {
  formatXp,
} = require('../../utils/levelMath');

const {
  sendLevelUp,
} = require('../../utils/sendLevelUp');

module.exports.data = new SlashCommandBuilder()
  .setName('setlevel')
  .setDescription('Admin: đặt Chat Level cho thành viên')
  .setDefaultMemberPermissions(
    PermissionFlagsBits.Administrator
  )
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('Thành viên')
      .setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName('level')
      .setDescription('Level mới')
      .setMinValue(1)
      .setRequired(true)
  );

module.exports.execute = async (interaction) => {
  const user =
    interaction.options.getUser('user', true);

  const level =
    interaction.options.getInteger('level', true);

  const member =
    await interaction.guild.members.fetch(user.id);

  // Lưu level cũ trước khi thay đổi
  const before =
    getChatProfile(
      interaction.guild.id,
      user.id
    );

  const profile =
    setChatLevel(
      interaction.guild.id,
      user.id,
      level
    );

  await syncLevelRole(
    member,
    profile.level
  );

  // Chỉ thông báo nếu level mới CAO HƠN level cũ
  if (profile.level > before.level) {
    await sendLevelUp(
      interaction.client,
      member,
      'chat',
      profile
    );
  }

  return interaction.reply({
    content:
      `Đã đặt Chat Level của ${user} thành **${profile.level}**. ` +
      `Tổng XP tương ứng: **${formatXp(profile.totalXp)}**. ` +
      'XP tháng được giữ nguyên.',
    ephemeral: true,
  });
};