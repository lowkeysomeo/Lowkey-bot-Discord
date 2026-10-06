const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const {
  addVoiceXp,
} = require('../../utils/voiceLevelSystem');

const {
  syncVoiceLevelRole,
} = require('../../utils/voiceRoles');

const {
  formatXp,
} = require('../../utils/levelMath');

const {
  sendLevelUp,
} = require('../../utils/sendLevelUp');

module.exports.data = new SlashCommandBuilder()
  .setName('givevoicexp')
  .setDescription('Admin: cộng Voice XP cho thành viên')
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
      .setDescription('Số Voice XP muốn cộng')
      .setMinValue(0.1)
      .setRequired(true)
  )

  .addBooleanOption((option) =>
    option
      .setName('monthly')
      .setDescription(
        'Có cộng vào BXH tháng không? Mặc định: không'
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

  const result = addVoiceXp(
    interaction.guild.id,
    user.id,
    amount,
    {
      countMonthly: monthly,
      minutes: 0,
    }
  );

  await syncVoiceLevelRole(
    member,
    result.profile.level
  );

  // Nếu XP admin cấp làm người chơi lên Voice Level
  // thì gửi Level Up Card.
  if (result.leveledUp) {
    await sendLevelUp(
      interaction.client,
      member,
      'voice',
      result.profile
    );
  }

  return interaction.reply({
    content:
      `Đã cộng **${formatXp(amount)} Voice XP** cho ${user}. ` +
      `Tổng Voice XP: **${formatXp(result.profile.totalXp)}**` +
      (
        monthly
          ? ` • Voice XP tháng: **${formatXp(result.profile.monthlyXp)}**`
          : ''
      ),

    ephemeral: true,
  });
};