'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');

const { music, label } = require('../../utils/musicSystem');
const localMusic = require('../../utils/localMusic');

function buildPanelPayload(tracks, guild) {
  const embed = new EmbedBuilder()
    .setColor('#00d2d3')
    .setAuthor({
      name: `🎵 Kho Nhạc Cục Bộ — ${guild.name}`,
      iconURL: guild.iconURL() || undefined,
    })
    .setTitle('📻 Danh Sách Bài Hát Có Sẵn (MP3 / MP4)')
    .setDescription(
      `Hiện đang có **${tracks.length} bài hát** trong kho nhạc của bot.\n\n` +
      tracks.slice(0, 15).map((t, idx) => `**${idx + 1}.** \`${t.ext.toUpperCase()}\` **${t.title}** *(${t.sizeMb} MB)*`).join('\n') +
      (tracks.length > 15 ? `\n*... và còn ${tracks.length - 15} bài khác.*` : '') +
      `\n\n💡 *Chọn bài hát từ danh mục bên dưới để phát vào kênh Voice, hoặc nhấn "Phát Tất Cả" để thêm toàn bộ vào hàng chờ!*`
    )
    .setFooter({ text: 'Lowkey Music System • Phát trực tiếp qua FFmpeg không lo lag hay chặn IP' })
    .setTimestamp();

  const selectOptions = tracks.slice(0, 25).map((t, idx) => ({
    label: t.title.slice(0, 100),
    description: `Định dạng: ${t.ext.toUpperCase()} • Dung lượng: ${t.sizeMb} MB`,
    value: t.filename.slice(0, 100),
    emoji: t.ext === '.mp4' ? '🎬' : '🎵',
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId('musiclocal:select_track')
    .setPlaceholder('Chọn bài hát bạn muốn phát ngay...')
    .addOptions(selectOptions);

  const rowMenu = new ActionRowBuilder().addComponents(menu);

  const btnPlayAll = new ButtonBuilder()
    .setCustomId('musiclocal:btn_play_all')
    .setLabel('Phát Tất Cả')
    .setEmoji('▶️')
    .setStyle(ButtonStyle.Success);

  const btnShuffle = new ButtonBuilder()
    .setCustomId('musiclocal:btn_shuffle')
    .setLabel('Phát Ngẫu Nhiên')
    .setEmoji('🔀')
    .setStyle(ButtonStyle.Primary);

  const rowButtons = new ActionRowBuilder().addComponents(btnPlayAll, btnShuffle);

  return { embeds: [embed], components: [rowMenu, rowButtons] };
}

async function checkVoiceConditions(interaction) {
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const channel = member.voice.channel;
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    throw new Error('Hãy vào một kênh voice thường trước khi dùng lệnh phát nhạc.');
  }
  const session = music.session(interaction.guildId);
  if (session && session.channelId !== channel.id) {
    throw new Error('Bạn cần ở cùng kênh voice với bot để điều khiển nhạc.');
  }
  const me = await interaction.guild.members.fetchMe();
  if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
    throw new Error('Bot cần quyền Xem kênh, Kết nối và Nói trong kênh voice này.');
  }
  if (channel.full && !me.permissions.has(PermissionFlagsBits.MoveMembers)) {
    throw new Error('Kênh voice đang đầy.');
  }
  return channel;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('musiclocal')
    .setDescription('Quản lý và phát nhạc từ kho nhạc cục bộ (mp3, mp4) của bot')
    .setDMPermission(false)
    .addSubcommand(sub =>
      sub.setName('play')
        .setDescription('Phát bài hát từ kho nhạc hoặc mở bảng điều khiển')
        .addStringOption(opt =>
          opt.setName('bai_hat')
            .setDescription('Tên bài hát trong kho (để trống để mở danh sách chọn)')
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Xem danh sách tất cả các bài hát đang có trong kho nhạc')
    )
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Thêm một bài nhạc (file mp3 hoặc mp4) vào kho của bot')
        .addAttachmentOption(opt =>
          opt.setName('file')
            .setDescription('File âm thanh hoặc video (.mp3, .mp4, .m4a, .wav, .ogg, .flac)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('ten')
            .setDescription('Tên hiển thị cho bài hát (mặc định lấy theo tên file)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Xóa một bài hát khỏi kho nhạc (yêu cầu quyền quản lý)')
        .addStringOption(opt =>
          opt.setName('bai_hat')
            .setDescription('Tên bài hát cần xóa')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const tracks = localMusic.listTracks();
    const filtered = tracks
      .filter(t => t.title.toLowerCase().includes(focused) || t.filename.toLowerCase().includes(focused))
      .slice(0, 25);
    await interaction.respond(
      filtered.map(t => ({
        name: `${t.title} (${t.ext.toUpperCase()} • ${t.sizeMb}MB)`.slice(0, 100),
        value: t.filename,
      }))
    ).catch(() => {});
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ─────────────────────────────────────────────────────────────
    // 1. THÊM BÀI HÁT VÀO KHO (ADD)
    // ─────────────────────────────────────────────────────────────
    if (sub === 'add') {
      await interaction.deferReply({ flags: 64 });
      const attachment = interaction.options.getAttachment('file', true);
      const customName = interaction.options.getString('ten');

      try {
        const saved = await localMusic.saveTrackFromUrl(attachment.url, attachment.name, customName);
        return interaction.editReply({
          content: `✅ Đã thêm thành công bài **${saved.title}** vào kho nhạc!\n` +
            `📁 **Tên file:** \`${saved.filename}\`\n` +
            `📦 **Định dạng:** \`${saved.ext.toUpperCase()}\` • **Dung lượng:** ${saved.sizeMb} MB\n\n` +
            `👉 Dùng lệnh \`/musiclocal play\` để phát bài hát này nhé!`,
        });
      } catch (err) {
        return interaction.editReply({
          content: `❌ Không thể thêm bài hát: ${err.message}`,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 2. XEM DANH SÁCH BÀI HÁT (LIST)
    // ─────────────────────────────────────────────────────────────
    if (sub === 'list') {
      await interaction.deferReply();
      const tracks = localMusic.listTracks();
      if (!tracks.length) {
        return interaction.editReply({
          content: '📂 Kho nhạc hiện tại đang trống!\n' +
            '👉 Bạn có thể dùng lệnh `/musiclocal add` để đính kèm file .mp3 / .mp4, hoặc copy trực tiếp file vào thư mục `data/local_music/` của bot.',
        });
      }

      const totalMb = tracks.reduce((sum, t) => sum + (t.sizeBytes / (1024 * 1024)), 0).toFixed(2);
      const embed = new EmbedBuilder()
        .setColor('#54a0ff')
        .setTitle(`📁 Kho Nhạc Cục Bộ (${tracks.length} bài • ${totalMb} MB)`)
        .setDescription(
          tracks.map((t, idx) => `**${idx + 1}.** \`${t.ext.toUpperCase()}\` **${t.title}** *(${t.sizeMb} MB)*`).join('\n')
        )
        .setFooter({ text: 'Dùng /musiclocal play để phát bất kỳ bài nào' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ─────────────────────────────────────────────────────────────
    // 3. XÓA BÀI HÁT (REMOVE)
    // ─────────────────────────────────────────────────────────────
    if (sub === 'remove') {
      await interaction.deferReply({ flags: 64 });
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.ManageChannels) && !member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.editReply({ content: '⛔ Bạn cần quyền Quản lý kênh hoặc Admin để xóa bài hát khỏi kho.' });
      }

      const query = interaction.options.getString('bai_hat', true);
      const deleted = localMusic.deleteTrack(query);
      if (!deleted) {
        return interaction.editReply({ content: `❌ Không tìm thấy bài hát tương ứng với \`${query}\` để xóa.` });
      }

      return interaction.editReply({
        content: `🗑️ Đã xóa bài hát **${deleted.title}** (\`${deleted.filename}\`) khỏi kho nhạc.`,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 4. PHÁT NHẠC TỪ KHO (PLAY)
    // ─────────────────────────────────────────────────────────────
    if (sub === 'play') {
      const selectedQuery = interaction.options.getString('bai_hat');

      // Nếu không nhập tên bài -> mở bảng menu chọn
      if (!selectedQuery) {
        const tracks = localMusic.listTracks();
        if (!tracks.length) {
          return interaction.reply({
            content: '📂 Kho nhạc hiện tại chưa có bài nào!\n' +
              '👉 Bạn hãy dùng lệnh `/musiclocal add` để tải file `.mp3` hoặc `.mp4` lên trước nhé.',
            flags: 64,
          });
        }

        const payload = buildPanelPayload(tracks, interaction.guild);
        return interaction.reply(payload);
      }

      // Nếu có nhập tên bài -> tìm và phát luôn
      await interaction.deferReply();
      try {
        const channel = await checkVoiceConditions(interaction);
        const trackItem = localMusic.findTrack(selectedQuery);
        if (!trackItem) {
          return interaction.editReply({
            content: `❌ Không tìm thấy bài hát \`${selectedQuery}\` trong kho nhạc. Dùng \`/musiclocal list\` để xem danh sách.`,
          });
        }

        const musicTrack = localMusic.toMusicTrack(trackItem);
        const result = await music.add(interaction, channel, musicTrack);
        const content = result.position
          ? `🎵 Đã thêm **${label(result.track)}** vào hàng chờ (#${result.position}).`
          : `🎵 Đang chuẩn bị phát **${label(result.track)}**…`;

        return interaction.editReply({ content });
      } catch (err) {
        return interaction.editReply({ content: `❌ ${err.message}` });
      }
    }
  },

  /**
   * Xử lý tương tác từ Menu chọn bài và Nút bấm
   */
  async handleInteraction(interaction) {
    if (interaction.isStringSelectMenu() && interaction.customId === 'musiclocal:select_track') {
      await interaction.deferReply();
      try {
        const channel = await checkVoiceConditions(interaction);
        const filename = interaction.values[0];
        const trackItem = localMusic.findTrack(filename);
        if (!trackItem) {
          return interaction.editReply({ content: '❌ Không tìm thấy bài hát đã chọn.' });
        }

        const musicTrack = localMusic.toMusicTrack(trackItem);
        const result = await music.add(interaction, channel, musicTrack);
        const content = result.position
          ? `🎵 Đã thêm **${label(result.track)}** vào hàng chờ (#${result.position}).`
          : `🎵 Đang chuẩn bị phát **${label(result.track)}**…`;

        return interaction.editReply({ content });
      } catch (err) {
        return interaction.editReply({ content: `❌ ${err.message}` });
      }
    }

    if (interaction.isButton() && interaction.customId === 'musiclocal:btn_play_all') {
      await interaction.deferReply();
      try {
        const channel = await checkVoiceConditions(interaction);
        const tracks = localMusic.listTracks();
        if (!tracks.length) {
          return interaction.editReply({ content: '📂 Kho nhạc hiện tại chưa có bài nào.' });
        }

        const musicTracks = tracks.map(t => localMusic.toMusicTrack(t));
        const res = await music.addMultiple(interaction, channel, musicTracks);
        return interaction.editReply({
          content: `🎶 Đã thêm **${res.addedCount} bài hát** trong kho vào hàng chờ phát! (Tổng trong hàng: ${res.totalInQueue} bài)`,
        });
      } catch (err) {
        return interaction.editReply({ content: `❌ ${err.message}` });
      }
    }

    if (interaction.isButton() && interaction.customId === 'musiclocal:btn_shuffle') {
      await interaction.deferReply();
      try {
        const channel = await checkVoiceConditions(interaction);
        const tracks = localMusic.listTracks();
        if (!tracks.length) {
          return interaction.editReply({ content: '📂 Kho nhạc hiện tại chưa có bài nào.' });
        }

        // Xáo trộn ngẫu nhiên Fisher-Yates
        const shuffled = [...tracks];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        const musicTracks = shuffled.map(t => localMusic.toMusicTrack(t));
        const res = await music.addMultiple(interaction, channel, musicTracks);
        return interaction.editReply({
          content: `🔀 Đã xáo trộn và thêm **${res.addedCount} bài hát** vào hàng chờ phát!`,
        });
      } catch (err) {
        return interaction.editReply({ content: `❌ ${err.message}` });
      }
    }
  },
};
