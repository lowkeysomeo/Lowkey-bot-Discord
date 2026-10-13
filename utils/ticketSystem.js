'use strict';
/**
 * utils/ticketSystem.js
 * Hệ thống Ticket độc quyền VietNam Legacy với Dropdown Select Menu,
 * phân quyền riêng cho role AdminTicket và Hỗ Trợ Ticket,
 * Embed chuyên nghiệp có banner hình ảnh và các nút đóng/mở/xóa/transcript.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits: P,
  AttachmentBuilder,
} = require('discord.js');

const { getDb } = require('./database');

const DEFAULT_OPTIONS = [
  { value: 'support', label: '📩 Hỗ Trợ Chung (Support)', description: 'Giải đáp thắc mắc, hỗ trợ các vấn đề trong server', emoji: '📩' },
  { value: 'staff_app', label: '🛡️ Ứng Tuyển Staff', description: 'Đăng ký ứng tuyển vào đội ngũ Staff của VietNam Legacy', emoji: '🛡️' },
  { value: 'nitro_boost', label: '⚡ N1tr0 B00st', description: 'N1tr0 D1sc0rd Giá Siêu Rẻ', emoji: '⚡' },
  { value: 'nitro_first', label: '🎁 N1tr0 Lần Đầu', description: 'Dành Cho Tài Khoản Chưa Từng Dùng N1tr0', emoji: '🎁' },
  { value: 'server_boost', label: '💎 B00st Server', description: 'Nâng Cấp Server Của Bạn', emoji: '💎' },
  { value: 'decor', label: '🔮 Khung Dec0r & Hiệu Ứng', description: 'Hiệu ứng & khung Discord giá rẻ', emoji: '🔮' },
  { value: 'youtube', label: '📺 Y0uTube Premium', description: 'Xem Y0uTube Không Quảng Cáo', emoji: '📺' },
];

const DEFAULT_BANNER = 'https://images-ext-1.discordapp.net/external/vnl-ticket-banner.png';

function db() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS ticket_config (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT,
      category_id TEXT,
      admin_role_id TEXT,
      support_role_id TEXT,
      log_channel_id TEXT,
      title TEXT,
      description TEXT,
      banner_url TEXT,
      color TEXT,
      placeholder TEXT,
      options_json TEXT
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      category_value TEXT NOT NULL,
      category_label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL,
      claimed_by TEXT,
      claimed_at INTEGER,
      closed_at INTEGER,
      closed_by TEXT,
      close_reason TEXT
    );
  `);

  try { d.exec('ALTER TABLE tickets ADD COLUMN claimed_by TEXT;'); } catch {}
  try { d.exec('ALTER TABLE tickets ADD COLUMN claimed_at INTEGER;'); } catch {}
  try { d.exec('ALTER TABLE tickets ADD COLUMN close_reason TEXT;'); } catch {}
  return d;
}

/**
 * Lấy cấu hình ticket của server
 */
function getConfig(guildId) {
  const row = db().prepare('SELECT * FROM ticket_config WHERE guild_id = ?').get(guildId);
  return {
    channelId: row?.channel_id || '',
    categoryId: row?.category_id || '',
    adminRoleId: row?.admin_role_id || '',
    supportRoleId: row?.support_role_id || '',
    logChannelId: row?.log_channel_id || '',
    title: row?.title || '🏷️ HỆ THỐNG TICKET',
    description: row?.description || (
      'Chào mừng bạn đến với hệ thống hỗ trợ của **VietNam Legacy**!\n\n' +
      'Nếu bạn cần hỗ trợ, mua hàng, báo cáo vấn đề hoặc muốn liên hệ với Staff, hãy chọn loại Ticket phù hợp từ danh mục bên dưới.\n\n' +
      '📌 **Lưu ý:**\n' +
      '• Không tạo Ticket khi không có mục đích rõ ràng.\n' +
      '• Mô tả vấn đề cụ thể để Staff có thể hỗ trợ nhanh hơn.\n' +
      '• Không spam hoặc tag Staff liên tục.\n' +
      '• Mỗi vấn đề nên tạo 1 Ticket riêng.\n\n' +
      '*VietNam Legacy — Connect • Community • Legacy*'
    ),
    bannerUrl: row?.banner_url || '',
    color: row?.color || '#00a8ff',
    placeholder: row?.placeholder || 'Nhấn Vào Đây Để Chọn Dịch Vụ / Hỗ Trợ...',
    options: row?.options_json ? JSON.parse(row.options_json) : DEFAULT_OPTIONS,
  };
}

function sanitizeEmoji(raw) {
  if (!raw || typeof raw !== 'string') return undefined;
  const str = raw.trim();
  if (!str) return undefined;
  const customMatch = /^<a?:([a-zA-Z0-9_]+):(\d+)>$/.exec(str);
  if (customMatch) {
    return { name: customMatch[1], id: customMatch[2] };
  }
  if (/^\d{17,20}$/.test(str)) {
    return { id: str };
  }
  return str;
}

/**
 * Lưu cấu hình ticket
 */
function saveConfig(guildId, patch) {
  const current = getConfig(guildId);
  const updated = { ...current, ...patch };

  if (Array.isArray(patch.options)) {
    const cleanOptions = patch.options
      .filter(o => o && typeof o === 'object' && o.label)
      .slice(0, 25)
      .map((o, idx) => ({
        value: String(o.value || `opt_${idx + 1}`).trim().slice(0, 100),
        label: String(o.label).trim().slice(0, 100),
        description: o.description ? String(o.description).trim().slice(0, 100) : undefined,
        emoji: o.emoji ? String(o.emoji).trim().slice(0, 30) : undefined,
      }));
    updated.options = cleanOptions.length > 0 ? cleanOptions : DEFAULT_OPTIONS;
  }

  db().prepare(`
    INSERT INTO ticket_config (
      guild_id, channel_id, category_id, admin_role_id, support_role_id,
      log_channel_id, title, description, banner_url, color, placeholder, options_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      channel_id = excluded.channel_id,
      category_id = excluded.category_id,
      admin_role_id = excluded.admin_role_id,
      support_role_id = excluded.support_role_id,
      log_channel_id = excluded.log_channel_id,
      title = excluded.title,
      description = excluded.description,
      banner_url = excluded.banner_url,
      color = excluded.color,
      placeholder = excluded.placeholder,
      options_json = excluded.options_json
  `).run(
    guildId,
    updated.channelId,
    updated.categoryId,
    updated.adminRoleId,
    updated.supportRoleId,
    updated.logChannelId,
    updated.title,
    updated.description,
    updated.bannerUrl,
    updated.color,
    updated.placeholder,
    JSON.stringify(updated.options)
  );
  return updated;
}

/**
 * Xây dựng Embed và Dropdown Menu của bảng Ticket Panel
 */
function buildPanelPayload(guild, config) {
  const embed = new EmbedBuilder()
    .setColor(config.color || '#00a8ff')
    .setAuthor({
      name: `💳 Hệ Thống Ticket ${guild.name}`,
      iconURL: guild.iconURL() || undefined,
    })
    .setTitle(config.title.slice(0, 256))
    .setDescription(config.description.slice(0, 4096))
    .setFooter({
      text: `${guild.name} • Support System`,
      iconURL: guild.iconURL() || undefined,
    });

  if (config.bannerUrl && /^https?:\/\//i.test(config.bannerUrl)) {
    embed.setImage(config.bannerUrl);
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('ticket:select_category')
    .setPlaceholder(config.placeholder.slice(0, 150))
    .addOptions(
      (config.options || DEFAULT_OPTIONS).map(opt => {
        const optionData = {
          value: opt.value,
          label: opt.label.slice(0, 100),
        };
        if (opt.description) optionData.description = opt.description.slice(0, 100);
        const em = sanitizeEmoji(opt.emoji);
        if (em) optionData.emoji = em;
        return optionData;
      })
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);
  return { embeds: [embed], components: [row] };
}

/**
 * Đăng bảng Ticket Panel vào một kênh Discord
 */
async function sendTicketPanel(guild, channelId, optionsOverride = {}) {
  const config = { ...getConfig(guild.id), ...optionsOverride };
  const channel = await guild.channels.fetch(channelId);
  if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
    throw new Error('Kênh được chọn không hợp lệ hoặc bot không có quyền truy cập.');
  }

  const payload = buildPanelPayload(guild, config);
  const msg = await channel.send(payload);

  saveConfig(guild.id, { channelId, bannerUrl: config.bannerUrl });
  return { ok: true, messageId: msg.id, channelId };
}

/**
 * Xử lý khi thành viên chọn danh mục trong Dropdown Menu
 */
async function handleSelectCategory(interaction) {
  const guild = interaction.guild;
  if (!guild) return;

  const config = getConfig(guild.id);
  const selectedValue = interaction.values[0];
  const option = (config.options || DEFAULT_OPTIONS).find(o => o.value === selectedValue) || {
    value: selectedValue,
    label: selectedValue,
  };

  // Reset lại select menu trên panel message để xóa trạng thái đã chọn (clear checkmark),
  // giúp thành viên có thể chọn lại cùng một mục mà không bị Discord client chặn sự kiện.
  if (interaction.message && typeof interaction.message.edit === 'function' && (interaction.message.editable ?? true)) {
    interaction.message.edit(buildPanelPayload(guild, config)).catch(() => {});
  }

  // 1. Kiểm tra giới hạn số lượng ticket đang mở của thành viên (Tối đa 3 ticket)
  const MAX_OPEN_TICKETS = 3;
  const openTickets = db().prepare(
    'SELECT channel_id FROM tickets WHERE guild_id = ? AND user_id = ? AND status = ?'
  ).all(guild.id, interaction.user.id, 'open');

  const activeChannels = [];
  for (const t of openTickets) {
    const ch = await guild.channels.fetch(t.channel_id).catch(() => null);
    if (ch) {
      activeChannels.push(ch);
    } else {
      // Nếu kênh cũ đã bị xóa tay ngoài Discord, đổi status thành closed để không tính vào giới hạn
      db().prepare('UPDATE tickets SET status = ? WHERE channel_id = ?').run('closed', t.channel_id);
    }
  }

  if (activeChannels.length >= MAX_OPEN_TICKETS) {
    const listStr = activeChannels.map(ch => `<#${ch.id}>`).join(', ');
    return interaction.reply({
      content: `⚠️ Bạn đã đạt giới hạn tối đa **${MAX_OPEN_TICKETS} Ticket** đang mở (${listStr})! Vui lòng hoàn tất hoặc đóng bớt Ticket cũ trước khi mở thêm nhé.`,
      flags: 64,
    });
  }

  await interaction.deferReply({ flags: 64 });

  // 2. Chuẩn bị quyền hạn cho kênh Ticket
  // CHỈ CÓ:
  // - Người tạo (User)
  // - Role AdminTicket (nếu cấu hình)
  // - Role Hỗ Trợ Ticket (nếu cấu hình)
  // - Bot
  // Toàn bộ @everyone bị ẨN HOÀN TOÀN.
  const permissionOverwrites = [
    {
      id: guild.id, // @everyone
      deny: [P.ViewChannel],
    },
    {
      id: interaction.user.id, // Người tạo ticket
      allow: [
        P.ViewChannel,
        P.SendMessages,
        P.AttachFiles,
        P.EmbedLinks,
        P.ReadMessageHistory,
      ],
    },
    {
      id: guild.client.user.id, // Bot
      allow: [
        P.ViewChannel,
        P.SendMessages,
        P.ManageChannels,
        P.ManageMessages,
        P.EmbedLinks,
        P.AttachFiles,
        P.ReadMessageHistory,
      ],
    },
  ];

  if (config.adminRoleId && guild.roles.cache.has(config.adminRoleId)) {
    permissionOverwrites.push({
      id: config.adminRoleId, // Role AdminTicket
      allow: [
        P.ViewChannel,
        P.SendMessages,
        P.AttachFiles,
        P.EmbedLinks,
        P.ReadMessageHistory,
        P.ManageMessages,
      ],
    });
  }

  if (config.supportRoleId && guild.roles.cache.has(config.supportRoleId)) {
    permissionOverwrites.push({
      id: config.supportRoleId, // Role Hỗ Trợ Ticket
      allow: [
        P.ViewChannel,
        P.SendMessages,
        P.AttachFiles,
        P.EmbedLinks,
        P.ReadMessageHistory,
      ],
    });
  }

  // 3. Đặt tên kênh ticket sạch sẽ
  const safeUsername = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'user';
  const safeCategory = selectedValue.slice(0, 10);
  const channelName = `🎫・${safeCategory}-${safeUsername}`;

  // Kiểm tra parent category
  let parent = null;
  if (config.categoryId) {
    const cat = await guild.channels.fetch(config.categoryId).catch(() => null);
    if (cat && cat.type === ChannelType.GuildCategory) {
      parent = cat.id;
    }
  }

  // 4. Tạo kênh Discord
  let ticketChannel;
  try {
    ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent,
      permissionOverwrites,
      topic: `Ticket của ${interaction.user.tag} (${interaction.user.id}) • Loại: ${option.label}`,
    });
  } catch (error) {
    console.error('[TICKET CREATE ERROR]', error);
    return interaction.editReply({
      content: `❌ Không thể tạo kênh ticket: ${error.message}. Vui lòng kiểm tra quyền "Manage Channels" của bot.`,
    });
  }

  // 5. Lưu vào Database
  const insertRes = db().prepare(`
    INSERT INTO tickets (guild_id, channel_id, user_id, category_value, category_label, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'open', ?)
  `).run(
    guild.id,
    ticketChannel.id,
    interaction.user.id,
    selectedValue,
    option.label,
    Date.now()
  );

  const ticketId = insertRes.lastInsertRowid;

  // 6. Gửi tin nhắn mở đầu trong phòng Ticket
  const pings = [`<@${interaction.user.id}>`];
  if (config.supportRoleId) pings.push(`<@&${config.supportRoleId}>`);
  if (config.adminRoleId && config.adminRoleId !== config.supportRoleId) pings.push(`<@&${config.adminRoleId}>`);

  const ticketData = {
    id: ticketId,
    guild_id: guild.id,
    channel_id: ticketChannel.id,
    user_id: interaction.user.id,
    category_value: selectedValue,
    category_label: option.label,
    status: 'open',
    created_at: Date.now(),
    claimed_by: null,
  };

  const welcomeEmbed = buildTicketWelcomeEmbed(ticketData, interaction.user, config, guild);
  const ticketRow = buildTicketButtons(ticketData);

  await ticketChannel.send({
    content: pings.join(' '),
    embeds: [welcomeEmbed],
    components: [ticketRow],
  });

  return interaction.editReply({
    content: `✅ Đã tạo Ticket của bạn thành công tại <#${ticketChannel.id}>!`,
  });
}

function buildTicketWelcomeEmbed(ticket, user, config, guild) {
  const claimedText = ticket.claimed_by
    ? `<@${ticket.claimed_by}>`
    : '⏳ *Chưa có Staff tiếp nhận (Bấm nút "Nhận Ticket" bên dưới)*';

  return new EmbedBuilder()
    .setColor(config.color || '#00a8ff')
    .setTitle(`🎫 TICKET #${ticket.id} — ${ticket.category_label}`)
    .setDescription(
      `Xin chào <@${ticket.user_id}>! Cảm ơn bạn đã liên hệ với **${guild.name}**.\n\n` +
      `📋 **Yêu cầu hỗ trợ:** **${ticket.category_label}**\n` +
      `👤 **Khách hàng:** <@${ticket.user_id}>\n` +
      `🛡️ **Staff tiếp nhận:** ${claimedText}\n\n` +
      `Đội ngũ **AdminTicket** & **Hỗ Trợ Ticket** đã nhận được thông báo và sẽ có mặt hỗ trợ bạn sớm nhất có thể.\n\n` +
      `💬 *Vui lòng mô tả chi tiết vấn đề / dịch vụ bạn cần để được hỗ trợ nhanh nhất nhé!*`
    )
    .setFooter({
      text: `${guild.name} • Ticket System • Nhấn nút bên dưới để nhận hoặc đóng ticket`,
      iconURL: guild.iconURL() || undefined,
    })
    .setTimestamp();
}

function buildTicketButtons(ticket = {}) {
  const isClaimed = Boolean(ticket.claimed_by);

  const claimButton = new ButtonBuilder()
    .setCustomId('ticket:btn_claim')
    .setLabel(isClaimed ? 'Đã Nhận Xử Lý' : 'Nhận Ticket')
    .setEmoji(isClaimed ? '✅' : '✋')
    .setStyle(isClaimed ? ButtonStyle.Secondary : ButtonStyle.Success)
    .setDisabled(isClaimed);

  const closeButton = new ButtonBuilder()
    .setCustomId('ticket:btn_close')
    .setLabel('Đóng Ticket')
    .setEmoji('🔒')
    .setStyle(ButtonStyle.Danger);

  const closeReasonButton = new ButtonBuilder()
    .setCustomId('ticket:btn_close_reason')
    .setLabel('Đóng Kèm Lý Do')
    .setEmoji('📝')
    .setStyle(ButtonStyle.Primary);

  const transcriptButton = new ButtonBuilder()
    .setCustomId('ticket:btn_transcript')
    .setLabel('Lưu Transcript')
    .setEmoji('📑')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(claimButton, closeButton, closeReasonButton, transcriptButton);
}

async function generateTranscriptAttachment(channel, ticket, guild, extra = {}) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  let text = `========================================================\n`;
  text += `TRANSCRIPT TICKET #${ticket.id} - ${guild.name}\n`;
  text += `Loại yêu cầu: ${ticket.category_label}\n`;
  text += `Người tạo: ${ticket.user_id}\n`;
  text += `Staff tiếp nhận: ${ticket.claimed_by || 'Chưa tiếp nhận'}\n`;
  if (extra.closedBy) text += `Người đóng: ${extra.closedBy}\n`;
  if (extra.reason) text += `Lý do đóng: ${extra.reason}\n`;
  text += `Thời gian xuất: ${new Date().toLocaleString('vi-VN')}\n`;
  text += `========================================================\n\n`;

  for (const m of sorted) {
    const time = new Date(m.createdTimestamp).toLocaleString('vi-VN');
    text += `[${time}] ${m.author?.tag || m.author?.username || 'User'} (${m.author?.id}):\n`;
    if (m.content) text += `  ${m.content}\n`;
    if (m.attachments?.size) {
      text += `  [Đính kèm: ${[...m.attachments.values()].map(a => a.url).join(', ')}]\n`;
    }
    text += `\n`;
  }

  const buffer = Buffer.from(text, 'utf-8');
  return new AttachmentBuilder(buffer, { name: `transcript-ticket-${ticket.id}.txt` });
}

/**
 * Thực thi đóng ticket: ghi DB, xuất transcript, gửi log/DM và xóa phòng
 */
async function executeCloseTicket(interaction, channel, ticket, guild, config, reason = null) {
  const closeReasonText = (reason && String(reason).trim())
    ? String(reason).trim()
    : 'Hoàn tất hỗ trợ (Không nêu lý do)';

  if (!interaction.deferred && !interaction.replied) {
    if (typeof interaction.deferReply === 'function') {
      await interaction.deferReply().catch(() => {});
    }
  }

  // 1. Tự động xuất transcript cuộc trò chuyện
  let transcriptAttachment = null;
  try {
    transcriptAttachment = await generateTranscriptAttachment(channel, ticket, guild, {
      closedBy: `${interaction.user.tag || interaction.user.username} (${interaction.user.id})`,
      reason: closeReasonText,
    });
  } catch (err) {
    console.error('[TRANSCRIPT GENERATE ERROR]', err);
  }

  // 2. Cập nhật Database: đóng ticket và lưu lý do
  db().prepare('UPDATE tickets SET status = ?, closed_at = ?, closed_by = ?, close_reason = ? WHERE id = ?')
    .run('closed', Date.now(), interaction.user.id, closeReasonText, ticket.id);

  // 3. Gửi transcript vào kênh Log nếu server có cấu hình
  if (config.logChannelId && transcriptAttachment) {
    try {
      const logChannel = await guild.channels.fetch(config.logChannelId).catch(() => null);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor('#ff4757')
          .setTitle(`📑 Lịch sử Ticket #${ticket.id} — ${ticket.category_label}`)
          .setDescription(
            `👤 **Khách hàng:** <@${ticket.user_id}>\n` +
            `🛡️ **Người tiếp nhận:** ${ticket.claimed_by ? `<@${ticket.claimed_by}>` : 'Chưa có'}\n` +
            `🔒 **Người đóng:** <@${interaction.user.id}>\n` +
            `📝 **Lý do đóng:** **${closeReasonText}**\n` +
            `⏰ **Thời gian:** ${new Date().toLocaleString('vi-VN')}`
          )
          .setFooter({ text: `${guild.name} • Ticket System Log` })
          .setTimestamp();

        await logChannel.send({
          embeds: [logEmbed],
          files: [transcriptAttachment],
        });
      }
    } catch (logErr) {
      console.error('[TICKET LOG ERROR]', logErr);
    }
  }

  // 4. Gửi transcript qua DM cho người tạo ticket để khách lưu giữ
  if (transcriptAttachment) {
    try {
      const creatorMember = await guild.members.fetch(ticket.user_id).catch(() => null);
      if (creatorMember && !creatorMember.user.bot) {
        await creatorMember.send({
          content:
            `📑 Chào bạn, Ticket #${ticket.id} (${ticket.category_label}) tại **${guild.name}** đã được hoàn tất.\n` +
            `🛡️ **Người xử lý:** ${ticket.claimed_by ? `<@${ticket.claimed_by}>` : 'Đội ngũ Hỗ Trợ'}\n` +
            `🔒 **Người đóng:** <@${interaction.user.id}>\n` +
            `📝 **Lý do đóng:** **${closeReasonText}**\n\n` +
            `Đây là bản lưu lại toàn bộ nội dung cuộc trò chuyện của bạn!`,
          files: [transcriptAttachment],
        }).catch(() => {});
      }
    } catch {}
  }

  // 5. Thông báo trong kênh và tự động xóa kênh sau 5 giây (đóng là xóa luôn)
  const closeEmbed = new EmbedBuilder()
    .setColor('#ff4757')
    .setTitle(`🔒 TICKET #${ticket.id} ĐÃ HOÀN TẤT VÀ ĐÓNG`)
    .setDescription(
      `Ticket đã được đóng bởi <@${interaction.user.id}>.\n` +
      (ticket.claimed_by ? `🛡️ **Người tiếp nhận:** <@${ticket.claimed_by}>\n` : '') +
      `📝 **Lý do đóng:** **${closeReasonText}**\n\n` +
      `✅ **Lịch sử trò chuyện (Transcript) đã được tự động lưu trữ.**\n` +
      `🗑️ Kênh này sẽ tự động **xóa vĩnh viễn sau 5 giây**...`
    )
    .setFooter({ text: `${guild.name} • Cảm ơn bạn đã sử dụng dịch vụ!` })
    .setTimestamp();

  const replyPayload = {
    embeds: [closeEmbed],
    files: transcriptAttachment ? [transcriptAttachment] : [],
  };

  if (interaction.deferred) {
    await interaction.editReply(replyPayload).catch(() => {});
  } else if (!interaction.replied) {
    await interaction.reply(replyPayload).catch(() => {});
  }

  const deleteTimer = setTimeout(async () => {
    try {
      await channel.delete(`Ticket #${ticket.id} đã hoàn tất và đóng vĩnh viễn`);
    } catch (delErr) {
      console.error('[TICKET DELETE ERROR]', delErr.message);
    }
  }, 5000);
  if (deleteTimer.unref) deleteTimer.unref();
}

/**
 * Xử lý các nút bấm trong kênh Ticket (Nhận ticket, Đóng, Đóng có lý do, Transcript)
 */
async function handleButtonAction(interaction) {
  const guild = interaction.guild;
  const channel = interaction.channel;
  if (!guild || !channel) return;

  const ticket = db().prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channel.id);
  if (!ticket) {
    return interaction.reply({
      content: '⚠️ Kênh này không phải là một phòng ticket hợp lệ trong hệ thống.',
      flags: 64,
    });
  }

  const config = getConfig(guild.id);
  const member = interaction.member;

  // Quyền: Admin server, role AdminTicket, role Hỗ Trợ Ticket, hoặc người tạo ticket
  const isAdmin = member.permissions.has(P.Administrator) || (config.adminRoleId && member.roles.cache.has(config.adminRoleId));
  const isSupport = config.supportRoleId && member.roles.cache.has(config.supportRoleId);
  const isCreator = interaction.user.id === ticket.user_id;

  const action = interaction.customId.replace('ticket:btn_', '');

  // ─────────────────────────────────────────────────────────────
  // 1. Nhận xử lý Ticket (Claim)
  // ─────────────────────────────────────────────────────────────
  if (action === 'claim') {
    if (!isAdmin && !isSupport) {
      if (isCreator) {
        return interaction.reply({
          content: '⚠️ Bạn là người tạo ticket này. Vui lòng đợi đội ngũ Staff/Hỗ trợ tiếp nhận nhé!',
          flags: 64,
        });
      }
      return interaction.reply({
        content: '⛔ Bạn không có quyền nhận ticket này. Chỉ Staff Hỗ Trợ hoặc Admin mới có quyền nhận.',
        flags: 64,
      });
    }

    if (ticket.claimed_by) {
      return interaction.reply({
        content: `⚠️ Ticket này đã được tiếp nhận xử lý bởi <@${ticket.claimed_by}> rồi.`,
        flags: 64,
      });
    }

    // Cập nhật DB
    const now = Date.now();
    db().prepare('UPDATE tickets SET claimed_by = ?, claimed_at = ? WHERE id = ?')
      .run(interaction.user.id, now, ticket.id);
    ticket.claimed_by = interaction.user.id;
    ticket.claimed_at = now;

    // Cập nhật topic phòng ticket nếu có
    if (typeof channel.setTopic === 'function') {
      const topicText = `Ticket của ${ticket.user_id} • Loại: ${ticket.category_label} • Đang xử lý: ${interaction.user.tag || interaction.user.username}`;
      channel.setTopic(topicText).catch(() => {});
    }

    // Cập nhật tin nhắn ban đầu (đổi trạng thái nút bấm và embed)
    if (interaction.message && typeof interaction.message.edit === 'function' && (interaction.message.editable ?? true)) {
      const updatedEmbed = buildTicketWelcomeEmbed(ticket, interaction.user, config, guild);
      const updatedRow = buildTicketButtons(ticket);
      await interaction.message.edit({
        embeds: [updatedEmbed],
        components: [updatedRow],
      }).catch(() => {});
    }

    // Gửi thông báo nổi bật vào phòng ticket để người tạo biết ai đang tiếp nhận xử lý
    const claimEmbed = new EmbedBuilder()
      .setColor('#2ed573')
      .setTitle('🙋‍♂️ TICKET ĐÃ ĐƯỢC TIẾP NHẬN XỬ LÝ')
      .setDescription(
        `Staff **<@${interaction.user.id}>** đã tiếp nhận hỗ trợ ticket này!\n\n` +
        `👤 **Khách hàng:** <@${ticket.user_id}>\n` +
        `🛡️ **Người tiếp nhận:** <@${interaction.user.id}>\n` +
        `📋 **Danh mục:** **${ticket.category_label}**\n` +
        `⏰ **Thời gian nhận:** ${new Date(now).toLocaleString('vi-VN')}\n\n` +
        `💬 *Khách hàng vui lòng trao đổi trực tiếp với nhân viên hỗ trợ tại đây.*`
      )
      .setFooter({ text: `${guild.name} • Ticket System` })
      .setTimestamp();

    return interaction.reply({
      content: `🔔 <@${ticket.user_id}>, ticket của bạn đã được tiếp nhận bởi **<@${interaction.user.id}>**!`,
      embeds: [claimEmbed],
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Đóng ticket trực tiếp (Nhanh)
  // ─────────────────────────────────────────────────────────────
  if (action === 'close') {
    if (!isAdmin && !isSupport && !isCreator) {
      return interaction.reply({
        content: '⛔ Bạn không có quyền đóng ticket này.',
        flags: 64,
      });
    }

    return executeCloseTicket(interaction, channel, ticket, guild, config, 'Đóng trực tiếp (Không có lý do)');
  }

  // ─────────────────────────────────────────────────────────────
  // 3. Đóng ticket với lý do (Mở Modal nhập lý do)
  // ─────────────────────────────────────────────────────────────
  if (action === 'close_reason') {
    if (!isAdmin && !isSupport && !isCreator) {
      return interaction.reply({
        content: '⛔ Bạn không có quyền đóng ticket này.',
        flags: 64,
      });
    }

    // Mở Modal nhập lý do nếu môi trường client hỗ trợ showModal
    if (typeof interaction.showModal === 'function') {
      const modal = new ModalBuilder()
        .setCustomId('ticket:modal_close_reason')
        .setTitle(`Đóng Ticket #${ticket.id}`);

      const reasonInput = new TextInputBuilder()
        .setCustomId('close_reason')
        .setLabel('Lý do đóng ticket')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Nhập lý do đóng ticket (ví dụ: Đã giải quyết, Khách không phản hồi...)')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(500);

      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      return interaction.showModal(modal);
    }

    // Fallback nếu không có showModal (ví dụ chạy unit test mock)
    return executeCloseTicket(interaction, channel, ticket, guild, config, 'Đóng kèm lý do');
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Xuất Transcript thủ công
  // ─────────────────────────────────────────────────────────────
  if (action === 'transcript') {
    await interaction.deferReply({ flags: 64 });
    try {
      const transcriptAttachment = await generateTranscriptAttachment(channel, ticket, guild);
      return interaction.editReply({
        content: `📑 Đã xuất Transcript của Ticket #${ticket.id}!`,
        files: [transcriptAttachment],
      });
    } catch (err) {
      console.error('[TRANSCRIPT ERROR]', err);
      return interaction.editReply({
        content: `❌ Không thể xuất transcript: ${err.message}`,
      });
    }
  }
}

/**
 * Xử lý khi nộp Modal nhập lý do đóng ticket
 */
async function handleModalSubmit(interaction) {
  const guild = interaction.guild;
  const channel = interaction.channel;
  if (!guild || !channel) return;

  const ticket = db().prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channel.id);
  if (!ticket) {
    return interaction.reply({
      content: '⚠️ Kênh này không phải là một phòng ticket hợp lệ trong hệ thống.',
      flags: 64,
    });
  }

  const config = getConfig(guild.id);
  const member = interaction.member;
  const isAdmin = member.permissions.has(P.Administrator) || (config.adminRoleId && member.roles.cache.has(config.adminRoleId));
  const isSupport = config.supportRoleId && member.roles.cache.has(config.supportRoleId);
  const isCreator = interaction.user.id === ticket.user_id;

  if (!isAdmin && !isSupport && !isCreator) {
    return interaction.reply({
      content: '⛔ Bạn không có quyền đóng ticket này.',
      flags: 64,
    });
  }

  const reason = interaction.fields?.getTextInputValue('close_reason')?.trim() || 'Không có lý do cụ thể';
  return executeCloseTicket(interaction, channel, ticket, guild, config, reason);
}

/**
 * Xử lý mọi tương tác liên quan đến Ticket
 */
async function handleInteraction(interaction) {
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket:select_category') {
    return handleSelectCategory(interaction);
  }
  if (interaction.isButton() && interaction.customId.startsWith('ticket:btn_')) {
    return handleButtonAction(interaction);
  }
  if (interaction.isModalSubmit() && interaction.customId === 'ticket:modal_close_reason') {
    return handleModalSubmit(interaction);
  }
}

module.exports = {
  getConfig,
  saveConfig,
  buildPanelPayload,
  sendTicketPanel,
  handleSelectCategory,
  handleButtonAction,
  handleModalSubmit,
  handleInteraction,
  buildTicketButtons,
  buildTicketWelcomeEmbed,
  executeCloseTicket,
  DEFAULT_OPTIONS,
  DEFAULT_BANNER,
};
