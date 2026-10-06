const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const {
  removeVoiceXp,
} = require('../../utils/voiceLevelSystem');

const {
  syncVoiceLevelRole,
} = require('../../utils/voiceRoles');

const {
  formatXp,
} = require('../../utils/levelMath');

module.exports.data = new SlashCommandBuilder()
  .setName('removevoicexp')
  .setDescription('Admin: trừ Voice XP của thành viên')
  .setDefaultMemberPermissions(
    PermissionFlagsBits.Administrator
  )

  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('Thành viên')
      .setRequired(true)
  )

  .addNumberOption((option) =>
    option
      .setName('amount')
      .setDescription('Số Voice XP muốn trừ')
      .setMinValue(0.1)
      .setRequired(true)
  )

  .addBooleanOption((option) =>
    option
      .setName('monthly')
      .setDescription(
        'Có trừ cả Voice XP tháng không? Mặc định: không'
      )
      .setRequired(false)
  );

module.exports.execute = async (interaction) => {
  const user =
    interaction.options.getUser(
      'user',
      true
    );

   if (user.bot) {
  return interaction.reply({
    content: '❌ Không thể chỉnh XP hoặc Level cho tài khoản bot.',
    flags: 64,
  });
}

  const amount =
    interaction.options.getNumber(
      'amount',
      true
    );

  const monthly =
    interaction.options.getBoolean(
      'monthly'
    ) ?? false;

  const member =
    await interaction.guild.members.fetch(
      user.id
    );

  const profile = removeVoiceXp(
    interaction.guild.id,
    user.id,
    amount,
    {
      affectMonthly: monthly,
    }
  );

  // Đồng bộ lại Voice Role nếu bị tụt level
  await syncVoiceLevelRole(
    member,
    profile.level
  );

  return interaction.reply({
    content:
      `Đã trừ **${formatXp(amount)} Voice XP** của ${user}.\n` +
      `🎙️ Voice Level hiện tại: **${profile.level}**\n` +
      `⭐ Tổng Voice XP còn lại: **${formatXp(profile.totalXp)}**` +
      (
        monthly
          ? `\n📅 Voice XP tháng còn lại: **${formatXp(profile.monthlyXp)}**`
          : ''
      ),

    ephemeral: true,
  });
};