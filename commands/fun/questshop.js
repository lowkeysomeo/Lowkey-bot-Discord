'use strict';

const {
  buildShopPanelPayload,
  buildStatusPayload,
  buildAdminConfigModal,
  ensureShopPanel,
  setBankConfig,
  getBankConfig,
  TARGET_CHANNEL_ID,
  OWNER_ID,
} = require('../../utils/questShop');
const { isOwner } = require('../../utils/questAuth');
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
    if (!isOwner(interaction.user.id)) {
      return interaction.reply({
        content: `❌ Lệnh này chỉ dành riêng cho Admin (ID: \`${OWNER_ID}\`)!`,
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
    if (!isOwner(interaction.user.id)) {
      return interaction.reply({
        content: `❌ Lệnh này chỉ dành riêng cho Admin (ID: \`${OWNER_ID}\`)!`,
        flags: 64,
      });
    }
    return interaction.showModal(buildAdminConfigModal());
  }

  if (action === 'orders') {
    if (!isOwner(interaction.user.id)) {
      return interaction.reply({
        content: `❌ Lệnh này chỉ dành riêng cho Admin (ID: \`${OWNER_ID}\`)!`,
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
