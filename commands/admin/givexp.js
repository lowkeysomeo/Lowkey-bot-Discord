const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const {
  addChatXp,
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
  .setName('givexp')
  .setDescription('Admin: cộng Chat XP cho thành viên')
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
      .setDescription('Số XP muốn cộng')
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

  const result = addChatXp(
    interaction.guild.id,
    user.id,
    amount,
    {
      countMonthly: monthly,
    }
  );

  await syncLevelRole(
    member,
    result.profile.level
  );

  // Nếu XP admin cấp làm người chơi lên level
  // thì gửi Level Up Card.
  if (result.leveledUp) {
    await sendLevelUp(
      interaction.client,
      member,
      'chat',
      result.profile
    );
  }

  return interaction.reply({
    content:
      `Đã cộng **${formatXp(amount)} Chat XP** cho ${user}. ` +
      `Tổng XP: **${formatXp(result.profile.totalXp)}**` +
      (
        monthly
          ? ` • XP tháng: **${formatXp(result.profile.monthlyXp)}**`
          : ''
      ),

    ephemeral: true,
  });
};