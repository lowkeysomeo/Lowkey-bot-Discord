'use strict';

const {
  buildMainHubPayload,
  buildScriptPayload,
  buildInfoPayload,
  buildTokenModal,
  buildSavedTokenPayload,
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
        { name: '🤖 Auto 100% bằng User Token (Đã lưu / Nhập mới)', value: 'token' },
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
  const userId = interaction.user?.id || interaction.member?.id || null;
  const userObj = interaction.user || interaction.member || { id: userId, tag: 'User' };

  if (action === 'admin') {
    if (!isOwner(userId)) {
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
    if (!isApproved(userId)) {
      return interaction.reply({ flags: 64, ...buildAccessGatePayload(userObj) });
    }
    const { buildAutoStatusPayload } = require('../../utils/questScheduler');
    return interaction.reply({ flags: 64, ...buildAutoStatusPayload(userId) });
  }

  if (action === 'scan') {
    if (!isApproved(userId)) {
      return interaction.reply({ flags: 64, ...buildAccessGatePayload(userObj) });
    }
    if (typeof interaction.deferReply === 'function') {
      await interaction.deferReply({ flags: 64 });
    }
    const { getSubscriber, scanUserQuests, buildAutoStatusPayload, isUserJobRunning } = require('../../utils/questScheduler');
    const { fetchQuests, enrollQuest, claimQuestReward, isQuestActive } = require('../../utils/questTokenWorker');
    const sub = getSubscriber(userId);
    if (!sub || !sub.token) {
      return interaction.editReply({
        content: '⚠️ Bạn chưa nạp Token vào hệ thống bot. Hãy dùng lệnh `/quest action:token` để nạp token và kích hoạt nhé!',
      });
    }
    if (sub.enabled === 0) {
      return interaction.editReply({
        content: '⚠️ Token đã lưu của bạn đã hết hạn hoặc không dùng được nữa. Hãy dùng lệnh `/quest action:token` và bấm **Đổi Token Mới** để cập nhật lại nhé!',
      });
    }

    if (isUserJobRunning(userId)) {
      return interaction.editReply({
        content: '⏳ **Tiến trình cày quest ngầm đang chạy trên tài khoản của bạn!**\nBot đang kết nối Gateway và gửi tín hiệu định kỳ. Quà ORB sẽ được gửi qua DM khi hoàn thành!',
        ...buildAutoStatusPayload(userId),
      });
    }

    let allQuests = [];
    try {
      allQuests = await fetchQuests(sub.token);
    } catch (err) {
      return interaction.editReply({
        content: `❌ Không thể kiểm tra nhiệm vụ: ${err.message}`,
      });
    }

    const activeQuests = allQuests.filter(isQuestActive);

    const pendingQuests = activeQuests.filter((q) => !q.user_status?.claimed_at);

    if (pendingQuests.length === 0) {
      return interaction.editReply({
        content: '✅ Đã quét xong: Hiện tại không có nhiệm vụ mới nào trên tài khoản của bạn.',
        ...buildAutoStatusPayload(userId),
      });
    }

    // Tự động enroll trước
    for (const q of pendingQuests) {
      if (!q.user_status?.enrolled_at) {
        try { await enrollQuest(sub.token, q.id); } catch (e) {}
      }
      if (q.user_status?.completed_at && !q.user_status?.claimed_at) {
        try { await claimQuestReward(sub.token, q.id); } catch (e) {}
      }
    }

    // Chạy ngầm trong background
    scanUserQuests(sub, interaction.client).catch((e) => console.error('[SCAN BACKGROUND ERROR]', e));

    return interaction.editReply({
      content: `🚀 **Đã bắt đầu tự động làm ${pendingQuests.length} nhiệm vụ ngầm!**\nBot đang kết nối Gateway và cày tiến độ 24/7. Khi hoàn tất, bot sẽ tự Claim ORB và gửi tin nhắn DM cho bạn.`,
      ...buildAutoStatusPayload(userId),
    });
  }

  if (action === 'token') {
    if (!isApproved(userId)) {
      return interaction.reply({ flags: 64, ...buildAccessGatePayload(userObj) });
    }
    const saved = buildSavedTokenPayload(userId);
    if (saved) {
      return interaction.reply({ flags: 64, ...saved });
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
  const payload = buildMainHubPayload(interaction.guildId, userId);
  return interaction.reply(payload);
};
