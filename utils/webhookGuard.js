/**
 * utils/webhookGuard.js
 * Hệ thống Anti-Webhook cho VietNam Legacy:
 * 1. Tự động xóa các Webhook lạ do bot khác hoặc thành viên không được phép tạo.
 * 2. Tự động xóa tin nhắn spam / mass mention / link lừa đảo phát ra từ Webhook độc hại và xóa luôn Webhook đó.
 * 3. Xử lý phạt (timeout 10m) thành viên tạo webhook trái phép.
 */

const { AuditLogEvent, EmbedBuilder } = require('discord.js');
const { getOptions } = require('./customization');

const recentWebhookBursts = new Map();

function hit(key, seconds, limit, now = Date.now()) {
  const list = (recentWebhookBursts.get(key) || []).filter(t => t > now - seconds * 1000);
  list.push(now);
  recentWebhookBursts.set(key, list.slice(-limit));
  return list.length >= limit;
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
    console.error('[WEBHOOK GUARD] Không gửi được cảnh báo:', error.message);
  }
}

/**
 * Xử lý khi có sự kiện WebhookCreate hoặc WebhookUpdate từ Audit Log.
 */
async function onAuditLog(entry, guild) {
  if (!entry || (entry.action !== AuditLogEvent.WebhookCreate && entry.action !== AuditLogEvent.WebhookUpdate)) return;
  const options = getOptions(guild.id);
  if (!options.securityEnabled || !options.securityAntiWebhook) return;

  const executorId = entry.executorId;
  if (!executorId || trusted(guild, executorId, options)) return;

  const targetId = entry.targetId;
  let deletedWebhook = false;
  let webhookName = 'Webhook #' + (targetId || 'unknown');

  // Thử fetch và xóa webhook theo targetId
  if (targetId && typeof guild.client?.fetchWebhook === 'function') {
    try {
      const webhook = await guild.client.fetchWebhook(targetId).catch(() => null);
      if (webhook && typeof webhook.delete === 'function') {
        webhookName = webhook.name || webhookName;
        await webhook.delete('Anti-webhook: Tự động xóa Webhook tạo trái phép');
        deletedWebhook = true;
      }
    } catch (e) {
      console.error('[WEBHOOK GUARD] Lỗi xóa webhook theo ID:', e.message);
    }
  }

  // Nếu chưa xóa được theo ID, tìm trong kênh
  if (!deletedWebhook && entry.extra?.channel?.id && typeof guild.channels?.fetch === 'function') {
    try {
      const channel = await guild.channels.fetch(entry.extra.channel.id).catch(() => null);
      if (channel && typeof channel.fetchWebhooks === 'function') {
        const webhooks = await channel.fetchWebhooks().catch(() => null);
        const wh = webhooks?.get(targetId);
        if (wh && typeof wh.delete === 'function') {
          webhookName = wh.name || webhookName;
          await wh.delete('Anti-webhook: Tự động xóa Webhook tạo trái phép');
          deletedWebhook = true;
        }
      }
    } catch (e) {
      console.error('[WEBHOOK GUARD] Lỗi tìm webhook trong kênh:', e.message);
    }
  }

  // Xử lý timeout thành viên tạo webhook trái phép
  let executorMember = null;
  if (typeof guild.members?.fetch === 'function') {
    try {
      executorMember = await guild.members.fetch(executorId).catch(() => null);
      if (executorMember && executorMember.moderatable && typeof executorMember.timeout === 'function') {
        await executorMember.timeout(10 * 60 * 1000, 'Anti-webhook: Tạo Webhook trái phép');
      }
    } catch (e) {}
  }

  const embed = new EmbedBuilder()
    .setColor(0xef4444)
    .setTitle('🛡️ Anti-webhook: Phát hiện Webhook tạo trái phép')
    .setDescription(
      `Phát hiện <@${executorId}> (\`${executorId}\`) vừa tạo/chỉnh sửa Webhook **${webhookName}** mà không được phép.\n\n` +
      (deletedWebhook ? '✅ **Đã tự động xóa Webhook ngay lập tức để bảo vệ server.**\n' : '⚠️ Cần kiểm tra quyền Manage Webhooks của bot để xóa Webhook này.\n') +
      (executorMember?.moderatable ? '⏱️ Đã timeout thành viên 10 phút để ngăn ngừa phát tán tin nhắn độc hại.' : '')
    )
    .setTimestamp();

  await sendAlert(guild, options, embed);
  return { deletedWebhook, executorId, webhookName };
}

/**
 * Xử lý khi có tin nhắn từ Webhook gửi vào kênh.
 * @param {Message} msg
 * @returns {Promise<boolean>} true nếu tin nhắn là spam/độc hại và đã bị xử lý
 */
async function onMessage(msg) {
  if (!msg.guild || !msg.webhookId) return false;
  const options = getOptions(msg.guild.id);
  if (!options.securityEnabled || !options.securityAntiWebhook) return false;

  const burstKey = `wh-burst:${msg.guild.id}:${msg.webhookId}`;
  const isBurst = hit(burstKey, 3, 3); // 3 tin nhắn trong 3 giây
  const hasMassMention = Boolean(
    msg.mentions?.everyone ||
    (msg.mentions?.roles && msg.mentions.roles.size >= 2) ||
    (msg.mentions?.users && msg.mentions.users.size >= 5)
  );

  const content = (msg.content || '').toLowerCase();
  const isPhishing =
    /@(everyone|here).*(free|nitro|steam|gift|airdrop|claim)/i.test(content) ||
    /(discord-nitro|dlscord|discorcl|free-nitro|steamcommunity-).*(\.xyz|\.ru|\.top|\.click|\.gift)/i.test(content);

  if (!isBurst && !hasMassMention && !isPhishing) return false;

  // Xóa ngay tin nhắn spam/độc hại
  if (msg.deletable && typeof msg.delete === 'function') {
    try {
      await msg.delete().catch(() => {});
    } catch (e) {}
  }

  // Tiêu hủy Webhook
  let whDeleted = false;
  let whName = 'Webhook #' + msg.webhookId;
  try {
    const channel = msg.channel;
    if (channel && typeof channel.fetchWebhooks === 'function') {
      const whList = await channel.fetchWebhooks().catch(() => null);
      const wh = whList?.get(msg.webhookId);
      if (wh && typeof wh.delete === 'function') {
        whName = wh.name || whName;
        await wh.delete('Anti-webhook: Tiêu hủy webhook phát tán spam / mass mention');
        whDeleted = true;
      }
    }
    if (!whDeleted && typeof msg.client?.fetchWebhook === 'function') {
      const wh = await msg.client.fetchWebhook(msg.webhookId).catch(() => null);
      if (wh && typeof wh.delete === 'function') {
        whName = wh.name || whName;
        await wh.delete('Anti-webhook: Tiêu hủy webhook phát tán spam / mass mention');
        whDeleted = true;
      }
    }
  } catch (e) {
    console.error('[WEBHOOK GUARD] Lỗi xóa webhook độc hại:', e.message);
  }

  const reason = isPhishing
    ? 'Chứa nội dung lừa đảo / Phishing Nitro'
    : hasMassMention
    ? 'Spam mass mention (@everyone / nhiều role)'
    : 'Spam tin nhắn dồn dập vượt ngưỡng';

  const embed = new EmbedBuilder()
    .setColor(0xdc2626)
    .setTitle('🚨 Anti-webhook: Chặn spam & tiêu hủy Webhook độc hại')
    .setDescription(
      `Đã phát hiện tin nhắn phát tán từ Webhook **${whName}** tại kênh <#${msg.channelId}> vi phạm an toàn:\n` +
      `• **Lý do:** ${reason}\n\n` +
      (whDeleted ? '✅ **Đã xóa tin nhắn và TIÊU HỦY Webhook thành công.**' : '⚠️ Đã xóa tin nhắn vi phạm.')
    )
    .setTimestamp();

  await sendAlert(msg.guild, options, embed);
  return true;
}

module.exports = {
  onAuditLog,
  onMessage,
  hit,
  trusted,
};
