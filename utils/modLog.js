/**
 * utils/modLog.js
 * Gửi thông báo hành động kiểm duyệt (ban, kick, timeout, untimeout)
 * vào kênh cố định 1555457471596724274.
 */

const { EmbedBuilder } = require('discord.js');
const { getOptions } = require('./customization');

const MOD_LOG_CHANNEL_ID = '1555457471596724274';

const ACTION_META = {
  ban:       { emoji: '🔨', label: 'BAN',       color: 0xef4444 },
  kick:      { emoji: '👢', label: 'KICK',      color: 0xf97316 },
  timeout:   { emoji: '⏱️', label: 'TIMEOUT',   color: 0xeab308 },
  untimeout: { emoji: '✅', label: 'GỠ TIMEOUT', color: 0x22c55e },
  unban:     { emoji: '🔓', label: 'GỠ BAN',    color: 0x22c55e },
};

/**
 * Gửi thông báo kiểm duyệt.
 * @param {Guild}  guild
 * @param {object} opts
 * @param {string} opts.action   - 'ban' | 'kick' | 'timeout' | 'untimeout' | 'unban'
 * @param {User}   opts.target   - người bị xử lý
 * @param {User}   [opts.mod]    - người thực hiện (null nếu tự động)
 * @param {string} [opts.reason] - lý do
 * @param {number} [opts.duration] - thời gian timeout (ms), chỉ dùng khi action='timeout'
 */
async function sendModLog(guild, { action, target, mod, reason, duration } = {}) {
  const meta = ACTION_META[action];
  if (!meta) return;

  const options = getOptions(guild.id);
  const targetChannelId = options.modLogChannel || MOD_LOG_CHANNEL_ID;
  if (!targetChannelId) return;

  try {
    const channel = await guild.channels.fetch(targetChannelId);
    if (!channel) return;

    const durationText = duration
      ? formatDuration(duration)
      : null;

    const targetName = target ? (target.tag || target.username || target.id) : 'Không xác định';
    const lines = [
      `**Thành viên:** ${target ? `<@${target.id}> (\`${targetName}\`)` : 'Không xác định'}`,
      `**Người thực hiện:** ${mod ? `<@${mod.id}>` : '🤖 Hệ thống tự động'}`,
      reason ? `**Lý do:** ${reason}` : null,
      durationText ? `**Thời gian:** ${durationText}` : null,
    ].filter(Boolean).join('\n');

    const embed = new EmbedBuilder()
      .setColor(meta.color)
      .setTitle(`${meta.emoji} ${meta.label}`)
      .setDescription(lines)
      .setThumbnail(target?.displayAvatarURL?.({ extension: 'png', size: 64 }) ?? null)
      .setFooter({ text: `ID: ${target?.id ?? '?'}` })
      .setTimestamp();

    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    console.error('[MOD LOG] Không gửi được thông báo:', error.message);
  }
}

/** Chuyển ms → chuỗi dễ đọc VD: "10 phút", "1 giờ 30 phút" */
function formatDuration(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const days    = Math.floor(totalSeconds / 86400);
  const hours   = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [
    days    ? `${days} ngày`   : null,
    hours   ? `${hours} giờ`   : null,
    minutes ? `${minutes} phút` : null,
    (!days && !hours && seconds) ? `${seconds} giây` : null,
  ].filter(Boolean).join(' ') || '< 1 giây';
}

module.exports = { sendModLog, MOD_LOG_CHANNEL_ID };
