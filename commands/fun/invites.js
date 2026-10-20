const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { count, setInviter } = require('../../utils/inviteSystem');
const { getOptions } = require('../../utils/customization');

module.exports = {
  data: new SlashCommandBuilder().setName('invites').setDescription('Xem hoặc quản lý số thành viên đã mời thành công')
    .addUserOption(option => option.setName('user').setDescription('Thành viên muốn xem'))
    .addUserOption(option => option.setName('thanh_vien_moi').setDescription('[Admin] Thành viên mới vào (cần gán người mời)'))
    .addUserOption(option => option.setName('nguoi_moi').setDescription('[Admin] Người đã mời thành viên mới này')),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: 'Dùng lệnh này trong server.', flags: 64 });
    // Lệnh xem lượt mời chỉ dùng tại kênh invite đã chọn trên dashboard.
    const channelId = getOptions(interaction.guildId).inviteChannel;
    if (!channelId) return interaction.reply({ content: 'Server chưa chọn kênh invite. Nhờ admin cấu hình tại Dashboard → Lời mời & Role nhé!', flags: 64, allowedMentions: { parse: [] } });
    if (interaction.channelId !== channelId) return interaction.reply({ content: 'Bạn vui lòng dùng lệnh /invites tại <#' + channelId + '> để kiểm tra lượt mời nhé!', flags: 64, allowedMentions: { parse: [] } });

    const thanhVienMoi = interaction.options.getUser('thanh_vien_moi');
    const nguoiMoi = interaction.options.getUser('nguoi_moi');

    if (thanhVienMoi && nguoiMoi) {
      const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
                      interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
      if (!isAdmin) {
        return interaction.reply({
          content: 'Chỉ Administrator hoặc Quản lý server mới có quyền gán thủ công người mời.',
          flags: 64,
        });
      }
      if (thanhVienMoi.id === nguoiMoi.id) {
        return interaction.reply({ content: 'Thành viên mới và người mời không thể là cùng một người!', flags: 64 });
      }
      if (thanhVienMoi.bot || nguoiMoi.bot) {
        return interaction.reply({ content: 'Không thể tính lượt mời cho bot.', flags: 64 });
      }

      try {
        const total = await setInviter(interaction.guild, thanhVienMoi.id, nguoiMoi.id);
        return interaction.reply({
          content: `✅ Đã gán thành công: <@${thanhVienMoi.id}> được mời bởi <@${nguoiMoi.id}>!\n💌 Tổng lượt mời hợp lệ của <@${nguoiMoi.id}> hiện tại là: **${total} thành viên**.`,
        });
      } catch (err) {
        return interaction.reply({ content: `Có lỗi khi gán người mời: ${err.message}`, flags: 64 });
      }
    }

    const user = interaction.options.getUser('user') || interaction.user;
    const total = count(interaction.guildId, user.id);
    return interaction.reply({
      content: '💌 <@' + user.id + '> đã mời **' + total + ' thành viên mới** được bot ghi nhận.\n🏅 ' +
        (total >= 100 ? 'Đã đạt mốc 100 lượt mời!' : total >= 50 ? 'Đã đạt mốc 50; còn ' + (100 - total) + ' lượt đến mốc 100.' : 'Còn ' + (50 - total) + ' lượt đến mốc 50.') +
        '\nMỗi thành viên chỉ tính một lần, kể từ khi bật theo dõi. Role được cấp theo cấu hình của server.',
      flags: 64,
      allowedMentions: { parse: [] }
    });
  },
};
