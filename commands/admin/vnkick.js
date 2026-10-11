const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { sendModLog } = require('../../utils/modLog');

module.exports.data = new SlashCommandBuilder()
  .setName('vnkick')
  .setDescription('Kick thành viên khỏi server')
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addUserOption(option =>
    option.setName('user').setDescription('Thành viên cần kick').setRequired(true)
  )
  .addStringOption(option =>
    option.setName('reason').setDescription('Lý do kick').setRequired(false)
  );

module.exports.execute = async (interaction) => {
  await interaction.deferReply({ flags: 64 });

  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason') || 'Không có lý do.';

  if (target.id === interaction.user.id)
    return interaction.editReply('❌ Không thể tự kick bản thân.');
  if (target.id === interaction.client.user.id)
    return interaction.editReply('❌ Không thể kick bot.');

  let member;
  try {
    member = await interaction.guild.members.fetch(target.id);
  } catch {
    return interaction.editReply('❌ Thành viên này không có trong server.');
  }

  if (!member.kickable)
    return interaction.editReply('❌ Bot không đủ quyền hoặc vị trí role để kick thành viên này.');
  if (interaction.user.id !== interaction.guild.ownerId && interaction.member.roles.highest.comparePositionTo(member.roles.highest) <= 0)
    return interaction.editReply('❌ Role của bạn không cao hơn thành viên cần kick.');

  try {
    await member.kick(`[${interaction.user.tag}] ${reason}`);
  } catch (error) {
    return interaction.editReply(`❌ Không kick được: ${error.message}`);
  }

  await sendModLog(interaction.guild, {
    action: 'kick',
    target,
    mod: interaction.user,
    reason,
  });

  return interaction.editReply(`👢 Đã kick **${target.tag || target.username}**. Lý do: ${reason}`);
};
