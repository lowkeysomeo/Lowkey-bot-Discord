/**
 * channelGuard.js
 * Phát hiện kênh bị xóa không được phép, cố tạo lại và cảnh báo chủ server.
 *
 * Ai được miễn kiểm tra:
 *  - Chủ server (ownerId)
 *  - Bản thân bot
 *  - ID tin cậy đã cấu hình trong Security (securityTrusted)
 */

const { AuditLogEvent, EmbedBuilder, ChannelType, PermissionFlagsBits: P } = require('discord.js');
const { getOptions, saveOptions } = require('./customization');
const { getDb } = require('./database');

// Giới hạn thử lại để tránh vòng lặp vô tận.
const RECENT_RESTORE_MS = 30_000;
const recentRestores = new Map(); // channelName:guildId -> timestamp

function trusted(guild, userId, options) {
  if (userId === guild.ownerId) return true;
  if (userId === guild.client.user.id) return true;
  const list = String(options.securityTrusted || '').split(/[\s,]+/).filter(Boolean);
  return list.includes(userId);
}

/**
 * Gửi cảnh báo vào kênh security log.
 */
async function sendAlert(guild, options, embed) {
  const channelId = options.securityLogChannel;
  if (!channelId) return;
  try {
    const channel = await guild.channels.fetch(channelId);
    if (!channel) return;
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    console.error('[CHANNEL GUARD] Không gửi được cảnh báo:', error.message);
  }
}

/**
 * Ánh xạ loại kênh sang ChannelType hợp lệ để tạo lại.
 * Trả về null nếu không thể tái tạo (VD: forum, stage…).
 */
function recreatableType(type) {
  const map = {
    [ChannelType.GuildText]: ChannelType.GuildText,
    [ChannelType.GuildAnnouncement]: ChannelType.GuildAnnouncement,
    [ChannelType.GuildVoice]: ChannelType.GuildVoice,
    [ChannelType.GuildCategory]: ChannelType.GuildCategory,
    [ChannelType.GuildStageVoice]: ChannelType.GuildStageVoice,
    [ChannelType.GuildForum]: ChannelType.GuildForum,
  };
  return map[type] ?? null;
}

/**
 * Thử tạo lại kênh đã bị xóa.
 * Trả về kênh mới hoặc null nếu không thể.
 */
async function tryRestore(guild, deletedChannel) {
  const key = `${deletedChannel.name}:${guild.id}`;

  // Chống vòng lặp: nếu vừa khôi phục kênh cùng tên thì bỏ qua.
  const last = recentRestores.get(key);
  if (last && Date.now() - last < RECENT_RESTORE_MS) {
    recentRestores.delete(key);
    return null;
  }

  const type = recreatableType(deletedChannel.type);
  if (type == null) return null;

  const me = guild.members.me || await guild.members.fetchMe();
  if (!me.permissions.has(P.ManageChannels)) return null;

  try {
    const options = {
      name: deletedChannel.name,
      type,
      reason: 'Channel Guard: khôi phục kênh bị xóa không được phép',
    };

    // Giữ danh mục cũ nếu có.
    if (deletedChannel.parentId) options.parent = deletedChannel.parentId;

    // Giữ vị trí.
    if (typeof deletedChannel.rawPosition === 'number') options.position = deletedChannel.rawPosition;

    // Giữ quyền cụ thể nếu có.
    if (deletedChannel.permissionOverwrites?.cache?.size) {
      options.permissionOverwrites = [...deletedChannel.permissionOverwrites.cache.values()].map(o => ({
        id: o.id,
        allow: o.allow.bitfield,
        deny: o.deny.bitfield,
        type: o.type,
      }));
    }

    // Giữ chủ đề kênh (chỉ text/announcement).
    if (deletedChannel.topic) options.topic = deletedChannel.topic;

    // Giữ NSFW flag.
    if (deletedChannel.nsfw) options.nsfw = true;

    // Giữ slowmode.
    if (deletedChannel.rateLimitPerUser) options.rateLimitPerUser = deletedChannel.rateLimitPerUser;

    recentRestores.set(key, Date.now());
    const restored = await guild.channels.create(options);
    return restored;
  } catch (error) {
    console.error('[CHANNEL GUARD] Không tạo lại được kênh:', error.message);
    return null;
  }
}

/**
 * Cập nhật tất cả cài đặt trong DB đang trỏ tới oldId → newId.
 * Bao gồm: guild_settings (các trường kênh trực tiếp) và DASHBOARD_OPTIONS JSON.
 */
function remapChannelId(guildId, oldId, newId) {
  const db = getDb();

  // 1. Cập nhật các setting kênh trực tiếp (VD: LEVEL_CHANNEL_ID, roleNoticeChannel trong JSON…).
  db.prepare(`
    UPDATE guild_settings
    SET value = ?
    WHERE guild_id = ? AND value = ?
  `).run(newId, guildId, oldId);

  // 2. Cập nhật bên trong DASHBOARD_OPTIONS JSON (các option kiểu 'channel').
  try {
    const row = db.prepare(
      `SELECT value FROM guild_settings WHERE guild_id = ? AND setting_key = 'DASHBOARD_OPTIONS'`
    ).get(guildId);
    if (!row) return;
    const opts = JSON.parse(row.value || '{}');
    let changed = false;
    for (const [key, val] of Object.entries(opts)) {
      if (val === oldId) { opts[key] = newId; changed = true; }
    }
    if (changed) {
      saveOptions(guildId, opts);
      console.log(`[CHANNEL GUARD] Đã cập nhật cài đặt từ kênh ${oldId} → ${newId}.`);
    }
  } catch (error) {
    console.error('[CHANNEL GUARD] Lỗi cập nhật DASHBOARD_OPTIONS:', error.message);
  }

  // 3. Cập nhật bảng cấu hình kênh confession_config
  try {
    db.prepare(`
      UPDATE confession_config
      SET channel_id = ?
      WHERE guild_id = ? AND channel_id = ?
    `).run(newId, guildId, oldId);
  } catch (error) {
    console.error('[CHANNEL GUARD] Lỗi cập nhật confession_config:', error.message);
  }
}


/**
 * Xử lý sự kiện ChannelDelete.
 * Được gọi từ securitySystem khi bot nhận AuditLog ChannelDelete.
 */
async function handleChannelDelete(deletedChannel, executorId) {
  const guild = deletedChannel.guild;
  if (!guild) return;

  const options = getOptions(guild.id);
  if (!options.channelGuardEnabled) return;

  // Người xóa là tin cậy → bỏ qua.
  if (trusted(guild, executorId, options)) return;

  console.warn(`[CHANNEL GUARD] Kênh "${deletedChannel.name}" (${deletedChannel.id}) bị xóa bởi ${executorId}`);

  // Thử khôi phục.
  const restored = await tryRestore(guild, deletedChannel);

  // Nếu tạo lại thành công, cập nhật tất cả cài đặt trỏ tới kênh cũ → kênh mới.
  if (restored) {
    remapChannelId(guild.id, deletedChannel.id, restored.id);
  }

  // Gửi cảnh báo.
  const channelTypeName = {
    [ChannelType.GuildText]: 'Text',
    [ChannelType.GuildAnnouncement]: 'Announcement',
    [ChannelType.GuildVoice]: 'Voice',
    [ChannelType.GuildCategory]: 'Category',
    [ChannelType.GuildStageVoice]: 'Stage',
    [ChannelType.GuildForum]: 'Forum',
  }[deletedChannel.type] || 'Kênh';

  const embed = new EmbedBuilder()
    .setColor(0xef4444)
    .setTitle('🚨 Kênh bị xóa không được phép!')
    .setDescription(
      `**Kênh:** \`${deletedChannel.name}\` (${channelTypeName})\n` +
      `**ID kênh:** \`${deletedChannel.id}\`\n` +
      `**Người xóa:** <@${executorId}> (\`${executorId}\`)\n\n` +
      (restored
        ? `✅ **Đã tạo lại kênh:** <#${restored.id}>\n⚠️ Tin nhắn cũ không thể khôi phục.`
        : `❌ **Không thể tạo lại kênh** — Bot thiếu quyền hoặc loại kênh không hỗ trợ.\nHãy kiểm tra và tạo lại thủ công.`)
    )
    .setFooter({ text: 'Channel Guard • Chỉ chủ server và ID tin cậy được xóa kênh' })
    .setTimestamp();

  await sendAlert(guild, options, embed);
}

/**
 * Lắng nghe AuditLog để phát hiện ChannelDelete và xác định ai xóa.
 * Được gọi từ securitySystem.start().
 */
async function onAuditLog(entry, guild) {
  if (entry.action !== AuditLogEvent.ChannelDelete) return;
  if (Date.now() - entry.createdTimestamp > 15000) return; // Bỏ qua entry cũ.

  const executorId = entry.executorId;
  if (!executorId) return;

  // Xây dựng đối tượng kênh đã xóa từ thông tin Audit Log.
  const deletedChannel = {
    id: entry.targetId,
    name: entry.changes?.find(c => c.key === 'name')?.old || `unknown-${entry.targetId}`,
    type: entry.changes?.find(c => c.key === 'type')?.old ?? ChannelType.GuildText,
    parentId: entry.changes?.find(c => c.key === 'parent_id')?.old || null,
    topic: entry.changes?.find(c => c.key === 'topic')?.old || null,
    nsfw: entry.changes?.find(c => c.key === 'nsfw')?.old || false,
    rateLimitPerUser: entry.changes?.find(c => c.key === 'rate_limit_per_user')?.old || 0,
    rawPosition: entry.changes?.find(c => c.key === 'position')?.old ?? null,
    permissionOverwrites: { cache: new Map() }, // Audit Log không lưu đủ overwrites chi tiết.
    guild,
  };

  await handleChannelDelete(deletedChannel, executorId);
}

module.exports = { onAuditLog, handleChannelDelete, trusted };
