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

  // Xác định kênh voice chiếu phim
  let targetChannel = null;
  if (config.voiceChannelId) {
    targetChannel = interaction.guild.channels.cache.get(config.voiceChannelId);
  }
  if (!targetChannel) {
    targetChannel = member.voice?.channel;
  }

  if (!targetChannel) {
    return interaction.reply({
      content: 'Bạn cần tham gia vào một kênh thoại (hoặc Admin cần cài đặt Kênh Voice chiếu phim trên Dashboard) trước khi phát phim!',
      flags: 64,
    });
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

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`cinema:select_movie:${interaction.user.id}`)
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
  let targetChannel = null;
  if (config.voiceChannelId) {
    targetChannel = interaction.guild.channels.cache.get(config.voiceChannelId);
  }
  if (!targetChannel) {
    targetChannel = interaction.member.voice?.channel;
  }

  if (!targetChannel) {
    return interaction.editReply({
      content: 'Không tìm thấy phòng thoại để phát phim. Hãy đảm bảo bạn đang ở trong phòng thoại hoặc kênh voice trên Dashboard hợp lệ.',
      embeds: [],
      components: [],
    });
  }

  // Cập nhật mốc thời gian của phim bắt đầu NGAY BÂY GIỜ từ giây 0
  const now = Date.now();
  let duration = Date.parse(selectedShow.endsAt) - Date.parse(selectedShow.startsAt);
  if (!duration || duration <= 0 || duration > 24 * 3600000) {
    duration = 2.5 * 3600 * 1000; // Mặc định 2.5 tiếng nếu lịch cũ không chuẩn
  }

  selectedShow.startsAt = new Date(now).toISOString();
  selectedShow.endsAt = new Date(now + duration).toISOString();

  // Lưu cấu hình vào database
  setGuildSetting(interaction.guildId, 'CINEMA_CONFIG', JSON.stringify(config));

  // 1. Bot tham gia kênh voice
  try {
    voice.joinVoiceChannel({
      channelId: targetChannel.id,
      guildId: interaction.guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true,
    });
    console.log(`[CINEMA] ✅ Bot đã vào kênh thoại #${targetChannel.name} để phát "${selectedShow.title}" (${interaction.guild.name})`);
  } catch (err) {
    console.error('[CINEMA] Lỗi khi vào voice channel:', err.message);
  }

  // 2. Tạo Activity Invite
  let inviteUrl = null;
  if (typeof targetChannel.createInvite === 'function') {
    try {
      const invite = await targetChannel.createInvite({
        targetApplication: interaction.client.user.id,
        targetType: 2, // EmbeddedApplication
        maxAge: Math.floor(duration / 1000),
      });
      inviteUrl = invite.url;
    } catch (e) {
      console.warn('[CINEMA] Không thể tạo activity invite:', e.message);
    }
  }

  const startUnix = Math.floor(now / 1000);
  const endUnix = Math.floor((now + duration) / 1000);
  const activityWebUrl = (process.env.DASHBOARD_URL || 'https://vietnamlegacy.up.railway.app').replace(/\/$/, '') + '/activity';

  const playingEmbed = new EmbedBuilder()
    .setColor(0xE50914)
    .setTitle(`🎬 ĐANG PHÁT PHIM: ${selectedShow.title}`)
    .setDescription(
      `🍿 Bộ phim **${selectedShow.title}** đã được khởi chiếu tại **<#${targetChannel.id}>** theo yêu cầu của <@${interaction.user.id}>!\n\n` +
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
      await notifyCh.send({ embeds: [playingEmbed], components }).catch(() => {});
    }
  }
}

module.exports = {
  data,
  execute,
  handleSelect,
};
