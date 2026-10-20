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
        { name: '🤖 Auto 100% bằng User Token (Cả Điện thoại & PC)', value: 'token' },
        { name: '🎮 Cày Huy hiệu Trò chơi đa dạng (Token ngầm)', value: 'variety_start' },
        { name: '⏹️ Dừng cày Huy hiệu Trò chơi đa dạng', value: 'variety_stop' },
        { name: '📊 Xem tiến trình Huy hiệu Trò chơi đa dạng', value: 'variety_status' },
        { name: '⏱️ Cày Huy hiệu Thời gian chơi (Token ngầm 24/7)', value: 'gametime_start' },
        { name: '⏹️ Dừng cày Huy hiệu Thời gian chơi', value: 'gametime_stop' },
        { name: '📊 Xem tiến trình Huy hiệu Thời gian chơi', value: 'gametime_status' },
        { name: '🛡️ Quản lý phê duyệt (Dành cho Admin)', value: 'admin' },
        { name: '🔑 Hướng dẫn lấy Token (iOS, Android & PC)', value: 'token_guide' },
        { name: '⚡ Lấy Script Auto Hoàn Thành Quest (Console)', value: 'script' },
        { name: '🎙️ Mời bot vào Voice làm Viewer (Treo 15p Mobile/PC)', value: 'stream' },
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

    const { executeAutoQuestFlow } = require('../../utils/questManager');
    return executeAutoQuestFlow(interaction, sub.token, userId, interaction.user.username);
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


  if (action === 'variety_start') {
    if (!isApproved(userId) && !isOwner(userId)) {
      return interaction.reply({ flags: 64, ...buildAccessGatePayload(userObj) });
    }
    const { getSubscriber } = require('../../utils/questScheduler');
    const sub = getSubscriber(userId);
    if (!sub || !sub.token) {
      return interaction.reply({
        flags: 64,
        content: '❌ Bạn chưa nạp Token. Dùng `/quest action:token` để nạp token trước nhé!',
      });
    }
    const { startVarietyFarming, isFarmingActive, loadProgress, getTierTitle } = require('../../utils/varietyTokenWorker');
    if (isFarmingActive(userId)) {
      const prog = loadProgress(userId);
      const count = (prog.completed || []).length;
      return interaction.reply({
        flags: 64,
        content: `⚡ Tiến trình cày ngầm đang chạy rồi! **${count}/100 games** - Cấp: **${getTierTitle(count)}**`,
      });
    }
    if (typeof interaction.deferReply === 'function') {
      await interaction.deferReply({ flags: 64 });
    }
    const res = await startVarietyFarming({
      token: sub.token,
      userId,
      durationPerGameMs: 20000,
      targetCount: 100,
      onProgress: null,
      onMilestone: async ({ count, tier }) => {
        try {
          const user = await interaction.client.users.fetch(userId);
          await user.send(`🎉 **Đạt mốc huy hiệu!** Bạn đã chơi **${count}/100** game — Cấp: **${tier.title}**!`);
        } catch (_) {}
      },
      onComplete: async ({ totalGames, tierTitle }) => {
        try {
          const user = await interaction.client.users.fetch(userId);
          await user.send(`🏆 **HOÀN TẤT 100% CÀY HUY HIỆU!**\nĐã ghi nhận **${totalGames}** game — Huy hiệu: **${tierTitle}**!`);
        } catch (_) {}
      },
    });
    if (!res.success) {
      return interaction.editReply({ content: `❌ ${res.message}` });
    }
    const prog2 = loadProgress(userId);
    const count2 = (prog2.completed || []).length;
    return interaction.editReply({
      content:
        `✅ **Đã bắt đầu cày ngầm Huy hiệu Trò chơi đa dạng!**\n` +
        `🎮 Người dùng: **${res.username}**\n` +
        `📊 Tiến trình: **${count2}/100** games | Cấp: **${getTierTitle(count2)}**\n` +
        `💡 Chạy ngầm 24/7 qua Token Gateway. Dùng \`/quest action:variety_stop\` để dừng.`,
    });
  }

  if (action === 'variety_stop') {
    const { stopVarietyFarming, isFarmingActive, loadProgress, getTierTitle } = require('../../utils/varietyTokenWorker');
    if (!isFarmingActive(userId)) {
      return interaction.reply({
        flags: 64,
        content: '⚠️ Hiện không có phiên cày ngầm nào đang chạy trên tài khoản của bạn.',
      });
    }
    stopVarietyFarming(userId);
    const prog = loadProgress(userId);
    const count = (prog.completed || []).length;
    return interaction.reply({
      flags: 64,
      content: `⏹️ **Đã dừng cày ngầm!** Tiến trình đã lưu: **${count}/100** games — Cấp: **${getTierTitle(count)}**`,
    });
  }

  if (action === 'variety_status') {
    const { isFarmingActive, loadProgress, getTierTitle } = require('../../utils/varietyTokenWorker');
    const prog = loadProgress(userId);
    const count = (prog.completed || []).length;
    const isRunning = isFarmingActive(userId);
    const tierTitle = getTierTitle(count);
    const pct = Math.min(100, Math.round((count / 100) * 100));
    const bar = '█'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));
    return interaction.reply({
      flags: 64,
      content:
        `🎮 **Huy hiệu Trò chơi đa dạng — Tiến trình của bạn**\n\n` +
        `${bar} **${pct}%**\n` +
        `📊 Đã hoàn thành: **${count}/100** games\n` +
        `🏅 Cấp hiện tại: **${tierTitle}**\n` +
        `⚡ Trạng thái: **${isRunning ? '🟢 Đang cày ngầm' : '🔴 Không chạy'}**\n\n` +
        `${isRunning ? '💡 Dùng \`/quest action:variety_stop\` để dừng.' : '💡 Dùng \`/quest action:variety_start\` để tiếp tục cày!'}`,
    });
  }


  if (action === 'gametime_start') {
    if (!isApproved(userId) && !isOwner(userId)) {
      return interaction.reply({ flags: 64, ...buildAccessGatePayload(userObj) });
    }
    const { getSubscriber } = require('../../utils/questScheduler');
    const sub = getSubscriber(userId);
    if (!sub || !sub.token) {
      return interaction.reply({
        flags: 64,
        content: '❌ Bạn chưa nạp Token. Dùng `/quest action:token` để nạp token trước nhé!',
      });
    }
    const { startGametimeFarming, isGametimeFarmingActive, loadGametimeProgress, getTierTitle } = require('../../utils/gameTimeWorker');
    if (isGametimeFarmingActive(userId)) {
      const prog = loadGametimeProgress(userId);
      const totalHours = Math.floor((prog.accumulatedSeconds || 0) / 3600);
      return interaction.reply({
        flags: 64,
        content: `⚡ Tiến trình cày giờ chơi đang chạy rồi! **~${totalHours} giờ chơi** — Cấp: **${getTierTitle(totalHours)}**`,
      });
    }
    if (typeof interaction.deferReply === 'function') {
      await interaction.deferReply({ flags: 64 });
    }
    const res = await startGametimeFarming({
      token: sub.token,
      userId,
      onMilestone: async ({ totalHours, tier }) => {
        try {
          const user = await interaction.client.users.fetch(userId);
          await user.send(`🎉 **Đạt mốc Huy hiệu Thời gian chơi!** Bạn đã tích lũy **${totalHours} giờ** — Cấp: **${tier.title}**!`);
        } catch (_) {}
      },
    });
    if (!res.success) {
      return interaction.editReply({ content: `❌ ${res.message}` });
    }
    const prog = loadGametimeProgress(userId);
    const totalHours = Math.floor((prog.accumulatedSeconds || 0) / 3600);
    return interaction.editReply({
      content:
        `✅ **Đã bắt đầu cày ngầm Huy hiệu Thời gian chơi 24/7!**\n` +
        `🎮 Tựa game: **${res.gameName}** | Người dùng: **${res.username}**\n` +
        `⏱️ Giờ chơi đã tích lũy: **~${totalHours}h** | Cấp: **${getTierTitle(totalHours)}**\n` +
        `💡 Bot sẽ giữ kết nối trên Cloud 24/7. Tắt máy vẫn tiếp tục tích lũy giờ. Dùng \`/quest action:gametime_stop\` để dừng.`,
    });
  }

  if (action === 'gametime_stop') {
    const { stopGametimeFarming, isGametimeFarmingActive, loadGametimeProgress, getTierTitle } = require('../../utils/gameTimeWorker');
    if (!isGametimeFarmingActive(userId)) {
      return interaction.reply({
        flags: 64,
        content: '⚠️ Hiện không có phiên cày giờ chơi nào đang chạy trên tài khoản của bạn.',
      });
    }
    stopGametimeFarming(userId);
    const prog = loadGametimeProgress(userId);
    const totalHours = Math.floor((prog.accumulatedSeconds || 0) / 3600);
    return interaction.reply({
      flags: 64,
      content: `⏹️ **Đã dừng cày giờ chơi!** Tiến trình đã lưu: **~${totalHours} giờ** — Cấp: **${getTierTitle(totalHours)}**`,
    });
  }

  if (action === 'gametime_status') {
    const { isGametimeFarmingActive, loadGametimeProgress, getTierTitle, TIERS } = require('../../utils/gameTimeWorker');
    const prog = loadGametimeProgress(userId);
    const isRunning = isGametimeFarmingActive(userId);
    const totalHours = Math.floor((prog.accumulatedSeconds || 0) / 3600);
    const currentTier = getTierTitle(totalHours);
    let nextTier = TIERS.find(t => t.hours > totalHours) || null;
    let pct = 100;
    if (nextTier) {
      pct = Math.min(100, Math.round((totalHours / nextTier.hours) * 100));
    }
    const bar = '█'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));
    return interaction.reply({
      flags: 64,
      content:
        `⏱️ **Huy hiệu Thời gian chơi — Tiến trình của bạn**\n\n` +
        `${bar} **${pct}%**\n` +
        `⏳ Đã tích lũy: **~${totalHours} giờ** chơi\n` +
        `🏅 Cấp hiện tại: **${currentTier}**` + (nextTier ? ` → Mục tiêu: **${nextTier.title} (${nextTier.hours}h)**` : '') + `\n` +
        `⚡ Trạng thái: **${isRunning ? '🟢 Đang cày ngầm 24/7' : '🔴 Không chạy'}**\n\n` +
        `${isRunning ? '💡 Dùng \`/quest action:gametime_stop\` để dừng.' : '💡 Dùng \`/quest action:gametime_start\` để tiếp tục cày!'}`,
    });
  }

  // Default: hub
  const payload = buildMainHubPayload(interaction.guildId, userId);
  return interaction.reply(payload);
};
