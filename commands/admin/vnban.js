const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { sendModLog } = require('../../utils/modLog');

module.exports.data = new SlashCommandBuilder()
  .setName('vnban')
  .setDescription('Ban thành viên khỏi server')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption(option =>
    option.setName('user').setDescription('Thành viên cần ban').setRequired(true)
  )
  .addStringOption(option =>
    option.setName('reason').setDescription('Lý do ban').setRequired(false)
  )
  .addIntegerOption(option =>
    option.setName('delete_days')
      .setDescription('Xóa tin nhắn bao nhiêu ngày gần nhất (0–7, mặc định 0)')
      .setMinValue(0).setMaxValue(7).setRequired(false)
  );

module.exports.execute = async (interaction) => {
  await interaction.deferReply({ flags: 64 });

  const target  = interaction.options.getUser('user', true);
  const reason  = interaction.options.getString('reason') || 'Không có lý do.';
  const delDays = interaction.options.getInteger('delete_days') ?? 0;

  if (target.id === interaction.user.id)
    return interaction.editReply('❌ Không thể tự ban bản thân.');
  if (target.id === interaction.client.user.id)
    return interaction.editReply('❌ Không thể ban bot.');

  const { isStaffLimitExceeded, handleStaffAction, stripStaffRoles } = require('../../utils/staffWatch');
  if (isStaffLimitExceeded(interaction.guild, interaction.user.id, 'ban')) {
    const staffMember = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (staffMember) await stripStaffRoles(staffMember, 'Staff Watch: Vượt hạn mức ban trong ngày (tự xóa role staff)');
    return interaction.editReply('❌ Bạn đã vượt quá hạn mức ban trong ngày của Staff. Lệnh ban bị từ chối và role Staff của bạn đã bị thu hồi.');
  }

  let member;
  try { member = await interaction.guild.members.fetch(target.id); } catch { /* Không trong server */ }

  if (member) {
    if (!member.bannable)
      return interaction.editReply('❌ Bot không đủ quyền hoặc vị trí role để ban thành viên này.');
    if (interaction.user.id !== interaction.guild.ownerId && interaction.member.roles.highest.comparePositionTo(member.roles.highest) <= 0)
      return interaction.editReply('❌ Role của bạn không cao hơn thành viên cần ban.');
  }

  try {
    await interaction.guild.members.ban(target.id, {
      deleteMessageSeconds: delDays * 86400,
      reason: `[${interaction.user.tag}] ${reason}`,
    });
  } catch (error) {
    return interaction.editReply(`❌ Không ban được: ${error.message}`);
  }

  await sendModLog(interaction.guild, {
    action: 'ban',
    target,
    mod: interaction.user,
    reason,
  });

  const watchResult = await handleStaffAction(interaction.guild, interaction.user.id, 'ban', target.id);
  if (watchResult?.triggered) {
    return interaction.editReply(
      `🔨 Đã ban **${target.tag || target.username}**. Lý do: ${reason}\n\n` +
      `🚨 **CẢNH BÁO STAFF WATCH:** Bạn đã thực hiện ${watchResult.count}/${watchResult.max} lượt ban trong 24 giờ qua (vượt quá hạn mức cho phép). ` +
      `Toàn bộ role Staff của bạn đã bị tự động xóa để bảo vệ an toàn server!` +
      (watchResult.unbanned ? '\n*(Lệnh ban này đã được tự động hoàn tác theo cài đặt bảo vệ).*' : '')
    );
  }

  return interaction.editReply(`🔨 Đã ban **${target.tag || target.username}**. Lý do: ${reason}`);
};
