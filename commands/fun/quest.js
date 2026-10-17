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
        { name: '🤖 Auto 100% bằng User Token (Mở Modal)', value: 'token' },
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

  if (action === 'token') {
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
  const payload = buildMainHubPayload(interaction.guildId);
  return interaction.reply(payload);
};
