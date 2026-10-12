'use strict';
/**
 * Test: Hệ thống Ticket độc quyền VietNam Legacy
 * Kiểm tra:
 * 1. Lưu & lấy cấu hình ticket
 * 2. Tạo giao diện Embed có banner ảnh và Dropdown Menu
 * 3. Phân quyền chặt chẽ: Ẩn với @everyone, chỉ cấp cho Người tạo + Role AdminTicket + Role Hỗ Trợ Ticket
 * 4. Chống mở trùng nhiều ticket
 * 5. Các hành động: Đóng, Mở lại, Transcript, Xóa
 */
const assert = require('node:assert/strict');
const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const ticketSystem = require('../utils/ticketSystem');

const mockChannels = new Map();
let createdChannels = [];
let sentMessages = [];

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
        user: { username: 'testuser', tag: 'testuser#1234' },
      }),
    },
  };
  return guild;
}

async function run() {
  const guild = makeGuild();

  // ─────────────────────────────────────────────────────────────
  // 1. Cấu hình & Lưu cấu hình với 2 role riêng biệt
  // ─────────────────────────────────────────────────────────────
  ticketSystem.saveConfig(guild.id, {
    channelId: 'ch-ticket-panel',
    categoryId: 'cat-tickets',
    adminRoleId: 'role-admin-ticket',
    supportRoleId: 'role-support-ticket',
    title: '🏷️ HỆ THỐNG TICKET VIETNAM LEGACY',
    bannerUrl: 'https://vnl.vn/banner-ticket.png',
    placeholder: 'Chọn sản phẩm / dịch vụ bạn cần...',
  });

  const config = ticketSystem.getConfig(guild.id);
  assert.equal(config.adminRoleId, 'role-admin-ticket');
  assert.equal(config.supportRoleId, 'role-support-ticket');
  assert.equal(config.bannerUrl, 'https://vnl.vn/banner-ticket.png');

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

  // ─────────────────────────────────────────────────────────────
  // 3. Tạo ticket khi chọn mục & Kiểm tra phân quyền độc quyền
  // ─────────────────────────────────────────────────────────────
  let replyData = null;
  const selectInteraction = {
    guild,
    user: { id: 'user-001', username: 'MemberA', tag: 'MemberA#0001' },
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
  // 4. Chống mở trùng ticket
  // ─────────────────────────────────────────────────────────────
  replyData = null;
  await ticketSystem.handleSelectCategory(selectInteraction);
  assert.ok(replyData.content.includes('Bạn đã có một Ticket đang mở'), 'Phải chặn không cho mở 2 ticket cùng lúc');

  // ─────────────────────────────────────────────────────────────
  // 5. Thao tác nút: Đóng ticket -> Khóa chat
  // ─────────────────────────────────────────────────────────────
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
    reply: async (p) => { replyData = p; },
    editReply: async (p) => { replyData = p; },
  };

  await ticketSystem.handleButtonAction(closeInteraction);
  assert.ok(replyData.embeds[0].data.title.includes('ĐÃ ĐÓNG'), 'Embed phải thông báo ticket đã đóng');

  // ─────────────────────────────────────────────────────────────
  // 6. Thao tác nút: Transcript
  // ─────────────────────────────────────────────────────────────
  const transcriptInteraction = {
    guild,
    channel: ticketChannel,
    user: { id: 'admin-001', tag: 'Admin#0001' },
    member: {
      permissions: { has: () => true },
      roles: { cache: new Map([['role-admin-ticket', true]]) },
    },
    customId: 'ticket:btn_transcript',
    isStringSelectMenu: () => false,
    isButton: () => true,
    deferReply: async () => {},
    reply: async (p) => { replyData = p; },
    editReply: async (p) => { replyData = p; },
  };

  await ticketSystem.handleButtonAction(transcriptInteraction);
  assert.ok(replyData.content.includes('Transcript'), 'Phải tạo transcript thành công');
  assert.equal(replyData.files.length, 1);

  // ─────────────────────────────────────────────────────────────
  // 7. Thao tác nút: Xóa ticket
  // ─────────────────────────────────────────────────────────────
  let deleteReply = null;
  const deleteInteraction = {
    guild,
    channel: ticketChannel,
    user: { id: 'admin-001', tag: 'Admin#0001' },
    member: {
      permissions: { has: () => true },
      roles: { cache: new Map([['role-admin-ticket', true]]) },
    },
    customId: 'ticket:btn_delete',
    isStringSelectMenu: () => false,
    isButton: () => true,
    reply: async (p) => { deleteReply = p; },
  };

  await ticketSystem.handleButtonAction(deleteInteraction);
  assert.ok(deleteReply.content.includes('5 giây'), 'Phải có thông báo đếm ngược xóa');

  console.log('PASS ticket-system: config, banner embed, select menu, AdminTicket & SupportTicket permissions, dedup open, close, transcript, delete.');
}

run().catch(error => { console.error('FAIL ticket-system:', error); process.exit(1); });
