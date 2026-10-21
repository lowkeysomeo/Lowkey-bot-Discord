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
        { name: '🚀 Cày Huy hiệu Stream (Token ngầm 24/7 Cloud)', value: 'stream_token_start' },
        { name: '🎙️ Mời bot vào Voice làm Viewer (Treo Stream)', value: 'stream_viewer_start' },
        { name: '📺 Cày Huy hiệu Stream (Tự động thông minh)', value: 'stream_start' },
        { name: '⏹️ Dừng cày Huy hiệu Stream', value: 'stream_stop' },
        { name: '📊 Xem tiến trình Huy hiệu Stream', value: 'stream_status' },
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

    // Tự động tạm dừng cày Thời gian chơi nếu đang chạy để tránh xung đột Presence
    const { isGametimeFarmingActive, stopGametimeFarming } = require('../../utils/gameTimeWorker');
    let autoPausedGametime = false;
    if (isGametimeFarmingActive(userId)) {
      stopGametimeFarming(userId);
      autoPausedGametime = true;
    }

    if (typeof interaction.deferReply === 'function') {
      await interaction.deferReply({ flags: 64 });
    }
    const res = await startVarietyFarming({
      token: sub.token,
      userId,
      durationPerGameMs: 360000, // 6 phút/game chuẩn Discord Telemetry
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
    const pauseNote = autoPausedGametime
      ? `\n*(ℹ️ Đã tự động tạm dừng cày Thời gian chơi để chuyển sang cày 100 game Đa dạng — tránh gửi 2 game xung đột lên Discord)*`
      : '';
    return interaction.editReply({
      content:
        `✅ **Đã bắt đầu cày ngầm Huy hiệu Trò chơi đa dạng!**\n` +
        `🎮 Người dùng: **${res.username}**\n` +
        `📊 Tiến trình: **${count2}/100** games | Cấp: **${getTierTitle(count2)}**\n` +
        `💡 Chạy ngầm 24/7 qua Token Gateway. Dùng \`/quest action:variety_stop\` để dừng.` +
        pauseNote,
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

    // Tự động tạm dừng cày Trò chơi đa dạng nếu đang chạy để tránh xung đột Presence
    const { isFarmingActive: isVarietyActive, stopVarietyFarming } = require('../../utils/varietyTokenWorker');
    let autoPausedVariety = false;
    if (isVarietyActive(userId)) {
      stopVarietyFarming(userId);
      autoPausedVariety = true;
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
    const pauseNote = autoPausedVariety
      ? `\n*(ℹ️ Đã tự động tạm dừng cày Trò chơi đa dạng để chuyển sang cày Thời gian chơi 24/7)*`
      : '';
    return interaction.editReply({
      content:
        `✅ **Đã bắt đầu cày ngầm Huy hiệu Thời gian chơi 24/7!**\n` +
        `🎮 Tựa game: **${res.gameName}** | Người dùng: **${res.username}**\n` +
        `⏱️ Giờ chơi đã tích lũy: **~${totalHours}h** | Cấp: **${getTierTitle(totalHours)}**\n` +
        `💡 Bot sẽ giữ kết nối trên Cloud 24/7. Tắt máy vẫn tiếp tục tích lũy giờ. Dùng \`/quest action:gametime_stop\` để dừng.` +
        pauseNote,
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

  if (action === 'stream_status') {
    const { buildStreamStatusPayload } = require('../../utils/streamTimeWorker');
    const payload = buildStreamStatusPayload(userId, userObj.tag);
    return interaction.reply({ flags: 64, ...payload });
  }

  if (action === 'stream_token_start') {
    if (!isApproved(userId) && !isOwner(userId)) {
      return interaction.reply({ flags: 64, ...buildAccessGatePayload(userObj) });
    }

    const { getSubscriber } = require('../../utils/questScheduler');
    const sub = getSubscriber(userId);
    if (!sub || !sub.token) {
      return interaction.reply({
        flags: 64,
        content:
          '❌ Bạn chưa nạp Token Discord vào hệ thống!\n\n' +
          '👉 Hãy dùng lệnh `/quest action:token` hoặc bấm nút **Auto Token 100%** trên Menu chính để nạp token trước nhé.',
      });
    }

    const {
      startTokenStreamFarming,
      isStreamFarmingActive,
      loadStreamProgress,
      getTierTitle,
    } = require('../../utils/streamTimeWorker');

    if (isStreamFarmingActive(userId)) {
      const prog = loadStreamProgress(userId);
      const totalHours = Math.floor(((prog.accumulatedSeconds || 0) + (prog.currentSessionSeconds || 0)) / 3600);
      return interaction.reply({
        flags: 64,
        content: `⚡ Bạn đã có phiên cày stream đang chạy rồi! **~${totalHours} giờ** — Cấp: **${getTierTitle(totalHours)}**\n💡 Dùng \`/quest action:stream_stop\` khi muốn dừng.`,
      });
    }

    const member = interaction.member;
    let targetChannel = member?.voice?.channel || null;

    if (!targetChannel && interaction.guild) {
      targetChannel = interaction.guild.channels?.cache?.find(
        (c) => c.isVoiceBased?.() && c.permissionsFor?.(interaction.client.user)?.has?.('Connect')
      );
    }

    if (!targetChannel) {
      return interaction.reply({
        flags: 64,
        content:
          '❌ Không tìm thấy kênh Voice nào trong server để bot và tài khoản của bạn vào stream!\n' +
          '👉 Hãy tạo hoặc vào một kênh Voice bất kỳ rồi thử lại nhé.',
      });
    }

    if (typeof interaction.deferReply === 'function') {
      await interaction.deferReply({ flags: 64 });
    }

    try {
      const res = await startTokenStreamFarming({
        token: sub.token,
        userId,
        guildId: targetChannel.guild.id,
        channelId: targetChannel.id,
        botClient: interaction.client,
        onMilestone: async ({ totalHours, tier }) => {
          try {
            const user = await interaction.client.users.fetch(userId);
            await user.send(`🎉 **Đạt mốc Huy hiệu Stream!** Bạn đã tích lũy **${totalHours} giờ** — Cấp: **${tier.title}**!`);
          } catch (_) {}
        },
      });

      if (!res.success) {
        return interaction.editReply({ content: `❌ Không thể bắt đầu cày stream: ${res.message}` });
      }

      const prog = loadStreamProgress(userId);
      const totalHours = Math.floor((prog.accumulatedSeconds || 0) / 3600);

      return interaction.editReply({
        content:
          `🚀 **ĐÃ KÍCH HOẠT CÀY NGẦM HUY HIỆU STREAM 24/7 BẰNG TOKEN TRÊN CLOUD!**\n\n` +
          `👤 Tài khoản: **${res.username}**\n` +
          `📺 Kênh Voice: **${targetChannel.name}**\n` +
          `⏱️ Giờ đã stream: **~${totalHours}h** | Cấp: **${getTierTitle(totalHours)}**\n` +
          `🤖 **Trạng thái:** Bot Lowkey đã vào phòng làm **Khán giả (Viewer)** để Discord xác nhận có người xem stream 24/7!\n\n` +
          `✨ **Ưu điểm:** Bạn có thể **tắt máy tính, tắt điện thoại** mà hệ thống vẫn tự động stream và tích lũy giờ liên tục.\n` +
          `💡 Dùng \`/quest action:stream_stop\` khi muốn dừng.`,
      });
    } catch (err) {
      return interaction.editReply({ content: `❌ Lỗi khi khởi động cày stream: ${err.message}` });
    }
  }

  if (action === 'stream_viewer_start') {
    if (!isApproved(userId) && !isOwner(userId)) {
      return interaction.reply({ flags: 64, ...buildAccessGatePayload(userObj) });
    }

    const {
      startViewerStreamFarming,
      isStreamFarmingActive,
      loadStreamProgress,
      getTierTitle,
    } = require('../../utils/streamTimeWorker');

    if (isStreamFarmingActive(userId)) {
      const prog = loadStreamProgress(userId);
      const totalHours = Math.floor(((prog.accumulatedSeconds || 0) + (prog.currentSessionSeconds || 0)) / 3600);
      return interaction.reply({
        flags: 64,
        content: `⚡ Phiên cày stream của bạn đang chạy rồi! **~${totalHours} giờ** — Cấp: **${getTierTitle(totalHours)}**`,
      });
    }

    const member = interaction.member;
    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({
        flags: 64,
        content:
          '❌ Bạn cần tham gia vào một kênh Voice trước khi gọi Bot vào làm Viewer!\n' +
          '👉 Hãy vào phòng Voice và gõ lại lệnh `/quest action:stream_viewer_start` nhé.',
      });
    }

    if (typeof interaction.deferReply === 'function') {
      await interaction.deferReply({ flags: 64 });
    }

    try {
      const res = await startViewerStreamFarming(member, interaction.channel, {
        onMilestone: async ({ totalHours, tier }) => {
          try {
            const user = await interaction.client.users.fetch(userId);
            await user.send(`🎉 **Đạt mốc Huy hiệu Stream!** Bạn đã tích lũy **${totalHours} giờ** — Cấp: **${tier.title}**!`);
          } catch (_) {}
        },
      });

      const prog = loadStreamProgress(userId);
      const totalHours = Math.floor((prog.accumulatedSeconds || 0) / 3600);

      return interaction.editReply({
        content:
          `✅ **Đã bật chế độ Trợ lý Khán giả (Viewer) 24/7!**\n` +
          `📺 Kênh Voice: **${voiceChannel.name}**\n` +
          `⏱️ Giờ đã stream: **~${totalHours}h** | Cấp: **${getTierTitle(totalHours)}**\n\n` +
          `👉 **Bước tiếp theo:** Hãy bật **Chia sẻ màn hình (Stream)** bất kỳ cửa sổ/game nào trong kênh Voice. Bot sẽ luôn ở lại làm Viewer đếm giờ tích lũy cho bạn!\n` +
          `💡 Dùng \`/quest action:stream_stop\` khi muốn dừng.`,
      });
    } catch (err) {
      return interaction.editReply({ content: `❌ Lỗi khi tham gia kênh Voice: ${err.message}` });
    }
  }

  if (action === 'stream_start') {
    if (!isApproved(userId) && !isOwner(userId)) {
      return interaction.reply({ flags: 64, ...buildAccessGatePayload(userObj) });
    }

    const { getSubscriber } = require('../../utils/questScheduler');
    const sub = getSubscriber(userId);

    // Nếu người dùng có Token, ưu tiên chạy Cày ngầm bằng Token 24/7 (tắt máy vẫn stream)
    if (sub && sub.token) {
      const {
        startTokenStreamFarming,
        isStreamFarmingActive,
        loadStreamProgress,
        getTierTitle,
      } = require('../../utils/streamTimeWorker');

      if (isStreamFarmingActive(userId)) {
        const prog = loadStreamProgress(userId);
        const totalHours = Math.floor(((prog.accumulatedSeconds || 0) + (prog.currentSessionSeconds || 0)) / 3600);
        return interaction.reply({
          flags: 64,
          content: `⚡ Tiến trình cày Huy hiệu Stream đang chạy rồi! **~${totalHours} giờ** — Cấp: **${getTierTitle(totalHours)}**`,
        });
      }

      const member = interaction.member;
      let targetChannel = member?.voice?.channel || null;
      if (!targetChannel && interaction.guild) {
        targetChannel = interaction.guild.channels?.cache?.find(
          (c) => c.isVoiceBased?.() && c.permissionsFor?.(interaction.client.user)?.has?.('Connect')
        );
      }

      if (targetChannel) {
        if (typeof interaction.deferReply === 'function') {
          await interaction.deferReply({ flags: 64 });
        }
        const res = await startTokenStreamFarming({
          token: sub.token,
          userId,
          guildId: targetChannel.guild.id,
          channelId: targetChannel.id,
          botClient: interaction.client,
          onMilestone: async ({ totalHours, tier }) => {
            try {
              const user = await interaction.client.users.fetch(userId);
              await user.send(`🎉 **Đạt mốc Huy hiệu Stream!** Bạn đã tích lũy **${totalHours} giờ** — Cấp: **${tier.title}**!`);
            } catch (_) {}
          },
        });

        if (!res.success) {
          return interaction.editReply({ content: `❌ ${res.message}` });
        }

        const prog = loadStreamProgress(userId);
        const totalHours = Math.floor((prog.accumulatedSeconds || 0) / 3600);

        return interaction.editReply({
          content:
            `🚀 **Đã kích hoạt cày ngầm Huy hiệu Stream bằng Token 24/7 trên Cloud!**\n` +
            `📺 Kênh: **${targetChannel.name}** | Người dùng: **${res.username}**\n` +
            `⏱️ Đã tích lũy: **~${totalHours}h** | Cấp: **${getTierTitle(totalHours)}**\n` +
            `💡 Bot sẽ giữ stream ngầm liên tục kèm bot viewer mà bạn không cần mở Discord hay bật máy.\n` +
            `💡 Dùng \`/quest action:stream_stop\` để dừng.`,
        });
      }
    }

    // Nếu không có Token nhưng đang ở trong Voice -> Bật chế độ Viewer Bot
    const member = interaction.member;
    const voiceChannel = member?.voice?.channel;
    if (voiceChannel) {
      if (typeof interaction.deferReply === 'function') {
        await interaction.deferReply({ flags: 64 });
      }
      const {
        startViewerStreamFarming,
        loadStreamProgress,
        getTierTitle,
      } = require('../../utils/streamTimeWorker');
      try {
        await startViewerStreamFarming(member, interaction.channel, {
          onMilestone: async ({ totalHours, tier }) => {
            try {
              const user = await interaction.client.users.fetch(userId);
              await user.send(`🎉 **Đạt mốc Huy hiệu Stream!** Bạn đã tích lũy **${totalHours} giờ** — Cấp: **${tier.title}**!`);
            } catch (_) {}
          },
        });
        const prog = loadStreamProgress(userId);
        const totalHours = Math.floor((prog.accumulatedSeconds || 0) / 3600);
        return interaction.editReply({
          content:
            `✅ **Đã bật chế độ Trợ lý Khán giả (Viewer) 24/7!**\n` +
            `📺 Kênh Voice: **${voiceChannel.name}**\n` +
            `⏱️ Giờ đã stream: **~${totalHours}h** | Cấp: **${getTierTitle(totalHours)}**\n\n` +
            `👉 **Hướng dẫn:** Hãy bật **Chia sẻ màn hình (Stream)** bất kỳ cửa sổ/game nào trong kênh Voice. Bot sẽ luôn ở lại làm Viewer đếm giờ tích lũy cho bạn!\n` +
            `💡 Dùng \`/quest action:stream_stop\` khi muốn dừng.`,
        });
      } catch (err) {
        return interaction.editReply({ content: `❌ Lỗi khi tham gia kênh Voice: ${err.message}` });
      }
    }

    // Nếu chưa vào Voice và chưa có Token
    return interaction.reply({
      flags: 64,
      content:
        `📺 **Cày Huy hiệu Stream (Phát trực tiếp cho người khác)**\n\n` +
        `Bạn có thể cày theo 2 phương thức cực kỳ tiện lợi:\n` +
        `1️⃣ **Phương thức 1: Cày ngầm bằng Token 24/7 (Khuyên dùng - Tắt máy vẫn cày)**\n` +
        `• Dùng lệnh \`/quest action:token\` để nạp Token Discord.\n` +
        `• Sau đó gõ \`/quest action:stream_token_start\` -> Bot sẽ tự động stream ngầm trên máy chủ đám mây cả ngày lẫn đêm mà bạn không cần mở máy hay treo app!\n\n` +
        `2️⃣ **Phương thức 2: Trợ lý Khán giả Voice (Không cần Token)**\n` +
        `• Hãy tham gia vào một **kênh Voice** bất kỳ trong server này.\n` +
        `• Sau đó gõ lệnh \`/quest action:stream_viewer_start\` -> Bot sẽ vào làm **Khán giả (Viewer)** 24/7 xem bạn Stream màn hình.`,
    });
  }

  if (action === 'stream_stop') {
    const { stopStreamFarming, isStreamFarmingActive, loadStreamProgress, getTierTitle } = require('../../utils/streamTimeWorker');
    if (!isStreamFarmingActive(userId)) {
      return interaction.reply({
        flags: 64,
        content: '⚠️ Hiện không có phiên cày stream nào đang chạy trên tài khoản của bạn.',
      });
    }
    stopStreamFarming(userId, 'Người dùng yêu cầu dừng');
    const prog = loadStreamProgress(userId);
    const totalHours = Math.floor((prog.accumulatedSeconds || 0) / 3600);
    return interaction.reply({
      flags: 64,
      content: `⏹️ **Đã dừng cày Huy hiệu Stream!**\n⏳ Tổng giờ stream đã lưu: **~${totalHours} giờ** — Cấp: **${getTierTitle(totalHours)}**`,
    });
  }

  // Default: hub
  const payload = buildMainHubPayload(interaction.guildId, userId);
  return interaction.reply(payload);
};
