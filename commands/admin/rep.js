const { SlashCommandBuilder } = require('discord.js');
const { sendReplyToShop } = require('../../utils/shopOrderReply');

module.exports.data = new SlashCommandBuilder()
  .setName('rep')
  .setDescription('Trả lời tin nhắn khách hàng trên website VietNam Legacy Store')
  .setDMPermission(false)
  .addStringOption(option =>
    option
      .setName('don_hang')
      .setDescription('Mã đơn hàng (ví dụ: VNL-4E1AC7B7 hoặc 4E1AC7B7)')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('tin_nhan')
      .setDescription('Nội dung tin nhắn gửi khách hàng')
      .setRequired(true)
  );

module.exports.execute = async interaction => {
  const orderId = interaction.options.getString('don_hang', true).trim().toUpperCase();
  const replyText = interaction.options.getString('tin_nhan', true).trim();

  await interaction.deferReply({ ephemeral: false });

  const authorName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
  const authorId = interaction.user.id;

  try {
    const { ok, data } = await sendReplyToShop({
      authorId,
      authorName,
      orderId,
      replyText,
    });

    if (ok && data?.success) {
      await interaction.editReply({
        content: `✅ **[${data.senderName || 'Shop'}]** Đã chuyển tin nhắn của bạn tới khách hàng trên đơn \`${data.order?.id || orderId}\`:\n> ${replyText}`,
      });
    } else {
      await interaction.editReply({
        content: `⚠️ **Không thể gửi phản hồi:** ${data?.message || data?.error || 'Lỗi xử lý từ hệ thống website shop.'}`,
      });
    }
  } catch (err) {
    await interaction.editReply({
      content: `❌ **Lỗi kết nối website shop:** ${err.message}`,
    });
  }
};
