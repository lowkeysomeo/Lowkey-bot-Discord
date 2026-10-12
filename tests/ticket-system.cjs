'use strict';
process.env.DB_PATH = ':memory:';

/**
 * Test: Hệ thống Ticket độc quyền VietNam Legacy
 * Kiểm tra:
 * 1. Lưu & lấy cấu hình ticket với AdminTicket & Hỗ Trợ Ticket
 * 2. Tạo giao diện Embed có banner ảnh và Dropdown Menu
 * 3. Phân quyền chặt chẽ: Ẩn với @everyone, chỉ cấp cho Người tạo + Role AdminTicket + Role Hỗ Trợ Ticket
 * 4. Cho phép mở tối đa 3 ticket cùng lúc, chặn ticket thứ 4
 * 5. Các hành động: Đóng (tự động xuất transcript, gửi log, gửi DM và xóa phòng sau 5s) & Lưu Transcript thủ công
 */
const assert = require('node:assert/strict');
const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const { getDb } = require('../utils/database');
const ticketSystem = require('../utils/ticketSystem');

const mockChannels = new Map();
let createdChannels = [];
let sentMessages = [];
let dmSentMessages = [];

function makeGuild() {
  const guild = {
    id: 'guild-vnl',
    name: 'VietNam Legacy',
    iconURL: () => 'https://cdn.discordapp.com/icons/vnl.png',
    client: { user: { id: 'bot-123' } },
    roles: {
      cache: new Map([
        ['role-admin-ticket', { id: 'role-admin-ticket', name: 'AdminTicket' }],
        ['role-support-ticket', { id: 'role-support-ticket', name: 'Hỗ Trợ Ticket' }],
      ]),
    },
    channels: {
      fetch: async (id) => mockChannels.get(id) || null,
      create: async (data) => {
        const ch = {
          id: 'ticket-ch-' + (createdChannels.length + 1),
          name: data.name,
          type: data.type,
          parent: data.parent,
          deleted: false,
          permissionOverwrites: {
            data: data.permissionOverwrites,
            edit: async (targetId, perms) => {
              ch.permissionOverwrites.data = ch.permissionOverwrites.data.map(po => {
                if (po.id === targetId) return { ...po, ...perms };
                return po;
              });
            },
          },
          setName: async (newName) => { ch.name = newName; },
          send: async (payload) => {
            sentMessages.push(payload);
            return { id: 'msg-' + sentMessages.length };
          },
          messages: {
            fetch: async () => new Map([
              ['m1', { createdTimestamp: 1000, author: { tag: 'User#1234', id: 'user-001' }, content: 'Cần mua Nitro Boost', attachments: new Map() }],
              ['m2', { createdTimestamp: 2000, author: { tag: 'Admin#0001', id: 'admin-001' }, content: 'Dạ chào bạn, bạn cần gói mấy tháng?', attachments: new Map() }],
            ]),
          },
          delete: async () => { ch.deleted = true; },
        };
        createdChannels.push(ch);
        mockChannels.set(ch.id, ch);
        return ch;
      },
    },
    members: {
      fetch: async (id) => ({
        id,
        user: { username: 'testuser', tag: 'testuser#1234', bot: false },
        send: async (payload) => {
          dmSentMessages.push(payload);
          return { id: 'dm-msg-1' };
        },
      }),
    },
  };
  return guild;
}

async function run() {
  const db = getDb();
  ticketSystem.getConfig('init');
  db.exec('DELETE FROM tickets; DELETE FROM ticket_config;');
  mockChannels.clear();
  createdChannels = [];
  sentMessages = [];
  dmSentMessages = [];

  const guild = makeGuild();

  // Đăng ký sẵn kênh log
  const logChannel = {
    id: 'ch-log',
    send: async (payload) => {
      sentMessages.push({ ...payload, isLog: true });
      return { id: 'log-msg-1' };
    },
  };
  mockChannels.set('ch-log', logChannel);

  // ─────────────────────────────────────────────────────────────
  // 1. Cấu hình & Lưu cấu hình với 2 role riêng biệt
  // ─────────────────────────────────────────────────────────────
  ticketSystem.saveConfig(guild.id, {
    channelId: 'ch-ticket-panel',
    categoryId: 'cat-tickets',
    adminRoleId: 'role-admin-ticket',
    supportRoleId: 'role-support-ticket',
    logChannelId: 'ch-log',
    title: '🏷️ HỆ THỐNG TICKET VIETNAM LEGACY',
    bannerUrl: 'https://vnl.vn/banner-ticket.png',
    placeholder: 'Chọn sản phẩm / dịch vụ bạn cần...',
  });

  const config = ticketSystem.getConfig(guild.id);
  assert.equal(config.adminRoleId, 'role-admin-ticket');
  assert.equal(config.supportRoleId, 'role-support-ticket');
  assert.equal(config.bannerUrl, 'https://vnl.vn/banner-ticket.png');
  assert.equal(config.logChannelId, 'ch-log');

  // ─────────────────────────────────────────────────────────────
  // 2. Xây dựng Embed và Menu chọn
  // ─────────────────────────────────────────────────────────────
  const panel = ticketSystem.buildPanelPayload(guild, config);
  assert.equal(panel.embeds.length, 1);
  assert.equal(panel.embeds[0].data.image.url, 'https://vnl.vn/banner-ticket.png', 'Embed phải có banner ảnh VNL');
  assert.equal(panel.components.length, 1);
  const menu = panel.components[0].components[0].toJSON();
  assert.equal(menu.custom_id, 'ticket:select_category');
  assert.ok(menu.options.length >= 5, 'Phải có danh sách các dịch vụ trong dropdown');

  // 2b. Kiểm tra lưu và render danh mục tùy chỉnh từ Dashboard
  const customOptions = [
    { value: 'custom_1', label: 'Tùy chỉnh 1', description: 'Mô tả 1', emoji: '✨' },
    { value: 'custom_2', label: 'Tùy chỉnh 2', description: 'Mô tả 2', emoji: '<:vnl:1234567890>' },
  ];
  ticketSystem.saveConfig(guild.id, { options: customOptions });
  const cfgWithOpts = ticketSystem.getConfig(guild.id);
  assert.equal(cfgWithOpts.options.length, 2);
  assert.equal(cfgWithOpts.options[0].label, 'Tùy chỉnh 1');
  const customPanel = ticketSystem.buildPanelPayload(guild, cfgWithOpts);
  const customMenu = customPanel.components[0].components[0].toJSON();
  assert.equal(customMenu.options.length, 2);
  assert.equal(customMenu.options[0].label, 'Tùy chỉnh 1');
  assert.equal(customMenu.options[1].emoji.id, '1234567890');

  // Khôi phục options mặc định để tiếp tục test chọn danh mục
  ticketSystem.saveConfig(guild.id, { options: ticketSystem.DEFAULT_OPTIONS });

  // ─────────────────────────────────────────────────────────────
  // 3. Tạo ticket khi chọn mục & Kiểm tra phân quyền độc quyền
  // ─────────────────────────────────────────────────────────────
  let replyData = null;
  let panelEditedPayload = null;
  const mockPanelMessage = {
    editable: true,
    edit: async (payload) => {
      panelEditedPayload = payload;
      return mockPanelMessage;
    },
  };

  const selectInteraction = {
    guild,
    user: { id: 'user-001', username: 'MemberA', tag: 'MemberA#0001' },
    message: mockPanelMessage,
    values: ['nitro_boost'],
    isStringSelectMenu: () => true,
    isButton: () => false,
    customId: 'ticket:select_category',
    deferReply: async () => {},
    reply: async (p) => { replyData = p; },
    editReply: async (p) => { replyData = p; },
  };

  await ticketSystem.handleSelectCategory(selectInteraction);
  assert.ok(replyData.content.includes('Đã tạo Ticket của bạn thành công'));
  assert.equal(createdChannels.length, 1);
  assert.ok(panelEditedPayload, 'Panel message phải được edit để reset dropdown select menu');
  const resetMenu = panelEditedPayload.components[0].components[0].toJSON();
  assert.equal(resetMenu.custom_id, 'ticket:select_category');
  assert.ok(!resetMenu.options.some(opt => opt.default), 'Không có option nào bị giữ trạng thái default/selected');

  // Kiểm tra chọn lại chính danh mục 'nitro_boost' (ví dụ thành viên khác chọn cùng mục hoặc chọn lại)
  panelEditedPayload = null;
  replyData = null;
  const reselectInteraction = {
    ...selectInteraction,
    user: { id: 'user-002', username: 'MemberB', tag: 'MemberB#0002' },
    values: ['nitro_boost'],
  };
  await ticketSystem.handleSelectCategory(reselectInteraction);
  assert.ok(replyData.content.includes('Đã tạo Ticket của bạn thành công'), 'Chọn lại cùng một danh mục phải tạo ticket thành công');
  assert.ok(panelEditedPayload, 'Panel message tiếp tục được reset sau khi chọn lại cùng mục');

  const ticketChannel = createdChannels[0];
  const overwrites = ticketChannel.permissionOverwrites.data;

  // Kiểm tra: @everyone bị ẩn hoàn toàn
  const everyonePerm = overwrites.find(o => o.id === guild.id);
  assert.ok(everyonePerm, '@everyone phải có trong overwrites');
  assert.ok(everyonePerm.deny.includes(P.ViewChannel), '@everyone phải bị DENY ViewChannel');

  // Kiểm tra: Người tạo ticket được xem
  const creatorPerm = overwrites.find(o => o.id === 'user-001');
  assert.ok(creatorPerm, 'Người tạo ticket phải có quyền');
  assert.ok(creatorPerm.allow.includes(P.ViewChannel));
  assert.ok(creatorPerm.allow.includes(P.SendMessages));

  // Kiểm tra: Role AdminTicket được xem
  const adminRolePerm = overwrites.find(o => o.id === 'role-admin-ticket');
  assert.ok(adminRolePerm, 'Role AdminTicket phải có quyền vào phòng ticket');
  assert.ok(adminRolePerm.allow.includes(P.ViewChannel));
  assert.ok(adminRolePerm.allow.includes(P.SendMessages));

  // Kiểm tra: Role Hỗ Trợ Ticket được xem
  const supportRolePerm = overwrites.find(o => o.id === 'role-support-ticket');
  assert.ok(supportRolePerm, 'Role Hỗ Trợ Ticket phải có quyền vào phòng ticket');
  assert.ok(supportRolePerm.allow.includes(P.ViewChannel));
  assert.ok(supportRolePerm.allow.includes(P.SendMessages));

  // ─────────────────────────────────────────────────────────────
  // 4. Cho phép mở tối đa 3 ticket cùng lúc, chặn ticket thứ 4
  // ─────────────────────────────────────────────────────────────
  // Mở ticket thứ 2 cho user-001 thành công
  replyData = null;
  selectInteraction.values = ['decor'];
  await ticketSystem.handleSelectCategory(selectInteraction);
  assert.ok(replyData.content.includes('Đã tạo Ticket của bạn thành công'), 'Ticket 2 phải mở thành công');

  // Mở ticket thứ 3 cho user-001 thành công
  replyData = null;
  selectInteraction.values = ['youtube'];
  await ticketSystem.handleSelectCategory(selectInteraction);
  assert.ok(replyData.content.includes('Đã tạo Ticket của bạn thành công'), 'Ticket 3 phải mở thành công');
  assert.equal(createdChannels.length, 4, 'Phải có 4 kênh ticket được tạo (1 user-002 + 3 user-001)');

  // Mở ticket thứ 4 cho user-001 -> Bị chặn!
  replyData = null;
  panelEditedPayload = null;
  selectInteraction.values = ['support'];
  await ticketSystem.handleSelectCategory(selectInteraction);
  assert.ok(replyData && replyData.content && replyData.content.includes('giới hạn tối đa') && replyData.content.includes('3 Ticket'), 'Phải chặn khi user-001 đã có 3 ticket đang mở');
  assert.ok(panelEditedPayload, 'Panel menu vẫn phải được reset khi bị chặn vượt quá số lượng ticket');

  // ─────────────────────────────────────────────────────────────
  // 5. Thao tác nút: Đóng ticket -> Tự động lưu transcript, gửi log/DM, xóa kênh sau 5s
  // ─────────────────────────────────────────────────────────────
  let closeReply = null;
  const closeInteraction = {
    guild,
    channel: ticketChannel,
    user: { id: 'admin-001', tag: 'Admin#0001' },
    member: {
      permissions: { has: () => true },
      roles: { cache: new Map([['role-admin-ticket', true]]) },
    },
    customId: 'ticket:btn_close',
    isStringSelectMenu: () => false,
    isButton: () => true,
    deferReply: async () => {},
    reply: async (p) => { closeReply = p; },
    editReply: async (p) => { closeReply = p; },
  };

  await ticketSystem.handleButtonAction(closeInteraction);
  assert.ok(closeReply.embeds[0].data.title.includes('ĐÃ HOÀN TẤT VÀ ĐÓNG'), 'Embed phải thông báo ticket đã hoàn tất và đóng');
  assert.ok(closeReply.files && closeReply.files.length === 1, 'Phải đính kèm file transcript vào thông báo');

  // Kiểm tra gửi transcript vào kênh log
  const logMsg = sentMessages.find(m => m.isLog);
  assert.ok(logMsg, 'Transcript phải được chuyển tiếp vào kênh log');
  assert.ok(logMsg.files && logMsg.files.length === 1, 'Kênh log phải nhận file transcript');

  // Kiểm tra gửi transcript qua DM cho người tạo ticket
  assert.ok(dmSentMessages.length >= 1, 'Người tạo ticket phải nhận transcript qua tin nhắn riêng (DM)');
  assert.ok(dmSentMessages[0].files && dmSentMessages[0].files.length === 1, 'DM phải có file transcript');

  // Kiểm tra cập nhật trạng thái trong database
  const closedTicket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(1);
  assert.equal(closedTicket.status, 'closed', 'Ticket 1 phải được đánh dấu closed trong database');

  // ─────────────────────────────────────────────────────────────
  // 6. Thao tác nút: Lưu Transcript thủ công
  // ─────────────────────────────────────────────────────────────
  let transcriptReply = null;
  const transcriptInteraction = {
    guild,
    channel: createdChannels[1], // kênh ticket thứ 2 đang mở
    user: { id: 'admin-001', tag: 'Admin#0001' },
    member: {
      permissions: { has: () => true },
      roles: { cache: new Map([['role-admin-ticket', true]]) },
    },
    customId: 'ticket:btn_transcript',
    isStringSelectMenu: () => false,
    isButton: () => true,
    deferReply: async () => {},
    reply: async (p) => { transcriptReply = p; },
    editReply: async (p) => { transcriptReply = p; },
  };

  await ticketSystem.handleButtonAction(transcriptInteraction);
  assert.ok(transcriptReply.content.includes('Transcript'), 'Phải tạo transcript thủ công thành công');
  assert.equal(transcriptReply.files.length, 1);

  console.log('PASS ticket-system: config, banner embed, select menu, AdminTicket & SupportTicket permissions, 3 concurrent tickets limit, instant close with transcript (channel, log & DM).');
}

run().catch(error => { console.error('FAIL ticket-system:', error); process.exit(1); });
