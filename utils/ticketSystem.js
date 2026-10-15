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
  UserSelectMenuBuilder,
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
        handlerRoleId: /^\d{17,20}$/.test(o.handlerRoleId || '') ? o.handlerRoleId : '',
        grantRoleId: /^\d{17,20}$/.test(o.grantRoleId || '') ? o.grantRoleId : '',
        grantButtonLabel: String(o.grantButtonLabel || 'Cấp role').trim().slice(0, 80) || 'Cấp role',
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
// Danh mục chưa có role riêng tiếp tục dùng nhóm hỗ trợ chung.
function ticketPolicy(config, ticket) {
  const option = (config.options || []).find(o => o.value === ticket.category_value) || {};
  return { ...option, handlerRoleId: option.handlerRoleId || config.supportRoleId || '' };
}
function canHandle(member, guild, policy) {
  if ((guild.ownerId && member.id === guild.ownerId) || member.permissions.has(P.Administrator)) return true;
  const role = guild.roles.cache.get(policy.handlerRoleId);
  return Boolean(role && (member.roles.cache.has(role.id) ||
    (member.roles.highest?.comparePositionTo && member.roles.highest.comparePositionTo(role) > 0)));
}

async function handleSelectCategory(interaction) {
  const guild = interaction.guild;
  if (!guild) return;

  const config = getConfig(guild.id);
  const selectedValue = interaction.values[0];
  const option = (config.options || DEFAULT_OPTIONS).find(o => o.value === selectedValue) || {
    value: selectedValue,
    label: selectedValue,
  };

  const policy = ticketPolicy(config, { category_value: selectedValue });
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

  if (policy.handlerRoleId && policy.handlerRoleId !== config.adminRoleId && guild.roles.cache.has(policy.handlerRoleId)) {
    permissionOverwrites.push({
      id: policy.handlerRoleId, // Nhóm xử lý riêng của danh mục
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
  if (policy.handlerRoleId) pings.push(`<@&${policy.handlerRoleId}>`);

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
  const ticketRow = buildTicketButtons(ticketData, config);

  await ticketChannel.send({
    content: pings.join(' '),
    allowedMentions: { users: [interaction.user.id], roles: policy.handlerRoleId ? [policy.handlerRoleId] : [] },
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
      `Đội ngũ ${ticketPolicy(config, ticket).handlerRoleId ? '<@&' + ticketPolicy(config, ticket).handlerRoleId + '>' : 'hỗ trợ'} sẽ tiếp nhận và đồng hành cùng bạn trong ticket này.\n\n` +
      `💬 *Vui lòng mô tả chi tiết vấn đề / dịch vụ bạn cần để được hỗ trợ nhanh nhất nhé!*`
    )
    .setFooter({
      text: `${guild.name} • Ticket System • Nhấn nút bên dưới để nhận hoặc đóng ticket`,
      iconURL: guild.iconURL() || undefined,
    })
    .setTimestamp();
}

function buildTicketButtons(ticket = {}, config = {}) {
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

  const transferButton = new ButtonBuilder()
    .setCustomId('ticket:btn_transfer')
    .setLabel('Chuyển Staff')
    .setEmoji('🔄')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(claimButton, closeButton, closeReasonButton, transferButton);
  const policy = ticketPolicy(config, ticket);
  if (policy.grantRoleId && policy.handlerRoleId) row.addComponents(new ButtonBuilder()
    .setCustomId('ticket:btn_grant_role').setLabel(policy.grantButtonLabel || 'Cấp role')
    .setEmoji('🤝').setStyle(ButtonStyle.Success));
  return row;
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
  const isSupport = canHandle(member, guild, ticketPolicy(config, ticket));
  const isCreator = interaction.user.id === ticket.user_id;

  const action = interaction.customId.replace('ticket:btn_', '');

  if (action === 'transfer') {
    if (ticket.status !== 'open' || (!isAdmin && !isSupport)) return interaction.reply({ content: '⛔ Chỉ nhân sự có quyền xử lý mới được chuyển ticket đang mở.', flags: 64 });
    return interaction.reply({
      content: 'Chọn staff tiếp nhận mới. Người được chọn phải có quyền xử lý loại ticket này.', flags: 64,
      components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder()
        .setCustomId('ticket:transfer:' + interaction.message.id)
        .setPlaceholder('Chọn staff tiếp nhận').setMinValues(1).setMaxValues(1))],
    });
  }

  if (action === 'grant_role') {
    await interaction.deferReply({ flags: 64 });
    const policy = ticketPolicy(config, ticket);
    const actor = await guild.members.fetch({ user: interaction.user.id, force: true }).catch(() => null);
    const role = await guild.roles.fetch(policy.grantRoleId || '0').catch(() => null);
    const handler = guild.roles.cache.get(policy.handlerRoleId);
    const me = await guild.members.fetchMe();
    const dangerous = [P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels, P.BanMembers, P.KickMembers, P.ManageWebhooks];
    if (ticket.status !== 'open' || !actor || !handler || !policy.grantRoleId || !canHandle(actor, guild, policy)) {
      return interaction.editReply('⛔ Chỉ nhóm xử lý được chỉ định hoặc người có role cao hơn mới được cấp role trong ticket đang mở.');
    }
    if (!role || role.id === guild.id || role.managed || dangerous.some(p => role.permissions.has(p)) ||
        role.comparePositionTo(handler) >= 0 || !me.permissions.has(P.ManageRoles) || me.roles.highest.comparePositionTo(role) <= 0 ||
        (actor.id !== guild.ownerId && actor.roles.highest.comparePositionTo(role) <= 0)) {
      return interaction.editReply('⚠️ Không thể cấp role này. Role nhận phải là role thường, nằm dưới nhóm xử lý và role cao nhất của bot/người cấp.');
    }
    const recipient = await guild.members.fetch({ user: ticket.user_id, force: true }).catch(() => null);
    if (!recipient) return interaction.editReply('⚠️ Người mở ticket không còn trong server.');
    if (recipient.roles.cache.has(role.id)) return interaction.editReply('✅ Người mở ticket đã có role này rồi.');
    try {
      await recipient.roles.add(role, 'Ticket #' + ticket.id + ' được duyệt bởi ' + actor.user.tag + ' (' + actor.id + ')');
    } catch {
      return interaction.editReply('❌ Bot chưa cấp được role. Hãy kiểm tra quyền Quản lý role và vị trí role của bot.');
    }
    await channel.send({content: '🤝 Chúc mừng <@' + ticket.user_id + '>! Bạn đã được cấp <@&' + role.id + '> sau khi ticket được <@' + actor.id + '> phê duyệt. Cảm ơn bạn đã đồng hành cùng ' + guild.name + '!', allowedMentions: { users: [ticket.user_id], roles: [] }}).catch(() => {});
    return interaction.editReply('✅ Đã cấp role thành công cho người mở ticket.');
  }

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
      const updatedRow = buildTicketButtons(ticket, config);
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
    if (!isAdmin && !isSupport && !isCreator) return interaction.reply({ content: '⛔ Bạn không có quyền xem transcript này.', flags: 64 });
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
  const isSupport = canHandle(member, guild, ticketPolicy(config, ticket));
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
async function handleTransfer(interaction) {
  if (!interaction.guild || !interaction.channel) return;
  await interaction.deferUpdate();
  const guild = interaction.guild, channel = interaction.channel;
  const ticket = db().prepare('SELECT * FROM tickets WHERE channel_id = ? AND guild_id = ?').get(channel.id, guild.id);
  const finish = content => interaction.editReply({ content, components: [] });
  if (!ticket || ticket.status !== 'open') return finish('⚠️ Ticket đã đóng hoặc không còn tồn tại.');
  const config = getConfig(guild.id), policy = ticketPolicy(config, ticket);
  const actor = await guild.members.fetch({ user: interaction.user.id, force: true }).catch(() => null);
  const target = await guild.members.fetch({ user: interaction.values[0], force: true }).catch(() => null);
  const eligible = member => member && (canHandle(member, guild, policy) || (config.adminRoleId && member.roles.cache.has(config.adminRoleId)));
  if (!eligible(actor)) return finish('⛔ Bạn không còn quyền chuyển ticket này.');
  if (!target || target.user.bot || !eligible(target)) return finish('⚠️ Hãy chọn một staff có quyền xử lý loại ticket này, không chọn tài khoản bot.');
  if (ticket.claimed_by === target.id) return finish('ℹ️ Staff này đang tiếp nhận ticket rồi.');
  // Bảo đảm staff được chọn có thể vào phòng, kể cả khi chỉ có role cấp trên.
  try {
    await channel.permissionOverwrites.edit(target.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true });
  } catch { return finish('❌ Bot không thể cấp quyền vào phòng cho staff. Ticket chưa được chuyển.'); }
  const now = Date.now();
  const changed = db().prepare("UPDATE tickets SET claimed_by = ?, claimed_at = ? WHERE id = ? AND status = 'open' AND claimed_by IS ?")
    .run(target.id, now, ticket.id, ticket.claimed_by);
  if (!changed.changes) return finish('⚠️ Ticket vừa thay đổi người xử lý hoặc đã đóng. Hãy mở lại nút Chuyển Staff.');
  const previous = ticket.claimed_by;
  ticket.claimed_by = target.id; ticket.claimed_at = now;
  const messageId = interaction.customId.slice('ticket:transfer:'.length);
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (message?.author.id === guild.client.user.id) await message.edit({ embeds: [buildTicketWelcomeEmbed(ticket, null, config, guild)], components: [buildTicketButtons(ticket, config)], allowedMentions: { parse: [] } }).catch(() => {});
  await channel.setTopic('Ticket của ' + ticket.user_id + ' • Loại: ' + ticket.category_label + ' • Đang xử lý: ' + target.user.tag).catch(() => {});
  await channel.send({ content: '🔄 <@' + ticket.user_id + '>, ticket của bạn đã được chuyển ' + (previous ? 'từ <@' + previous + '> ' : '') + 'sang <@' + target.id + '> tiếp nhận.\nNgười chuyển: <@' + actor.id + '>. Staff mới sẽ tiếp tục hỗ trợ bạn tại đây nhé!', allowedMentions: { users: [ticket.user_id, target.id], roles: [] } }).catch(() => {});
  return finish('✅ Đã chuyển ticket sang staff mới.');
}

async function handleInteraction(interaction) {
  if (interaction.isUserSelectMenu?.() && interaction.customId.startsWith('ticket:transfer:')) return handleTransfer(interaction);
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

async function refreshOpenTickets(guild, previous, config) {
  const tickets = db().prepare("SELECT * FROM tickets WHERE guild_id = ? AND status = 'open'").all(guild.id);
  let updated = 0, failed = 0;
  for (const ticket of tickets) {
    try {
      const channel = await guild.channels.fetch(ticket.channel_id);
      if (!channel) continue;
      const oldRole = ticketPolicy(previous, ticket).handlerRoleId;
      const newRole = ticketPolicy(config, ticket).handlerRoleId;
      if (newRole && guild.roles.cache.has(newRole)) {
        await channel.permissionOverwrites.edit(newRole, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true });
      }
      if (oldRole && oldRole !== newRole && oldRole !== config.adminRoleId && oldRole !== guild.id) {
        await channel.permissionOverwrites.delete(oldRole);
      }
      const messages = await channel.messages.fetch({ limit: 100 });
      const welcome = messages.find(m => m.author.id === guild.client.user.id && m.embeds.some(e => e.title?.startsWith('🎫 TICKET #' + ticket.id + ' —')));
      if (welcome) {
        await welcome.edit({ embeds: [buildTicketWelcomeEmbed(ticket, null, config, guild)], components: [buildTicketButtons(ticket, config)], allowedMentions: { parse: [] } });
        updated++;
      } else failed++;
    } catch (error) {
      failed++;
      console.warn('[TICKET REFRESH]', ticket.channel_id, error.code || error.name);
    }
  }
  return { updated, failed };
}

module.exports = {
  refreshOpenTickets,
  ticketPolicy,
  canHandle,
  getConfig,
  saveConfig,
  buildPanelPayload,
  sendTicketPanel,
  handleSelectCategory,
  handleButtonAction,
  handleModalSubmit,
  handleTransfer,
  handleInteraction,
  buildTicketButtons,
  buildTicketWelcomeEmbed,
  executeCloseTicket,
  DEFAULT_OPTIONS,
  DEFAULT_BANNER,
};
