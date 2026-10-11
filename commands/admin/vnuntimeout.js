const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { sendModLog } = require('../../utils/modLog');

module.exports.data = new SlashCommandBuilder()
  .setName('vnuntimeout')
  .setDescription('Gỡ hạn chế (untimeout) cho thành viên trong server')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption(option =>
    option.setName('user').setDescription('Thành viên cần gỡ hạn chế').setRequired(true)
  )
  .addStringOption(option =>
    option.setName('reason').setDescription('Lý do gỡ hạn chế').setRequired(false)
  );

module.exports.execute = async (interaction) => {
  await interaction.deferReply({ flags: 64 });

  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason') || 'Không có lý do.';

  let member;
  try {
    member = await interaction.guild.members.fetch(target.id);
  } catch {
    return interaction.editReply('❌ Thành viên này không có trong server.');
  }

  if (!member.moderatable)
    return interaction.editReply('❌ Bot không đủ quyền hoặc vị trí role để gỡ hạn chế thành viên này.');
  if (interaction.user.id !== interaction.guild.ownerId && interaction.member.roles.highest.comparePositionTo(member.roles.highest) <= 0)
    return interaction.editReply('❌ Role của bạn không cao hơn thành viên này.');

  if (!member.isCommunicationDisabled())
    return interaction.editReply('ℹ️ Thành viên này hiện không bị hạn chế.');

  try {
    await member.timeout(null, `[${interaction.user.tag}] ${reason}`);
  } catch (error) {
    return interaction.editReply(`❌ Không gỡ hạn chế được: ${error.message}`);
  }

  await sendModLog(interaction.guild, {
    action: 'untimeout',
    target,
    mod: interaction.user,
    reason,
  });

  return interaction.editReply(`✅ Đã gỡ hạn chế cho **${target.tag || target.username}**. Lý do: ${reason}`);
};
