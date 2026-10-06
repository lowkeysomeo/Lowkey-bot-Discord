const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const { setVoiceLevel } = require('../../utils/voiceLevelSystem');
const { syncVoiceLevelRole } = require('../../utils/voiceRoles');
const { formatXp } = require('../../utils/levelMath');

module.exports.data = new SlashCommandBuilder()
  .setName('setvoicelevel')
  .setDescription('Admin: đặt Voice Level cho thành viên')
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
      .setDescription('Voice Level mới')
      .setMinValue(1)
      .setRequired(true),
  );

module.exports.execute = async (interaction) => {
  const user = interaction.options.getUser('user', true);
  const level = interaction.options.getInteger('level', true);

  const member = await interaction.guild.members.fetch(user.id);
  const profile = setVoiceLevel(interaction.guild.id, user.id, level);

  await syncVoiceLevelRole(member, profile.level);

  return interaction.reply({
    content:
      `Đã đặt Voice Level của ${user} thành **${profile.level}**. ` +
      `Tổng Voice XP tương ứng: **${formatXp(profile.totalXp)}**. ` +
      'Voice XP tháng được giữ nguyên.',
    ephemeral: true,
  });
};
