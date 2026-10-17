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

  // 1d. Test Webhook Invite Link
  saveOptions(guildId, {
    securityEnabled: true,
    securityAntiWebhook: true,
    securityInvites: true,
    securityStaffWatch: true,
    securityStaffDailyBanLimit: 2,
    securityStaffDailyKickLimit: 3,
  });
  let inviteDeleted = false;
  const inviteWebhookMsg = {
    guild: mockGuild,
    channel: mockChannel,
    channelId: 'ch-chat',
    webhookId: 'wh-invite',
    deletable: true,
    content: 'Tham gia server tại discord.gg/somewhere',
    mentions: { everyone: false, roles: new Map(), users: new Map() },
    delete: async () => { inviteDeleted = true; },
    client: mockGuild.client,
  };
  const inviteHandled = await webhookGuard.onMessage(inviteWebhookMsg);
  assert.equal(inviteHandled, true);
  assert.equal(inviteDeleted, true);
  assert.equal(deletedWebhooks.some(w => w.id === 'wh-invite'), true);

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

  // Ban với targetId null vẫn ghi nhận log an toàn không lỗi NOT NULL
  await staffWatch.onAuditLog(
    { action: A.MemberBanAdd, executorId: 'staff-456', targetId: null },
    mockGuild
  );
  assert.equal(staffWatch.countStaffActions(guildId, 'staff-456', 'ban'), 4);

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

  // Kiểm tra khôi phục icon về null nếu ban đầu server không có icon
  const oldGuildNoIcon = {
    id: guildId,
    name: 'VietNam Legacy Official',
    icon: null,
    iconURL: () => null,
  };
  const newGuildWithIcon = {
    ...mockGuild,
    name: 'VietNam Legacy Official',
    icon: 'rogue-icon-hash',
    fetchAuditLogs: async () => ({
      entries: {
        first: () => ({
          executorId: 'staff-456',
          targetId: guildId,
          changes: [{ key: 'icon_hash', old: null, new: 'rogue-icon-hash' }],
          createdTimestamp: Date.now(),
        }),
      },
    }),
  };
  await staffWatch.onGuildUpdate(oldGuildNoIcon, newGuildWithIcon);
  assert.equal(iconRestored?.icon, null);

  // 4. Testing Bot Command staff moderation (10 bans / 15 kicks limits and role stripping)
  console.log('4. Testing Staff Watch: Bot Command tracking & default limits (10 bans / 15 kicks)...');
  const botCmdGuildId = 'guild-bot-cmd-test';
  let botCmdStripped = [];
  let botCmdTimeouts = [];

  const botCmdStaffMember = {
    id: 'staff-bot-user',
    guild: { id: botCmdGuildId },
    moderatable: true,
    timeout: async (ms, reason) => {
      botCmdTimeouts.push({ ms, reason });
    },
    roles: {
      cache: new Map([
        ['role-staff-name', { id: 'role-staff-name', name: 'Ban Quản Trị Staff', editable: true, managed: false, permissions: { any: () => false } }],
        ['role-mod-name', { id: 'role-mod-name', name: 'Partner Management', editable: true, managed: false, permissions: { any: () => false } }],
        ['role-member', { id: 'role-member', name: 'Thành viên', editable: true, managed: false, permissions: { any: () => false } }],
      ]),
      remove: async (roleId, reason) => {
        botCmdStripped.push(roleId);
      },
    },
  };

  const botCmdGuild = {
    id: botCmdGuildId,
    name: 'Bot Command Test Guild',
    ownerId: 'owner-999',
    client: { user: { id: 'bot-self' } },
    members: {
      fetch: async (id) => (id === 'staff-bot-user' ? botCmdStaffMember : null),
    },
    channels: {
      fetch: async () => mockChannel,
    },
  };

  // Bật securityStaffWatch nhưng dùng mặc định: maxBans = 10, maxKicks = 15
  saveOptions(botCmdGuildId, {
    securityEnabled: true,
    securityStaffWatch: true,
  });

  // Staff dùng lệnh bot ban 10 người đầu tiên -> Không bị phạt
  for (let i = 1; i <= 10; i++) {
    const res = await staffWatch.handleStaffAction(botCmdGuild, 'staff-bot-user', 'ban', `victim-ban-${i}`);
    assert.equal(res.triggered, false);
    assert.equal(res.count, i);
    assert.equal(res.max, 10);
  }
  assert.equal(botCmdStripped.length, 0);

  // Staff dùng lệnh bot ban người thứ 11 (> 10 người/ngày) -> Tự xóa role staff & timeout!
  const ban11 = await staffWatch.handleStaffAction(botCmdGuild, 'staff-bot-user', 'ban', 'victim-ban-11');
  assert.equal(ban11.triggered, true);
  assert.equal(ban11.count, 11);
  assert.equal(ban11.max, 10);
  assert.ok(botCmdStripped.includes('role-staff-name'), 'Phải xóa role chứa tên Staff');
  assert.ok(botCmdStripped.includes('role-mod-name'), 'Phải xóa role chứa tên Partner Management');
  assert.ok(!botCmdStripped.includes('role-member'), 'Không được xóa role thành viên thường');
  assert.equal(botCmdTimeouts.length, 1);

  // Kiểm tra chặn lệnh ban tiếp theo khi đã vượt hạn mức
  assert.equal(staffWatch.isStaffLimitExceeded(botCmdGuild, 'staff-bot-user', 'ban'), true);

  // Staff dùng lệnh bot kick 15 người đầu tiên -> Không bị phạt
  for (let i = 1; i <= 15; i++) {
    const res = await staffWatch.handleStaffAction(botCmdGuild, 'staff-bot-user', 'kick', `victim-kick-${i}`);
    assert.equal(res.triggered, false);
    assert.equal(res.count, i);
    assert.equal(res.max, 15);
  }

  // Staff dùng lệnh bot kick người thứ 16 (> 15 người/ngày) -> Tự xóa role staff & timeout!
  const kick16 = await staffWatch.handleStaffAction(botCmdGuild, 'staff-bot-user', 'kick', 'victim-kick-16');
  assert.equal(kick16.triggered, true);
  assert.equal(kick16.count, 16);
  assert.equal(kick16.max, 15);
  assert.equal(staffWatch.isStaffLimitExceeded(botCmdGuild, 'staff-bot-user', 'kick'), true);

  console.log('PASS: Webhook Guard & Staff Watch successfully verified!');
})().catch((err) => {
  console.error('FAILED:', err);
  process.exitCode = 1;
});
