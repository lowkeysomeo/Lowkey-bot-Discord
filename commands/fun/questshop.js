'use strict';

const {
  buildShopPanelPayload,
  buildStatusPayload,
  buildAdminConfigModal,
  ensureShopPanel,
  setBankConfig,
  getBankConfig,
  isShopAdmin,
  TARGET_CHANNEL_ID,
  OWNER_ID,
} = require('../../utils/questShop');
const { getDb } = require('../../utils/database');
const { EmbedBuilder } = require('discord.js');

module.exports.data = {
  name: 'quest-shop',
  description: 'Cửa hàng Auto Quest Discord: Mua lẻ 4.000đ/nv hoặc Gói tháng 40.000đ/tháng',
  type: 1,
  options: [
    {
      name: 'action',
      description: 'Chọn thao tác bạn muốn thực hiện',
      type: 3,
      required: false,
      choices: [
        { name: '🏪 Mở Cửa Hàng Auto Quest (Mặc định)', value: 'panel' },
        { name: '🔍 Kiểm tra Gói cước & Tài khoản của bạn', value: 'status' },
        { name: '📌 Ghim Bảng Cửa Hàng vào kênh chỉ định (Admin)', value: 'setup' },
        { name: '⚙️ Cài đặt Ngân Hàng & SePay (Admin)', value: 'config' },
        { name: '📊 Thống kê Đơn Hàng & Doanh Thu (Admin)', value: 'orders' },
      ],
    },
    {
      name: 'bank_id',
      description: 'Mã ngân hàng nhận tiền (VD: MB, VCB, ACB, TPB, TCB, ICB...)',
      type: 3,
      required: false,
    },
    {
      name: 'bank_account',
      description: 'Số tài khoản nhận tiền',
      type: 3,
      required: false,
    },
    {
      name: 'bank_name',
      description: 'Tên chủ tài khoản (In hoa không dấu, VD: NGUYEN VAN A)',
      type: 3,
      required: false,
    },
    {
      name: 'sepay_key',
      description: 'SePay API Token (Tùy chọn: tự động check tiền)',
      type: 3,
      required: false,
    },
    {
      name: 'channel',
      description: 'Kênh muốn đặt bảng cửa hàng (Dùng khi chọn action: setup)',
      type: 7,
      required: false,
    },
  ],
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

module.exports.execute = async (interaction) => {
  const action = interaction.options?.getString?.('action') || 'panel';

  if (action === 'panel') {
    return interaction.reply({ ...buildShopPanelPayload(), flags: 64 });
  }

  if (action === 'status') {
    await interaction.deferReply({ flags: 64 });
    const payload = await buildStatusPayload(interaction.user.id);
    return interaction.editReply(payload);
  }

  if (action === 'setup') {
    if (!isShopAdmin(interaction.user, interaction.guild)) {
      return interaction.reply({
        content: `❌ Lệnh này chỉ dành riêng cho Admin (ID: \`${OWNER_ID}\`) hoặc Chủ Server!`,
        flags: 64,
      });
    }

    const channelOption = interaction.options?.getChannel?.('channel');
    const targetChannelId = channelOption?.id || TARGET_CHANNEL_ID;

    setBankConfig('channel_id', targetChannelId);
    setBankConfig('panel_message_id', ''); // Reset để gửi mới

    await interaction.deferReply({ flags: 64 });
    const msg = await ensureShopPanel(interaction.client);
    if (msg) {
      return interaction.editReply({
        content: `✅ Đã thiết lập và ghim Bảng Cửa Hàng Auto Quest thành công vào kênh <#${targetChannelId}>!`,
      });
    }
    return interaction.editReply({
      content: `⚠️ Không thể gửi vào kênh <#${targetChannelId}>. Hãy kiểm tra quyền Send Messages của bot trong kênh đó nhé!`,
    });
  }

  if (action === 'config') {
    if (!isShopAdmin(interaction.user, interaction.guild)) {
      return interaction.reply({
        content: `❌ Lệnh này chỉ dành riêng cho Admin (ID: \`${OWNER_ID}\`) hoặc Chủ Server!`,
        flags: 64,
      });
    }

    const bankId = interaction.options?.getString?.('bank_id');
    const bankAccount = interaction.options?.getString?.('bank_account');
    const bankName = interaction.options?.getString?.('bank_name');
    const sepayKey = interaction.options?.getString?.('sepay_key');

    // Nếu người dùng nhập trực tiếp tham số qua lệnh
    if (bankId || bankAccount || bankName || sepayKey) {
      if (bankId) setBankConfig('bank_id', bankId.toUpperCase().trim());
      if (bankAccount) setBankConfig('bank_account', bankAccount.trim());
      if (bankName) setBankConfig('bank_name', bankName.toUpperCase().trim());
      if (sepayKey) setBankConfig('sepay_api_key', sepayKey.trim());

      const current = getBankConfig();
      return interaction.reply({
        content:
          `✅ **Đã cập nhật thông tin ngân hàng thành công!**\n` +
          `• Ngân hàng: **${current.bankId}**\n` +
          `• Số tài khoản: \`${current.bankAccount || '(Chưa nhập)'}\`\n` +
          `• Chủ tài khoản: **${current.bankName || '(Chưa nhập)'}**\n` +
          `• SePay Token: ${current.sepayApiKey ? 'Đã kích hoạt' : 'Chưa nhập'}`,
        flags: 64,
      });
    }

    // Nếu không có tham số, mở Modal để điền
    return interaction.showModal(buildAdminConfigModal());
  }

  if (action === 'orders') {
    if (!isShopAdmin(interaction.user, interaction.guild)) {
      return interaction.reply({
        content: `❌ Lệnh này chỉ dành riêng cho Admin (ID: \`${OWNER_ID}\`) hoặc Chủ Server!`,
        flags: 64,
      });
    }

    const db = getDb();
    const orders = db.prepare('SELECT * FROM quest_orders ORDER BY created_at DESC LIMIT 10').all();
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders
      FROM quest_orders
    `).get();

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('📊 THỐNG KÊ ĐƠN HÀNG & DOANH THU AUTO QUEST')
      .setDescription(
        `• **Tổng doanh thu:** **${Number(stats.total_revenue || 0).toLocaleString('vi-VN')} đ**\n` +
        `• **Đơn thành công:** **${stats.completed_orders || 0}** đơn\n` +
        `• **Đơn đang chờ:** **${stats.pending_orders || 0}** đơn\n\n` +
        `### 🕒 10 ĐƠN HÀNG GẦN NHẤT:\n` +
        (orders.length > 0
          ? orders
              .map(
                (o) =>
                  `• \`[${o.order_id}]\` <@${o.user_id}> | **${Number(o.amount).toLocaleString('vi-VN')} đ** (${o.package_type === 'monthly' ? 'Gói Tháng' : `${o.quest_count} Quest`}) ➔ \`${o.status}\``
              )
              .join('\n')
          : 'Chưa có đơn hàng nào.')
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: 64 });
  }
};
