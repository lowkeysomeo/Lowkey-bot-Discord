'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const voice = require('@discordjs/voice');
const cinema = require('../../utils/cinema');
const { setGuildSetting } = require('../../utils/guildSettings');

const data = new SlashCommandBuilder()
  .setName('cinema')
  .setDescription('Rạp phim: chọn phim và bắt đầu chiếu ngay lập tức')
  .addIntegerOption(opt =>
    opt.setName('phong')
      .setDescription('Chọn phòng chiếu (1, 2 hoặc 3)')
      .setRequired(false)
      .addChoices(
        { name: '🎬 Cinema 1 (Phòng 1)', value: 1 },
        { name: '🎬 Cinema 2 (Phòng 2)', value: 2 },
        { name: '🎬 Cinema 3 (Phòng 3)', value: 3 },
      )
  )
  .setDMPermission(false);

async function executeCinemaRoom(interaction, requestedRoom = null) {
  if (!interaction.inGuild()) return;

  if (process.env.CINEMA_ENABLED !== 'true') {
    return interaction.reply({
      content: 'Chức năng Cinema chưa được bật bởi chủ bot.',
      flags: 64,
    });
  }

  const config = cinema.getConfig(interaction.guildId);
  if (!config.enabled) {
    return interaction.reply({
      content: 'Rạp phim VNL Cinema hiện đang tắt tại server này. Quản trị viên có thể bật tại Web Dashboard.',
      flags: 64,
    });
  }

  const member = interaction.member;
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

  if (config.audience === 'admins' && !isAdmin) {
    return interaction.reply({
      content: 'Rạp phim hiện đang được cấu hình chỉ dành cho Administrator.',
      flags: 64,
    });
  }

  if (config.audience === 'roles' && !isAdmin && !config.roleIds.some(id => member.roles.cache.has(id))) {
    return interaction.reply({
      content: 'Bạn chưa có role được cấp quyền xem rạp phim.',
      flags: 64,
    });
  }

  // Xác định số phòng chiếu (1, 2 hoặc 3)
  let roomNumber = requestedRoom ? Number(requestedRoom) : null;
  if (!roomNumber) {
    const userCh = member.voice?.channel;
    const detected = cinema.getRoomNumberFromChannel(userCh);
    roomNumber = detected || 1;
  }
  if (![1, 2, 3].includes(roomNumber)) roomNumber = 1;

  const now = Date.now();
  const currentShow = cinema.getActiveShow(config, now, roomNumber);

  // Xác định kênh voice chiếu phim tương ứng với phòng
  const cinemaCategory = cinema.getCinemaCategory(interaction.guild, config);
  const cinemaVoices = cinema.getCinemaVoiceChannels(interaction.guild, config);
  const hasCategory = cinemaCategory && cinemaVoices && cinemaVoices.size > 0;
  const userVoice = member.voice?.channel;
  const targetChannel = cinema.getCinemaRoomChannel(interaction.guild, config, roomNumber);

  // TRƯỜNG HỢP 1: Đang có phim chiếu tại phòng này -> Dẫn thẳng tới suất chiếu với nút [Vào xem phim ngay]
  if (currentShow) {
    const playChannel = targetChannel || userVoice;

    if (playChannel && playChannel.isVoiceBased?.()) {
      try {
        const existingConn = voice.getVoiceConnection(interaction.guildId);
        if (!existingConn) {
          voice.joinVoiceChannel({
            channelId: playChannel.id,
            guildId: interaction.guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: true,
          });
        }
      } catch (err) {
        console.warn(`[CINEMA] Không thể join voice channel #${playChannel.name}:`, err.message);
      }
    }

    const startUnix = Math.floor(Date.parse(currentShow.startsAt) / 1000);
    const endUnix = Math.floor(Date.parse(currentShow.endsAt) / 1000);
    let inviteUrl = null;
    if (playChannel && typeof playChannel.createInvite === 'function') {
      try {
        const invite = await playChannel.createInvite({
          targetApplication: interaction.client?.user?.id || 'bot',
          targetType: 2, // EmbeddedApplication
          maxAge: Math.max(600, endUnix - Math.floor(now / 1000)),
        });
        inviteUrl = invite.url;
      } catch (e) {
        console.warn('[CINEMA] Không thể tạo invite:', e.message);
      }
    }

    const activityWebUrl = (process.env.DASHBOARD_URL || 'https://vietnamlegacy.up.railway.app').replace(/\/$/, '') + '/activity';
    const watchUrl = inviteUrl || activityWebUrl;

    const elapsedSeconds = Math.max(0, Math.floor((now - Date.parse(currentShow.startsAt)) / 1000));
    const totalSeconds = Math.max(1, Math.floor((Date.parse(currentShow.endsAt) - Date.parse(currentShow.startsAt)) / 1000));
    const elapsedMins = Math.floor(elapsedSeconds / 60);
    const totalMins = Math.floor(totalSeconds / 60);

    const voiceTag = playChannel ? `<#${playChannel.id}>` : `Cinema ${roomNumber}`;

    const futureShows = config.shows
      .filter(s => (s.roomId || 1) === roomNumber && Date.parse(s.startsAt) > now)
      .slice(0, 5);
    let upcomingText = '';
    if (futureShows.length) {
      upcomingText = `\n\n**📅 Lịch chiếu tiếp theo tại Cinema ${roomNumber}:**\n` + futureShows.map(s => {
        const uStart = Math.floor(Date.parse(s.startsAt) / 1000);
        const uEnd = Math.floor(Date.parse(s.endsAt) / 1000);
        return `• **${s.title}** — <t:${uStart}:t> - <t:${uEnd}:t> (<t:${uStart}:R>)`;
      }).join('\n');
    }

    const embed = new EmbedBuilder()
      .setColor(0xE50914)
      .setTitle(`🎬 VNL CINEMA ${roomNumber} · ĐANG CHIẾU: ${currentShow.title}`)
      .setDescription(
        `Bộ phim **${currentShow.title}** đang được chiếu trực tiếp tại **${voiceTag}** (Phòng ${roomNumber})!\n\n` +
        `⏰ **Suất chiếu:** <t:${startUnix}:t> - <t:${endUnix}:t> (<t:${startUnix}:R>)\n` +
        `⏱️ **Tiến trình:** Đang chiếu ở phút thứ **${elapsedMins}** / **${totalMins}**\n\n` +
        `🍿 Bấm nút **[Vào xem phim ngay]** bên dưới để mở màn hình xem phim đồng bộ cùng mọi người!` +
        upcomingText
      )
      .setFooter({ text: `VNL Cinema ${roomNumber} • Đồng bộ thời gian thực` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(`🍿 Vào xem phim ngay (Cinema ${roomNumber})`)
        .setStyle(ButtonStyle.Link)
        .setURL(watchUrl)
    );

    return interaction.reply({
      embeds: [embed],
      components: [row],
    });
  }

  // TRƯỜNG HỢP 2: Chưa có phim nào đang chiếu trong phòng này -> Cho phép chọn phim phát ngay
  if (hasCategory) {
    if (!userVoice) {
      const allowedNames = cinemaVoices.map(c => `**${c.name}**`).join(', ');
      return interaction.reply({
        content: `⚠️ Bạn cần tham gia vào một trong các phòng chiếu thuộc danh mục **${cinemaCategory.name}** (${allowedNames}) trước khi dùng lệnh!`,
        flags: 64,
      });
    }

    if (userVoice.parentId !== cinemaCategory.id) {
      const allowedNames = cinemaVoices.map(c => `**${c.name}**`).join(', ');
      return interaction.reply({
        content: `⚠️ Kênh thoại **${userVoice.name}** không thuộc danh mục rạp phim!\n🎬 Phim chỉ được phép chiếu tại các kênh thoại thuộc danh mục **${cinemaCategory.name}** (${allowedNames}). Vui lòng vào đúng phòng chiếu để bắt đầu.`,
        flags: 64,
      });
    }

    if (targetChannel && userVoice.id !== targetChannel.id) {
      return interaction.reply({
        content: `⚠️ Bạn đang ở phòng **${userVoice.name}**. Để phát phim vào **Cinema ${roomNumber}**, vui lòng chuyển sang phòng thoại **<#${targetChannel.id}>**!`,
        flags: 64,
      });
    }
  } else {
    if (!targetChannel && !userVoice) {
      return interaction.reply({
        content: 'Bạn cần tham gia vào một kênh thoại (hoặc Admin cần cài đặt Kênh Voice chiếu phim trên Dashboard) trước khi phát phim!',
        flags: 64,
      });
    }
  }

  const activeChannel = targetChannel || userVoice;

  let allMovies = [];
  try {
    allMovies = await cinema.listUploadedMovies(interaction.guildId);
  } catch (err) {
    console.warn('[CINEMA] Không thể lấy danh sách phim từ R2:', err.message);
  }

  // Fallback về config.shows nếu R2 không khả dụng hoặc rỗng
  if (!allMovies || allMovies.length === 0) {
    const seenTitles = new Set();
    allMovies = (config.shows || []).filter(s => {
      if (!s || !s.title) return false;
      const norm = s.title.trim().toLowerCase();
      if (seenTitles.has(norm)) return false;
      seenTitles.add(norm);
      return true;
    }).map(s => {
      const durSec = (Date.parse(s.endsAt) - Date.parse(s.startsAt)) / 1000;
      return {
        title: s.title,
        source: s.source,
        durationSeconds: durSec > 0 ? durSec : 7200,
        scheduled: true,
        scheduleShow: s,
      };
    });
  }

  if (!allMovies || allMovies.length === 0) {
    return interaction.reply({
      content: 'Rạp phim hiện chưa có bộ phim nào trong kho. Quản trị viên có thể tải phim lên hoặc thêm phim trên Web Dashboard trước nhé!',
      flags: 64,
    });
  }

  allMovies.sort((a, b) => a.title.localeCompare(b.title, 'vi'));

  const options = allMovies.slice(0, 25).map((movie, idx) => {
    let desc = '';
    if (movie.durationSeconds && Number.isFinite(movie.durationSeconds) && movie.durationSeconds > 0) {
      const mins = Math.round(movie.durationSeconds / 60);
      const hours = Math.floor(mins / 60);
      const remMins = mins % 60;
      desc = hours > 0
        ? `Thời lượng: ~${hours}g ${remMins}p • Sẵn sàng phát`
        : `Thời lượng: ~${mins} phút • Sẵn sàng phát`;
    } else {
      desc = 'Thời lượng: ~120 phút • Sẵn sàng phát';
    }
    return {
      label: movie.title.slice(0, 100),
      description: desc.slice(0, 100),
      value: String(idx),
      emoji: '🎬',
    };
  });

  const userId = interaction.user?.id || interaction.member?.user?.id || interaction.member?.id || 'unknown';
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`cinema:select_movie:${roomNumber}:${userId}`)
    .setPlaceholder(`🍿 Chọn bộ phim bạn muốn phát tại Cinema ${roomNumber}...`)
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(selectMenu);

  const futureShows = (config.shows || [])
    .filter(s => (s.roomId || 1) === roomNumber && Date.parse(s.startsAt) > now)
    .slice(0, 5);
  let upcomingDesc = '';
  if (futureShows.length) {
    upcomingDesc = `\n\n**📅 Lịch chiếu đã lên lịch tại Cinema ${roomNumber}:**\n` + futureShows.map(s => {
      const uStart = Math.floor(Date.parse(s.startsAt) / 1000);
      const uEnd = Math.floor(Date.parse(s.endsAt) / 1000);
      return `• **${s.title}** — <t:${uStart}:t> - <t:${uEnd}:t> (<t:${uStart}:R>)`;
    }).join('\n');
  }

  const embed = new EmbedBuilder()
    .setColor(0xE50914)
    .setTitle(`🎬 VNL CINEMA ${roomNumber} · CHỌN PHIM PHÁT NGAY`)
    .setDescription(`Chọn một bộ phim từ danh sách bên dưới để bắt đầu chiếu ngay lập tức tại **<#${activeChannel.id}>**!\n\n🍿 **Đồng bộ thời gian thực:** Mọi người trong phòng thoại sẽ xem cùng một mốc thời gian.${upcomingDesc}`)
    .setFooter({ text: `VNL Cinema ${roomNumber} • Phát phim theo yêu cầu` })
    .setTimestamp();

  return interaction.reply({
    embeds: [embed],
    components: [row],
  });
}

async function execute(interaction) {
  let roomNumber = interaction.options?.getInteger?.('phong');
  if (!roomNumber) {
    const detected = cinema.getRoomNumberFromChannel(interaction.member?.voice?.channel);
    roomNumber = detected || 1;
  }
  return executeCinemaRoom(interaction, roomNumber);
}

async function handleSelect(interaction) {
  if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith('cinema:select_movie:')) return;

  const parts = interaction.customId.split(':');
  let roomNumber = 1;
  let authorId = null;

  if (parts.length >= 4) {
    roomNumber = Number(parts[2]) || 1;
    authorId = parts[3];
  } else {
    roomNumber = 1;
    authorId = parts[2];
  }

  if (authorId && interaction.user.id !== authorId) {
    return interaction.reply({
      content: `Chỉ người dùng lệnh \`/cinema${roomNumber}\` mới có thể chọn phim trên bảng này.`,
      flags: 64,
    });
  }

  await interaction.deferUpdate();

  const config = cinema.getConfig(interaction.guildId);
  const selectedIndex = parseInt(interaction.values[0], 10);

  // Lấy toàn bộ danh sách phim từ kho (R2 + config)
  let allMovies = [];
  try {
    allMovies = await cinema.listUploadedMovies(interaction.guildId);
  } catch (err) {
    console.warn('[CINEMA] Không thể lấy danh sách phim từ R2:', err.message);
  }

  // Fallback về config.shows nếu R2 không khả dụng hoặc rỗng
  if (!allMovies || allMovies.length === 0) {
    const seenTitles = new Set();
    allMovies = (config.shows || []).filter(s => {
      if (!s || !s.title) return false;
      const norm = s.title.trim().toLowerCase();
      if (seenTitles.has(norm)) return false;
      seenTitles.add(norm);
      return true;
    }).map(s => {
      const durSec = (Date.parse(s.endsAt) - Date.parse(s.startsAt)) / 1000;
      return {
        title: s.title,
        source: s.source,
        durationSeconds: durSec > 0 ? durSec : 7200,
        scheduled: true,
        scheduleShow: s,
      };
    });
  }

  allMovies.sort((a, b) => a.title.localeCompare(b.title, 'vi'));

  let selectedMovie = null;
  if (Number.isInteger(selectedIndex) && allMovies[selectedIndex]) {
    selectedMovie = allMovies[selectedIndex];
  } else {
    selectedMovie = allMovies.find(m => m.key === interaction.values[0] || m.source === interaction.values[0] || m.title === interaction.values[0]);
  }

  // Fallback trường hợp config.shows có sẵn (như trong các mock test)
  if (!selectedMovie && config.shows && config.shows[selectedIndex]) {
    selectedMovie = config.shows[selectedIndex];
  }

  if (!selectedMovie) {
    return interaction.editReply({
      content: 'Không tìm thấy bộ phim đã chọn hoặc danh sách phim đã thay đổi.',
      embeds: [],
      components: [],
    });
  }

  const now = Date.now();
  const currentActiveShow = cinema.getActiveShow(config, now, roomNumber);

  if (currentActiveShow) {
    const endUnix = Math.floor(Date.parse(currentActiveShow.endsAt) / 1000);
    return interaction.editReply({
      content: `⚠️ Hiện tại Cinema ${roomNumber} đang chiếu bộ phim **${currentActiveShow.title}** (dự kiến kết thúc lúc <t:${endUnix}:t>). Không thể tạo suất chiếu mới trong thời gian suất chiếu hiện tại đang diễn ra!`,
      embeds: [],
      components: [],
    });
  }

  // Xác định kênh voice chiếu
  const targetChannel = cinema.getCinemaRoomChannel(interaction.guild, config, roomNumber) || interaction.member.voice?.channel;

  if (!targetChannel) {
    return interaction.editReply({
      content: `Không tìm thấy phòng thoại để phát phim cho Cinema ${roomNumber}. Hãy đảm bảo bạn đang ở trong phòng thoại hoặc kênh voice trên Dashboard hợp lệ.`,
      embeds: [],
      components: [],
    });
  }

  // 1. Xác định thời lượng dự kiến
  let duration = 0;
  if (selectedMovie.durationSeconds && Number.isFinite(selectedMovie.durationSeconds) && selectedMovie.durationSeconds > 0) {
    duration = selectedMovie.durationSeconds * 1000;
  } else if (selectedMovie.endsAt && selectedMovie.startsAt) {
    duration = Date.parse(selectedMovie.endsAt) - Date.parse(selectedMovie.startsAt);
  } else if (selectedMovie.scheduleShow?.endsAt && selectedMovie.scheduleShow?.startsAt) {
    duration = Date.parse(selectedMovie.scheduleShow.endsAt) - Date.parse(selectedMovie.scheduleShow.startsAt);
  }
  if (!duration || duration <= 0 || duration > 24 * 3600000) {
    duration = 2.5 * 3600 * 1000; // Mặc định 2.5 tiếng nếu không rõ thời lượng
  }

  // 2. Bảo toàn toàn bộ các suất chiếu đã đặt lịch
  const safeExistingShows = (config.shows || []).map(s => ({ ...s }));

  // Kiểm tra không đè vào suất chiếu kế tiếp TRONG CÙNG PHÒNG
  const futureShowsSameRoom = safeExistingShows
    .filter(s => (s.roomId || 1) === roomNumber && Date.parse(s.startsAt) > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  let finalEndsAt = now + duration;
  if (futureShowsSameRoom.length > 0) {
    const nextStart = Date.parse(futureShowsSameRoom[0].startsAt);
    if (finalEndsAt > nextStart) {
      finalEndsAt = Math.max(now + 60000, nextStart);
    }
  }

  const immediateShow = {
    title: selectedMovie.title,
    source: selectedMovie.source,
    roomId: roomNumber,
    startsAt: new Date(now).toISOString(),
    endsAt: new Date(finalEndsAt).toISOString(),
  };

  // Ghép suất chiếu mới phát ngay cùng với các suất chiếu đã đặt sẵn (tối đa 30 suất)
  config.shows = [...safeExistingShows, immediateShow]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(-30);
  config.revision = (config.revision || 0) + 1;

  // Lưu cấu hình vào database
  setGuildSetting(interaction.guildId, 'CINEMA_CONFIG', JSON.stringify(config));

  // Đánh dấu suất chiếu đã được thông báo
  const showKey = `${immediateShow.startsAt}_${immediateShow.title}`;
  cinema.markShowAnnounced(interaction.guildId, immediateShow);

  // 1. Bot tham gia kênh voice nếu có thể
  let voiceConn = null;
  try {
    voiceConn = voice.joinVoiceChannel({
      channelId: targetChannel.id,
      guildId: interaction.guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true,
    });
    console.log(`[CINEMA] ✅ Bot đã vào kênh thoại #${targetChannel.name} để phát "${immediateShow.title}" tại Cinema ${roomNumber} (${interaction.guild.name})`);
  } catch (err) {
    // Nếu bot đã ở phòng khác thì không làm crash luồng, activity vẫn chạy bình thường
  }

  try {
    const scheduler = require('../../utils/cinemaScheduler');
    if (scheduler.activeSessions) {
      const sess = {
        showKey,
        show: immediateShow,
        roomId: roomNumber,
        joined: Boolean(voiceConn),
        announced: true,
        connection: voiceConn || null,
      };
      scheduler.activeSessions.set(`${interaction.guildId}_room${roomNumber}`, sess);
      if (roomNumber === 1 || !scheduler.activeSessions.has(interaction.guildId)) {
        scheduler.activeSessions.set(interaction.guildId, sess);
      }
    }
  } catch {}

  // 2. Tạo Activity Invite
  let inviteUrl = null;
  if (typeof targetChannel.createInvite === 'function') {
    try {
      const invite = await targetChannel.createInvite({
        targetApplication: interaction.client.user.id,
        targetType: 2, // EmbeddedApplication
        maxAge: Math.floor((finalEndsAt - now) / 1000),
      });
      inviteUrl = invite.url;
    } catch (e) {
      console.warn('[CINEMA] Không thể tạo activity invite:', e.message);
    }
  }

  const startUnix = Math.floor(now / 1000);
  const endUnix = Math.floor(finalEndsAt / 1000);
  const activityWebUrl = (process.env.DASHBOARD_URL || 'https://vietnamlegacy.up.railway.app').replace(/\/$/, '') + '/activity';

  const upcomingList = config.shows
    .filter(s => (s.roomId || 1) === roomNumber && Date.parse(s.startsAt) > now && s.startsAt !== immediateShow.startsAt)
    .slice(0, 5);
  let upcomingText = '';
  if (upcomingList.length) {
    upcomingText = `\n\n**📅 Lịch chiếu tiếp theo tại Cinema ${roomNumber}:**\n` + upcomingList.map(s => {
      const uStart = Math.floor(Date.parse(s.startsAt) / 1000);
      const uEnd = Math.floor(Date.parse(s.endsAt) / 1000);
      return `• **${s.title}** — <t:${uStart}:t> - <t:${uEnd}:t> (<t:${uStart}:R>)`;
    }).join('\n');
  }

  const playingEmbed = new EmbedBuilder()
    .setColor(0xE50914)
    .setTitle(`🎬 ĐANG PHÁT PHIM: ${immediateShow.title} (Cinema ${roomNumber})`)
    .setDescription(
      `🍿 Bộ phim **${immediateShow.title}** đã được khởi chiếu tại **<#${targetChannel.id}>** (Cinema ${roomNumber}) theo yêu cầu của <@${interaction.user.id}>!\n\n` +
      `⏰ **Thời gian:** <t:${startUnix}:t> - <t:${endUnix}:t> (Kết thúc <t:${endUnix}:R>)\n\n` +
      `👇 **Cách xem:**\n` +
      `1. Bấm nút **"Vào rạp xem phim"** bên dưới (hoặc bấm biểu tượng **Tên Lửa / Hoạt Động (Activities)** ở thanh điều khiển cuộc gọi).\n` +
      `2. Màn hình rạp chiếu sẽ tự động mở lên đồng bộ cho tất cả mọi người cùng xem!` +
      upcomingText
    )
    .setFooter({ text: `VNL Cinema ${roomNumber} • Phát phim đồng bộ thời gian thực` })
    .setTimestamp();

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(`🍿 Vào rạp xem phim ngay (Cinema ${roomNumber})`)
        .setStyle(ButtonStyle.Link)
        .setURL(inviteUrl || activityWebUrl)
    )
  ];

  // Cập nhật tin nhắn phản hồi
  const replyMsg = await interaction.editReply({
    embeds: [playingEmbed],
    components,
  });

  try {
    const scheduler = require('../../utils/cinemaScheduler');
    const sess = scheduler.activeSessions?.get(`${interaction.guildId}_room${roomNumber}`) || scheduler.activeSessions?.get(interaction.guildId);
    if (sess) {
      if (!Array.isArray(sess.messages)) sess.messages = [];
      if (replyMsg) sess.messages.push(replyMsg);
    }
  } catch {}

  // Thông báo tới kênh thông báo chung nếu có
  if (config.notifyChannelId && config.notifyChannelId !== interaction.channelId) {
    const notifyCh = interaction.guild.channels.cache.get(config.notifyChannelId);
    if (notifyCh && typeof notifyCh.send === 'function') {
      let content = undefined;
      let allowedMentions = undefined;
      if (config.notifyRoleId === 'everyone') {
        content = '@everyone';
        allowedMentions = { parse: ['everyone'] };
      } else if (config.notifyRoleId === 'here') {
        content = '@here';
        allowedMentions = { parse: ['everyone'] };
      } else if (config.notifyRoleId && /^\d+$/.test(config.notifyRoleId)) {
        content = `<@&${config.notifyRoleId}>`;
        allowedMentions = { roles: [config.notifyRoleId] };
      }
      notifyCh.send({
        content,
        embeds: [playingEmbed],
        components,
        ...(allowedMentions ? { allowedMentions } : {})
      }).then(msg => {
        try {
          const scheduler = require('../../utils/cinemaScheduler');
          const sess = scheduler.activeSessions?.get(`${interaction.guildId}_room${roomNumber}`) || scheduler.activeSessions?.get(interaction.guildId);
          if (sess && msg) {
            if (!Array.isArray(sess.messages)) sess.messages = [];
            sess.messages.push(msg);
          }
        } catch {}
      }).catch(() => {});
    }
  }
}

module.exports = {
  data,
  execute,
  executeCinemaRoom,
  handleSelect,
};
