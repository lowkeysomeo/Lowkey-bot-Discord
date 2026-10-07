'use strict';

const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { music, label } = require('./musicSystem');
const { sourceErrorMessage } = require('./musicSource');

function musicCommand(name, description) {
  return { data: { name, description, type: 1,
    ...(name === 'play' ? { options: [{ name: 'query', description: 'Tên bài hát hoặc link YouTube/SoundCloud', type: 3, required: true }] } : {}) },
  async execute(interaction) {
    await interaction.deferReply({ flags: name === 'play' ? undefined : 64 });
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const channel = member.voice.channel;
      if (!channel || channel.type !== ChannelType.GuildVoice) throw new Error('Hãy vào một kênh voice thường trước khi dùng lệnh nhạc.');
      const session = music.session(interaction.guildId);
      if (session && session.channelId !== channel.id) throw new Error('Bạn cần ở cùng kênh voice với bot để điều khiển nhạc.');
      let content;
      if (name === 'play') {
        const me = await interaction.guild.members.fetchMe();
        if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
          throw new Error('Bot cần quyền Xem kênh, Kết nối và Nói trong kênh voice này.');
        }
        if (channel.full && !me.permissions.has(PermissionFlagsBits.MoveMembers)) throw new Error('Kênh voice đang đầy.');
        const result = await music.add(interaction, channel, interaction.options.getString('query', true));
        content = result.position ? `🎵 Đã thêm **${label(result.track)}** vào hàng chờ (#${result.position}).`
          : `🎵 Đang chuẩn bị phát **${label(result.track)}**…`;
      } else {
        if (!session) throw new Error('Chưa có phiên nhạc. Dùng /play để bắt đầu.');
        if (name === 'queue') {
          content = `🎶 **Đang phát:** ${session.current ? label(session.current) : 'Chưa có bài'}\n\n` +
            (session.queue.length ? session.queue.slice(0, 10).map((track, i) => `${i + 1}. ${label(track)}`).join('\n') : 'Hàng chờ trống.') +
            (session.queue.length > 10 ? `\n… còn ${session.queue.length - 10} bài.` : '');
        } else if (name === 'stop') { music.destroy(session); content = '⏹️ Đã dừng nhạc, xoá hàng chờ và rời voice.'; }
        else {
          if (!session.current) throw new Error('Không có bài đang phát.');
          if (name === 'skip') { music.skip(session); content = '⏭️ Đã bỏ qua bài hiện tại.'; }
          if (name === 'pause') { if (!session.player.pause()) throw new Error('Bài hát chưa phát hoặc đã tạm dừng.'); content = '⏸️ Đã tạm dừng.'; }
          if (name === 'resume') { if (!session.player.unpause()) throw new Error('Bài hát chưa tạm dừng.'); content = '▶️ Đã tiếp tục phát.'; }
        }
      }
      await interaction.editReply({ content, allowedMentions: { parse: [] } });
    } catch (error) {
      const known = /^(Nhập|Link|Chỉ hỗ trợ|Không tìm|Bạn |Bot |Hãy |Kênh |Hàng |Chưa |Không có|Bài hát)/.test(error.message);
      if (!known) console.error('[MUSIC] Không tải được nguồn nhạc:', error.code || error.name);
      await interaction.editReply({ content: `❌ ${known ? error.message : sourceErrorMessage(error)}`,
        allowedMentions: { parse: [] } });
    }
  } };
}

module.exports = { musicCommand };
