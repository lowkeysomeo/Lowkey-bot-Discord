'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { startQuestStream, stopQuestStream, getQuestStreamStatus } = require('./questVoiceHelper');
const { runAutoQuestForToken } = require('./questTokenWorker');

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

function buildTokenModal() {
  const modal = new ModalBuilder()
    .setCustomId('quest:modal_submit')
    .setTitle('🤖 Auto Quest 100% Bằng Token');

  const tokenInput = new TextInputBuilder()
    .setCustomId('discord_token')
    .setLabel('Discord User Token (Bảo mật 100%)')
    .setPlaceholder('Dán Discord User Token của bạn vào đây (chỉ bạn nhìn thấy)...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(tokenInput));
  return modal;
}

function buildTokenGuidePayload() {
  const embed = new EmbedBuilder()
    .setColor(0x00b0f4)
    .setTitle('🔑 HƯỚNG DẪN LẤY DISCORD USER TOKEN')
    .setDescription(
      'Để hệ thống chạy **tự động 100%** không cần bạn thao tác tay hay mở game, bot cần dùng **User Token** của bạn để gửi yêu cầu hoàn thành nhiệm vụ và nhận thưởng trực tiếp từ Discord:\n\n' +
        '📌 **Cách lấy User Token trong 10 giây (trên Discord Web hoặc Desktop):**\n' +
        '1. Mở Discord trên trình duyệt (hoặc Discord Desktop có bật DevTools).\n' +
        '2. Bấm phím `F12` hoặc tổ hợp phím `Ctrl + Shift + I` (trên Mac: `Cmd + Option + I`).\n' +
        '3. Chuyển sang tab **Network** (Mạng).\n' +
        '4. Gõ chữ `api` hoặc `science` vào ô tìm kiếm (Filter).\n' +
        '5. Bấm vào bất kỳ một dòng yêu cầu nào trong danh sách $\\rightarrow$ Chọn tab **Headers**.\n' +
        '6. Kéo xuống mục **Request Headers**, tìm dòng **`Authorization`**.\n' +
        '7. Sao chép toàn bộ chuỗi ký tự sau chữ `Authorization` (đó chính là User Token của bạn).\n\n' +
        '🔒 **Cam kết bảo mật:**\n' +
        '• Khi bạn nhập qua Modal, nội dung chỉ được gửi trực tiếp và xử lý tức thì, không bị hiển thị ra kênh chat.\n' +
        '• Bot chỉ dùng token để truy vấn danh mục Quest (`/quests/@me`), gửi heartbeat và bấm nhận thưởng (`claim-reward`).'
    )
    .setFooter({ text: 'Lowkey Auto Quest • Không bao giờ chia sẻ token cho người lạ' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('quest:modal')
      .setLabel('Bắt đầu Auto Token ngay')
      .setEmoji('🤖')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('quest:hub')
      .setLabel('Quay lại Menu Chính')
      .setEmoji('↩️')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function buildMainHubPayload(guildId) {
  const status = guildId ? getQuestStreamStatus(guildId) : null;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🔮 TRUNG TÂM AUTO QUEST & SĂN ORB DISCORD')
    .setDescription(
      'Hệ thống hỗ trợ tự động hoàn thành **Nhiệm vụ Discord (Discord Quests)** giúp bạn dễ dàng cày điểm **ORB**, mở khóa Khung Avatar, Hiệu ứng hồ sơ và các phần quà độc quyền mà không cần tải game nặng!\n\n' +
        '✨ **Chọn phương thức hỗ trợ bạn muốn sử dụng:**'
    )
    .addFields(
      {
        name: '🤖 1. Auto 100% Bằng User Token (Không Cần Nhúng Tay)',
        value:
          'Nhập User Token để bot tự động nhận nhiệm vụ, gửi heartbeat hoàn thành 100% tiến độ và claim toàn bộ phần quà/điểm ORB vào tài khoản của bạn ngay lập tức.',
        inline: false,
      },
      {
        name: '⚡ 2. Script Auto Hoàn Thành Quest (Console F12)',
        value:
          'Lấy đoạn mã JavaScript hook Webpack tự động giả lập chơi game và stream. Hoàn thành 100% nhiệm vụ chỉ sau vài giây ngay trên máy tính mà không cần cài game.',
        inline: false,
      },
      {
        name: '🎙️ 3. Trợ Lý Treo Voice Stream (15 Phút)',
        value:
          'Nếu làm nhiệm vụ stream cho bạn bè: Bot sẽ vào phòng Voice làm **Viewer (Người xem)** cho bạn stream màn hình. Đủ 15 phút bot sẽ nhắc bạn nhận thưởng và tự rời phòng.',
        inline: false,
      },
      {
        name: '💎 4. Discord ORB Dùng Để Làm Gì?',
        value:
          'Điểm ORB tích lũy qua các Quest có thể dùng trong **Discord Shop** để mua Khung ảnh đại diện (Avatar Decoration), Hiệu ứng hồ sơ (Profile Effects) và đổi ưu đãi Nitro.',
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

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('quest:modal')
      .setLabel('Auto Token 100%')
      .setEmoji('🤖')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('quest:script')
      .setLabel('Script Console F12')
      .setEmoji('⚡')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('quest:stream')
      .setLabel('Treo Voice 15p')
      .setEmoji('🎙️')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('quest:token_guide')
      .setLabel('Cách lấy Token')
      .setEmoji('🔑')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('quest:leave')
      .setLabel('Rời phòng Voice')
      .setEmoji('🚪')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('quest:info')
      .setLabel('Mẹo & Điểm ORB')
      .setEmoji('ℹ️')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

function buildScriptPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
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
      .setCustomId('quest:modal')
      .setLabel('Auto Token 100%')
      .setEmoji('🤖')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('quest:stream')
      .setLabel('Treo Voice Stream')
      .setEmoji('🎙️')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    content: '```javascript\n' + QUEST_SCRIPT + '\n```',
    embeds: [embed],
    components: [row],
  };
}

function buildInfoPayload() {
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('ℹ️ TÌM HIỂU VỀ DISCORD QUESTS & ĐIỂM ORB')
    .setDescription(
      '**Discord Quests là gì?**\n' +
        'Discord Quests là tính năng nhiệm vụ chính thức từ Discord liên kết cùng các nhà phát hành game (Genshin Impact, Fortnite, League of Legends, Valorant, Honkai, PUBG...). Người dùng hoàn thành nhiệm vụ để nhận phần thưởng.\n\n' +
        '**Điểm ORB là gì?**\n' +
        'ORB là loại điểm thưởng ảo tích lũy được từ việc làm các nhiệm vụ Quest. Bạn có thể mở **Discord Shop** để đổi điểm ORB lấy các vật phẩm trang trí hồ sơ độc quyền:\n' +
        '• Khung hình đại diện (Avatar Decorations)\n' +
        '• Hiệu ứng hồ sơ (Profile Effects)\n' +
        '• Huy hiệu sự kiện hoặc giảm giá Discord Nitro.\n\n' +
        '🛡️ **Các phương thức hỗ trợ của Lowkey Bot:**\n' +
        '1. **Auto 100% bằng User Token:** Nhanh gọn nhất, hoàn toàn tự động nhận quest, gửi heartbeat và claim quà.\n' +
        '2. **Script Console F12:** Hook trực tiếp trên máy của bạn, hoàn thành trong vài giây không cần tải game.\n' +
        '3. **Treo Voice Stream:** An toàn 100%, bot vào làm viewer đếm ngược 15 phút cho bạn.'
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
      .setCustomId('quest:modal')
      .setLabel('Auto Token 100%')
      .setEmoji('🤖')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('quest:token_guide')
      .setLabel('Cách lấy Token')
      .setEmoji('🔑')
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

async function handleButtonInteraction(interaction) {
  const action = interaction.customId.replace('quest:', '');

  if (action === 'modal') {
    return interaction.showModal(buildTokenModal());
  }

  if (action === 'token_guide') {
    const payload = buildTokenGuidePayload();
    return interaction.update({ content: null, ...payload });
  }

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
        content:
          `✅ Bot đã tham gia kênh **${res.channelName}** làm Viewer hỗ trợ bạn!\n` +
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
    return interaction.editReply({
      content: 'ℹ️ Bot hiện không ở trong phòng Voice nào để hỗ trợ quest trong server này.',
    });
  }
}

async function handleModalInteraction(interaction) {
  if (interaction.customId !== 'quest:modal_submit') return;

  await interaction.deferReply({ flags: 64 });
  const token = interaction.fields?.getTextInputValue?.('discord_token')?.trim();

  if (!token) {
    return interaction.editReply({ content: '❌ Token không được để trống.' });
  }

  let lastUpdate = 0;
  const updateProgress = async (text) => {
    const now = Date.now();
    if (now - lastUpdate > 1200) {
      lastUpdate = now;
      await interaction.editReply({ content: text }).catch(() => {});
    }
  };

  try {
    const report = await runAutoQuestForToken(token, {
      heartbeatDelayMs: 1500,
      onProgress: (p) => {
        if (p.step === 'auth' || p.step === 'fetch') {
          updateProgress(`🔄 ${p.message}`);
        } else if (p.step === 'quest_start') {
          updateProgress(`🎮 ${p.message}`);
        } else if (p.step === 'progress') {
          updateProgress(
            `⏳ [${p.index}/${p.total}] **${p.questName}**: Đang hoàn thành (${p.percent}% - ${p.currentSeconds}/${p.targetSeconds}s)...`
          );
        }
      },
    });

    const resultEmbed = new EmbedBuilder()
      .setColor(report.completedCount > 0 ? 0x57f287 : 0x5865f2)
      .setTitle('🎉 KẾT QUẢ AUTO QUEST DISCORD (100% TỰ ĐỘNG)')
      .setDescription(
        `👤 **Tài khoản:** \`${report.accountTag}\`\n` +
          `📋 **Tổng số nhiệm vụ:** **${report.totalQuests}**\n` +
          `✅ **Đã hoàn thành:** **${report.completedCount}/${report.totalQuests}** nhiệm vụ\n` +
          `🎁 **Đã nhận thưởng:** **${report.claimedCount}** phần quà / ORB\n\n` +
          (report.message ? `ℹ️ *${report.message}*\n\n` : '') +
          (report.results.length > 0
            ? '**Chi tiết từng nhiệm vụ:**\n' +
              report.results
                .map((r, i) => {
                  if (r.success) {
                    const state = r.alreadyDone
                      ? 'Đã làm trước đó'
                      : 'Hoàn thành 100% & Đã Claim ORB';
                    return `**${i + 1}. ${r.questName}**: ✅ ${state}`;
                  }
                  return `**${i + 1}. ${r.questName}**: ⚠️ Thất bại (${r.error})`;
                })
                .join('\n')
            : 'Không có nhiệm vụ nào cần thực hiện.')
      )
      .setFooter({ text: 'Lowkey Auto Quest • Kiểm tra Kho quà tặng / Shop Discord để xem ORB' })
      .setTimestamp();

    return interaction.editReply({ content: null, embeds: [resultEmbed] });
  } catch (err) {
    return interaction.editReply({
      content: `❌ **Lỗi thực hiện Auto Quest:** ${err.message}`,
    });
  }
}

module.exports = {
  QUEST_SCRIPT,
  buildTokenModal,
  buildTokenGuidePayload,
  buildMainHubPayload,
  buildScriptPayload,
  buildInfoPayload,
  handleButtonInteraction,
  handleModalInteraction,
};
