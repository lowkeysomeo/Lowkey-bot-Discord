const SHOP_URL = (process.env.SHOP_URL || 'https://vietnamlegacy.shop').replace(/\/+$/, '');
const BOT_TOKEN = process.env.TOKEN || '';

const ORDER_ID_REGEX = /\b(VNL-[A-Za-z0-9]+)\b/i;
const COMMAND_REGEX = /^!(?:rep|reply)\s+([A-Za-z0-9-]+)\s+([\s\S]+)$/i;

async function sendReplyToShop({ authorId, authorName, orderId, replyText }) {
  const url = `${SHOP_URL}/api/discord/reply`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Bot-Token': BOT_TOKEN,
    },
    body: JSON.stringify({
      authorId,
      authorName,
      orderId,
      replyText,
    }),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function handleMessageReply(message) {
  if (!message || message.author?.bot) return false;

  let orderId = null;
  let replyText = null;

  const content = String(message.content || '').trim();

  // Case 1: Lệnh prefix !rep <mã_đơn> <nội dung> hoặc !reply <mã_đơn> <nội dung>
  const cmdMatch = content.match(COMMAND_REGEX);
  if (cmdMatch) {
    orderId = cmdMatch[1].toUpperCase();
    replyText = cmdMatch[2].trim();
  }

  // Case 2: Quote reply trực tiếp vào tin nhắn thông báo đơn hàng
  if (!orderId && message.reference?.messageId) {
    try {
      const referenced = await message.channel.messages.fetch(message.reference.messageId);
      if (referenced) {
        let match = String(referenced.content || '').match(ORDER_ID_REGEX);
        if (!match && Array.isArray(referenced.embeds)) {
          for (const embed of referenced.embeds) {
            const embedText = [
              embed.title || '',
              embed.description || '',
              ...(embed.fields || []).map(f => `${f.name} ${f.value}`),
              embed.footer?.text || '',
            ].join(' ');
            match = embedText.match(ORDER_ID_REGEX);
            if (match) break;
          }
        }

        if (match) {
          orderId = match[1].toUpperCase();
          replyText = content;
        }
      }
    } catch (err) {
      console.warn('[SHOP REPLY] Không thể lấy tin nhắn được reply:', err.message);
    }
  }

  if (!orderId || !replyText) return false;

  try {
    await message.channel.sendTyping().catch(() => {});
    const authorName = message.member?.displayName || message.author.globalName || message.author.username;
    const authorId = message.author.id;

    const { ok, data } = await sendReplyToShop({
      authorId,
      authorName,
      orderId,
      replyText,
    });

    if (ok && data?.success) {
      await message.react('✅').catch(() => {});
      await message.reply({
        content: `✅ **[${data.senderName || 'Shop'}]** Đã chuyển tin nhắn của bạn tới khách hàng trên đơn \`${data.order?.id || orderId}\`:\n> ${replyText}`,
        allowedMentions: { repliedUser: false },
      }).catch(() => {});
    } else {
      await message.react('⚠️').catch(() => {});
      await message.reply({
        content: `⚠️ **Không thể gửi phản hồi:** ${data?.message || data?.error || 'Lỗi xử lý từ hệ thống website shop.'}`,
        allowedMentions: { repliedUser: false },
      }).catch(() => {});
    }
    return true;
  } catch (err) {
    console.error('[SHOP REPLY ERROR]', err);
    await message.react('❌').catch(() => {});
    await message.reply({
      content: `❌ **Lỗi kết nối website shop:** ${err.message}`,
      allowedMentions: { repliedUser: false },
    }).catch(() => {});
    return true;
  }
}

async function handleInteraction(interaction) {
  // Button "Trả lời khách" -> Mở Modal nhập câu trả lời
  if (interaction.isButton() && interaction.customId?.startsWith('reply_order:')) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    const orderId = interaction.customId.replace('reply_order:', '');

    const modal = new ModalBuilder()
      .setCustomId(`rep_modal:${orderId}`)
      .setTitle(`Phản hồi đơn ${orderId}`);

    const input = new TextInputBuilder()
      .setCustomId('rep_message')
      .setLabel('Nội dung tin nhắn gửi khách hàng')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Nhập nội dung bạn muốn phản hồi cho khách hàng...')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(2000);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);
    return true;
  }

  // Modal Submit
  if (interaction.isModalSubmit() && interaction.customId?.startsWith('rep_modal:')) {
    const orderId = interaction.customId.replace('rep_modal:', '');
    const replyText = interaction.fields.getTextInputValue('rep_message')?.trim() || '';

    await interaction.deferReply({ ephemeral: false });

    const authorName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
    const authorId = interaction.user.id;

    const { ok, data } = await sendReplyToShop({
      authorId,
      authorName,
      orderId,
      replyText,
    });

    if (ok && data?.success) {
      await interaction.editReply({
        content: `✅ **[${data.senderName || 'Shop'}]** Đã gửi phản hồi đến khách hàng trên đơn \`${data.order?.id || orderId}\`:\n> ${replyText}`,
      });
    } else {
      await interaction.editReply({
        content: `⚠️ **Không thể gửi phản hồi:** ${data?.message || data?.error || 'Lỗi không xác định.'}`,
      });
    }
    return true;
  }

  return false;
}

module.exports = {
  handleMessageReply,
  handleInteraction,
  sendReplyToShop,
  ORDER_ID_REGEX,
  COMMAND_REGEX,
};
