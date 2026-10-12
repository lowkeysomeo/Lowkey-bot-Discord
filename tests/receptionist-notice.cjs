'use strict';
/**
 * Test: Hệ thống thông báo lễ tân khi có thành viên mới
 * Kiểm tra: bật/tắt, thiếu kênh, bỏ qua bot, tag role, nội dung tùy chỉnh, thiếu quyền.
 */
const assert = require('node:assert/strict');

let sentContent = null;
let sentOptions = null;

function makeOptions(overrides = {}) {
  return {
    receptionistEnabled: true,
    receptionistChannel: 'ch-general',
    receptionistRole: 'role-letan',
    receptionistText: '👋 {member} vừa vào server! {role} chào thành viên mới nhé~',
    ...overrides,
  };
}

function makeMember({ bot = false, id = 'user-001', username = 'TestUser', hasViewSend = true } = {}) {
  const meObj = { permissions: { has: () => true }, roles: { highest: {} } };
  const guild = {
    id: 'guild-1',
    name: 'Test Server',
    memberCount: 42,
    members: { me: meObj, fetchMe: async () => meObj },
    channels: {
      fetch: async (chId) => {
        if (chId !== 'ch-general') return null;
        return {
          guildId: 'guild-1', type: 0,
          permissionsFor: () => ({ has: () => hasViewSend }),
          send: async (payload) => { sentContent = payload.content; sentOptions = payload.allowedMentions; },
        };
      },
    },
  };
  return { user: { bot, id, username }, id, guild };
}

// Mỗi case: dùng cust.getOptions đã được mock trực tiếp (inline require trong receptionistNotice)
async function run() {
  const cust = require('../utils/customization');
  const origGet = cust.getOptions;
  const { notifyReceptionist } = require('../utils/receptionistNotice');

  // ────────────────────────────────────────────────
  // 1. Tắt tính năng → không gửi
  // ────────────────────────────────────────────────
  sentContent = null;
  cust.getOptions = () => makeOptions({ receptionistEnabled: false });
  await notifyReceptionist(makeMember());
  assert.equal(sentContent, null, 'Phải bỏ qua khi tắt tính năng');

  // ────────────────────────────────────────────────
  // 2. Thành viên là bot → không gửi
  // ────────────────────────────────────────────────
  sentContent = null;
  cust.getOptions = () => makeOptions();
  await notifyReceptionist(makeMember({ bot: true }));
  assert.equal(sentContent, null, 'Phải bỏ qua khi thành viên là bot');

  // ────────────────────────────────────────────────
  // 3. Không có kênh → không gửi (không crash)
  // ────────────────────────────────────────────────
  sentContent = null;
  cust.getOptions = () => makeOptions({ receptionistChannel: '' });
  await notifyReceptionist(makeMember());
  assert.equal(sentContent, null, 'Phải bỏ qua khi chưa chọn kênh');

  // ────────────────────────────────────────────────
  // 4. Thiếu quyền → không gửi (không crash)
  // ────────────────────────────────────────────────
  sentContent = null; sentOptions = null;
  cust.getOptions = () => makeOptions();
  await notifyReceptionist(makeMember({ hasViewSend: false }));
  assert.equal(sentContent, null, 'Phải bỏ qua khi thiếu quyền gửi tin');

  // ────────────────────────────────────────────────
  // 5. Gửi đúng – nội dung mặc định, tag role lễ tân
  // ────────────────────────────────────────────────
  sentContent = null; sentOptions = null;
  cust.getOptions = () => makeOptions();
  await notifyReceptionist(makeMember({ id: 'user-001', username: 'Alice' }));
  assert.ok(sentContent !== null, 'Phải gửi tin khi đủ điều kiện');
  assert.ok(sentContent.includes('<@user-001>'), 'Phải tag mention thành viên mới');
  assert.ok(sentContent.includes('<@&role-letan>'), 'Phải tag role lễ tân');
  assert.deepEqual(sentOptions.roles, ['role-letan'], 'allowedMentions.roles phải chứa role lễ tân');
  assert.deepEqual(sentOptions.users, ['user-001'], 'allowedMentions.users phải chứa member.id để ping thành viên mới');
  assert.deepEqual(sentOptions.parse, [], 'allowedMentions.parse phải rỗng (không @everyone)');

  // ────────────────────────────────────────────────
  // 6. Nội dung tùy chỉnh với các biến {memberCount}, {server}, {username}
  // ────────────────────────────────────────────────
  sentContent = null;
  cust.getOptions = () => makeOptions({ receptionistText: '{role} 👀 {username} đã vào! Server giờ có {memberCount} người. — {server}' });
  await notifyReceptionist(makeMember({ id: 'user-002', username: 'Bob' }));
  assert.ok(sentContent !== null, 'Phải gửi tin ở case 6');
  assert.ok(sentContent.includes('Bob'), 'Phải hiển thị username');
  assert.ok(sentContent.includes('42'), 'Phải hiển thị memberCount');
  assert.ok(sentContent.includes('Test Server'), 'Phải hiển thị tên server');

  // ────────────────────────────────────────────────
  // 7. Không có role lễ tân → vẫn gửi bình thường, không crash
  // ────────────────────────────────────────────────
  sentContent = null; sentOptions = null;
  cust.getOptions = () => makeOptions({ receptionistRole: '' });
  await notifyReceptionist(makeMember({ id: 'user-003' }));
  assert.ok(sentContent !== null, 'Vẫn gửi dù không có role lễ tân');
  assert.deepEqual(sentOptions.roles, [], 'allowedMentions.roles rỗng khi không có role');

  // Khôi phục getOptions gốc
  cust.getOptions = origGet;

  console.log('PASS receptionist notice: bật/tắt, bỏ qua bot, thiếu kênh, thiếu quyền, tag role, biến tùy chỉnh, không có role.');
}

run().catch(error => { console.error('FAIL receptionist:', error.message); process.exit(1); });
