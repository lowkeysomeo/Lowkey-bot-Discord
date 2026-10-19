'use strict';

const cinema = require('./cinema');

const activeCinemaSessions = new Map(); // guildId -> { showKey, show, joined, announced, connection }
let timer = null;

function checkShows(client) {
  if (!client.isReady() || process.env.CINEMA_ENABLED !== 'true') return;

  const now = Date.now();

  for (const guild of client.guilds.cache.values()) {
    try {
      const config = cinema.getConfig(guild.id);
      if (!config.enabled || !Array.isArray(config.shows) || !config.shows.length) {
        cleanupSession(guild);
        continue;
      }

      const currentShow = config.shows.find(s => {
        const start = Date.parse(s.startsAt);
        const end = Date.parse(s.endsAt);
        return Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end;
      });

      if (currentShow) {
        const showKey = `${currentShow.startsAt}_${currentShow.title}`;
        let session = activeCinemaSessions.get(guild.id);

        const isSameShow = session && (
          session.showKey === showKey ||
          (session.show && session.show.title === currentShow.title &&
           Math.abs(Date.parse(session.show.startsAt) - Date.parse(currentShow.startsAt)) < 30 * 60 * 1000)
        );

        if (session && !isSameShow) {
          // Suất cũ vừa hết, một bộ phim khác bắt đầu ngay
          cleanupSession(guild, false);
          session = null;
        }

        if (session && isSameShow) {
          // Cập nhật lại show mới nhất nhưng bảo toàn trạng thái đã thông báo và connection
          session.show = currentShow;
          session.showKey = showKey;
        }

        if (!session) {
          const isAnnounced = cinema.isShowAnnounced(guild.id, currentShow, now);
          session = { showKey, show: currentShow, joined: false, announced: isAnnounced };
          activeCinemaSessions.set(guild.id, session);
        }

        // 1. Tự động vào kênh Voice
        const cinemaCategory = cinema.getCinemaCategory(guild, config);
        let voiceChannel = null;
        if (config.voiceChannelId) {
          voiceChannel = guild.channels.cache.get(config.voiceChannelId);
        }

        // Nếu có danh mục Cinema, đảm bảo kênh voice phải thuộc danh mục này
        if (cinemaCategory) {
          if (!voiceChannel || voiceChannel.parentId !== cinemaCategory.id) {
            const cinemaVoices = cinema.getCinemaVoiceChannels(guild, config);
            voiceChannel = (cinemaVoices && typeof cinemaVoices.first === 'function' ? cinemaVoices.first() : null) || null;
          }
        }

        if (voiceChannel && voiceChannel.isVoiceBased() && !session.joined) {
          try {
            const { joinVoiceChannel } = require('@discordjs/voice');
            session.connection = joinVoiceChannel({
              channelId: voiceChannel.id,
              guildId: guild.id,
              adapterCreator: guild.voiceAdapterCreator,
              selfDeaf: true,
              selfMute: true,
            });
            session.joined = true;
            console.log(`[CINEMA SCHEDULER] ✅ Bot đã tự động vào kênh thoại #${voiceChannel.name} để phát "${currentShow.title}" (${guild.name})`);
          } catch (err) {
            console.error(`[CINEMA SCHEDULER] Không thể vào voice channel:`, err.message);
          }
        }

        // 2. Tự động gửi thông báo & thẻ mời xem phim (Chỉ gửi 1 lần duy nhất / 1 suất chiếu)
        const alreadyAnnounced = session.announced || cinema.isShowAnnounced(guild.id, currentShow, now);
        if (alreadyAnnounced) {
          session.announced = true;
        } else {
          session.announced = true;
          cinema.markShowAnnounced(guild.id, currentShow);

          (async () => {
            try {
              let voiceChannel = config.voiceChannelId ? guild.channels.cache.get(config.voiceChannelId) : null;
              if (cinemaCategory && (!voiceChannel || voiceChannel.parentId !== cinemaCategory.id)) {
                const cinemaVoices = cinema.getCinemaVoiceChannels(guild, config);
                voiceChannel = (cinemaVoices && typeof cinemaVoices.first === 'function' ? cinemaVoices.first() : null) || null;
              }

              let inviteUrl = null;
              if (voiceChannel && typeof voiceChannel.createInvite === 'function') {
                try {
                  const invite = await voiceChannel.createInvite({
                    targetApplication: client.user.id,
                    targetType: 2, // EmbeddedApplication (Activity)
                    maxAge: Math.max(600, Math.floor((Date.parse(currentShow.endsAt) - now) / 1000)),
                  });
                  inviteUrl = invite.url;
                } catch {
                  // Fallback nếu thiếu quyền tạo invite hoặc chưa bật activity trên portal
                }
              }

              const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
              const startUnix = Math.floor(Date.parse(currentShow.startsAt) / 1000);
              const endUnix = Math.floor(Date.parse(currentShow.endsAt) / 1000);
              const activityWebUrl = (process.env.DASHBOARD_URL || 'https://vietnamlegacy.up.railway.app').replace(/\/$/, '') + '/activity';
              const watchUrl = inviteUrl || activityWebUrl;
              const voiceTag = voiceChannel ? `<#${voiceChannel.id}>` : 'VNL Cinema';

              let description = '';
              if (config.notifyMessage && config.notifyMessage.trim()) {
                description = config.notifyMessage
                  .replace(/{phim}|{ten_phim}|{title}/gi, currentShow.title)
                  .replace(/{kenh_voice}|{voice}/gi, voiceTag)
                  .replace(/{gio_chieu}|{start}/gi, `<t:${startUnix}:t> (<t:${startUnix}:R>)`)
                  .replace(/{gio_ket_thuc}|{end}/gi, `<t:${endUnix}:t>`)
                  .replace(/{link_xem}|{link}/gi, watchUrl);
              } else {
                description = `Bộ phim **${currentShow.title}** đang được chiếu tại **${voiceTag}**!\n\n⏰ **Suất chiếu:** <t:${startUnix}:t> - <t:${endUnix}:t> (<t:${startUnix}:R>)\n🍿 **Cách xem:** ${inviteUrl ? 'Bấm nút **Vào rạp xem phim** bên dưới hoặc ' : ''}vào phòng thoại và gõ lệnh \`/cinema\` để mở màn hình xem phim cùng mọi người.`;
              }

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

              const embed = new EmbedBuilder()
                .setColor(0xE50914) // Cinema Red
                .setTitle(`🎬 RẠP PHIM ĐÃ BẮT ĐẦU: ${currentShow.title}`)
                .setDescription(description)
                .setFooter({ text: 'VNL Cinema • Tự động phát theo lịch' })
                .setTimestamp();

              const components = [
                new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setLabel('🍿 Vào rạp xem phim ngay')
                    .setStyle(ButtonStyle.Link)
                    .setURL(watchUrl)
                )
              ];

              // Chỉ gửi 1 lần duy nhất tới kênh chỉ định (hoặc ưu tiên kênh thông báo thuộc danh mục Cinema)
              let targetChannel = config.notifyChannelId ? guild.channels.cache.get(config.notifyChannelId) : null;
              if (!targetChannel && cinemaCategory) {
                targetChannel = guild.channels.cache.find(c =>
                  c.parentId === cinemaCategory.id && (c.type === 0 || c.type === 5) && /thông[- ]?báo/i.test(c.name || '')
                ) || guild.channels.cache.find(c =>
                  c.parentId === cinemaCategory.id && (c.type === 0 || c.type === 5)
                );
              }
              if (!targetChannel && voiceChannel && typeof voiceChannel.send === 'function') {
                targetChannel = voiceChannel;
              }

              if (targetChannel && typeof targetChannel.send === 'function') {
                await targetChannel.send({
                  content,
                  embeds: [embed],
                  components,
                  ...(allowedMentions ? { allowedMentions } : {})
                }).catch(err => {
                  console.error(`[CINEMA SCHEDULER] Không thể gửi thông báo tới #${targetChannel.name}:`, err.message);
                });
              }
            } catch (annErr) {
              console.error('[CINEMA SCHEDULER] Lỗi thông báo chiếu phim:', annErr.message);
            }
          })();
        }
      } else {
        // Không có suất chiếu nào đang diễn ra
        if (activeCinemaSessions.has(guild.id)) {
          cleanupSession(guild, true);
        }
      }
    } catch (err) {
      console.error(`[CINEMA SCHEDULER] Lỗi kiểm tra guild ${guild.id}:`, err.message);
    }
  }
}

function cleanupSession(guild, notifyEnd = false) {
  const session = activeCinemaSessions.get(guild.id);
  if (!session) return;

  try {
    if (session.connection) {
      session.connection.destroy();
    } else {
      const { getVoiceConnection } = require('@discordjs/voice');
      const conn = getVoiceConnection(guild.id);
      if (conn) conn.destroy();
    }
    console.log(`[CINEMA SCHEDULER] ⏹️ Đã rời kênh thoại tại ${guild.name} (Suất chiếu "${session.show?.title || ''}" kết thúc).`);

    if (notifyEnd) {
      const config = cinema.getConfig(guild.id);
      if (config.notifyChannelId) {
        const notifyCh = guild.channels.cache.get(config.notifyChannelId);
        if (notifyCh && typeof notifyCh.send === 'function') {
          const { EmbedBuilder } = require('discord.js');
          const endEmbed = new EmbedBuilder()
            .setColor(0x808080)
            .setTitle(`🎬 KẾT THÚC SUẤT CHIẾU: ${session.show?.title || ''}`)
            .setDescription(`Suất chiếu bộ phim **${session.show?.title || ''}** đã kết thúc.\nCảm ơn tất cả mọi người đã tham gia cùng rạp phim! Hẹn gặp lại ở các suất chiếu tiếp theo. ✨`)
            .setFooter({ text: 'VNL Cinema' })
            .setTimestamp();
          notifyCh.send({ embeds: [endEmbed] }).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error('[CINEMA SCHEDULER] Lỗi dọn dẹp session:', err.message);
  }

  activeCinemaSessions.delete(guild.id);
}

function startCinemaScheduler(client) {
  if (timer) clearInterval(timer);
  timer = setInterval(() => checkShows(client), 15000);
  console.log('[CINEMA SCHEDULER] ⏱️ Đã kích hoạt bộ lập lịch rạp phim tự động (quét mỗi 15 giây).');
}

module.exports = {
  start: startCinemaScheduler,
  checkShows,
  activeSessions: activeCinemaSessions,
};
