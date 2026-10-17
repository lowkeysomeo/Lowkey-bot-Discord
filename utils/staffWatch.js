/**
 * utils/staffWatch.js
 * Hệ thống Staff Watch cho VietNam Legacy:
 * 1. Giám sát và giới hạn hạn mức xử phạt (Ban, Kick) trong ngày của từng Staff.
 *    -> Ngăn chặn Staff bị lộ token / lạm quyền / rogue mod nuke server.
 *    -> Tự động thu hồi quyền quản trị, timeout staff và unban cho thành viên nếu vượt ngưỡng.
 * 2. Cấm Staff tự ý thay đổi thông tin máy chủ (Tên server, Icon, Banner, v.v.).
 *    -> Tự động khôi phục lại tên/icon cũ ngay lập tức và thu hồi quyền Staff.
 * 3. Nhật ký cảnh báo riêng gửi đến kênh security log cho Chủ Server.
 */

const { AuditLogEvent, EmbedBuilder, PermissionFlagsBits: P } = require('discord.js');
const { randomUUID } = require('node:crypto');
const { getOptions } = require('./customization');
const { getDb } = require('./database');

const sensitivePermissions = [
  P.Administrator,
  P.ManageGuild,
  P.ManageRoles,
  P.ManageChannels,
  P.ManageWebhooks,
  P.BanMembers,
  P.KickMembers,
  P.ModerateMembers,
  P.MentionEveryone,
];

function initDb() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_action_logs (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      staff_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_staff_actions ON staff_action_logs(guild_id, staff_id, action, created_at);
  `);
  return db;
}

function recordStaffAction(guildId, staffId, action, targetId) {
  const db = initDb();
  const id = randomUUID();
  db.prepare(
    'INSERT INTO staff_action_logs (id, guild_id, staff_id, action, target_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, guildId, staffId, action, String(targetId || 'unknown'), Date.now());
}

function countStaffActions(guildId, staffId, action, windowMs = 86400000) {
  const db = initDb();
  const since = Date.now() - windowMs;
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM staff_action_logs WHERE guild_id = ? AND staff_id = ? AND action = ? AND created_at > ?'
  ).get(guildId, staffId, action, since);
  return row?.count || 0;
}

function trusted(guild, userId, options) {
  if (!userId) return false;
  if (userId === guild.ownerId) return true;
  if (userId === guild.client?.user?.id) return true;
  const list = String(options.securityTrusted || '').split(/[\s,]+/).filter(Boolean);
  return list.includes(userId);
}

async function sendAlert(guild, options, embed) {
  const channelId = options.securityLogChannel;
  if (!channelId) return;
  try {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || typeof channel.send !== 'function') return;
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    console.error('[STAFF WATCH] Không gửi được cảnh báo:', error.message);
  }
}

function isStaffRole(role, guild) {
  if (!role || role.id === guild?.id || role.managed) return false;
  if (role.permissions?.any && role.permissions.any(sensitivePermissions)) return true;
  const name = String(role.name || '').toLowerCase();
  if (/(staff|admin|mod|quản\s*trị|bảo\s*vệ|partner\s*management|hỗ\s*trợ|supporter|kiểm\s*duyệt)/i.test(name)) return true;
  return false;
}

/**
 * Tự động xóa/thu hồi toàn bộ role Staff và role chứa quyền nhạy cảm của Staff
 */
async function stripStaffRoles(member, reason = 'Staff Watch: Vượt hạn mức ban/kick trong ngày (tự xóa role staff)') {
  if (!member || !member.roles?.cache) return [];
  const removedRoles = [];
  for (const role of member.roles.cache.values()) {
    if (role.id === member.guild.id || role.managed) continue;
    if (role.permissions?.any?.(sensitivePermissions) || isStaffRole(role, member.guild)) {
      if (role.editable || role.editable === undefined) {
        try {
          if (typeof member.roles.remove === 'function') {
            await member.roles.remove(role.id, reason);
            removedRoles.push(role.name || role.id);
          }
        } catch (e) {
          console.error('[STAFF WATCH] Không gỡ được role:', role.name, e.message);
        }
      }
    }
  }
  return removedRoles;
}

/**
 * Kiểm tra xem Staff đã vượt quá hạn mức Ban/Kick trong 24h hay chưa
 */
function isStaffLimitExceeded(guild, executorId, action) {
  if (!guild || !executorId) return false;
  const options = getOptions(guild.id);
  if (!options.securityStaffWatch) return false;
  if (trusted(guild, executorId, options)) return false;

  if (action === 'ban') {
    const banCount = countStaffActions(guild.id, executorId, 'ban', 86400000);
    const maxBans = Number(options.securityStaffDailyBanLimit) || 10;
    return banCount > maxBans;
  }
  if (action === 'kick') {
    const kickCount = countStaffActions(guild.id, executorId, 'kick', 86400000);
    const maxKicks = Number(options.securityStaffDailyKickLimit) || 15;
    return kickCount > maxKicks;
  }
  return false;
}

/**
 * Giám sát và xử lý khi Staff thực hiện hành động Ban hoặc Kick (qua Discord UI hoặc qua lệnh Bot)
 * @param {Guild} guild
 * @param {string} executorId - ID của Staff thực hiện
 * @param {'ban'|'kick'} action - Loại hành động
 * @param {string} targetId - ID của người bị ban/kick
 * @returns {Promise<{ triggered: boolean, action?: string, count?: number, max?: number, stripped?: string[], unbanned?: boolean }>}
 */
async function handleStaffAction(guild, executorId, action, targetId) {
  if (!guild || !executorId) return { triggered: false };
  const options = getOptions(guild.id);
  if (!options.securityStaffWatch) return { triggered: false };
  if (trusted(guild, executorId, options)) return { triggered: false };

  // 1. Giám sát lệnh BAN của Staff
  if (action === 'ban' || action === AuditLogEvent.MemberBanAdd) {
    recordStaffAction(guild.id, executorId, 'ban', targetId);
    const banCount = countStaffActions(guild.id, executorId, 'ban', 86400000);
    const maxBans = Number(options.securityStaffDailyBanLimit) || 10;

    if (banCount > maxBans) {
      let staffMember = null;
      let stripped = [];
      if (typeof guild.members?.fetch === 'function') {
        staffMember = await guild.members.fetch(executorId).catch(() => null);
        if (staffMember) {
          stripped = await stripStaffRoles(staffMember, 'Staff Watch: Vượt hạn mức ban trong ngày (tự xóa role staff)');
          if (staffMember.moderatable && typeof staffMember.timeout === 'function') {
            await staffMember.timeout(60 * 60 * 1000, 'Staff Watch: Vượt hạn mức ban trong ngày').catch(() => {});
          }
        }
      }

      // Tự động mở ban cho người bị ban nếu khả dụng
      let unbanned = false;
      if (options.securityStaffUndoBan && targetId && typeof guild.members?.unban === 'function') {
        try {
          await guild.members.unban(targetId, 'Staff Watch: Tự động hoàn tác lệnh ban vượt hạn mức');
          unbanned = true;
        } catch (e) {
          console.error('[STAFF WATCH] Không unban được nạn nhân:', e.message);
        }
      }

      const embed = new EmbedBuilder()
        .setColor(0xdc2626)
        .setTitle('🚨 STAFF WATCH: Cảnh báo Staff vượt quá hạn mức Ban trong ngày!')
        .setDescription(
          `Staff <@${executorId}> (\`${executorId}\`) vừa ban thành viên <@${targetId}>.\n\n` +
          `📊 **Thống kê:** Staff này đã thực hiện **${banCount}/${maxBans} lượt ban** trong vòng 24 giờ qua (vượt quá giới hạn an toàn).\n\n` +
          `🔒 **Hành động bảo vệ tự động:**\n` +
          `• ${stripped.length ? `Đã tự động thu hồi toàn bộ role Staff/quản trị: **${stripped.join(', ')}**` : 'Đã gắn cờ cảnh báo (không tìm thấy role có thể gỡ)'}\n` +
          `• Đã tạm hạn chế (timeout) Staff 60 phút để phòng chống nguy cơ nuke/lạm quyền.\n` +
          `• ${unbanned ? `✅ Đã tự động gỡ ban cho nạn nhân <@${targetId}>.` : `⚠️ Hãy kiểm tra và cân nhắc gỡ ban cho <@${targetId}> nếu đây là lệnh ban nhầm.`}`
        )
        .setTimestamp();

      await sendAlert(guild, options, embed);
      return { triggered: true, action: 'ban', count: banCount, max: maxBans, stripped, unbanned };
    }
    return { triggered: false, action: 'ban', count: banCount, max: maxBans };
  }

  // 2. Giám sát lệnh KICK của Staff
  if (action === 'kick' || action === AuditLogEvent.MemberKick) {
    recordStaffAction(guild.id, executorId, 'kick', targetId);
    const kickCount = countStaffActions(guild.id, executorId, 'kick', 86400000);
    const maxKicks = Number(options.securityStaffDailyKickLimit) || 15;

    if (kickCount > maxKicks) {
      let staffMember = null;
      let stripped = [];
      if (typeof guild.members?.fetch === 'function') {
        staffMember = await guild.members.fetch(executorId).catch(() => null);
        if (staffMember) {
          stripped = await stripStaffRoles(staffMember, 'Staff Watch: Vượt hạn mức kick trong ngày (tự xóa role staff)');
          if (staffMember.moderatable && typeof staffMember.timeout === 'function') {
            await staffMember.timeout(60 * 60 * 1000, 'Staff Watch: Vượt hạn mức kick trong ngày').catch(() => {});
          }
        }
      }

      const embed = new EmbedBuilder()
        .setColor(0xdc2626)
        .setTitle('🚨 STAFF WATCH: Cảnh báo Staff vượt quá hạn mức Kick trong ngày!')
        .setDescription(
          `Staff <@${executorId}> (\`${executorId}\`) vừa kick thành viên <@${targetId}>.\n\n` +
          `📊 **Thống kê:** Staff này đã thực hiện **${kickCount}/${maxKicks} lượt kick** trong vòng 24 giờ qua.\n\n` +
          `🔒 **Hành động bảo vệ tự động:**\n` +
          `• ${stripped.length ? `Đã tự động thu hồi toàn bộ role Staff/quản trị: **${stripped.join(', ')}**` : 'Đã gắn cờ cảnh báo (không tìm thấy role có thể gỡ)'}\n` +
          `• Đã timeout Staff 60 phút để ngăn ngừa hành vi kick hàng loạt.`
        )
        .setTimestamp();

      await sendAlert(guild, options, embed);
      return { triggered: true, action: 'kick', count: kickCount, max: maxKicks, stripped };
    }
    return { triggered: false, action: 'kick', count: kickCount, max: maxKicks };
  }

  return { triggered: false };
}

/**
 * Xử lý sự kiện Audit Log (Ban, Kick) để giám sát hạn mức của Staff
 */
async function onAuditLog(entry, guild) {
  if (!entry || !guild) return { triggered: false };
  const options = getOptions(guild.id);
  if (!options.securityStaffWatch) return { triggered: false };

  const executorId = entry.executorId;
  if (!executorId || trusted(guild, executorId, options)) return { triggered: false };

  if (entry.action === AuditLogEvent.MemberBanAdd) {
    return handleStaffAction(guild, executorId, 'ban', entry.targetId);
  }
  if (entry.action === AuditLogEvent.MemberKick) {
    return handleStaffAction(guild, executorId, 'kick', entry.targetId);
  }

  return { triggered: false };
}

/**
 * Xử lý khi có sự kiện GuildUpdate (Staff tự ý sửa tên server, icon, v.v.)
 */
async function onGuildUpdate(oldGuild, newGuild) {
  if (!oldGuild || !newGuild) return;
  const options = getOptions(newGuild.id);
  if (!options.securityEnabled || !options.securityStaffWatch) return;

  const nameChanged = oldGuild.name !== newGuild.name;
  const iconChanged = oldGuild.icon !== newGuild.icon;

  if (!nameChanged && !iconChanged) return;

  // Lấy Audit Log để biết ai đã đổi
  let executorId = null;
  if (typeof newGuild.fetchAuditLogs === 'function') {
    try {
      const logs = await newGuild.fetchAuditLogs({
        type: AuditLogEvent.GuildUpdate,
        limit: 1,
      }).catch(() => null);
      const entry = logs?.entries?.first();
      if (entry && entry.targetId === newGuild.id && Math.abs(Date.now() - entry.createdTimestamp) < 15000 &&
          (!nameChanged || entry.changes?.some(c => c.key === 'name' && c.old === oldGuild.name && c.new === newGuild.name)) &&
          (!iconChanged || entry.changes?.some(c => c.key === 'icon_hash' && c.old === oldGuild.icon && c.new === newGuild.icon))) {
        executorId = entry.executorId;
      }
    } catch (e) {
      console.error('[STAFF WATCH] Lỗi lấy Audit Log GuildUpdate:', e.message);
    }
  }

  // Không đảo ngược thay đổi khi chưa xác định chắc người thực hiện.
  if (!executorId) return;
  // Nếu là Chủ Server hoặc bot/tin cậy -> Cho phép đổi bình thường
  if (executorId && trusted(newGuild, executorId, options)) return;

  // Khôi phục lại tên máy chủ
  let restoredName = false;
  if (nameChanged && typeof newGuild.setName === 'function') {
    try {
      await newGuild.setName(oldGuild.name, 'Staff Watch: Tự động khôi phục tên server do Staff tự ý đổi');
      restoredName = true;
    } catch (e) {
      console.error('[STAFF WATCH] Lỗi khôi phục tên server:', e.message);
    }
  }

  // Khôi phục lại icon máy chủ
  let restoredIcon = false;
  if (iconChanged && typeof newGuild.setIcon === 'function') {
    try {
      const oldIconURL = oldGuild.iconURL ? oldGuild.iconURL({ extension: 'png' }) : null;
      await newGuild.setIcon(oldIconURL || null, 'Staff Watch: Tự động khôi phục icon server do Staff tự ý đổi');
      restoredIcon = true;
    } catch (e) {
      console.error('[STAFF WATCH] Lỗi khôi phục icon server:', e.message);
    }
  }

  // Trừng phạt Staff nếu xác định được danh tính
  let stripped = [];
  if (executorId && typeof newGuild.members?.fetch === 'function') {
    try {
      const staffMember = await newGuild.members.fetch(executorId).catch(() => null);
      if (staffMember) {
        stripped = await stripStaffRoles(staffMember, 'Staff Watch: Tự ý sửa đổi thông tin máy chủ');
        if (staffMember.moderatable && typeof staffMember.timeout === 'function') {
          await staffMember.timeout(60 * 60 * 1000, 'Staff Watch: Tự ý sửa thông tin máy chủ');
        }
      }
    } catch (e) {}
  }

  const embed = new EmbedBuilder()
    .setColor(0xdc2626)
    .setTitle('🚨 STAFF WATCH: Phát hiện thay đổi thông tin máy chủ trái phép')
    .setDescription(
      (executorId ? `Phát hiện Staff <@${executorId}> (\`${executorId}\`)` : 'Phát hiện có người') +
      ` vừa tự ý thay đổi thông tin của **${oldGuild.name}**:\n` +
      (nameChanged ? `• **Tên máy chủ:** \`${oldGuild.name}\` → \`${newGuild.name}\`\n` : '') +
      (iconChanged ? `• **Ảnh đại diện (Icon):** Đã bị thay đổi\n` : '') +
      `\n🛡️ **Hành động khôi phục:**\n` +
      (restoredName ? '✅ Đã tự động khôi phục lại tên server ban đầu.\n' : '') +
      (restoredIcon ? '✅ Đã tự động khôi phục lại icon máy chủ ban đầu.\n' : '') +
      (stripped.length ? `🔒 Đã thu hồi quyền quản trị của Staff vi phạm: **${stripped.join(', ')}** và timeout 60 phút.` : '')
    )
    .setTimestamp();

  await sendAlert(newGuild, options, embed);
}

module.exports = {
  onAuditLog,
  onGuildUpdate,
  handleStaffAction,
  isStaffLimitExceeded,
  isStaffRole,
  recordStaffAction,
  countStaffActions,
  stripStaffRoles,
  trusted,
};
