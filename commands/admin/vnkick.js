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

  const { isStaffLimitExceeded, handleStaffAction, stripStaffRoles } = require('../../utils/staffWatch');
  if (isStaffLimitExceeded(interaction.guild, interaction.user.id, 'kick')) {
    const staffMember = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (staffMember) await stripStaffRoles(staffMember, 'Staff Watch: Vượt hạn mức kick trong ngày (tự xóa role staff)');
    return interaction.editReply('❌ Bạn đã vượt quá hạn mức kick trong ngày của Staff. Lệnh kick bị từ chối và role Staff của bạn đã bị thu hồi.');
  }

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

  const watchResult = await handleStaffAction(interaction.guild, interaction.user.id, 'kick', target.id);
  if (watchResult?.triggered) {
    return interaction.editReply(
      `👢 Đã kick **${target.tag || target.username}**. Lý do: ${reason}\n\n` +
      `🚨 **CẢNH BÁO STAFF WATCH:** Bạn đã thực hiện ${watchResult.count}/${watchResult.max} lượt kick trong 24 giờ qua (vượt quá hạn mức cho phép). ` +
      `Toàn bộ role Staff của bạn đã bị tự động xóa để bảo vệ an toàn server!`
    );
  }

  return interaction.editReply(`👢 Đã kick **${target.tag || target.username}**. Lý do: ${reason}`);
};
