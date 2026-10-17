'use strict';

const voice = require('@discordjs/voice');
const { EmbedBuilder } = require('discord.js');

let voiceAdapter = voice;
const activeSessions = new Map(); // guildId -> { guildId, channelId, userId, textChannelId, connection, timer, startedAt }

function setVoiceAdapter(adapter) {
  voiceAdapter = adapter || voice;
}

/**
 * Mời bot vào phòng Voice của thành viên để làm Viewer hỗ trợ nhiệm vụ Stream 15 phút.
 */
async function startQuestStream(member, textChannel) {
  if (!member.guild) throw new Error('Chỉ có thể dùng trong server.');
  const voiceChannel = member.voice?.channel;
  if (!voiceChannel) {
    throw new Error('Bạn cần tham gia vào một kênh Voice trước khi gọi bot vào hỗ trợ stream!');
  }

  const guildId = member.guild.id;

  // Kiểm tra nếu bot đang phát nhạc
  try {
    const { music } = require('./musicSystem');
    const musicSession = music.session(guildId);
    if (musicSession?.current) {
      throw new Error('Bot hiện đang bận phát nhạc trong server. Vui lòng dừng nhạc trước hoặc dùng chức năng lấy Script Auto Quest.');
    }
  } catch (err) {
    if (err.message && err.message.includes('phát nhạc')) throw err;
  }

  // Nếu đã có session đang chạy trong guild này
  if (activeSessions.has(guildId)) {
    const current = activeSessions.get(guildId);
    if (current.userId === member.id && current.channelId === voiceChannel.id) {
      const elapsedMinutes = Math.floor((Date.now() - current.startedAt) / 60000);
      const remainingMinutes = Math.max(1, 15 - elapsedMinutes);
      return {
        alreadyRunning: true,
        remainingMinutes,
        message: `Bot đã ở trong phòng Voice cùng bạn rồi! Còn khoảng **${remainingMinutes} phút** nữa là đủ 15 phút.`,
      };
    }
    stopQuestStream(guildId, 'Phiên mới được bắt đầu');
  }

  const connection = voiceAdapter.joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: member.guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: true,
  });

  const durationMs = 15 * 60 * 1000; // 15 phút
  const startedAt = Date.now();

  const timer = setTimeout(async () => {
    try {
      stopQuestStream(guildId, 'Hoàn thành 15 phút');
      const doneEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('🎉 HOÀN THÀNH STREAM 15 PHÚT DISCORD QUEST!')
        .setDescription(`Xin chúc mừng <@${member.id}>!\n\nBạn đã stream đủ **15 phút** cùng bot trong kênh **${voiceChannel.name}**.\n\nHãy mở ngay **Discord Desktop / Mobile** -> Vào **Cài đặt người dùng (User Settings)** -> **Nhiệm vụ (Quests)** hoặc **Kho quà tặng (Gift Inventory)** để bấm **Nhận thưởng (Claim Reward)** và lấy điểm **ORB** nhé! ✨`)
        .setFooter({ text: 'Lowkey Quest Helper • Tự động ngắt kết nối' })
        .setTimestamp();

      if (textChannel && typeof textChannel.send === 'function') {
        await textChannel.send({ content: `<@${member.id}>`, embeds: [doneEmbed] }).catch(() => {});
      }
    } catch (e) {
      console.error('[QUEST VOICE HELPER] Lỗi khi kết thúc 15 phút:', e);
    }
  }, durationMs);

  activeSessions.set(guildId, {
    guildId,
    channelId: voiceChannel.id,
    userId: member.id,
    textChannelId: textChannel?.id,
    connection,
    timer,
    startedAt,
  });

  return {
    alreadyRunning: false,
    channelName: voiceChannel.name,
    durationMinutes: 15,
  };
}

/**
 * Cho bot rời phòng Voice và hủy hẹn giờ.
 */
function stopQuestStream(guildId, reason = 'Người dùng kết thúc sớm') {
  const session = activeSessions.get(guildId);
  if (!session) return false;

  if (session.timer) clearTimeout(session.timer);
  try {
    session.connection.destroy();
  } catch {}

  activeSessions.delete(guildId);
  return true;
}

/**
 * Lấy thông tin trạng thái treo voice hiện tại trong server.
 */
function getQuestStreamStatus(guildId) {
  const session = activeSessions.get(guildId);
  if (!session) return null;
  const elapsedMs = Date.now() - session.startedAt;
  const remainingMs = Math.max(0, 15 * 60 * 1000 - elapsedMs);
  const remainingMinutes = Math.ceil(remainingMs / 60000);
  return {
    ...session,
    elapsedMs,
    remainingMs,
    remainingMinutes,
  };
}

module.exports = {
  startQuestStream,
  stopQuestStream,
  getQuestStreamStatus,
  setVoiceAdapter,
  activeSessions,
};
