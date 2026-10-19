'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const cinema = require('../../utils/cinema');
const { formatDuration } = require('../../utils/movieCatalog');

const data = new SlashCommandBuilder()
  .setName('cinemalist')
  .setDescription('Xem kho phim và lịch chiếu sắp tới trên VNL Cinema')
  .addStringOption(opt =>
    opt.setName('muc')
      .setDescription('Chọn mục muốn xem: Kho phim có sẵn hoặc Lịch chiếu sắp tới')
      .setRequired(false)
      .addChoices(
        { name: '📁 Kho phim có sẵn (Danh sách phim)', value: 'kho' },
        { name: '⏳ Lịch chiếu sắp tới (Suất chiếu)', value: 'lich' },
      )
  )
  .setDMPermission(false);

function buildKhoEmbed(movies, page, totalPages, upcomingShows) {
  const pageSize = 5;
  const startIdx = page * pageSize;
  const pageMovies = movies.slice(startIdx, startIdx + pageSize);
  const now = Date.now();
  const upcomingCount = Array.isArray(upcomingShows) ? upcomingShows.length : 0;

  let headerNotice = '';
  if (upcomingCount > 0) {
    const nextShow = upcomingShows[0];
    const nStart = Math.floor(Date.parse(nextShow.startsAt) / 1000);
    const rId = nextShow.roomId || 1;
    headerNotice = `\n\n📢 **Lịch chiếu gần nhất:** **${nextShow.title}** tại **Cinema ${rId}** (<t:${nStart}:R>).\n👉 Bấm nút **[ ⏳ Lịch Chiếu Sắp Tới (${upcomingCount}) ]** bên dưới để xem toàn bộ lịch chiếu!`;
  }

  const embed = new EmbedBuilder()
    .setColor(0xE50914) // Cinema Red
    .setTitle('📁 VNL CINEMA · KHO PHIM CÓ SẴN')
    .setDescription(
      `Hiện có **${movies.length}** bộ phim sẵn sàng phát trong kho.\n` +
      `🍿 Vào phòng thoại Cinema và dùng lệnh \`/cinema1\`, \`/cinema2\`, \`/cinema3\` để phát phim vào từng phòng.` +
      headerNotice
    )
    .setFooter({
      text: `VNL Cinema • Kho phim (Trang ${page + 1}/${totalPages}) • Cùng xem, cùng một khoảnh khắc`,
    })
    .setTimestamp();

  if (pageMovies.length === 0) {
    embed.addFields({
      name: 'Kho phim trống',
      value: 'Chưa có phim nào trong kho. Vui lòng quay lại sau.',
    });
    return embed;
  }

  for (let i = 0; i < pageMovies.length; i++) {
    const m = pageMovies[i];
    const index = startIdx + i + 1;

    let statusText = '🍿 Sẵn sàng phát (`/cinema`)';
    if (m.scheduleShow) {
      const sStart = Date.parse(m.scheduleShow.startsAt);
      const sEnd = Date.parse(m.scheduleShow.endsAt);
      const roomTag = `Cinema ${m.scheduleShow.roomId || 1}`;
      if (Number.isFinite(sStart) && Number.isFinite(sEnd)) {
        if (sStart <= now && now < sEnd) {
          statusText = `🔴 **Đang chiếu tại ${roomTag}** (kết thúc <t:${Math.floor(sEnd / 1000)}:t>)`;
        } else if (sStart > now) {
          statusText = `⏳ **Có lịch chiếu tại ${roomTag}:** <t:${Math.floor(sStart / 1000)}:t> (<t:${Math.floor(sStart / 1000)}:R>)`;
        }
      }
    }

    const uploadTime = m.lastModified
      ? `<t:${Math.floor(m.lastModified.getTime() / 1000)}:f> (<t:${Math.floor(m.lastModified.getTime() / 1000)}:R>)`
      : 'Có sẵn trên kho';

    const fieldContent = [
      `⏱️ **Thời lượng:** ${formatDuration(m.durationSeconds)}`,
      `🎬 **Trạng thái:** ${statusText}`,
      `📅 **Ngày tải lên:** ${uploadTime}`,
    ].join('\n');

    embed.addFields({
      name: `${index}. 🎞️ ${m.title}`,
      value: fieldContent,
      inline: false,
    });
  }

  return embed;
}

function buildScheduleEmbed(shows, page, totalPages, khoCount) {
  const pageSize = 5;
  const startIdx = page * pageSize;
  const pageShows = shows.slice(startIdx, startIdx + pageSize);
  const now = Date.now();

  const embed = new EmbedBuilder()
    .setColor(0x5865F2) // Discord Blurple
    .setTitle('⏳ VNL CINEMA · LỊCH CHIẾU SẮP TỚI')
    .setDescription(
      `Hiện có **${shows.length}** suất chiếu đã được lên lịch tại các phòng Cinema.\n` +
      `🍿 Khi đến giờ chiếu, bot sẽ tự động gửi thông báo và mở rạp xem phim.\n\n` +
      `👉 *Bấm nút **[ 📁 Kho Phim Có Sẵn (${khoCount}) ]** bên dưới để xem toàn bộ phim có sẵn trong kho.*`
    )
    .setFooter({
      text: `VNL Cinema • Lịch chiếu (Trang ${page + 1}/${totalPages}) • Cùng xem, cùng một khoảnh khắc`,
    })
    .setTimestamp();

  if (pageShows.length === 0) {
    embed.addFields({
      name: 'Chưa có lịch chiếu',
      value: 'Hiện chưa có suất chiếu nào sắp tới. Bạn có thể dùng `/cinema1`, `/cinema2`, `/cinema3` để chọn phim phát ngay từ kho!',
    });
    return embed;
  }

  for (let i = 0; i < pageShows.length; i++) {
    const s = pageShows[i];
    const index = startIdx + i + 1;
    const startUnix = Math.floor(Date.parse(s.startsAt) / 1000);
    const endUnix = Math.floor(Date.parse(s.endsAt) / 1000);
    const roomNum = s.roomId || 1;
    const isOngoing = Date.parse(s.startsAt) <= now && now < Date.parse(s.endsAt);
    const durMins = Math.round((Date.parse(s.endsAt) - Date.parse(s.startsAt)) / 60000) || 120;

    let timeText = '';
    let statusText = '';
    if (isOngoing) {
      statusText = `🔴 **Đang chiếu trực tiếp**`;
      timeText = `⏰ **Thời gian:** <t:${startUnix}:t> - <t:${endUnix}:t> (Kết thúc <t:${endUnix}:R>)`;
    } else {
      statusText = `⏳ **Sắp công chiếu** (<t:${startUnix}:R>)`;
      timeText = `⏰ **Bắt đầu:** <t:${startUnix}:F> (<t:${startUnix}:t> - <t:${endUnix}:t>)`;
    }

    const fieldContent = [
      `📍 **Phòng chiếu:** 🎬 **Cinema ${roomNum}** (Phòng ${roomNum})`,
      `🎬 **Trạng thái:** ${statusText}`,
      timeText,
      `⏱️ **Thời lượng:** ~${durMins} phút`,
      `🍿 **Lệnh xem:** \`/cinema${roomNum}\``,
    ].join('\n');

    embed.addFields({
      name: `${index}. 🎞️ ${s.title}`,
      value: fieldContent,
      inline: false,
    });
  }

  return embed;
}

function buildActionRows(currentTab, page, totalPages, khoCount, upcomingCount) {
  const rows = [];

  const tabRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('cinemalist:tab:kho')
      .setLabel(`📁 Kho Phim Có Sẵn (${khoCount})`)
      .setStyle(currentTab === 'kho' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('cinemalist:tab:lich')
      .setLabel(`⏳ Lịch Chiếu Sắp Tới (${upcomingCount})`)
      .setStyle(currentTab === 'lich' ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );
  rows.push(tabRow);

  if (totalPages > 1) {
    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('cinemalist:prev')
        .setLabel('⬅️ Trang trước')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId('cinemalist:indicator')
        .setLabel(`${page + 1} / ${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId('cinemalist:next')
        .setLabel('Trang sau ➡️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1)
    );
    rows.push(navRow);
  }

  return rows;
}

async function execute(interaction) {
  if (!interaction.inGuild()) return;

  if (process.env.CINEMA_ENABLED !== 'true') {
    return interaction.reply({
      content: 'Chức năng Cinema chưa được bật bởi chủ bot.',
      flags: 64,
    });
  }

  await interaction.deferReply();

  try {
    const config = cinema.getConfig(interaction.guildId);
    const movies = await cinema.listUploadedMovies(interaction.guildId);

    const now = Date.now();
    const upcomingShows = (config.shows || []).filter(s => {
      const end = Date.parse(s.endsAt);
      return Number.isFinite(end) && end > now;
    }).sort((a, b) => a.startsAt.localeCompare(b.startsAt));

    const requestedMuc = interaction.options?.getString?.('muc');
    let currentTab = requestedMuc === 'lich' ? 'lich' : 'kho';

    // Nếu kho phim trống mà có lịch chiếu thì tự động chuyển sang tab lịch chiếu
    if (movies.length === 0 && upcomingShows.length > 0 && !requestedMuc) {
      currentTab = 'lich';
    }

    const pageSize = 5;
    const totalKhoPages = Math.max(1, Math.ceil(movies.length / pageSize));
    const totalLichPages = Math.max(1, Math.ceil(upcomingShows.length / pageSize));
    let currentPage = 0;

    const isKho = currentTab === 'kho';
    const totalPages = isKho ? totalKhoPages : totalLichPages;

    const initialEmbed = isKho
      ? buildKhoEmbed(movies, currentPage, totalKhoPages, upcomingShows)
      : buildScheduleEmbed(upcomingShows, currentPage, totalLichPages, movies.length);
    const initialRows = buildActionRows(currentTab, currentPage, totalPages, movies.length, upcomingShows.length);

    const response = await interaction.editReply({
      embeds: [initialEmbed],
      components: initialRows,
    });

    const collector = response.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 300000, // 5 phút
    });

    collector.on('collect', async i => {
      if (i.customId === 'cinemalist:tab:kho') {
        currentTab = 'kho';
        currentPage = 0;
      } else if (i.customId === 'cinemalist:tab:lich') {
        currentTab = 'lich';
        currentPage = 0;
      } else if (i.customId === 'cinemalist:prev') {
        currentPage = Math.max(0, currentPage - 1);
      } else if (i.customId === 'cinemalist:next') {
        const maxP = currentTab === 'kho' ? totalKhoPages : totalLichPages;
        currentPage = Math.min(maxP - 1, currentPage + 1);
      }

      const activeKho = currentTab === 'kho';
      const activeTotalPages = activeKho ? totalKhoPages : totalLichPages;
      const newEmbed = activeKho
        ? buildKhoEmbed(movies, currentPage, activeTotalPages, upcomingShows)
        : buildScheduleEmbed(upcomingShows, currentPage, activeTotalPages, movies.length);
      const newRows = buildActionRows(currentTab, currentPage, activeTotalPages, movies.length, upcomingShows.length);

      await i.update({
        embeds: [newEmbed],
        components: newRows,
      });
    });

    collector.on('end', async () => {
      try {
        const activeKho = currentTab === 'kho';
        const activeTotalPages = activeKho ? totalKhoPages : totalLichPages;
        const disabledRows = buildActionRows(currentTab, currentPage, activeTotalPages, movies.length, upcomingShows.length);
        for (const r of disabledRows) {
          r.components.forEach(c => c.setDisabled(true));
        }
        await interaction.editReply({ components: disabledRows }).catch(() => {});
      } catch {}
    });
  } catch (err) {
    console.error('[CINEMA LIST] Lỗi lấy danh sách phim:', err);
    return interaction.editReply({
      content: '❌ Chưa thể tải kho phim. Vui lòng thử lại sau.',
      embeds: [],
      components: [],
    });
  }
}

module.exports = {
  data,
  execute,
  buildKhoEmbed,
  buildScheduleEmbed,
  buildActionRows,
};
