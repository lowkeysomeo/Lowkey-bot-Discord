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

      if (typeof cinema.ensureCinemaChannelPermissions === 'function') {
        cinema.ensureCinemaChannelPermissions(guild, config).catch(() => {});
      }

      // 1. Kiểm tra các suất chiếu sắp tới để gửi thông báo nhắc trước (2 lần: Lần 1 trước 3 tiếng/tùy chọn, Lần 2 trước 10 phút)
      const preHours = typeof config.preReminderHours === 'number' ? config.preReminderHours : 3;
      const remind10mEnabled = config.remind10m !== false;

      const upcomingShows = config.shows.filter(s => {
        const start = Date.parse(s.startsAt);
        return Number.isFinite(start) && start > now;
      });

      for (const upcoming of upcomingShows) {
        const startUnix = Math.floor(Date.parse(upcoming.startsAt) / 1000);
        const msUntilStart = Date.parse(upcoming.startsAt) - now;

        const cinemaCat = cinema.getCinemaCategory(guild, config);
        let notifyChan = config.notifyChannelId ? guild.channels.cache.get(config.notifyChannelId) : null;
        if (!notifyChan && cinemaCat) {
          notifyChan = guild.channels.cache.find(c =>
            c.parentId === cinemaCat.id && (c.type === 0 || c.type === 5) && /thông[- ]?báo/i.test(c.name || '')
          ) || guild.channels.cache.find(c =>
            c.parentId === cinemaCat.id && (c.type === 0 || c.type === 5)
          );
        }
        if (!notifyChan && config.voiceChannelId) {
          notifyChan = guild.channels.cache.get(config.voiceChannelId);
        }

        let voiceCh = config.voiceChannelId ? guild.channels.cache.get(config.voiceChannelId) : null;
        if (!voiceCh && cinemaCat) {
          const cinemaVoices = cinema.getCinemaVoiceChannels(guild, config);
          voiceCh = (cinemaVoices && typeof cinemaVoices.first === 'function' ? cinemaVoices.first() : null) || null;
        }
        const vTag = voiceCh ? `<#${voiceCh.id}>` : (cinemaCat ? `danh mục ${cinemaCat.name}` : 'phòng chiếu phim');

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

        const { EmbedBuilder } = require('discord.js');

        // MỐC 1: Thông báo sớm (trước X tiếng, mặc định 3 tiếng hoặc tùy chọn)
        if (preHours > 0) {
          const preMs = preHours * 3600 * 1000;
          if (msUntilStart <= preMs && msUntilStart > 10 * 60 * 1000) {
            if (!cinema.isReminderAnnounced(guild.id, upcoming, 'early')) {
              cinema.markReminderAnnounced(guild.id, upcoming, 'early');
              if (notifyChan && typeof notifyChan.send === 'function') {
                const hoursLabel = preHours >= 1 ? `${preHours} tiếng` : `${Math.round(preHours * 60)} phút`;
                const embedEarly = new EmbedBuilder()
                  .setColor(0x5865F2)
                  .setTitle(`📢 SẮP CÔNG CHIẾU: ${upcoming.title} (Còn ~${hoursLabel})`)
                  .setDescription(
                    `Rạp phim VNL Cinema sẽ phát sóng bộ phim **${upcoming.title}** vào lúc **<t:${startUnix}:t>** (<t:${startUnix}:R>)!\n\n` +
                    `⏰ **Thời gian:** <t:${startUnix}:F>\n` +
                    `🔊 **Kênh chiếu:** ${vTag}\n\n` +
                    `🍿 Mọi người hãy chuẩn bị sẵn sàng và đừng bỏ lỡ nhé!`
                  )
                  .setFooter({ text: 'VNL Cinema • Thông báo lịch chiếu' })
                  .setTimestamp();

                notifyChan.send({
                  content,
                  embeds: [embedEarly],
                  ...(allowedMentions ? { allowedMentions } : {})
                }).catch(err => console.error('[CINEMA SCHEDULER] Lỗi gửi thông báo sớm:', err.message));
              }
            }
          }
        }

        // MỐC 2: Thông báo trước khi chiếu 10 phút
        if (remind10mEnabled) {
          if (msUntilStart <= 10 * 60 * 1000 && msUntilStart > 0) {
            if (!cinema.isReminderAnnounced(guild.id, upcoming, '10m')) {
              cinema.markReminderAnnounced(guild.id, upcoming, '10m');
              if (notifyChan && typeof notifyChan.send === 'function') {
                const embed10m = new EmbedBuilder()
                  .setColor(0xFEE75C)
                  .setTitle(`⏰ CHUẨN BỊ LÊN SÓNG: ${upcoming.title} (Còn 10 phút)`)
                  .setDescription(
                    `Chỉ còn **10 phút** nữa, bộ phim **${upcoming.title}** sẽ chính thức lên sóng tại ${vTag}!\n\n` +
                    `⏰ **Bắt đầu lúc:** <t:${startUnix}:t> (<t:${startUnix}:R>)\n\n` +
                    `🍿 Mọi người hãy nhanh chóng vào phòng thoại để ổn định chỗ ngồi và sẵn sàng cùng thưởng thức bộ phim!`
                  )
                  .setFooter({ text: 'VNL Cinema • Đếm ngược 10 phút' })
                  .setTimestamp();

                notifyChan.send({
                  content,
                  embeds: [embed10m],
                  ...(allowedMentions ? { allowedMentions } : {})
                }).catch(err => console.error('[CINEMA SCHEDULER] Lỗi gửi thông báo 10p:', err.message));
              }
            }
          }
        }
      }

      // 2. Kiểm tra suất chiếu đang diễn ra trên từng phòng (Cinema 1, 2, 3)
      let anyRoomActive = false;
      for (const roomNum of [1, 2, 3]) {
        const currentShow = config.shows.find(s => {
          if ((s.roomId || 1) !== roomNum) return false;
          const start = Date.parse(s.startsAt);
          const end = Date.parse(s.endsAt);
          return Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end;
        });

        const sessionKey = `${guild.id}_room${roomNum}`;
        let session = activeCinemaSessions.get(sessionKey);

        if (currentShow) {
          anyRoomActive = true;
          const showKey = `${currentShow.startsAt}_${currentShow.title}`;
          const isSameShow = session && (
            session.showKey === showKey ||
            (session.show && session.show.title === currentShow.title &&
             Math.abs(Date.parse(session.show.startsAt) - Date.parse(currentShow.startsAt)) < 30 * 60 * 1000)
          );

          if (session && !isSameShow) {
            cleanupSession(guild, false, roomNum);
            session = null;
          }

          if (session && isSameShow) {
            session.show = currentShow;
            session.showKey = showKey;
          }

          if (!session) {
            const isAnnounced = cinema.isShowAnnounced(guild.id, currentShow, now);
            session = { showKey, show: currentShow, roomId: roomNum, joined: false, announced: isAnnounced };
            activeCinemaSessions.set(sessionKey, session);
            if (roomNum === 1 || !activeCinemaSessions.has(guild.id)) {
              activeCinemaSessions.set(guild.id, session);
            }
          }

          const voiceChannel = cinema.getCinemaRoomChannel(guild, config, roomNum);

          if (voiceChannel && session.voiceStatusSet !== currentShow.title) {
            session.voiceStatusSet = currentShow.title;
            session.voiceChannelId = voiceChannel.id;
            const statusText = cinema.formatCinemaVoiceStatus(currentShow.title);
            cinema.updateVoiceChannelStatus(client, voiceChannel.id, statusText).catch(() => {});
          }

          if (voiceChannel && voiceChannel.isVoiceBased() && !session.joined) {
            try {
              const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
              const existing = getVoiceConnection(guild.id);
              if (!existing) {
                session.connection = joinVoiceChannel({
                  channelId: voiceChannel.id,
                  guildId: guild.id,
                  adapterCreator: guild.voiceAdapterCreator,
                  selfDeaf: true,
                  selfMute: true,
                });
                session.joined = true;
                console.log(`[CINEMA SCHEDULER] ✅ Bot đã tự động vào kênh thoại #${voiceChannel.name} để phát "${currentShow.title}" tại Cinema ${roomNum} (${guild.name})`);
              }
            } catch (err) {
              console.error(`[CINEMA SCHEDULER] Không thể vào voice channel:`, err.message);
            }
          }

          const alreadyAnnounced = session.announced || cinema.isShowAnnounced(guild.id, currentShow, now);
          if (alreadyAnnounced) {
            session.announced = true;
          } else {
            session.announced = true;
            cinema.markShowAnnounced(guild.id, currentShow);

            (async () => {
              try {
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
                    // Fallback nếu thiếu quyền tạo invite
                  }
                }

                const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                const startUnix = Math.floor(Date.parse(currentShow.startsAt) / 1000);
                const endUnix = Math.floor(Date.parse(currentShow.endsAt) / 1000);
                const activityWebUrl = (process.env.DASHBOARD_URL || 'https://vietnamlegacy.up.railway.app').replace(/\/$/, '') + '/activity';
                const watchUrl = inviteUrl || activityWebUrl;
                const voiceTag = voiceChannel ? `<#${voiceChannel.id}>` : `Cinema ${roomNum}`;

                let description = '';
                if (config.notifyMessage && config.notifyMessage.trim()) {
                  description = config.notifyMessage
                    .replace(/{phim}|{ten_phim}|{title}/gi, currentShow.title)
                    .replace(/{kenh_voice}|{voice}/gi, voiceTag)
                    .replace(/{gio_chieu}|{start}/gi, `<t:${startUnix}:t> (<t:${startUnix}:R>)`)
                    .replace(/{gio_ket_thuc}|{end}/gi, `<t:${endUnix}:t>`)
                    .replace(/{link_xem}|{link}/gi, watchUrl);
                } else {
                  description = `Bộ phim **${currentShow.title}** đang được chiếu tại **${voiceTag}**!\n\n⏰ **Suất chiếu:** <t:${startUnix}:t> - <t:${endUnix}:t> (<t:${startUnix}:R>)\n🍿 **Cách xem:** ${inviteUrl ? 'Bấm nút **Vào rạp xem phim** bên dưới hoặc ' : ''}vào phòng thoại và gõ lệnh \`/cinema${roomNum}\` để mở màn hình xem phim cùng mọi người.`;
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
                  .setTitle(`🎬 RẠP PHIM ĐÃ BẮT ĐẦU: ${currentShow.title}${roomNum > 1 ? ` (Cinema ${roomNum})` : ''}`)
                  .setDescription(description)
                  .setFooter({ text: `VNL Cinema ${roomNum} • Tự động phát theo lịch` })
                  .setTimestamp();

                const components = [
                  new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                      .setLabel(`🍿 Vào rạp xem phim ngay${roomNum > 1 ? ` (Cinema ${roomNum})` : ''}`)
                      .setStyle(ButtonStyle.Link)
                      .setURL(watchUrl)
                  )
                ];

                const cinemaCategory = cinema.getCinemaCategory(guild, config);
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
                  const msg = await targetChannel.send({
                    content,
                    embeds: [embed],
                    components,
                    ...(allowedMentions ? { allowedMentions } : {})
                  }).catch(err => {
                    console.error(`[CINEMA SCHEDULER] Không thể gửi thông báo tới #${targetChannel.name}:`, err.message);
                  });
                  if (msg) session.announcementMessage = msg;
                }
              } catch (annErr) {
                console.error('[CINEMA SCHEDULER] Lỗi thông báo chiếu phim:', annErr.message);
              }
            })();
          }
        } else {
          if (activeCinemaSessions.has(sessionKey)) {
            cleanupSession(guild, true, roomNum);
          }
        }
      }

      if (!anyRoomActive) {
        if (activeCinemaSessions.has(guild.id)) {
          cleanupSession(guild, true);
        }
      }
    } catch (err) {
      console.error(`[CINEMA SCHEDULER] Lỗi kiểm tra guild ${guild.id}:`, err.message);
    }
  }
}

function cleanupSession(guild, notifyEnd = false, roomNumber = null) {
  const roomsToClean = roomNumber ? [Number(roomNumber)] : [1, 2, 3];
  let hasAnySessionLeft = false;

  for (const rId of roomsToClean) {
    const sessionKey = `${guild.id}_room${rId}`;
    const session = activeCinemaSessions.get(sessionKey) || (rId === 1 ? activeCinemaSessions.get(guild.id) : null);

    // Xóa tiêu đề/trạng thái phòng chiếu nếu có hoặc khi kết thúc phim
    try {
      const config = cinema.getConfig(guild.id);
      const targetChannel = (session && session.voiceChannelId)
        ? guild.channels?.cache?.get(session.voiceChannelId)
        : cinema.getCinemaRoomChannel(guild, config, rId);
      if (targetChannel && targetChannel.id && (session?.voiceStatusSet || notifyEnd)) {
        cinema.updateVoiceChannelStatus(guild.client, targetChannel.id, '').catch(() => {});
      }
    } catch (err) {
      console.warn(`[CINEMA SCHEDULER] Không thể xóa trạng thái voice channel phòng ${rId}:`, err.message);
    }

    if (!session) continue;

    try {
      if (session.connection) {
        try { session.connection.destroy(); } catch {}
      }

      console.log(`[CINEMA SCHEDULER] ⏹️ Đã rời kênh thoại tại ${guild.name} (Suất chiếu "${session.show?.title || ''}" kết thúc).`);

      const messages = [
        session.announcementMessage,
        ...(Array.isArray(session.messages) ? session.messages : [])
      ].filter(Boolean);

      for (const msg of messages) {
        if (typeof msg.edit === 'function') {
          try {
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const disabledRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setLabel('⏹️ Suất chiếu đã kết thúc')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
                .setCustomId('cinema:ended_' + Math.random().toString(36).slice(2, 6))
            );
            msg.edit({ components: [disabledRow] }).catch(() => {});
          } catch {}
        }
      }

      if (notifyEnd && session.show?.title) {
        const config = cinema.getConfig(guild.id);
        if (config.notifyChannelId) {
          const notifyCh = guild.channels.cache.get(config.notifyChannelId);
          if (notifyCh && typeof notifyCh.send === 'function') {
            const { EmbedBuilder } = require('discord.js');
            const endEmbed = new EmbedBuilder()
              .setColor(0x808080)
              .setTitle(`🎬 KẾT THÚC SUẤT CHIẾU: ${session.show?.title || ''}${rId > 1 ? ` (Cinema ${rId})` : ''}`)
              .setDescription(`Suất chiếu bộ phim **${session.show?.title || ''}**${rId > 1 ? ` tại Cinema ${rId}` : ''} đã kết thúc.\nCảm ơn tất cả mọi người đã tham gia cùng rạp phim! Hẹn gặp lại ở các suất chiếu tiếp theo. ✨`)
              .setFooter({ text: 'VNL Cinema' })
              .setTimestamp();
            notifyCh.send({ embeds: [endEmbed] }).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error('[CINEMA SCHEDULER] Lỗi dọn dẹp session:', err.message);
    }

    activeCinemaSessions.delete(sessionKey);
  }

  for (const rId of [1, 2, 3]) {
    if (activeCinemaSessions.has(`${guild.id}_room${rId}`)) {
      hasAnySessionLeft = true;
      break;
    }
  }

  if (!hasAnySessionLeft) {
    try {
      const { getVoiceConnection } = require('@discordjs/voice');
      const conn = getVoiceConnection(guild.id);
      if (conn) conn.destroy();
    } catch {}
    activeCinemaSessions.delete(guild.id);
  }
}

function startCinemaScheduler(client) {
  if (timer) clearInterval(timer);
  timer = setInterval(() => checkShows(client), 15000);
  console.log('[CINEMA SCHEDULER] ⏱️ Đã kích hoạt bộ lập lịch rạp phim tự động (quét mỗi 15 giây).');
}

module.exports = {
  start: startCinemaScheduler,
  checkShows,
  cleanupSession,
  activeSessions: activeCinemaSessions,
};
