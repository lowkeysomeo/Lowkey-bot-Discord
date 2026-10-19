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
  .setDMPermission(false);

async function execute(interaction) {
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

  if (!Array.isArray(config.shows) || !config.shows.length) {
    return interaction.reply({
      content: 'Rạp phim chưa có bộ phim nào được thêm vào lịch chiếu. Hãy vào Dashboard để thêm phim trước nhé!',
      flags: 64,
    });
  }

  // Xác định kênh voice chiếu phim (chỉ cho phép các kênh thuộc danh mục Cinema nếu có)
  const cinemaCategory = cinema.getCinemaCategory(interaction.guild, config);
  const cinemaVoices = cinema.getCinemaVoiceChannels(interaction.guild, config);
  const hasCategory = cinemaCategory && cinemaVoices && cinemaVoices.size > 0;

  let targetChannel = null;
  const userVoice = member.voice?.channel;

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

    targetChannel = userVoice;
  } else {
    if (config.voiceChannelId) {
      targetChannel = interaction.guild.channels.cache.get(config.voiceChannelId);
    }
    if (!targetChannel) {
      targetChannel = userVoice;
    }

    if (!targetChannel) {
      return interaction.reply({
        content: 'Bạn cần tham gia vào một kênh thoại (hoặc Admin cần cài đặt Kênh Voice chiếu phim trên Dashboard) trước khi phát phim!',
        flags: 64,
      });
    }
  }

  const options = config.shows.slice(0, 25).map((show, idx) => {
    const durMins = Math.round((Date.parse(show.endsAt) - Date.parse(show.startsAt)) / 60000) || 120;
    return {
      label: show.title.slice(0, 100),
      description: `Thời lượng dự kiến: ~${durMins} phút`,
      value: String(idx),
      emoji: '🎬',
    };
  });

  const userId = interaction.user?.id || interaction.member?.user?.id || interaction.member?.id || 'unknown';
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`cinema:select_movie:${userId}`)
    .setPlaceholder('🍿 Chọn bộ phim bạn muốn phát ngay...')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(selectMenu);

  const embed = new EmbedBuilder()
    .setColor(0xE50914)
    .setTitle('🎬 VNL CINEMA · CHỌN PHIM PHÁT NGAY')
    .setDescription(`Chọn một bộ phim từ danh sách bên dưới để bắt đầu chiếu ngay lập tức tại **<#${targetChannel.id}>**!\n\n🍿 **Đồng bộ thời gian thực:** Mọi người trong phòng thoại sẽ xem cùng một mốc thời gian.`)
    .setFooter({ text: 'VNL Cinema • Phát phim theo yêu cầu' })
    .setTimestamp();

  return interaction.reply({
    embeds: [embed],
    components: [row],
  });
}

async function handleSelect(interaction) {
  if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith('cinema:select_movie:')) return;

  const parts = interaction.customId.split(':');
  const authorId = parts[2];

  if (authorId && interaction.user.id !== authorId) {
    return interaction.reply({
      content: 'Chỉ người dùng lệnh `/cinema` mới có thể chọn phim trên bảng này.',
      flags: 64,
    });
  }

  await interaction.deferUpdate();

  const config = cinema.getConfig(interaction.guildId);
  const showIndex = parseInt(interaction.values[0], 10);
  const selectedShow = config.shows?.[showIndex];

  if (!selectedShow) {
    return interaction.editReply({
      content: 'Không tìm thấy bộ phim đã chọn hoặc danh sách phim đã thay đổi.',
      embeds: [],
      components: [],
    });
  }

  // Xác định kênh voice chiếu
  const cinemaCategory = cinema.getCinemaCategory(interaction.guild, config);
  const cinemaVoices = cinema.getCinemaVoiceChannels(interaction.guild, config);
  const hasCategory = cinemaCategory && cinemaVoices && cinemaVoices.size > 0;

  let targetChannel = null;
  const userVoice = interaction.member.voice?.channel;

  if (hasCategory) {
    if (userVoice && userVoice.parentId === cinemaCategory.id) {
      targetChannel = userVoice;
    } else if (config.voiceChannelId) {
      const cfgVoice = interaction.guild.channels.cache.get(config.voiceChannelId);
      if (cfgVoice && cfgVoice.parentId === cinemaCategory.id) {
        targetChannel = cfgVoice;
      }
    }

    if (!targetChannel) {
      const allowedNames = cinemaVoices.map(c => `**${c.name}**`).join(', ');
      return interaction.editReply({
        content: `⚠️ Không tìm thấy phòng chiếu hợp lệ. Phim chỉ được phép chiếu tại các kênh thoại thuộc danh mục **${cinemaCategory.name}** (${allowedNames}).`,
        embeds: [],
        components: [],
      });
    }
  } else {
    if (config.voiceChannelId) {
      targetChannel = interaction.guild.channels.cache.get(config.voiceChannelId);
    }
    if (!targetChannel) {
      targetChannel = userVoice;
    }

    if (!targetChannel) {
      return interaction.editReply({
        content: 'Không tìm thấy phòng thoại để phát phim. Hãy đảm bảo bạn đang ở trong phòng thoại hoặc kênh voice trên Dashboard hợp lệ.',
        embeds: [],
        components: [],
      });
    }
  }

  // 1. Xác định thời lượng dự kiến
  const now = Date.now();
  let duration = Date.parse(selectedShow.endsAt) - Date.parse(selectedShow.startsAt);
  if (!duration || duration <= 0 || duration > 24 * 3600000) {
    duration = 2.5 * 3600 * 1000; // Mặc định 2.5 tiếng nếu lịch cũ không chuẩn
  }

  // 2. Bảo toàn toàn bộ các suất chiếu đã đặt lịch (không ghi đè hay xóa các suất đã lên lịch)
  const safeExistingShows = config.shows.map(s => {
    const sStart = Date.parse(s.startsAt);
    const sEnd = Date.parse(s.endsAt);
    // Nếu có suất chiếu cũ đang diễn ra tại thời điểm này thì kết thúc nó tại 'now' để phát phim mới được chọn
    if (sStart < now && sEnd > now) {
      return { ...s, endsAt: new Date(now).toISOString() };
    }
    return { ...s };
  }).filter(s => Date.parse(s.endsAt) > Date.parse(s.startsAt));

  // Kiểm tra không đè vào suất chiếu kế tiếp trong tương lai
  const futureShows = safeExistingShows
    .filter(s => Date.parse(s.startsAt) > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  let finalEndsAt = now + duration;
  if (futureShows.length > 0) {
    const nextStart = Date.parse(futureShows[0].startsAt);
    if (finalEndsAt > nextStart) {
      // Giới hạn giờ kết thúc ngay trước khi suất chiếu đã đặt bắt đầu để không trùng lịch
      finalEndsAt = Math.max(now + 60000, nextStart);
    }
  }

  const immediateShow = {
    title: selectedShow.title,
    source: selectedShow.source,
    startsAt: new Date(now).toISOString(),
    endsAt: new Date(finalEndsAt).toISOString(),
  };

  // Ghép suất chiếu mới phát ngay cùng với các suất chiếu đã đặt sẵn (tối đa 20 suất)
  config.shows = [...safeExistingShows, immediateShow]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(-20);

  // Lưu cấu hình vào database
  setGuildSetting(interaction.guildId, 'CINEMA_CONFIG', JSON.stringify(config));

  // Đánh dấu suất chiếu đã được thông báo để bộ scheduler không thông báo lặp
  const showKey = `${immediateShow.startsAt}_${immediateShow.title}`;
  cinema.markShowAnnounced(interaction.guildId, showKey);

  // 1. Bot tham gia kênh voice
  let voiceConn = null;
  try {
    voiceConn = voice.joinVoiceChannel({
      channelId: targetChannel.id,
      guildId: interaction.guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true,
    });
    console.log(`[CINEMA] ✅ Bot đã vào kênh thoại #${targetChannel.name} để phát "${immediateShow.title}" (${interaction.guild.name})`);
  } catch (err) {
    console.error('[CINEMA] Lỗi khi vào voice channel:', err.message);
  }

  try {
    const scheduler = require('../../utils/cinemaScheduler');
    if (scheduler.activeSessions) {
      scheduler.activeSessions.set(interaction.guildId, {
        showKey,
        show: immediateShow,
        joined: true,
        announced: true,
        connection: voiceConn || voice.getVoiceConnection(interaction.guildId),
      });
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

  const playingEmbed = new EmbedBuilder()
    .setColor(0xE50914)
    .setTitle(`🎬 ĐANG PHÁT PHIM: ${immediateShow.title}`)
    .setDescription(
      `🍿 Bộ phim **${immediateShow.title}** đã được khởi chiếu tại **<#${targetChannel.id}>** theo yêu cầu của <@${interaction.user.id}>!\n\n` +
      `⏰ **Thời gian:** <t:${startUnix}:t> - <t:${endUnix}:t> (Kết thúc <t:${endUnix}:R>)\n\n` +
      `👇 **Cách xem:**\n` +
      `1. Bấm nút **"Vào rạp xem phim"** bên dưới (hoặc bấm biểu tượng **Tên Lửa / Hoạt Động (Activities)** ở thanh điều khiển cuộc gọi).\n` +
      `2. Màn hình rạp chiếu sẽ tự động mở lên đồng bộ cho tất cả mọi người cùng xem!`
    )
    .setFooter({ text: 'VNL Cinema • Phát phim đồng bộ thời gian thực' })
    .setTimestamp();

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('🍿 Vào rạp xem phim ngay')
        .setStyle(ButtonStyle.Link)
        .setURL(inviteUrl || activityWebUrl)
    )
  ];

  // Cập nhật tin nhắn phản hồi
  await interaction.editReply({
    embeds: [playingEmbed],
    components,
  });

  // Nếu có cấu hình kênh thông báo riêng khác với kênh lệnh thì thông báo thêm vào đó
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
      await notifyCh.send({
        content,
        embeds: [playingEmbed],
        components,
        ...(allowedMentions ? { allowedMentions } : {})
      }).catch(() => {});
    }
  }
}

module.exports = {
  data,
  execute,
  handleSelect,
};
