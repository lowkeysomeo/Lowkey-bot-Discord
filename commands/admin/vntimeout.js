const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { sendModLog } = require('../../utils/modLog');

module.exports.data = new SlashCommandBuilder()
  .setName('vntimeout')
  .setDescription('Hạn chế (timeout) thành viên trong server')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption(option =>
    option.setName('user').setDescription('Thành viên cần hạn chế').setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName('minutes')
      .setDescription('Thời gian hạn chế tính bằng phút (1 - 40320 phút, mặc định: 10 phút)')
      .setMinValue(1)
      .setMaxValue(40320)
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('reason').setDescription('Lý do hạn chế').setRequired(false)
  );

module.exports.execute = async (interaction) => {
  await interaction.deferReply({ flags: 64 });

  const target = interaction.options.getUser('user', true);
  const minutes = interaction.options.getInteger('minutes') ?? 10;
  const reason = interaction.options.getString('reason') || 'Không có lý do.';

  if (target.id === interaction.user.id)
    return interaction.editReply('❌ Không thể tự hạn chế bản thân.');
  if (target.id === interaction.client.user.id)
    return interaction.editReply('❌ Không thể hạn chế bot.');

  let member;
  try {
    member = await interaction.guild.members.fetch(target.id);
  } catch {
    return interaction.editReply('❌ Thành viên này không có trong server.');
  }

  if (!member.moderatable)
    return interaction.editReply('❌ Bot không đủ quyền hoặc vị trí role để hạn chế thành viên này.');
  if (interaction.user.id !== interaction.guild.ownerId && interaction.member.roles.highest.comparePositionTo(member.roles.highest) <= 0)
    return interaction.editReply('❌ Role của bạn không cao hơn thành viên cần hạn chế.');

  const durationMs = minutes * 60 * 1000;
  try {
    await member.timeout(durationMs, `[${interaction.user.tag}] ${reason}`);
  } catch (error) {
    return interaction.editReply(`❌ Không hạn chế được: ${error.message}`);
  }

  await sendModLog(interaction.guild, {
    action: 'timeout',
    target,
    mod: interaction.user,
    reason,
    duration: durationMs,
  });

  return interaction.editReply(`⏱️ Đã hạn chế **${target.tag || target.username}** trong **${minutes} phút**. Lý do: ${reason}`);
};
