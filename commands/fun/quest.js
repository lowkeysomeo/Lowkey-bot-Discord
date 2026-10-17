'use strict';

const {
  buildMainHubPayload,
  buildScriptPayload,
  buildInfoPayload,
  buildTokenModal,
  buildTokenGuidePayload,
} = require('../../utils/questManager');
const { startQuestStream, stopQuestStream } = require('../../utils/questVoiceHelper');

module.exports.data = {
  name: 'quest',
  description: 'Trung tâm Auto Quest & Săn điểm ORB Discord',
  type: 1,
  options: [
    {
      name: 'action',
      description: 'Chọn thao tác bạn muốn thực hiện',
      type: 3,
      required: false,
      choices: [
        { name: '🔮 Bảng điều khiển Quest & ORB (Mặc định)', value: 'hub' },
        { name: '🏪 Cửa hàng Mua Bán Auto Quest & Gói Tháng', value: 'shop' },
        { name: '⏰ Đặt lịch Tự động quét & làm Quest mới', value: 'auto' },
        { name: '🔄 Quét tìm nhiệm vụ mới ngay lập tức', value: 'scan' },
        { name: '🤖 Auto 100% bằng User Token (Mở Modal)', value: 'token' },
        { name: '🛡️ Quản lý phê duyệt (Dành cho Admin)', value: 'admin' },
        { name: '🔑 Hướng dẫn lấy Discord User Token', value: 'token_guide' },
        { name: '⚡ Lấy Script Auto Hoàn Thành Quest (Console)', value: 'script' },
        { name: '🎙️ Mời bot vào Voice làm Viewer (15 phút)', value: 'stream' },
        { name: '🚪 Cho bot rời phòng Voice', value: 'leave' },
        { name: 'ℹ️ Hướng dẫn & Tìm hiểu về Discord ORB', value: 'info' },
      ],
    },
  ],
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

module.exports.execute = async (interaction) => {
  const action = interaction.options?.getString?.('action') || 'hub';
  const { isApproved, isOwner, buildAccessGatePayload, buildAdminListPayload } = require('../../utils/questAuth');

  if (action === 'admin') {
    if (!isOwner(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Lệnh này chỉ dành riêng cho Admin (ID: 604729446649298963)!',
        flags: 64,
      });
    }
    return interaction.reply({ flags: 64, ...buildAdminListPayload() });
  }

  if (action === 'shop') {
    const { buildShopPanelPayload } = require('../../utils/questShop');
    return interaction.reply({ flags: 64, ...buildShopPanelPayload() });
  }

  if (action === 'auto') {
    if (!isApproved(interaction.user.id)) {
      return interaction.reply({ flags: 64, ...buildAccessGatePayload(interaction.user) });
    }
    const { buildAutoStatusPayload } = require('../../utils/questScheduler');
    return interaction.reply({ flags: 64, ...buildAutoStatusPayload(interaction.user.id) });
  }

  if (action === 'scan') {
    if (!isApproved(interaction.user.id)) {
      return interaction.reply({ flags: 64, ...buildAccessGatePayload(interaction.user) });
    }
    if (typeof interaction.deferReply === 'function') {
      await interaction.deferReply({ flags: 64 });
    }
    const { getSubscriber, scanUserQuests, buildAutoStatusPayload } = require('../../utils/questScheduler');
    const sub = getSubscriber(interaction.user.id);
    if (!sub) {
      return interaction.editReply({
        content: '⚠️ Bạn chưa nạp Token vào hệ thống bot. Hãy dùng lệnh `/quest action:token` để nạp token và kích hoạt nhé!',
      });
    }
    const res = await scanUserQuests(sub, interaction.client);
    if (res.actions?.length > 0) {
      return interaction.editReply({
        content: `🎉 Đã quét xong: Tự động xử lý thành công **${res.actions.length}** nhiệm vụ! Kiểm tra DM để xem chi tiết.`,
        ...buildAutoStatusPayload(interaction.user.id),
      });
    }
    return interaction.editReply({
      content: '✅ Đã quét xong: Hiện tại không có nhiệm vụ mới nào trên tài khoản của bạn.',
      ...buildAutoStatusPayload(interaction.user.id),
    });
  }

  if (action === 'token') {
    if (!isApproved(interaction.user.id)) {
      return interaction.reply({ flags: 64, ...buildAccessGatePayload(interaction.user) });
    }
    if (typeof interaction.showModal === 'function') {
      return interaction.showModal(buildTokenModal());
    }
    const payload = buildTokenGuidePayload();
    return interaction.reply({ flags: 64, ...payload });
  }

  if (action === 'token_guide') {
    const payload = buildTokenGuidePayload();
    return interaction.reply({ flags: 64, ...payload });
  }

  if (action === 'script') {
    const payload = buildScriptPayload();
    return interaction.reply(payload);
  }

  if (action === 'info') {
    const payload = buildInfoPayload();
    return interaction.reply(payload);
  }

  if (action === 'stream') {
    if (typeof interaction.deferReply === 'function') {
      await interaction.deferReply({ flags: 64 });
    }
    try {
      const res = await startQuestStream(interaction.member, interaction.channel);
      const replyFn =
        typeof interaction.editReply === 'function'
          ? interaction.editReply.bind(interaction)
          : interaction.reply.bind(interaction);
      if (res.alreadyRunning) {
        return replyFn({ content: `ℹ️ ${res.message}` });
      }
      return replyFn({
        content:
          `✅ Bot đã tham gia kênh **${res.channelName}** làm Viewer hỗ trợ bạn!\n` +
          `• Hãy bắt đầu **Chia sẻ màn hình (Stream)** trong kênh này.\n` +
          `• Bot sẽ giữ kết nối trong **15 phút**, gửi thông báo chúc mừng kèm tag bạn khi hoàn thành và tự động rời phòng.\n` +
          `• Nếu xong sớm, bạn có thể bấm **Rời phòng Voice** bất cứ lúc nào!`,
      });
    } catch (err) {
      const replyFn =
        typeof interaction.editReply === 'function'
          ? interaction.editReply.bind(interaction)
          : interaction.reply.bind(interaction);
      return replyFn({ content: `❌ ${err.message}` });
    }
  }

  if (action === 'leave') {
    if (typeof interaction.deferReply === 'function') {
      await interaction.deferReply({ flags: 64 });
    }
    const stopped = stopQuestStream(interaction.guildId, 'Người dùng yêu cầu rời phòng');
    const replyFn =
      typeof interaction.editReply === 'function'
        ? interaction.editReply.bind(interaction)
        : interaction.reply.bind(interaction);
    if (stopped) {
      return replyFn({ content: '✅ Bot đã ngắt kết nối và rời phòng Voice theo yêu cầu!' });
    }
    return replyFn({
      content: 'ℹ️ Bot hiện không ở trong phòng Voice nào để hỗ trợ quest trong server này.',
    });
  }

  // Default: hub
  const payload = buildMainHubPayload(interaction.guildId, interaction.user.id);
  return interaction.reply(payload);
};
