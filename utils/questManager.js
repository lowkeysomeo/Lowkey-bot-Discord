'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { startQuestStream, stopQuestStream, getQuestStreamStatus } = require('./questVoiceHelper');
const {
  runAutoQuestForToken,
  fetchQuests,
  enrollQuest,
  claimQuestReward,
  isQuestActive,
  getQuestProgressSeconds,
  getQuestTargetSeconds,
} = require('./questTokenWorker');

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'quest_desktop_script.js');
let QUEST_SCRIPT = '';
try {
  QUEST_SCRIPT = fs.readFileSync(SCRIPT_PATH, 'utf8');
} catch (e) {
  console.warn('[QUEST MANAGER] Không thể nạp scripts/quest_desktop_script.js:', e.message);
}

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

function buildSavedTokenPayload(userId) {
  const { getSubscriber } = require('./questScheduler');
  const sub = getSubscriber(userId);
  if (!sub || !sub.token || sub.token.length < 20) return null;

  const maskedToken = sub.token.length > 8 ? `••••••••${sub.token.slice(-4)}` : '••••••••';

  // Trường hợp Token đã hết hạn / không sài được nữa:
  if (sub.enabled === 0) {
    const expiredEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('⚠️ TOKEN ĐÃ LƯU KHÔNG CÒN SỬ DỤNG ĐƯỢC')
      .setDescription(
        `Token đã lưu của bạn (**\`${maskedToken}\`** — \`${sub.username || 'User'}\`) hiện **không thể xác thực** với Discord (lỗi 401 hoặc đã đổi mật khẩu).\n\n` +
        `👉 **Khi nào cần thêm token:** Bạn chỉ cần thêm token mới khi muốn đổi hoặc khi token cũ không còn dùng được nữa.\n\n` +
        `Vui lòng bấm **🔄 Đổi Token Mới** bên dưới để cập nhật lại token mới và tiếp tục sử dụng!`
      )
      .setFooter({ text: 'Lowkey Auto Quest • Token cũ đã ngắt kết nối' })
      .setTimestamp();

    const expiredRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('quest:change_token')
        .setLabel('Đổi Token Mới')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('quest:token_guide')
        .setLabel('Cách Lấy Token')
        .setEmoji('🔑')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('quest:delete_token')
        .setLabel('Xóa Token Cũ')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('quest:hub')
        .setLabel('Về Menu Chính')
        .setEmoji('↩️')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [expiredEmbed], components: [expiredRow] };
  }

  // Trường hợp Token đang hoạt động tốt (được ghi nhớ):
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('⚡ TÀI KHOẢN AUTO QUEST ĐÃ GHI NHỚ')
    .setDescription(
      `Bot đã ghi nhớ Discord User Token của bạn (**\`${maskedToken}\`** — \`${sub.username || 'User'}\`).\n\n` +
      `✅ **Bạn không cần nhập lại token mỗi lần làm quest!** Bot sẽ tự động sử dụng token này.\n\n` +
      `• Bấm **▶️ Chạy Ngay (Token Đã Lưu)** để bot hoàn thành 100% tất cả nhiệm vụ và nhận điểm ORB ngay lập tức.\n` +
      `• Bấm **🔄 Đổi Token Mới** khi bạn muốn đổi sang tài khoản hoặc token khác.\n` +
      `• Bấm **🗑️ Xóa Token** nếu bạn muốn gỡ tài khoản khỏi bot.`
    )
    .setFooter({ text: 'Lowkey Auto Quest • Token được bảo mật và mã hóa trên máy chủ' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('quest:run_saved_token')
      .setLabel('Chạy Ngay (Token Đã Lưu)')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('quest:change_token')
      .setLabel('Đổi Token Mới')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('quest:delete_token')
      .setLabel('Xóa Token')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('quest:hub')
      .setLabel('Về Menu Chính')
      .setEmoji('↩️')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function buildTokenGuidePayload() {
  const embed = new EmbedBuilder()
    .setColor(0x00b0f4)
    .setTitle('🔑 HƯỚNG DẪN LẤY DISCORD USER TOKEN (ĐIỆN THOẠI & MÁY TÍNH)')
    .setDescription(
      'Để hệ thống chạy **tự động 100%** không cần bạn thao tác tay hay mở game, bot cần dùng **User Token** của bạn để gửi yêu cầu hoàn thành tiến độ nhiệm vụ trực tiếp lên Discord:\n\n' +
        '📱 **CÁCH 1: LẤY TOKEN TRÊN ĐIỆN THOẠI (iOS / ANDROID):**\n' +
        '1. Vào **`https://discord.com/login`** (hoặc mở trình duyệt truy cập Discord) và đăng nhập vào tài khoản của bạn.\n' +
        '2. Dán dòng lệnh này vào thanh tìm kiếm (thanh URL trình duyệt) và **thêm chữ `javascript:` vào đầu dòng**:\n' +
        '```javascript\njavascript:(function(){var i=document.createElement("iframe");document.body.appendChild(i);var t=(i.contentWindow.localStorage.token||"").replace(/\'/g,"").replace(/\"/g,"");if(!t){try{let r;(window.webpackChunkdiscord_app||[]).push([[Symbol()],{},(x)=>{if(Object.keys(x?.c||{}).length>Object.keys(r?.c||{}).length)r=x;}]);window.webpackChunkdiscord_app?.pop();for(const m of Object.values(r?.c||{})){const e=m?.exports;if(typeof e?.default?.getToken==="function"){t=e.default.getToken();break;}if(typeof e?.getToken==="function"){t=e.getToken();break;}if(typeof e?.Z?.getToken==="function"){t=e.Z.getToken();break;}}}catch(e){}}prompt("Here is your token",t);})();\n```\n' +
        '3. Bấm **Enter / Đi (Go)** ➔ Bảng thông báo **"Here is your token"** sẽ hiện ra chứa mã Token của bạn.\n' +
        '4. Bấm **Sao chép (Copy)** mã Token ➔ Quay lại Discord bấm nút **Nhập Token** và dán vào bot!\n\n' +
        '💻 **CÁCH 2: LẤY TOKEN TRÊN MÁY TÍNH (PC / LAPTOP):**\n' +
        '1. Mở Discord trên trình duyệt (hoặc Discord Desktop có bật DevTools).\n' +
        '2. Bấm phím `F12` hoặc tổ hợp phím `Ctrl + Shift + I` (trên Mac: `Cmd + Option + I`).\n' +
        '3. Chuyển sang tab **Console** ➔ Dán lệnh sau rồi nhấn **Enter**:\n' +
        '```javascript\nlet token;\nwindow.webpackChunkdiscord_app.push([[Symbol()], {}, o => {\n  for (let e of Object.values(o.c)) {\n    try {\n      if (!e.exports || e.exports === window) continue;\n      if (e.exports?.getToken) {\n        token = e.exports.getToken();\n        console.log("Token:", token);\n      }\n      for (let o in e.exports) {\n        if (e.exports?.[o]?.getToken && "IntlMessagesProxy" !== e.exports[o][Symbol.toStringTag]) {\n          token = e.exports[o].getToken();\n          console.log("Token:", token);\n        }\n      }\n    } catch {}\n  }\n}]);\nwindow.webpackChunkdiscord_app.pop();\n```\n' +
        '4. Sao chép chuỗi Token hiện ra bên dưới (bỏ chữ `Token:` nếu có) và dán vào bot.\n\n' +
        '💡 **Mẹo:** Nếu không muốn lấy Token, bạn có thể vào phòng Voice trên điện thoại và gõ `/quest action:stream` để bot vào làm Viewer treo 15 phút cùng bạn hoàn toàn tự động!'
    )
    .setFooter({ text: 'Lowkey Auto Quest • Hỗ trợ hoàn hảo cả Điện thoại & Máy tính' })
    .setTimestamp();

  return { embeds: [embed], components: [] };
}

function buildMainHubPayload(guildId, userId = null) {
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
        name: '🤖 1. Auto 100% Bằng User Token (Hỗ trợ cả Điện thoại & Máy tính)',
        value:
          'Nhập User Token để bot tự động chạy ngầm 24/7 trên Cloud. Tự nhận nhiệm vụ, kết nối Gateway giả lập (cả Desktop & Mobile) cày đủ 100% thời gian chơi mà bạn không cần mở máy tính hay treo app.',
        inline: false,
      },
      {
        name: '⚡ 2. Script Auto Hoàn Thành Quest (Console F12 Máy Tính)',
        value:
          'Lấy đoạn mã JavaScript hook Webpack tự động giả lập chơi game và stream. Hoàn thành 100% nhiệm vụ chỉ sau vài giây ngay trên máy tính mà không cần cài game.',
        inline: false,
      },
      {
        name: '🎙️ 3. Trợ Lý Treo Voice Stream 15 Phút (Hoàn Hảo Cho Điện Thoại)',
        value:
          'Người dùng điện thoại chỉ cần vào phòng Voice bất kỳ, bấm nút Treo Voice để bot vào làm **Viewer (Người xem)**. Đủ 15 phút bot sẽ nhắc bạn nhận thưởng và tự rời phòng.',
        inline: false,
      },
      {
        name: '💎 4. Discord ORB Dùng Để Làm Gì?',
        value:
          'Điểm ORB tích lũy qua các Quest có thể dùng trong **Discord Shop** để mua Khung ảnh đại diện (Avatar Decoration), Hiệu ứng hồ sơ (Profile Effects) và đổi ưu đãi Nitro.',
        inline: false,
      },
      {
        name: '📺 5. Cày Huy Hiệu Profile Discord (Stream, Giờ Chơi & 100 Game)',
        value:
          '• **Huy hiệu Stream:** Cày 10 cấp từ Người mới (1h), Chim non (5h) đến Xuất thần (5.000h) với bot làm Viewer 24/7!\n' +
          '• **Huy hiệu Giờ chơi:** Cày tích lũy giờ chơi game 24/7 trên Cloud không cần bật máy.\n' +
          '• **Huy hiệu Đa dạng:** Chạy ngầm 100 tựa game khác nhau để mở khóa trọn bộ.',
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
      .setCustomId('quest:auto_menu')
      .setLabel('Đặt Lịch Tự Động')
      .setEmoji('⏰')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('quest:modal')
      .setLabel('Auto Token 100%')
      .setEmoji('🤖')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('quest:script')
      .setLabel('Script Console F12')
      .setEmoji('⚡')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('quest:stream')
      .setLabel('Treo Voice 15p')
      .setEmoji('🎙️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('quest:variety_status')
      .setLabel('Cày Huy hiệu')
      .setEmoji('🎮')
      .setStyle(ButtonStyle.Success)
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
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('quest:gametime_status')
      .setLabel('Cày Giờ chơi')
      .setEmoji('⏱️')
      .setStyle(ButtonStyle.Success)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('quest:stream_status')
      .setLabel('Huy hiệu Stream')
      .setEmoji('📺')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('quest:stream_token_start')
      .setLabel('Cày Stream Token 24/7')
      .setEmoji('🚀')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('quest:stream_viewer_start')
      .setLabel('Bot Làm Viewer Voice')
      .setEmoji('🎙️')
      .setStyle(ButtonStyle.Secondary)
  );

  const { isOwner } = require('./questAuth');
  if (userId && isOwner(userId)) {
    row3.addComponents(
      new ButtonBuilder()
        .setCustomId('quest:admin_list')
        .setLabel('Duyệt Thành Viên')
        .setEmoji('🛡️')
        .setStyle(ButtonStyle.Primary)
    );
  }

  return { embeds: [embed], components: [row1, row2, row3] };
}

function buildScriptPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('⚡ MÃ SCRIPT AUTO HOÀN THÀNH 100% DISCORD QUESTS')
    .setDescription(
      'Hỗ trợ **100% tất cả các loại Quest** (Video, Game PC như Where Winds Meet, Roblox Clean Crew, và Hoạt động Discord như VALORANT Aces):\n\n' +
      '📂 **Cách 1: Dán trực tiếp từ file (Khuyên dùng - 100% không bị CSP chặn)**\n' +
      '1. Tải hoặc mở file **`auto_quest.js`** đính kèm bên dưới tin nhắn này.\n' +
      '2. Mở file bằng Notepad (hoặc xem trực tiếp), bấm **`Ctrl + A`** rồi **`Ctrl + C`** để sao chép toàn bộ mã.\n' +
      '3. Mở Discord trên máy tính ➔ Bấm **`Ctrl + Shift + I`** (hoặc `F12`) ➔ Chọn tab **Console**.\n' +
      '*(Nếu Console có thông báo cấm dán, hãy gõ `allow pasting` rồi bấm Enter)*.\n' +
      '4. Bấm **`Ctrl + V`** dán toàn bộ mã vào rồi bấm **Enter**.\n\n' +
      '⚡ **Cách 2: Chạy 1 Dòng Lệnh Nhanh (Localhost)**\n' +
      'Nếu bạn đang mở Discord trên máy chủ chạy bot:\n' +
      '```javascript\nfetch("http://127.0.0.1:3000/auto_quest.js").then(r=>r.text()).then(eval);\n```\n' +
      '⚠️ *Lưu ý: Không dùng lệnh `fetch` từ link github vì Discord Desktop sẽ chặn theo chính sách bảo mật CSP.*'
    )
    .setFooter({ text: 'Lowkey Quest Helper • Hoàn thành 100% tự động & nhận điểm ORB' })
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

  const file = new AttachmentBuilder(Buffer.from(QUEST_SCRIPT, 'utf-8'), { name: 'auto_quest.js' });

  return {
    content: '⚡ **HƯỚNG DẪN AUTO QUEST (F12 CONSOLE):**\n' +
      '👉 Tải/mở file **`auto_quest.js`** đính kèm bên dưới, bấm `Ctrl + A` ➔ `Ctrl + C` để copy mã, sau đó dán trực tiếp vào Console Discord (F12) rồi bấm Enter!\n' +
      '*(Nếu mở Discord ngay trên máy chủ bot, bạn có thể dán lệnh: `fetch("http://127.0.0.1:3000/auto_quest.js").then(r=>r.text()).then(eval);`)*',
    embeds: [embed],
    components: [row],
    files: [file],
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
  const userObj = interaction.user || interaction.member || {};
  const userId = userObj.id || null;

  if (action === 'modal') {
    const { isApproved, buildAccessGatePayload } = require('./questAuth');
    if (!isApproved(userId)) {
      const gate = buildAccessGatePayload(userObj);
      if (interaction.message?.flags?.has?.(64)) return interaction.update(gate);
      return interaction.reply({ flags: 64, ...gate });
    }
    const saved = buildSavedTokenPayload(userId);
    if (saved) {
      if (interaction.message?.flags?.has?.(64)) return interaction.update(saved);
      return interaction.reply({ flags: 64, ...saved });
    }
    return interaction.showModal(buildTokenModal());
  }

  if (action === 'change_token') {
    return interaction.showModal(buildTokenModal());
  }

  if (action === 'delete_token') {
    try {
      const { getDb } = require('./database');
      getDb().prepare('DELETE FROM quest_subscribers WHERE user_id = ?').run(userId);
      const { isOwner } = require('./questAuth');
      if (isOwner(userId)) {
        const fs = require('node:fs');
        const path = require('node:path');
        const tokenPath = path.join(__dirname, '..', 'data', 'saved_quest_token.txt');
        if (fs.existsSync(tokenPath)) {
          try { fs.unlinkSync(tokenPath); } catch {}
        }
      }
    } catch (e) {}
    const deletedRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('quest:change_token').setLabel('Nhập Token Mới').setEmoji('🔑').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('quest:hub').setLabel('Về Menu Chính').setEmoji('↩️').setStyle(ButtonStyle.Secondary)
    );
    return interaction.update({
      content: '✅ **Đã xóa Token đã lưu của bạn khỏi hệ thống!**\nKhi cần cày quest hoặc thêm token mới, bạn có thể bấm nút bên dưới bất cứ lúc nào.',
      embeds: [],
      components: [deletedRow],
    });
  }

  if (action === 'run_saved_token') {
    const { getSubscriber } = require('./questScheduler');
    const sub = getSubscriber(userId);
    if (!sub || !sub.token || sub.token.length < 20) {
      return interaction.showModal(buildTokenModal());
    }
    if (sub.enabled === 0) {
      const saved = buildSavedTokenPayload(userId);
      if (interaction.message?.flags?.has?.(64)) return interaction.update(saved);
      return interaction.reply({ flags: 64, ...saved });
    }
    if (!interaction.deferred && !interaction.replied) {
      if (typeof interaction.deferUpdate === 'function') {
        await interaction.deferUpdate();
      } else {
        await interaction.deferReply({ flags: 64 });
      }
    }
    const username = interaction.user?.tag || interaction.member?.user?.tag || sub.username || 'User';
    return executeAutoQuestFlow(interaction, sub.token, userId, username);
  }

  if (action === 'token_guide') {
    const payload = buildTokenGuidePayload();
    return interaction.update({ content: null, ...payload });
  }

  if (action === 'gametime_status') {
    const { isGametimeFarmingActive, loadGametimeProgress, getTierTitle, TIERS } = require('./gameTimeWorker');
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
    const statusEmoji = isRunning ? '🟢 Đang cày ngầm 24/7' : '🔴 Không chạy';
    const hint = isRunning
      ? '💡 Dùng `/quest action:gametime_stop` để dừng.'
      : '💡 Dùng `/quest action:gametime_start` để tiếp tục cày!';
    return interaction.reply({
      flags: 64,
      content:
        `⏱️ **Huy hiệu Thời gian chơi — Tiến trình của bạn**\n\n` +
        `${bar} **${pct}%**\n` +
        `⏳ Đã tích lũy: **~${totalHours} giờ** chơi\n` +
        `🏅 Cấp hiện tại: **${currentTier}**` + (nextTier ? ` → Mục tiêu: **${nextTier.title} (${nextTier.hours}h)**` : '') + `\n` +
        `⚡ Trạng thái: **${statusEmoji}**\n\n` +
        `${hint}`,
    });
  }

  if (action === 'variety_status') {
    const { isFarmingActive, loadProgress, getTierTitle } = require('./varietyTokenWorker');
    const prog = loadProgress(userId);
    const count = (prog.completed || []).length;
    const isRunning = isFarmingActive(userId);
    const tierTitle = getTierTitle(count);
    const pct = Math.min(100, Math.round((count / 100) * 100));
    const bar = '\u2588'.repeat(Math.floor(pct / 10)) + '\u2591'.repeat(10 - Math.floor(pct / 10));
    const statusEmoji = isRunning ? '\U0001f7e2 \u0110ang c\u00e0y ng\u1ea7m' : '\U0001f534 Kh\u00f4ng ch\u1ea1y';
    const hint = isRunning
      ? '\U0001f4a1 D\u00f9ng `/quest action:variety_stop` \u0111\u1ec3 d\u1eebng.'
      : '\U0001f4a1 D\u00f9ng `/quest action:variety_start` \u0111\u1ec3 ti\u1ebfp t\u1ee5c c\u00e0y!';
    return interaction.reply({
      flags: 64,
      content:
        `🎮 **Huy hiệu Trò chơi đa dạng — Tiến trình của bạn**\n\n` +
        `${bar} **${pct}%**\n` +
        `📊 Đã hoàn thành: **${count}/100** games\n` +
        `🏅 Cấp hiện tại: **${tierTitle}**\n` +
        `⚡ Trạng thái: **${statusEmoji}**\n\n` +
        `${hint}`,
    });
  }

  if (action === 'stream_status') {
    const { buildStreamStatusPayload } = require('./streamTimeWorker');
    const payload = buildStreamStatusPayload(userId, interaction.user?.tag);
    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply({ flags: 64, ...payload });
    }
    return interaction.followUp({ flags: 64, ...payload });
  }

  if (action === 'stream_token_start') {
    const { isApproved, buildAccessGatePayload } = require('./questAuth');
    if (!isApproved(userId)) {
      const gate = buildAccessGatePayload(userObj);
      if (interaction.message?.flags?.has?.(64)) return interaction.update(gate);
      return interaction.reply({ flags: 64, ...gate });
    }

    const { getSubscriber } = require('./questScheduler');
    const sub = getSubscriber(userId);
    if (!sub || !sub.token) {
      return interaction.reply({
        flags: 64,
        content:
          '❌ Bạn chưa nạp Token Discord vào hệ thống!\n\n' +
          '👉 Hãy bấm nút **Nhập Token** bên dưới hoặc dùng lệnh `/quest action:token` để nạp token trước nhé.',
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('quest:modal')
              .setLabel('Nhập User Token Ngay')
              .setEmoji('🔑')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('quest:hub')
              .setLabel('Về Menu Chính')
              .setEmoji('↩️')
              .setStyle(ButtonStyle.Secondary)
          ),
        ],
      });
    }

    const {
      startTokenStreamFarming,
      isStreamFarmingActive,
      loadStreamProgress,
      getTierTitle,
    } = require('./streamTimeWorker');

    if (isStreamFarmingActive(userId)) {
      const prog = loadStreamProgress(userId);
      const totalHours = Math.floor(((prog.accumulatedSeconds || 0) + (prog.currentSessionSeconds || 0)) / 3600);
      return interaction.reply({
        flags: 64,
        content: `⚡ Bạn đã có phiên cày stream đang chạy rồi! **~${totalHours} giờ** — Cấp: **${getTierTitle(totalHours)}**\n💡 Bấm nút **Dừng Cày Stream** khi muốn kết thúc.`,
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

    await interaction.deferReply({ flags: 64 });

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

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('quest:stream_status')
          .setLabel('Xem Tiến Trình Stream')
          .setEmoji('📊')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('quest:stream_stop')
          .setLabel('Dừng Cày Stream')
          .setEmoji('⏹️')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('quest:hub')
          .setLabel('Về Bảng Điều Khiển')
          .setEmoji('🔮')
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.editReply({
        content:
          `🚀 **ĐÃ KÍCH HOẠT CÀY NGẦM HUY HIỆU STREAM 24/7 BẰNG TOKEN TRÊN CLOUD!**\n\n` +
          `👤 Tài khoản: **${res.username}**\n` +
          `📺 Kênh Voice: **${targetChannel.name}**\n` +
          `⏱️ Giờ đã stream: **~${totalHours}h** | Cấp: **${getTierTitle(totalHours)}**\n` +
          `🤖 **Trạng thái:** Bot Lowkey đã vào phòng làm **Khán giả (Viewer)** để Discord xác nhận có người xem stream 24/7!\n\n` +
          `✨ **Ưu điểm:** Bạn có thể **tắt máy tính, tắt điện thoại** mà hệ thống vẫn tự động stream và tích lũy giờ liên tục.\n` +
          `💡 Bấm nút bên dưới để xem tiến trình hoặc dừng cày bất cứ lúc nào.`,
        components: [actionRow],
      });
    } catch (err) {
      return interaction.editReply({ content: `❌ Lỗi khi khởi động cày stream: ${err.message}` });
    }
  }

  if (action === 'stream_viewer_start') {
    const { isApproved, buildAccessGatePayload } = require('./questAuth');
    if (!isApproved(userId)) {
      const gate = buildAccessGatePayload(userObj);
      if (interaction.message?.flags?.has?.(64)) return interaction.update(gate);
      return interaction.reply({ flags: 64, ...gate });
    }

    const {
      startViewerStreamFarming,
      isStreamFarmingActive,
      loadStreamProgress,
      getTierTitle,
    } = require('./streamTimeWorker');

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
          '❌ Bạn cần vào một kênh Voice trước khi gọi Bot vào làm Viewer!\n' +
          '👉 Hãy tham gia vào phòng Voice và bấm lại nút này nhé.',
      });
    }

    await interaction.deferReply({ flags: 64 });
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
          `✅ **Đã bật Trợ lý Viewer Stream 24/7 trong kênh ${voiceChannel.name}!**\n` +
          `⏱️ Đã stream: **~${totalHours}h** | Cấp: **${getTierTitle(totalHours)}**\n\n` +
          `👉 Hãy bắt đầu **Chia sẻ màn hình (Stream)** bất kỳ cửa sổ/game nào để bot tính giờ tích lũy cho bạn nhé!\n` +
          `💡 Bấm nút **Dừng Cày Stream** hoặc dùng \`/quest action:stream_stop\` khi muốn kết thúc.`,
      });
    } catch (err) {
      return interaction.editReply({ content: `❌ Lỗi: ${err.message}` });
    }
  }

  if (action === 'stream_start') {
    const { getSubscriber } = require('./questScheduler');
    const sub = getSubscriber(userId);

    // Ưu tiên chạy token stream 24/7 nếu có token
    if (sub && sub.token) {
      const {
        startTokenStreamFarming,
        isStreamFarmingActive,
        loadStreamProgress,
        getTierTitle,
      } = require('./streamTimeWorker');

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
        await interaction.deferReply({ flags: 64 });
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
            return interaction.editReply({ content: `❌ ${res.message}` });
          }
          const prog = loadStreamProgress(userId);
          const totalHours = Math.floor((prog.accumulatedSeconds || 0) / 3600);
          return interaction.editReply({
            content:
              `🚀 **Đã kích hoạt cày ngầm Huy hiệu Stream bằng Token 24/7 trên Cloud!**\n` +
              `📺 Kênh: **${targetChannel.name}** | Người dùng: **${res.username}**\n` +
              `⏱️ Đã tích lũy: **~${totalHours}h** | Cấp: **${getTierTitle(totalHours)}**\n` +
              `💡 Bot sẽ giữ stream ngầm liên tục mà bạn không cần mở Discord hay bật máy.\n` +
              `💡 Dùng \`/quest action:stream_stop\` để dừng.`,
          });
        } catch (err) {
          return interaction.editReply({ content: `❌ Lỗi: ${err.message}` });
        }
      }
    }

    // Nếu không có Token, kiểm tra xem người dùng có ở trong kênh Voice không
    const member = interaction.member;
    const voiceChannel = member?.voice?.channel;
    if (voiceChannel) {
      const { startViewerStreamFarming, isStreamFarmingActive, loadStreamProgress, getTierTitle } = require('./streamTimeWorker');
      if (isStreamFarmingActive(userId)) {
        const prog = loadStreamProgress(userId);
        const totalHours = Math.floor(((prog.accumulatedSeconds || 0) + (prog.currentSessionSeconds || 0)) / 3600);
        return interaction.reply({
          flags: 64,
          content: `⚡ Tiến trình cày stream của bạn đang chạy rồi! **~${totalHours} giờ** — Cấp: **${getTierTitle(totalHours)}**`,
        });
      }
      await interaction.deferReply({ flags: 64 });
      try {
        await startViewerStreamFarming(member, interaction.channel);
        const prog = loadStreamProgress(userId);
        const totalHours = Math.floor((prog.accumulatedSeconds || 0) / 3600);
        return interaction.editReply({
          content:
            `✅ **Đã bật Trợ lý Viewer Stream 24/7 trong kênh ${voiceChannel.name}!**\n` +
            `⏱️ Đã stream: **~${totalHours}h** | Cấp: **${getTierTitle(totalHours)}**\n` +
            `👉 Hãy bắt đầu **Chia sẻ màn hình (Stream)** bất kỳ cửa sổ/game nào để bot tính giờ tích lũy cho bạn nhé!\n` +
            `💡 Bấm nút **Dừng Cày Stream** hoặc dùng \`/quest action:stream_stop\` khi muốn kết thúc.`,
        });
      } catch (err) {
        return interaction.editReply({ content: `❌ Lỗi: ${err.message}` });
      }
    }

    // Nếu chưa vào Voice và chưa có Token
    return interaction.reply({
      flags: 64,
      content:
        `📺 **Cày Huy hiệu Stream (Phát trực tiếp cho người khác)**\n\n` +
        `Bạn có thể cày theo 2 phương thức cực kỳ tiện lợi:\n` +
        `1️⃣ **Phương thức 1: Cày ngầm bằng Token 24/7 (Khuyên dùng - Tắt máy vẫn cày)**\n` +
        `• Bấm nút **Nhập Token** bên dưới để nạp Token Discord.\n` +
        `• Sau đó bấm nút **Cày Stream Token 24/7** -> Bot sẽ tự động stream ngầm trên máy chủ đám mây cả ngày lẫn đêm mà bạn không cần mở máy hay treo app!\n\n` +
        `2️⃣ **Phương thức 2: Trợ lý Khán giả Voice (Không cần Token)**\n` +
        `• Hãy tham gia vào một **kênh Voice** bất kỳ trong server này.\n` +
        `• Sau đó bấm nút **Bot Làm Viewer Voice** -> Bot sẽ vào làm **Khán giả (Viewer)** 24/7 xem bạn Stream màn hình.`,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('quest:modal')
            .setLabel('Nhập User Token Ngay')
            .setEmoji('🔑')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('quest:stream_viewer_start')
            .setLabel('Bot Làm Viewer Voice')
            .setEmoji('🎙️')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('quest:hub')
            .setLabel('Về Menu Chính')
            .setEmoji('↩️')
            .setStyle(ButtonStyle.Secondary)
        ),
      ],
    });
  }

  if (action === 'stream_stop') {
    const { stopStreamFarming, isStreamFarmingActive, loadStreamProgress, getTierTitle } = require('./streamTimeWorker');
    if (!isStreamFarmingActive(userId)) {
      return interaction.reply({
        flags: 64,
        content: '⚠️ Hiện không có phiên cày stream nào đang chạy.',
      });
    }
    stopStreamFarming(userId, 'Dừng từ nút bấm');
    const prog = loadStreamProgress(userId);
    const totalHours = Math.floor((prog.accumulatedSeconds || 0) / 3600);
    return interaction.reply({
      flags: 64,
      content: `⏹️ **Đã dừng cày Huy hiệu Stream!**\n⏳ Tổng giờ stream đã lưu: **~${totalHours} giờ** — Cấp: **${getTierTitle(totalHours)}**`,
    });
  }

  if (action === 'hub') {
    const payload = buildMainHubPayload(interaction.guildId, userId);
    return interaction.update({ content: null, ...payload });
  }

  if (action === 'script') {
    const payload = buildScriptPayload();
    try {
      return await interaction.update(payload);
    } catch (e) {
      if (!interaction.replied && !interaction.deferred) {
        return await interaction.reply({ flags: 64, ...payload });
      }
      return await interaction.followUp({ flags: 64, ...payload });
    }
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

  if (action === 'auto_menu') {
    const { isApproved, buildAccessGatePayload } = require('./questAuth');
    if (!isApproved(userId)) {
      const gate = buildAccessGatePayload(userObj);
      if (interaction.message?.flags?.has?.(64)) return interaction.update(gate);
      return interaction.reply({ flags: 64, ...gate });
    }
    const { buildAutoStatusPayload } = require('./questScheduler');
    const payload = buildAutoStatusPayload(userId);
    if (interaction.message?.flags?.has?.(64)) {
      return interaction.update(payload);
    }
    return interaction.reply({ flags: 64, ...payload });
  }

  if (action === 'request_access') {
    await interaction.deferUpdate();
    const { requestAccess, buildAccessGatePayload } = require('./questAuth');
    await requestAccess(userObj, interaction.client);
    const gate = buildAccessGatePayload(userObj);
    return interaction.editReply(gate);
  }

  if (action.startsWith('approve_')) {
    const targetUserId = action.replace('approve_', '');
    const { isOwner, approveUser } = require('./questAuth');
    if (!isOwner(interaction.user.id)) {
      return interaction.reply({ content: '❌ Chỉ Admin mới có quyền phê duyệt.', flags: 64 });
    }
    await approveUser(targetUserId, interaction.user.id, interaction.client);
    const isTargetAdmin = isOwner(targetUserId);
    return interaction.update({
      content: `✅ **ĐÃ PHÊ DUYỆT:** Bạn đã cấp quyền sử dụng Auto Quest cho thành viên <@${targetUserId}> (${isTargetAdmin ? 'Gói Vô thời hạn - Admin' : 'Gói trải nghiệm 10 ngày'})!`,
      components: [],
    });
  }

  if (action.startsWith('reject_')) {
    const targetUserId = action.replace('reject_', '');
    const { isOwner, rejectUser } = require('./questAuth');
    if (!isOwner(interaction.user.id)) {
      return interaction.reply({ content: '❌ Chỉ Admin mới có quyền từ chối.', flags: 64 });
    }
    await rejectUser(targetUserId, interaction.user.id, interaction.client);
    return interaction.update({
      content: `❌ **ĐÃ TỪ CHỐI:** Bạn đã từ chối cấp quyền cho thành viên <@${targetUserId}>.`,
      components: [],
    });
  }

  if (action === 'admin_list') {
    const { isOwner, buildAdminListPayload } = require('./questAuth');
    if (!isOwner(interaction.user.id)) {
      return interaction.reply({ content: '❌ Chỉ Admin mới có quyền truy cập menu này.', flags: 64 });
    }
    if (interaction.message?.flags?.has?.(64)) {
      return interaction.update(buildAdminListPayload());
    }
    return interaction.reply({ flags: 64, ...buildAdminListPayload() });
  }

  if (action === 'auto_toggle') {
    const { toggleSubscriber, buildAutoStatusPayload, getSubscriber, scanUserQuests } = require('./questScheduler');
    const sub = getSubscriber(interaction.user.id);
    if (!sub) {
      return interaction.reply({
        content: '⚠️ Bạn chưa nạp Token vào hệ thống bot. Hãy bấm nút **Nhập Token** để nạp và kích hoạt nhé!',
        flags: 64,
      });
    }
    const isNowEnabled = toggleSubscriber(interaction.user.id);
    if (isNowEnabled) {
      scanUserQuests(sub, interaction.client).catch((e) => console.error('[AUTO TOGGLE SCAN ERROR]', e));
    }
    return interaction.update(buildAutoStatusPayload(interaction.user.id));
  }

  if (action === 'auto_dm_toggle') {
    const { toggleNotifyDm, buildAutoStatusPayload, getSubscriber } = require('./questScheduler');
    const sub = getSubscriber(interaction.user.id);
    if (!sub) {
      return interaction.reply({
        content: '⚠️ Bạn chưa nạp Token vào hệ thống bot. Hãy bấm nút **Nhập Token** để nạp và kích hoạt nhé!',
        flags: 64,
      });
    }
    toggleNotifyDm(interaction.user.id);
    return interaction.update(buildAutoStatusPayload(interaction.user.id));
  }

  if (action === 'auto_scan_now') {
    const { getSubscriber, isUserJobRunning } = require('./questScheduler');
    const sub = getSubscriber(interaction.user.id);
    if (!sub || !sub.token) {
      return interaction.reply({
        content: '⚠️ Bạn chưa nạp Token vào hệ thống bot. Hãy bấm nút **Nhập Token** để nạp và kích hoạt nhé!',
        flags: 64,
      });
    }

    if (isUserJobRunning(interaction.user.id)) {
      const runningEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('⏳ ĐANG TIẾN HÀNH CÀY QUEST NGẦM')
        .setDescription(
          'Bot đang kết nối Gateway và cày tiến độ ngầm 24/7 cho toàn bộ nhiệm vụ Video & Game trên tài khoản của bạn.\n\n' +
          '⚡ Tiến trình đang chạy tự động 100% theo nhịp chuẩn an toàn của Discord. Khi hoàn tất 100%, bot sẽ thông báo để bạn vào Cài đặt -> Quests bấm Claim (vì Discord yêu cầu xác thực con người)!'
        )
        .setTimestamp();

      return interaction.reply({ embeds: [runningEmbed], flags: 64 });
    }

    return executeAutoQuestFlow(interaction, sub.token, interaction.user.id, sub.username || interaction.user.username);
  }
}

async function executeAutoQuestFlow(interaction, token, userId, username) {
  if (!interaction.deferred && !interaction.replied) {
    if (typeof interaction.deferUpdate === 'function' && interaction.isButton && interaction.isButton()) {
      try {
        await interaction.deferUpdate();
      } catch (e) {
        if (typeof interaction.deferReply === 'function') {
          await interaction.deferReply({ flags: 64 }).catch(() => {});
        }
      }
    } else if (typeof interaction.deferReply === 'function') {
      await interaction.deferReply({ flags: 64 }).catch(() => {});
    }
  }

  try {
    const { registerSubscriber } = require('./questScheduler');
    registerSubscriber(userId, token, username, 1);
  } catch (e) {}

  let lastUpdate = 0;
  let pendingTimer = null;
  const updateProgress = (text) => {
    const now = Date.now();
    const doUpdate = async () => {
      lastUpdate = Date.now();
      await interaction.editReply({ content: text, embeds: [], components: [] }).catch(() => {});
    };

    if (now - lastUpdate >= 1200) {
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      doUpdate();
    } else if (!pendingTimer) {
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        doUpdate();
      }, 1200 - (now - lastUpdate));
    }
  };

  try {
    const report = await runAutoQuestForToken(token, {
      autoClaim: false,
      heartbeatDelayMs: 1200,
      onProgress: (p) => {
        if (p.step === 'auth' || p.step === 'fetch') {
          updateProgress(`🔄 ${p.message}`);
        } else if (p.step === 'quest_start') {
          const typeBadge = p.type === 'video' ? '🎬 [Video]' : '🎮 [Game]';
          updateProgress(`${typeBadge} ${p.message}`);
        } else if (p.step === 'progress') {
          const typeIcon = p.type === 'video' ? '🎬' : '🎮';
          updateProgress(
            `⏳ [${p.index}/${p.total}] ${typeIcon} **${p.questName}**: Đang hoàn thành (${p.percent}% - ${p.currentSeconds}/${p.targetSeconds}s)...`
          );
        }
      },
    });

    const isAllCompleted = report.totalQuests > 0 && report.completedCount === report.totalQuests;
    const videoCount = report.results.filter((r) => r.type === 'video').length;
    const gameCount = report.results.filter((r) => r.type !== 'video').length;

    let desc =
      `👤 **Tài khoản:** \`${report.accountTag}\`\n` +
      `📋 **Tổng số nhiệm vụ:** **${report.totalQuests}** (🎮 Game: **${gameCount}** | 🎬 Video: **${videoCount}**)\n` +
      `✅ **Đã hoàn tất 100%:** **${report.completedCount}/${report.totalQuests}** nhiệm vụ\n` +
      `🎁 **Đã nhận thưởng:** **${report.claimedCount}** phần quà / ORB\n\n` +
      (videoCount === 0 && report.totalQuests > 0
        ? `*(ℹ️ Hiện tại Discord chưa phát hành nhiệm vụ Video nào trên tài khoản này. Bot sẽ tự động làm ngay khi có video mới!)*\n\n`
        : '') +
      (report.message ? `ℹ️ *${report.message}*\n\n` : '') +
      (report.results.length > 0
        ? '**Chi tiết từng nhiệm vụ (Video & Game):**\n' +
          report.results
            .map((r, i) => {
              const typeBadge = r.type === 'video' ? '🎬 [Video]' : '🎮 [Game]';
              if (r.completed || r.alreadyDone || r.progressPercent >= 100) {
                const state = r.alreadyDone
                  ? 'Đã làm trước đó'
                  : r.claimed
                  ? 'Hoàn thành 100% & Đã Claim ORB'
                  : 'Hoàn thành 100% (Vào Discord bấm Claim)';
                return `**${i + 1}.** ${typeBadge} **${r.questName}**: ✅ ${state}`;
              }
              return `**${i + 1}.** ${typeBadge} **${r.questName}**: ⚠️ Chưa xong (${r.error || r.message || 'Thất bại'})`;
            })
            .join('\n')
        : 'Không có nhiệm vụ nào cần thực hiện.');

    if (report.completedCount > 0) {
      desc +=
        `\n\n🎁 **HƯỚNG DẪN NHẬN QUÀ:**\n` +
        `Các nhiệm vụ đã được cày **100% hoàn tất**!\n` +
        `Vui lòng vào **Cài đặt người dùng (User Settings) ➔ Quests (Nhiệm vụ)** trên Discord để bấm nút **Claim** nhận phần thưởng (Discord yêu cầu xác thực con người khi nhận quà).`;
    }

    const resultEmbed = new EmbedBuilder()
      .setColor(isAllCompleted ? 0x57f287 : 0x5865f2)
      .setTitle(
        isAllCompleted
          ? '🎉 KẾT QUẢ AUTO QUEST DISCORD (VIDEO & GAME 100%)'
          : '⚡ KẾT QUẢ AUTO QUEST DISCORD (VIDEO & GAME)'
      )
      .setDescription(desc)
      .setFooter({ text: 'Lowkey Auto Quest • Mở Cài đặt -> Quests để bấm Claim nhận quà' })
      .setTimestamp();

    try {
      const { registerSubscriber } = require('./questScheduler');
      registerSubscriber(userId, token, report.accountTag || username, 1);
    } catch (e) {}

    const resultRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('quest:hub')
        .setLabel('Menu Chính')
        .setEmoji('🔮')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('quest:change_token')
        .setLabel('Đổi Token Khác')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.editReply({ content: null, embeds: [resultEmbed], components: [resultRow] });
  } catch (err) {
    const isTokenExpired =
      err.message &&
      (err.message.includes('401') ||
        err.message.includes('Token không hợp lệ') ||
        err.message.includes('hết hạn'));

    if (isTokenExpired) {
      try {
        const { getDb } = require('./database');
        getDb().prepare('UPDATE quest_subscribers SET enabled = 0 WHERE user_id = ?').run(userId);
      } catch (e) {}

      const expiredEmbed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('❌ TOKEN CỦA BẠN ĐÃ HẾT HẠN HOẶC KHÔNG HỢP LỆ')
        .setDescription(
          `Token Discord của bạn không thể xác thực (lỗi 401 Unauthorized).\n\n` +
          `• **Nguyên nhân:** Có thể bạn vừa đổi mật khẩu Discord, đổi mã bảo mật 2FA hoặc đăng xuất khỏi Discord Web/Desktop.\n` +
          `• **Ghi nhớ Token:** Token cũ đã bị vô hiệu hóa vì không còn dùng được. Vui lòng bấm **🔄 Đổi Token Mới** bên dưới để cập nhật lại token mới nhé!`
        )
        .setFooter({ text: 'Lowkey Auto Quest • Token cũ đã ngắt kết nối' })
        .setTimestamp();

      const changeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('quest:change_token')
          .setLabel('Đổi Token Mới')
          .setEmoji('🔄')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('quest:token_guide')
          .setLabel('Cách Lấy Token')
          .setEmoji('🔑')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('quest:hub')
          .setLabel('Về Menu Chính')
          .setEmoji('↩️')
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.editReply({ content: null, embeds: [expiredEmbed], components: [changeRow] });
    }

    return interaction.editReply({
      content: `❌ **Lỗi thực hiện Auto Quest:** ${err.message}`,
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

  const userId = interaction.user?.id || interaction.member?.id || 'unknown';
  const username = interaction.user?.tag || interaction.member?.user?.tag || 'User';

  const { isApproved } = require('./questAuth');
  if (!isApproved(userId)) {
    return interaction.editReply({
      content: '❌ Bạn chưa được Admin (ID: 604729446649298963) phê duyệt sử dụng tính năng này.',
    });
  }

  return executeAutoQuestFlow(interaction, token, userId, username);
}

module.exports = {
  QUEST_SCRIPT,
  buildTokenModal,
  buildSavedTokenPayload,
  buildTokenGuidePayload,
  buildMainHubPayload,
  buildScriptPayload,
  buildInfoPayload,
  handleButtonInteraction,
  handleModalInteraction,
  executeAutoQuestFlow,
};
