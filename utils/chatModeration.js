/**
 * utils/chatModeration.js
 * Xử lý các lệnh moderation gõ trực tiếp trong khung chat (không cần dấu /):
 *   - [chatModBanCmd] @user [lý do]
 *   - [chatModKickCmd] @user [lý do]
 *   - [chatModTimeoutCmd] @user [số phút/thời gian] [lý do]
 *   - [chatModUntimeoutCmd] @user [lý do]
 * Các cú pháp được đọc động từ Dashboard (mặc định: vnban, vnkick, vntimeout, vnuntimeout).
 */

const { PermissionFlagsBits: P } = require('discord.js');
const { sendModLog } = require('./modLog');
const { getOptions } = require('./customization');

/**
 * Phân tích chuỗi thời gian (10, 10m, 2h, 1d) thành số phút.
 * Trả về { minutes, isDuration: boolean }
 */
function parseDuration(token) {
  if (!token) return { minutes: 10, isDuration: false };
  const match = /^(\d+)(m|h|d)?$/i.exec(token);
  if (!match) return { minutes: 10, isDuration: false };

  const num = parseInt(match[1], 10);
  const unit = (match[2] || 'm').toLowerCase();
  let minutes = num;
  if (unit === 'h') minutes = num * 60;
  else if (unit === 'd') minutes = num * 1440;

  minutes = Math.max(1, Math.min(minutes, 40320)); // Giới hạn tối đa 28 ngày
  return { minutes, isDuration: true };
}

/**
 * Xử lý tin nhắn trong chat.
 * @param {Message} message
 * @returns {Promise<boolean>} true nếu tin nhắn là lệnh moderation, false nếu là tin nhắn thường
 */
async function handleChatModeration(message) {
  if (!message.guild || message.author.bot || !message.content) return false;

  const options = getOptions(message.guild.id);
  if (!options.chatModEnabled) return false;

  const banCmd = (options.chatModBanCmd || 'vnban').trim().toLowerCase();
  const kickCmd = (options.chatModKickCmd || 'vnkick').trim().toLowerCase();
  const timeoutCmd = (options.chatModTimeoutCmd || 'vntimeout').trim().toLowerCase();
  const untimeoutCmd = (options.chatModUntimeoutCmd || 'vnuntimeout').trim().toLowerCase();

  const commandMap = new Map([
    [banCmd, 'ban'],
    [kickCmd, 'kick'],
    [timeoutCmd, 'timeout'],
    [untimeoutCmd, 'untimeout'],
  ]);

  // Hỗ trợ thêm alias tiếng Việt thuận tiện cho quản trị viên
  if (!commandMap.has('vnhanche') && (!options.chatModTimeoutCmd || options.chatModTimeoutCmd === 'vntimeout')) {
    commandMap.set('vnhanche', 'timeout');
  }
  if (!commandMap.has('vngohanhe') && (!options.chatModUntimeoutCmd || options.chatModUntimeoutCmd === 'vnuntimeout')) {
    commandMap.set('vngohanhe', 'untimeout');
  }
  if (!commandMap.has('vnbohanhe') && (!options.chatModUntimeoutCmd || options.chatModUntimeoutCmd === 'vnuntimeout')) {
    commandMap.set('vnbohanhe', 'untimeout');
  }

  const text = message.content.trim();
  const parts = text.split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  const action = commandMap.get(cmd);
  if (!action) return false;

  // Xóa ngay tin nhắn lệnh của người dùng để các thành viên khác không thấy
  if (typeof message.delete === 'function') {
    message.delete().catch(() => {});
  }

  // Phản hồi kết quả và tự động xóa sau 5 giây (hoặc thời gian tùy chỉnh) để không làm loãng kênh chat
  const sendFeedback = async (content, autoDeleteMs = 5000) => {
    try {
      const sent = await message.reply(content).catch(() => message.channel?.send?.(content));
      if (sent && typeof sent.delete === 'function') {
        setTimeout(() => sent.delete().catch(() => {}), autoDeleteMs);
      }
      return sent;
    } catch {
      return null;
    }
  };

  const targetArg = parts[1];
  const rest = parts.slice(2);

  if (!targetArg) {
    await sendFeedback(`❌ Thiếu người dùng. Cú pháp: \`${cmd} @thành_viên [lý do]\``);
    return true;
  }

  const targetId = targetArg.replace(/^<@!?(\d+)>$/, '$1');
  if (!/^\d{17,20}$/.test(targetId)) {
    await sendFeedback(`❌ Vui lòng tag thành viên hoặc nhập ID hợp lệ. Ví dụ: \`${cmd} @user lý do\``);
    return true;
  }

  // 1. Kiểm tra quyền của người gõ lệnh
  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return true;

  const isOwner = message.author.id === message.guild.ownerId;
  const permMap = {
    ban: P.BanMembers,
    kick: P.KickMembers,
    timeout: P.ModerateMembers,
    untimeout: P.ModerateMembers,
  };

  const neededPerm = permMap[action];
  if (!isOwner && !member.permissions.has(neededPerm)) {
    await sendFeedback('❌ Bạn không đủ quyền để thực hiện hành động này.');
    return true;
  }

  // 2. Kiểm tra mục tiêu không phải tác giả hay bot
  if (targetId === message.author.id) {
    await sendFeedback('❌ Bạn không thể tự xử phạt bản thân.');
    return true;
  }
  if (targetId === message.client.user.id) {
    await sendFeedback('❌ Bạn không thể xử phạt bot.');
    return true;
  }

  // 3. Lấy thông tin thành viên mục tiêu (nếu còn trong server)
  let targetMember = null;
  try {
    targetMember = await message.guild.members.fetch(targetId);
  } catch {
    /* Thành viên không có trong server */
  }

  // 4. Kiểm tra phân cấp role
  if (targetMember && !isOwner) {
    if (member.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0) {
      await sendFeedback('❌ Role của bạn không cao hơn thành viên này.');
      return true;
    }
  }

  // 5. Thực thi từng hành động
  try {
    if (action === 'ban') {
      if (targetMember && !targetMember.bannable) {
        await sendFeedback('❌ Bot không đủ quyền hoặc vị trí role để ban thành viên này.');
        return true;
      }
      const staffWatch = require('./staffWatch');
      if (staffWatch.isStaffLimitExceeded(message.guild, message.author.id, 'ban')) {
        const staffMember = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
        if (staffMember) await staffWatch.stripStaffRoles(staffMember, 'Staff Watch: Vượt hạn mức ban trong ngày (tự xóa role staff)');
        await sendFeedback('❌ Bạn đã vượt quá hạn mức ban trong ngày của Staff. Lệnh ban bị từ chối và role Staff của bạn đã bị thu hồi.');
        return true;
      }
      const reason = rest.join(' ') || 'Không có lý do.';
      await message.guild.members.ban(targetId, {
        reason: `[${message.author.tag}] ${reason}`,
      });

      await sendModLog(message.guild, {
        action: 'ban',
        target: targetMember?.user || { id: targetId },
        mod: message.author,
        reason,
      });

      const watchResult = await staffWatch.handleStaffAction(message.guild, message.author.id, 'ban', targetId);
      if (watchResult?.triggered) {
        await sendFeedback(
          `🔨 Đã ban <@${targetId}>. Lý do: ${reason}\n\n🚨 **CẢNH BÁO STAFF WATCH:** Bạn đã thực hiện ${watchResult.count}/${watchResult.max} lượt ban trong 24 giờ qua (vượt quá hạn mức cho phép). ` +
          `Toàn bộ role Staff của bạn đã bị tự động xóa để bảo vệ an toàn server!` +
          (watchResult.unbanned ? ' (Lệnh ban đã được tự động hoàn tác).' : ''),
          15000
        );
      } else {
        await sendFeedback(`🔨 Đã ban <@${targetId}>. Lý do: ${reason}`);
      }
      return true;
    }

    if (action === 'kick') {
      if (!targetMember) {
        await sendFeedback('❌ Thành viên này không có trong server.');
        return true;
      }
      if (!targetMember.kickable) {
        await sendFeedback('❌ Bot không đủ quyền hoặc vị trí role để kick thành viên này.');
        return true;
      }
      const staffWatch = require('./staffWatch');
      if (staffWatch.isStaffLimitExceeded(message.guild, message.author.id, 'kick')) {
        const staffMember = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
        if (staffMember) await staffWatch.stripStaffRoles(staffMember, 'Staff Watch: Vượt hạn mức kick trong ngày (tự xóa role staff)');
        await sendFeedback('❌ Bạn đã vượt quá hạn mức kick trong ngày của Staff. Lệnh kick bị từ chối và role Staff của bạn đã bị thu hồi.');
        return true;
      }
      const reason = rest.join(' ') || 'Không có lý do.';
      await targetMember.kick(`[${message.author.tag}] ${reason}`);

      await sendModLog(message.guild, {
        action: 'kick',
        target: targetMember.user,
        mod: message.author,
        reason,
      });

      const watchResult = await staffWatch.handleStaffAction(message.guild, message.author.id, 'kick', targetId);
      if (watchResult?.triggered) {
        await sendFeedback(
          `👢 Đã kick <@${targetId}>. Lý do: ${reason}\n\n🚨 **CẢNH BÁO STAFF WATCH:** Bạn đã thực hiện ${watchResult.count}/${watchResult.max} lượt kick trong 24 giờ qua (vượt quá hạn mức cho phép). ` +
          `Toàn bộ role Staff của bạn đã bị tự động xóa để bảo vệ an toàn server!`,
          15000
        );
      } else {
        await sendFeedback(`👢 Đã kick <@${targetId}>. Lý do: ${reason}`);
      }
      return true;
    }

    if (action === 'timeout') {
      if (!targetMember) {
        await sendFeedback('❌ Thành viên này không có trong server.');
        return true;
      }
      if (!targetMember.moderatable) {
        await sendFeedback('❌ Bot không đủ quyền hoặc vị trí role để hạn chế thành viên này.');
        return true;
      }

      const { minutes, isDuration } = parseDuration(rest[0]);
      const reason = (isDuration ? rest.slice(1) : rest).join(' ') || 'Không có lý do.';
      const durationMs = minutes * 60 * 1000;

      await targetMember.timeout(durationMs, `[${message.author.tag}] ${reason}`);

      await sendModLog(message.guild, {
        action: 'timeout',
        target: targetMember.user,
        mod: message.author,
        reason,
        duration: durationMs,
      });

      await sendFeedback(`⏱️ Đã hạn chế <@${targetId}> trong **${minutes} phút**. Lý do: ${reason}`);
      return true;
    }

    if (action === 'untimeout') {
      if (!targetMember) {
        await sendFeedback('❌ Thành viên này không có trong server.');
        return true;
      }
      if (!targetMember.moderatable) {
        await sendFeedback('❌ Bot không đủ quyền hoặc vị trí role để gỡ hạn chế thành viên này.');
        return true;
      }
      if (!targetMember.isCommunicationDisabled()) {
        await sendFeedback('ℹ️ Thành viên này hiện không bị hạn chế.');
        return true;
      }

      const reason = rest.join(' ') || 'Không có lý do.';
      await targetMember.timeout(null, `[${message.author.tag}] ${reason}`);

      await sendModLog(message.guild, {
        action: 'untimeout',
        target: targetMember.user,
        mod: message.author,
        reason,
      });

      await sendFeedback(`✅ Đã gỡ hạn chế cho <@${targetId}>. Lý do: ${reason}`);
      return true;
    }
  } catch (error) {
    console.error(`[CHAT MOD] Lỗi khi xử lý ${cmd}:`, error);
    await sendFeedback(`❌ Có lỗi xảy ra: ${error.message}`).catch(() => {});
    return true;
  }

  return false;
}

module.exports = { handleChatModeration, parseDuration };
