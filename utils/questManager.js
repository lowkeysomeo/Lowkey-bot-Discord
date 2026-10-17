'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { startQuestStream, stopQuestStream, getQuestStreamStatus } = require('./questVoiceHelper');

const QUEST_SCRIPT = `delete window.$;
let wpRequire = webpackChunkdiscord_app.push([[Symbol()], {}, r => r]);
webpackChunkdiscord_app.pop();

let ApplicationStreamingStore = Object.values(wpRequire.c).find(x => x?.exports?.A?.__proto__?.getStreamerActiveStreamMetadata)?.exports?.A || Object.values(wpRequire.c).find(x => x?.exports?.Z?.__proto__?.getStreamerActiveStreamMetadata)?.exports?.Z;
let RunningGameStore = Object.values(wpRequire.c).find(x => x?.exports?.Ay?.getRunningGames)?.exports?.Ay || Object.values(wpRequire.c).find(x => x?.exports?.ZP?.getRunningGames)?.exports?.ZP;
let QuestsStore = Object.values(wpRequire.c).find(x => x?.exports?.A?.__proto__?.getQuest)?.exports?.A || Object.values(wpRequire.c).find(x => x?.exports?.Z?.__proto__?.getQuest)?.exports?.Z;
let FluxDispatcher = Object.values(wpRequire.c).find(x => x?.exports?.Z?.__proto__?.flushWaitQueue)?.exports?.Z;

let quest = [...QuestsStore.quests.values()].find(x => x.userStatus?.enrolledAt && !x.userStatus?.completedAt && new Date(x.config.expiresAt).getTime() > Date.now());

if (!quest) {
  console.log("%c[Lowkey Quest]%c Không tìm thấy nhiệm vụ nào đang nhận dở! Hãy vào Cài đặt -> Quests và bấm 'Accept Quest' trước nhé.", "color: #5865F2; font-weight: bold", "color: #FAA61A");
} else {
  let pid = Math.floor(Math.random() * 30000) + 1000;
  ApplicationStreamingStore.getStreamerActiveStreamMetadata = () => ({
    id: quest.config.applicationId,
    pid,
    sourceName: null
  });
  let secondsNeeded = (quest.config.streamDurationRequirementMinutes || 15) * 60;
  console.log(\`%c[Lowkey Quest]%c Đang tự động hoàn thành: \${quest.config.messages.gameTitle}...\`, "color: #5865F2; font-weight: bold", "color: #57F287");
  let fn = data => {
    let progress = data.userStatus?.streamProgressSeconds || data.userStatus?.completedSeconds || 0;
    console.log(\`%c[Tiến độ]%c \${progress}/\${secondsNeeded}s (\${Math.round((progress/secondsNeeded)*100)}%)\`, "color: #5865F2", "color: #FAA61A");
    if (progress >= secondsNeeded) {
      console.log("%c[HOÀN TẤT]%c Đã hoàn thành 100%! Vào Discord Quests bấm Claim để nhận điểm ORB!", "color: #57F287; font-weight: bold", "color: #FFFFFF");
      FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);
    }
  };
  FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);
  setInterval(() => {
    FluxDispatcher.dispatch({
      type: "RUNNING_GAMES_CHANGE",
      removed: [],
      added: [{ name: quest.config.messages.gameTitle, pid, cmdLine: "", id: quest.config.applicationId, overlay: false, unity: false }]
    });
  }, 10000);
}`;

function buildMainHubPayload(guildId) {
  const status = guildId ? getQuestStreamStatus(guildId) : null;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🔮 TRUNG TÂM AUTO QUEST & SĂN ORB DISCORD')
    .setDescription(
      'Hệ thống hỗ trợ tự động hoàn thành **Nhiệm vụ Discord (Discord Quests)** giúp bạn dễ dàng cày điểm **ORB**, mở khóa Khung Avatar, Hiệu ứng hồ sơ và các phần quà độc quyền mà không cần tải game nặng!\n\n' +
      '✨ **Chọn một trong các phương thức hỗ trợ bên dưới:**'
    )
    .addFields(
      {
        name: '⚡ 1. Script Auto Hoàn Thành Quest (Console)',
        value: 'Lấy đoạn mã JavaScript hook Webpack tự động giả lập chơi game và stream. Hoàn thành 100% nhiệm vụ chỉ sau vài giây ngay trên máy tính mà không cần cài game.',
        inline: false,
      },
      {
        name: '🎙️ 2. Trợ Lý Treo Voice Stream (15 Phút)',
        value: 'Nếu làm nhiệm vụ stream cho bạn bè: Bot sẽ vào phòng Voice làm **Viewer (Người xem)** cho bạn stream màn hình. Đủ 15 phút bot sẽ nhắc bạn nhận thưởng và tự rời phòng.',
        inline: false,
      },
      {
        name: '💎 3. Discord ORB Dùng Để Làm Gì?',
        value: 'Điểm ORB tích lũy qua các Quest có thể dùng trong **Discord Shop** để mua Khung ảnh đại diện (Avatar Decoration), Hiệu ứng hồ sơ (Profile Effects) và đổi ưu đãi Nitro.',
        inline: false,
      }
    );

  if (status) {
    embed.addFields({
      name: '🔴 Trạng thái Treo Voice Hiện Tại',
      value: `Bot đang treo tại phòng <#${status.channelId}> cho <@${status.userId}> (còn khoảng **${status.remainingMinutes} phút**).`,
      inline: false,
    });
  }

  embed.setFooter({ text: 'Lowkey Discord • Auto Quest & Orb Assistant' }).setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('quest:script')
      .setLabel('Lấy Script Auto Quest')
      .setEmoji('⚡')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('quest:stream')
      .setLabel('Treo Voice 15 Phút')
      .setEmoji('🎙️')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('quest:leave')
      .setLabel('Rời phòng Voice')
      .setEmoji('🚪')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('quest:info')
      .setLabel('Hướng dẫn & Lưu ý')
      .setEmoji('ℹ️')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function buildScriptPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle('⚡ MÃ SCRIPT AUTO HOÀN THÀNH DISCORD QUEST (ORB)')
    .setDescription(
      'Làm theo các bước sau để tự động hoàn thành nhiệm vụ Discord chỉ trong vài giây:\n\n' +
      '**Bước 1:** Vào **Cài đặt người dùng (User Settings)** $\\rightarrow$ **Nhiệm vụ (Quests)** $\\rightarrow$ Bấm **Nhận nhiệm vụ (Accept Quest)**.\n' +
      '**Bước 2:** Bấm tổ hợp phím `Ctrl + Shift + I` (trên Windows) hoặc `Cmd + Option + I` (trên Mac) để mở cửa sổ DevTools $\\rightarrow$ Chọn tab **Console**.\n' +
      '*(Nếu Console báo lỗi không cho dán, hãy gõ `allow pasting` rồi bấm Enter)*.\n' +
      '**Bước 3:** Sao chép đoạn mã script trong khung bên dưới, dán vào tab Console và bấm **Enter**.\n' +
      '**Bước 4:** Đợi script chạy đến khi báo `[HOÀN TẤT]`, sau đó quay lại tab Quests bấm **Claim Reward** để nhận điểm ORB!'
    )
    .setFooter({ text: 'Mẹo: Dùng trên Discord Desktop App hoặc Discord Web trên trình duyệt' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('quest:hub')
      .setLabel('Quay lại Menu Chính')
      .setEmoji('↩️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('quest:stream')
      .setLabel('Treo Voice Stream')
      .setEmoji('🎙️')
      .setStyle(ButtonStyle.Success)
  );

  return {
    content: '```javascript\n' + QUEST_SCRIPT + '\n```',
    embeds: [embed],
    components: [row],
  };
}

function buildInfoPayload() {
  const embed = new EmbedBuilder()
    .setColor(0xF1C40F)
    .setTitle('ℹ️ TÌM HIỂU VỀ DISCORD QUESTS & ĐIỂM ORB')
    .setDescription(
      '**Discord Quests là gì?**\n' +
      'Discord Quests là tính năng nhiệm vụ chính thức từ Discord liên kết cùng các nhà phát hành game (Genshin Impact, Fortnite, League of Legends, Valorant, Honkai, PUBG...). Người dùng hoàn thành nhiệm vụ để nhận phần thưởng.\n\n' +
      '**Điểm ORB là gì?**\n' +
      'ORB là loại điểm thưởng ảo tích lũy được từ việc làm các nhiệm vụ Quest. Bạn có thể mở **Discord Shop** để đổi điểm ORB lấy các vật phẩm trang trí hồ sơ độc quyền:\n' +
      '• Khung hình đại diện (Avatar Decorations)\n' +
      '• Hiệu ứng hồ sơ (Profile Effects)\n' +
      '• Huy hiệu sự kiện hoặc giảm giá Discord Nitro.\n\n' +
      '🛡️ **Lưu ý an toàn khi làm Quest:**\n' +
      '• Khi dùng tính năng Treo Voice Stream của bot: Đây là phương thức an toàn 100% tuân thủ mọi quy định của Discord.\n' +
      '• Khi dùng Console Script: Script hook vào bộ nạp Webpack nội bộ của Discord để gửi tiến trình chơi game. Tuy rất tiện lợi, bạn nên chạy từng nhiệm vụ một và không lạm dụng liên tục quá nhiều acc trong thời gian ngắn.'
    )
    .setFooter({ text: 'Lowkey Quest Helper • Bảo vệ tài khoản và tiết kiệm thời gian' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('quest:hub')
      .setLabel('Quay lại Menu Chính')
      .setEmoji('↩️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('quest:script')
      .setLabel('Lấy Script Auto')
      .setEmoji('⚡')
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

async function handleButtonInteraction(interaction) {
  const action = interaction.customId.replace('quest:', '');

  if (action === 'hub') {
    const payload = buildMainHubPayload(interaction.guildId);
    return interaction.update({ content: null, ...payload });
  }

  if (action === 'script') {
    const payload = buildScriptPayload();
    return interaction.update(payload);
  }

  if (action === 'info') {
    const payload = buildInfoPayload();
    return interaction.update({ content: null, ...payload });
  }

  if (action === 'stream') {
    await interaction.deferReply({ flags: 64 });
    try {
      const member = interaction.member;
      const res = await startQuestStream(member, interaction.channel);
      if (res.alreadyRunning) {
        return interaction.editReply({ content: `ℹ️ ${res.message}` });
      }
      return interaction.editReply({
        content: `✅ Bot đã tham gia kênh **${res.channelName}** làm Viewer hỗ trợ bạn!\n` +
          `• Hãy bắt đầu **Chia sẻ màn hình (Stream)** trong kênh này.\n` +
          `• Bot sẽ giữ kết nối trong **15 phút**, gửi thông báo chúc mừng kèm tag bạn khi hoàn thành và tự động rời phòng.\n` +
          `• Nếu xong sớm, bạn có thể bấm **Rời phòng Voice** bất cứ lúc nào!`,
      });
    } catch (err) {
      return interaction.editReply({ content: `❌ ${err.message}` });
    }
  }

  if (action === 'leave') {
    await interaction.deferReply({ flags: 64 });
    const stopped = stopQuestStream(interaction.guildId, 'Người dùng yêu cầu rời phòng');
    if (stopped) {
      return interaction.editReply({ content: '✅ Bot đã ngắt kết nối và rời phòng Voice theo yêu cầu!' });
    }
    return interaction.editReply({ content: 'ℹ️ Bot hiện không ở trong phòng Voice nào để hỗ trợ quest trong server này.' });
  }
}

module.exports = {
  QUEST_SCRIPT,
  buildMainHubPayload,
  buildScriptPayload,
  buildInfoPayload,
  handleButtonInteraction,
};
