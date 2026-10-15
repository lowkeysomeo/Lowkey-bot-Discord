process.env.DB_PATH = ':memory:';
const assert = require('node:assert/strict');
const { AuditLogEvent: A, PermissionFlagsBits: P } = require('discord.js');
const { initializeDatabase, getDb } = require('../utils/database');
initializeDatabase();

const { saveOptions } = require('../utils/customization');
const webhookGuard = require('../utils/webhookGuard');
const staffWatch = require('../utils/staffWatch');
const security = require('../utils/securitySystem');

(async () => {
  console.log('--- Testing Webhook Guard & Staff Watch ---');

  const guildId = 'test-guild-guard';
  let alertSent = [];
  let deletedWebhooks = [];
  let timeouts = [];
  let unbans = [];
  let strippedRoles = [];
  let nameRestored = null;
  let iconRestored = null;

  const mockChannel = {
    id: 'sec-log-ch',
    send: async (payload) => {
      alertSent.push(payload);
    },
    fetchWebhooks: async () => {
      const map = new Map();
      map.set('wh-123', {
        id: 'wh-123',
        name: 'Spam Webhook',
        delete: async (reason) => {
          deletedWebhooks.push({ id: 'wh-123', reason });
        },
      });
      return map;
    },
  };

  const staffMember = {
    id: 'staff-456',
    guild: { id: guildId },
    moderatable: true,
    timeout: async (ms, reason) => {
      timeouts.push({ id: 'staff-456', ms, reason });
    },
    roles: {
      cache: new Map([
        ['mod-role', { id: 'mod-role', name: 'Moderator', editable: true, managed: false, permissions: { any: (perms) => perms.includes(P.BanMembers) } }],
        ['chat-role', { id: 'chat-role', name: 'Chatter', editable: true, managed: false, permissions: { any: () => false } }],
      ]),
      remove: async (roleId, reason) => {
        strippedRoles.push({ roleId, reason });
      },
    },
  };

  const mockGuild = {
    id: guildId,
    name: 'VietNam Legacy Official',
    icon: 'old-icon-hash',
    ownerId: 'owner-001',
    client: {
      user: { id: 'bot-self' },
      fetchWebhook: async (id) => ({
        id,
        name: 'Malicious Webhook',
        delete: async (reason) => {
          deletedWebhooks.push({ id, reason });
        },
      }),
    },
    channels: {
      fetch: async (id) => mockChannel,
    },
    members: {
      fetch: async (id) => {
        if (id === 'staff-456') return staffMember;
        return null;
      },
      unban: async (targetId, reason) => {
        unbans.push({ targetId, reason });
      },
    },
    setName: async (name, reason) => {
      nameRestored = { name, reason };
    },
    setIcon: async (icon, reason) => {
      iconRestored = { icon, reason };
    },
    iconURL: () => 'https://cdn.discordapp.com/icons/old-icon.png',
  };

  // Bật Security, AntiWebhook và StaffWatch
  saveOptions(guildId, {
    securityEnabled: true,
    securityLogChannel: 'sec-log-ch',
    securityAntiWebhook: true,
    securityStaffWatch: true,
    securityStaffDailyBanLimit: 2,
    securityStaffDailyKickLimit: 3,
  });
  // Kiểm tra bảo vệ webhook.
  console.log('1. Testing Anti-Webhook Audit Log detection...');

  // 1a. Owner tạo webhook -> Bỏ qua
  await webhookGuard.onAuditLog(
    { action: A.WebhookCreate, executorId: 'owner-001', targetId: 'wh-owner' },
    mockGuild
  );
  assert.equal(deletedWebhooks.length, 0);

  // 1b. Staff lạ hoặc kẻ xấu tạo webhook -> Tự động xóa & timeout kẻ tạo!
  await webhookGuard.onAuditLog(
    { action: A.WebhookCreate, executorId: 'staff-456', targetId: 'wh-bad' },
    mockGuild
  );
  assert.equal(deletedWebhooks.length, 1);
  assert.equal(deletedWebhooks[0].id, 'wh-bad');
  assert.equal(timeouts.length, 1);
  assert.equal(timeouts[0].id, 'staff-456');
  assert.equal(alertSent.length, 1);

  // 1c. Test Webhook Message Spam / Mass Mention
  console.log('1c. Testing Webhook message filtering...');
  let msgDeleted = false;
  const spamWebhookMsg = {
    guild: mockGuild,
    channel: mockChannel,
    channelId: 'ch-chat',
    webhookId: 'wh-123',
    deletable: true,
    content: '@everyone Claim Free Nitro Gift Here: https://discord-nitro.xyz/gift',
    mentions: { everyone: true, roles: new Map(), users: new Map() },
    delete: async () => {
      msgDeleted = true;
    },
    client: mockGuild.client,
  };

  const handled = await webhookGuard.onMessage(spamWebhookMsg);
  assert.equal(handled, true);
  assert.equal(msgDeleted, true);
  assert.equal(deletedWebhooks.some(w => w.id === 'wh-123'), true);
  // Kiểm tra hạn mức ban và kick của staff.
  console.log('2. Testing Staff Watch: Daily Ban quota...');

  // Staff ban lần 1 (cho phép, ghi nhận log)
  await staffWatch.onAuditLog(
    { action: A.MemberBanAdd, executorId: 'staff-456', targetId: 'user-001' },
    mockGuild
  );
  assert.equal(staffWatch.countStaffActions(guildId, 'staff-456', 'ban'), 1);
  assert.equal(unbans.length, 0);

  // Staff ban lần 2 (vẫn trong hạn mức <= 2)
  await staffWatch.onAuditLog(
    { action: A.MemberBanAdd, executorId: 'staff-456', targetId: 'user-002' },
    mockGuild
  );
  assert.equal(staffWatch.countStaffActions(guildId, 'staff-456', 'ban'), 2);
  assert.equal(unbans.length, 0);

  // Ban lần thứ ba vượt hạn mức: thu hồi quyền, giữ nguyên lệnh ban để chủ server kiểm tra.
  await staffWatch.onAuditLog(
    { action: A.MemberBanAdd, executorId: 'staff-456', targetId: 'user-003' },
    mockGuild
  );
  assert.equal(staffWatch.countStaffActions(guildId, 'staff-456', 'ban'), 3);
  assert.equal(unbans.length, 0, 'Không tự mở ban để tránh cho người raid quay lại');
  assert.equal(strippedRoles.some(r => r.roleId === 'mod-role'), true);
  // Kiểm tra bảo vệ tên và ảnh server.
  console.log('3. Testing Staff Watch: Guild Info Guard...');

  const oldGuild = {
    id: guildId,
    name: 'VietNam Legacy Official',
    icon: 'old-icon-hash',
    iconURL: () => 'https://cdn.discordapp.com/icons/old-icon.png',
  };

  const newGuild = {
    ...mockGuild,
    name: 'Hacked by Rogue Staff',
    icon: 'new-icon-hash',
    fetchAuditLogs: async () => ({
      entries: {
        first: () => ({
          executorId: 'staff-456',
          targetId: guildId,
          changes: [{key:'name',old:oldGuild.name,new:'Hacked by Rogue Staff'},{key:'icon_hash',old:oldGuild.icon,new:'new-icon-hash'}],
          createdTimestamp: Date.now(),
        }),
      },
    }),
  };

  await staffWatch.onGuildUpdate(oldGuild, newGuild);
  assert.equal(nameRestored?.name, 'VietNam Legacy Official');
  assert(nameRestored?.reason.includes('Staff Watch'));
  assert.equal(iconRestored?.icon, 'https://cdn.discordapp.com/icons/old-icon.png');

  console.log('PASS: Webhook Guard & Staff Watch successfully verified!');
})().catch((err) => {
  console.error('FAILED:', err);
  process.exitCode = 1;
});
