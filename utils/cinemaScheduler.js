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

        if (session && session.showKey !== showKey) {
          // Suất cũ vừa hết, suất mới bắt đầu ngay
          cleanupSession(guild, false);
          session = null;
        }

        if (!session) {
          session = { showKey, show: currentShow, joined: false, announced: false };
          activeCinemaSessions.set(guild.id, session);
        }

        // 1. Tự động vào kênh Voice
        if (config.voiceChannelId && !session.joined) {
          const voiceChannel = guild.channels.cache.get(config.voiceChannelId);
          if (voiceChannel && voiceChannel.isVoiceBased()) {
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
        }

        // 2. Tự động gửi thông báo & thẻ mời xem phim
        if (!session.announced) {
          session.announced = true;
          (async () => {
            try {
              const voiceChannel = config.voiceChannelId ? guild.channels.cache.get(config.voiceChannelId) : null;
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

              const embed = new EmbedBuilder()
                .setColor(0xE50914) // Cinema Red
                .setTitle(`🎬 RẠP PHIM ĐÃ BẮT ĐẦU: ${currentShow.title}`)
                .setDescription(`Bộ phim **${currentShow.title}** đang được chiếu tại **${voiceChannel ? `<#${voiceChannel.id}>` : 'VNL Cinema'}**!\n\n⏰ **Suất chiếu:** <t:${startUnix}:t> - <t:${endUnix}:t> (<t:${startUnix}:R>)\n🍿 **Cách xem:** ${inviteUrl ? 'Bấm nút **Vào rạp xem phim** bên dưới hoặc ' : ''}vào phòng thoại và gõ lệnh \`/cinema\` để mở màn hình xem phim cùng mọi người.`)
                .setFooter({ text: 'VNL Cinema • Tự động phát theo lịch' })
                .setTimestamp();

              const activityWebUrl = (process.env.DASHBOARD_URL || 'https://vietnamlegacy.up.railway.app').replace(/\/$/, '') + '/activity';
              const components = [
                new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setLabel('🍿 Vào rạp xem phim ngay')
                    .setStyle(ButtonStyle.Link)
                    .setURL(inviteUrl || activityWebUrl)
                )
              ];

              if (config.notifyChannelId) {
                const notifyCh = guild.channels.cache.get(config.notifyChannelId);
                if (notifyCh && typeof notifyCh.send === 'function') {
                  await notifyCh.send({ embeds: [embed], components }).catch(() => {});
                }
              }

              if (voiceChannel && voiceChannel.id !== config.notifyChannelId && typeof voiceChannel.send === 'function') {
                await voiceChannel.send({ embeds: [embed], components }).catch(() => {});
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
