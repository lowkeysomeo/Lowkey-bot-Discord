'use strict';

const cinema = require('./cinema');
const { withPoster } = require('./cinemaPresentation');
const pendingReminders = new Set();

const activeCinemaSessions = new Map(); // guildId -> { showKey, show, joined, announced, connection }
let timer = null;

function checkShows(client) {
  if (!client.isReady() || process.env.CINEMA_ENABLED !== 'true') return;

  const now = Date.now();

  for (const guild of client.guilds.cache.values()) {
    try {
      const config = cinema.getConfig(guild.id);
      if (!config.enabled || !Array.isArray(config.shows) || !config.shows.length) {
        cleanupSession(guild, true);
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

        const voiceCh = cinema.getCinemaRoomChannel(guild, config, upcoming.roomId || 1);
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
              const reminderKey = `${guild.id}:${cinema.showIdentity(upcoming)}:early`;
              if (notifyChan && typeof notifyChan.send === 'function' && !pendingReminders.has(reminderKey)) {
                pendingReminders.add(reminderKey);
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
                  embeds: withPoster(embedEarly, upcoming),
                  ...(allowedMentions ? { allowedMentions } : {})
                }).then(() => cinema.markReminderAnnounced(guild.id, upcoming, 'early'))
                  .catch(err => console.error('[CINEMA SCHEDULER] Lỗi gửi thông báo sớm:', err.message))
                  .finally(() => pendingReminders.delete(reminderKey));
              }
            }
          }
        }

        // MỐC 2: Thông báo trước khi chiếu 10 phút
        if (remind10mEnabled) {
          if (msUntilStart <= 10 * 60 * 1000 && msUntilStart > 0) {
            if (!cinema.isReminderAnnounced(guild.id, upcoming, '10m')) {
              const reminderKey = `${guild.id}:${cinema.showIdentity(upcoming)}:10m`;
              if (notifyChan && typeof notifyChan.send === 'function' && !pendingReminders.has(reminderKey)) {
                pendingReminders.add(reminderKey);
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
                  embeds: withPoster(embed10m, upcoming),
                  ...(allowedMentions ? { allowedMentions } : {})
                }).then(() => cinema.markReminderAnnounced(guild.id, upcoming, '10m'))
                  .catch(err => console.error('[CINEMA SCHEDULER] Lỗi gửi thông báo 10p:', err.message))
                  .finally(() => pendingReminders.delete(reminderKey));
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
          const showKey = cinema.showIdentity(currentShow);
          const isSameShow = session && (
            session.showKey === showKey ||
            (session.show && !session.show.id && session.show.title === currentShow.title &&
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
            const savedAnnounce = cinema.getActiveAnnouncement(guild.id, roomNum);
            if (savedAnnounce && savedAnnounce.channelId && savedAnnounce.messageId) {
              const chan = guild.channels?.cache?.get(savedAnnounce.channelId);
              if (chan && typeof chan.messages?.fetch === 'function') {
                chan.messages.fetch(savedAnnounce.messageId).then(m => {
                  if (m) session.announcementMessage = m;
                }).catch(() => {});
              }
            }
            activeCinemaSessions.set(sessionKey, session);
            if (roomNum === 1 || !activeCinemaSessions.has(guild.id)) {
              activeCinemaSessions.set(guild.id, session);
            }
          }

          const voiceChannel = cinema.getCinemaRoomChannel(guild, config, roomNum);

          if (voiceChannel && session.voiceStatusSet !== currentShow.title) {
            session.voiceChannelId = voiceChannel.id;
            const statusText = cinema.formatCinemaVoiceStatus(currentShow.title);
            cinema.updateVoiceChannelStatus(client, voiceChannel.id, statusText).then(ok => { if (ok) session.voiceStatusSet = currentShow.title; }).catch(() => {});
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
          } else if (!session.announcing) {
            session.announcing = true;

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

                if (activeCinemaSessions.get(sessionKey) !== session) return;
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
                    embeds: withPoster(embed, currentShow),
                    components,
                    ...(allowedMentions ? { allowedMentions } : {})
                  }).catch(err => {
                    console.error(`[CINEMA SCHEDULER] Không thể gửi thông báo tới #${targetChannel.name}:`, err.message);
                    throw err;
                  });
                  // A successful send may return undefined in test adapters.
                  if (msg) {
                    session.announcementMessage = msg;
                    if (targetChannel && targetChannel.id && msg.id) {
                      cinema.saveActiveAnnouncement(guild.id, roomNum, {
                        channelId: targetChannel.id,
                        messageId: msg.id,
                        showTitle: currentShow.title,
                        startsAt: currentShow.startsAt,
                        endsAt: currentShow.endsAt,
                        roomId: roomNum,
                      });
                    }
                  }
                  if (activeCinemaSessions.get(sessionKey) === session) {
                    session.announced = true;
                    cinema.markShowAnnounced(guild.id, currentShow);
                  }
                }
              } catch (annErr) {
                console.error('[CINEMA SCHEDULER] Lỗi thông báo chiếu phim:', annErr.message);
              } finally {
                session.announcing = false;
              }
            })();
          }
        } else {
          const savedAnnounce = cinema.getActiveAnnouncement(guild.id, roomNum);
          const hasExpiredSavedShow = savedAnnounce && Number.isFinite(Date.parse(savedAnnounce.endsAt)) && Date.parse(savedAnnounce.endsAt) <= now;
          if (activeCinemaSessions.has(sessionKey) || hasExpiredSavedShow) {
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
    const savedAnnounce = cinema.getActiveAnnouncement(guild.id, rId);

    // Xóa tiêu đề/trạng thái phòng chiếu nếu có hoặc khi kết thúc phim
    try {
      const config = cinema.getConfig(guild.id);
      const targetChannel = (session && session.voiceChannelId)
        ? guild.channels?.cache?.get(session.voiceChannelId)
        : cinema.getCinemaRoomChannel(guild, config, rId);
      if (session && targetChannel && targetChannel.id && (session.voiceStatusSet || notifyEnd)) {
        cinema.updateVoiceChannelStatus(guild.client, targetChannel.id, '').catch(() => {});
      }
    } catch (err) {
      console.warn(`[CINEMA SCHEDULER] Không thể xóa trạng thái voice channel phòng ${rId}:`, err.message);
    }

    if (!session && !savedAnnounce) continue;

    try {
      if (session && session.connection) {
        try { session.connection.destroy(); } catch {}
      }

      const showTitle = session?.show?.title || savedAnnounce?.showTitle || '';
      const showEndsAt = session?.show?.endsAt || savedAnnounce?.endsAt || null;

      console.log(`[CINEMA SCHEDULER] ⏹️ Đã rời kênh thoại tại ${guild.name} (Suất chiếu "${showTitle}" kết thúc tại Cinema ${rId}).`);

      // Xóa bản ghi active announcement sau khi xử lý
      cinema.clearActiveAnnouncement(guild.id, rId);

      const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('⏹️ Suất chiếu đã kết thúc')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
          .setCustomId('cinema:ended_' + Math.random().toString(36).slice(2, 6))
      );

      const endUnix = Math.floor((showEndsAt ? Date.parse(showEndsAt) : Date.now()) / 1000);
      const endedEmbed = new EmbedBuilder()
        .setColor(0x808080)
        .setTitle(`🎬 SUẤT CHIẾU ĐÃ KẾT THÚC: ${showTitle}${rId > 1 ? ` (Cinema ${rId})` : ''}`)
        .setDescription(`Suất chiếu bộ phim **${showTitle || 'phim'}**${rId > 1 ? ` tại Cinema ${rId}` : ''} đã kết thúc lúc <t:${endUnix}:t> (<t:${endUnix}:R>).\n\nCảm ơn tất cả mọi người đã tham gia cùng rạp phim! Hẹn gặp lại ở các suất chiếu tiếp theo. ✨`)
        .setFooter({ text: `VNL Cinema ${rId} • Suất chiếu đã kết thúc` })
        .setTimestamp();

      const messages = [
        session?.announcementMessage,
        ...(Array.isArray(session?.messages) ? session.messages : [])
      ].filter(Boolean);

      let editSuccess = false;

      for (const msg of messages) {
        if (typeof msg.edit === 'function') {
          try {
            msg.edit({
              content: null,
              embeds: [endedEmbed],
              components: [disabledRow]
            }).catch(() => {
              msg.edit({ components: [disabledRow] }).catch(() => {});
            });
            editSuccess = true;
          } catch {}
        }
      }

      // Nếu bot vừa khởi động lại và session trong RAM không có message, nạp từ Database
      if (!editSuccess && savedAnnounce && savedAnnounce.channelId && savedAnnounce.messageId) {
        (async () => {
          try {
            const chan = guild.channels?.cache?.get(savedAnnounce.channelId) || await guild.channels?.fetch?.(savedAnnounce.channelId).catch(() => null);
            if (chan && typeof chan.messages?.fetch === 'function') {
              const fetchedMsg = await chan.messages.fetch(savedAnnounce.messageId).catch(() => null);
              if (fetchedMsg && typeof fetchedMsg.edit === 'function') {
                await fetchedMsg.edit({
                  content: null,
                  embeds: [endedEmbed],
                  components: [disabledRow]
                }).catch(() => {
                  fetchedMsg.edit({ components: [disabledRow] }).catch(() => {});
                });
                editSuccess = true;
              }
            }
          } catch (fetchErr) {
            console.warn(`[CINEMA SCHEDULER] Không thể khôi phục và sửa tin nhắn thông báo (Room ${rId}):`, fetchErr.message);
          }

          if (notifyEnd && showTitle && !editSuccess) {
            try {
              const config = cinema.getConfig(guild.id);
              const notifyChanId = config.notifyChannelId || savedAnnounce?.channelId;
              if (notifyChanId) {
                const notifyCh = guild.channels?.cache?.get(notifyChanId) || await guild.channels?.fetch?.(notifyChanId).catch(() => null);
                if (notifyCh && typeof notifyCh.send === 'function') {
                  notifyCh.send({ embeds: [endedEmbed] }).catch(() => {});
                }
              }
            } catch (_) {}
          }
        })();
      } else if (notifyEnd && showTitle && !editSuccess) {
        const config = cinema.getConfig(guild.id);
        if (config.notifyChannelId) {
          const notifyCh = guild.channels?.cache?.get(config.notifyChannelId);
          if (notifyCh && typeof notifyCh.send === 'function') {
            notifyCh.send({ embeds: [endedEmbed] }).catch(() => {});
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
    activeCinemaSessions.delete(guild.id);
  } else {
    const remaining = [1, 2, 3].map(id => activeCinemaSessions.get(`${guild.id}_room${id}`)).find(Boolean);
    activeCinemaSessions.set(guild.id, remaining);
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
