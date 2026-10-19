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
  .setDescription('Xem danh sách các bộ phim đã được tải lên (upload) trên VNL Cinema')
  .setDMPermission(false);

function buildPageEmbed(movies, page, totalPages) {
  const pageSize = 5;
  const startIdx = page * pageSize;
  const pageMovies = movies.slice(startIdx, startIdx + pageSize);
  const now = Date.now();

  const embed = new EmbedBuilder()
    .setColor(0xE50914) // Cinema Red
    .setTitle('🎬 VNL CINEMA · KHO PHIM')
    .setDescription(`Có **${movies.length}** phim trong kho.\n🍿 Vào phòng thoại Cinema và dùng lệnh \`/cinema\` để xem phim.`)
    .setFooter({
      text: `VNL Cinema • Trang ${page + 1}/${totalPages} • Cùng xem, cùng một khoảnh khắc`,
    })
    .setTimestamp();

  for (let i = 0; i < pageMovies.length; i++) {
    const m = pageMovies[i];
    const index = startIdx + i + 1;

    let statusText = '🍿 Sẵn sàng phát (`/cinema`)';
    if (m.scheduleShow) {
      const sStart = Date.parse(m.scheduleShow.startsAt);
      const sEnd = Date.parse(m.scheduleShow.endsAt);
      if (Number.isFinite(sStart) && Number.isFinite(sEnd)) {
        if (sStart <= now && now < sEnd) {
          statusText = `🔴 **Đang chiếu trực tiếp** (kết thúc <t:${Math.floor(sEnd / 1000)}:t>)`;
        } else if (sStart > now) {
          statusText = `⏳ **Lịch chiếu sắp tới:** <t:${Math.floor(sStart / 1000)}:t> (<t:${Math.floor(sStart / 1000)}:R>)`;
        } else {
          statusText = `🎬 **Suất trước:** đã chiếu ngày <t:${Math.floor(sStart / 1000)}:d>`;
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

function buildActionRows(page, totalPages) {
  const rows = [];

  const navRow = new ActionRowBuilder();
  if (totalPages > 1) {
    navRow.addComponents(
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
  }

  if (navRow.components.length > 0) {
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
    const movies = await cinema.listUploadedMovies(interaction.guildId);

    if (!movies || movies.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setColor(0xE50914)
        .setTitle('🎬 VNL CINEMA · KHO PHIM')
        .setDescription('Kho phim hiện chưa có phim. Vui lòng quay lại sau.')
        .setFooter({ text: 'VNL Cinema' })
        .setTimestamp();

      return interaction.editReply({
        embeds: [emptyEmbed],
        components: [],
      });
    }

    const pageSize = 5;
    const totalPages = Math.ceil(movies.length / pageSize);
    let currentPage = 0;

    const initialEmbed = buildPageEmbed(movies, currentPage, totalPages);
    const initialRows = buildActionRows(currentPage, totalPages);

    const response = await interaction.editReply({
      embeds: [initialEmbed],
      components: initialRows,
    });

    if (totalPages > 1) {
      const collector = response.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time: 300000, // 5 phút
      });

      collector.on('collect', async i => {
        if (i.customId === 'cinemalist:prev') {
          currentPage = Math.max(0, currentPage - 1);
        } else if (i.customId === 'cinemalist:next') {
          currentPage = Math.min(totalPages - 1, currentPage + 1);
        }

        const newEmbed = buildPageEmbed(movies, currentPage, totalPages);
        const newRows = buildActionRows(currentPage, totalPages);

        await i.update({
          embeds: [newEmbed],
          components: newRows,
        });
      });

      collector.on('end', async () => {
        try {
          const disabledRows = buildActionRows(currentPage, totalPages);
          // Vô hiệu hóa nút prev/next
          if (disabledRows[0] && disabledRows[0].components?.[0]?.data?.custom_id?.startsWith?.('cinemalist:')) {
            disabledRows[0].components.forEach(c => c.setDisabled(true));
          }
          await interaction.editReply({ components: disabledRows }).catch(() => {});
        } catch {}
      });
    }
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
};
