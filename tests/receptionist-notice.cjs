'use strict';
/**
 * Test: Hệ thống thông báo lễ tân khi có thành viên mới
 * Kiểm tra: bật/tắt, thiếu kênh, bỏ qua bot, tag role, nội dung tùy chỉnh, thiếu quyền, embed layout & avatar.
 */
const assert = require('node:assert/strict');

let sentContent = null;
let sentOptions = null;
let sentEmbeds = null;

function makeOptions(overrides = {}) {
  return {
    receptionistEnabled: true,
    receptionistChannel: 'ch-general',
    receptionistRole: 'role-letan',
    receptionistPingText: '👋 Welcome {member} đến với **{server}**! {role}',
    receptionistTitle: '✨ Welcome to {server}',
    receptionistText: '🌸 Chào mừng bạn gia nhập **{server}**!\n\nMỗi thành viên đều là một phần quan trọng của cộng đồng. Đừng ngần ngại gửi lời chào và trò chuyện cùng {role} và mọi người nhé!\n\n✨ Chúc bạn có những phút giây thật vui vẻ tại đây!',
    receptionistColor: '#54a0ff',
    ...overrides,
  };
}

function makeMember({ bot = false, id = 'user-001', username = 'TestUser', hasViewSend = true, hasEmbed = true } = {}) {
  const meObj = { permissions: { has: () => true }, roles: { highest: {} } };
  const guild = {
    id: 'guild-1',
    name: 'Test Server',
    memberCount: 42,
    iconURL: () => 'https://cdn.discordapp.com/icons/guild.png',
    members: { me: meObj, fetchMe: async () => meObj },
    channels: {
      fetch: async (chId) => {
        if (chId !== 'ch-general') return null;
        return {
          guildId: 'guild-1', type: 0,
          permissionsFor: () => ({
            has: (p) => {
              if (Array.isArray(p)) return p.every(perm => String(perm) === '16384' ? hasEmbed : hasViewSend);
              return String(p) === '16384' ? hasEmbed : hasViewSend;
            },
          }),
          send: async (payload) => {
            sentContent = payload.content;
            sentOptions = payload.allowedMentions;
            sentEmbeds = payload.embeds;
          },
        };
      },
    },
  };
  return {
    user: {
      bot, id, username,
      displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/user.png',
    },
    id,
    guild,
  };
}

async function run() {
  const cust = require('../utils/customization');
  const origGet = cust.getOptions;
  const { notifyReceptionist } = require('../utils/receptionistNotice');

  // ────────────────────────────────────────────────
  // 1. Tắt tính năng → không gửi
  // ────────────────────────────────────────────────
  sentContent = null; sentEmbeds = null;
  cust.getOptions = () => makeOptions({ receptionistEnabled: false });
  await notifyReceptionist(makeMember());
  assert.equal(sentContent, null, 'Phải bỏ qua khi tắt tính năng');

  // ────────────────────────────────────────────────
  // 2. Thành viên là bot → không gửi
  // ────────────────────────────────────────────────
  sentContent = null; sentEmbeds = null;
  cust.getOptions = () => makeOptions();
  await notifyReceptionist(makeMember({ bot: true }));
  assert.equal(sentContent, null, 'Phải bỏ qua khi thành viên là bot');

  // ────────────────────────────────────────────────
  // 3. Không có kênh → không gửi (không crash)
  // ────────────────────────────────────────────────
  sentContent = null; sentEmbeds = null;
  cust.getOptions = () => makeOptions({ receptionistChannel: '' });
  await notifyReceptionist(makeMember());
  assert.equal(sentContent, null, 'Phải bỏ qua khi chưa chọn kênh');

  // ────────────────────────────────────────────────
  // 4. Thiếu quyền → không gửi (không crash)
  // ────────────────────────────────────────────────
  sentContent = null; sentOptions = null; sentEmbeds = null;
  cust.getOptions = () => makeOptions();
  await notifyReceptionist(makeMember({ hasViewSend: false }));
  assert.equal(sentContent, null, 'Phải bỏ qua khi thiếu quyền gửi tin');

  // ────────────────────────────────────────────────
  // 5. Gửi đúng – ping text ở ngoài, Embed chào mừng có avatar
  // ────────────────────────────────────────────────
  sentContent = null; sentOptions = null; sentEmbeds = null;
  cust.getOptions = () => makeOptions();
  await notifyReceptionist(makeMember({ id: 'user-001', username: 'Alice' }));
  assert.ok(sentContent !== null, 'Phải gửi tin khi đủ điều kiện');
  assert.ok(sentContent.includes('<@user-001>'), 'Dòng ping phải tag mention thành viên mới');
  assert.ok(sentContent.includes('<@&role-letan>'), 'Dòng ping phải tag role lễ tân');
  assert.deepEqual(sentOptions.roles, ['role-letan'], 'allowedMentions.roles phải chứa role lễ tân');
  assert.deepEqual(sentOptions.users, ['user-001'], 'allowedMentions.users phải chứa member.id để ping thành viên mới');
  assert.deepEqual(sentOptions.parse, [], 'allowedMentions.parse phải rỗng (không @everyone)');

  // Kiểm tra Embed
  assert.ok(sentEmbeds && sentEmbeds.length === 1, 'Phải gửi kèm 1 Embed');
  const embed = sentEmbeds[0].data;
  assert.ok(embed.title.includes('Test Server'), 'Embed title phải chứa tên server');
  assert.equal(embed.thumbnail?.url, 'https://cdn.discordapp.com/avatars/user.png', 'Embed phải có thumbnail là avatar user');
  assert.ok(embed.description.includes('Test Server'), 'Embed description phải chứa tên server');
  assert.ok(embed.description.includes('<@&role-letan>'), 'Embed description phải chứa role lễ tân');
  assert.ok(embed.footer?.text.includes('42'), 'Embed footer phải chứa memberCount');
  assert.equal(embed.color, 0x54a0ff, 'Màu Embed phải là #54a0ff');

  // ────────────────────────────────────────────────
  // 6. Tùy chỉnh dòng ping và nội dung embed
  // ────────────────────────────────────────────────
  sentContent = null; sentEmbeds = null;
  cust.getOptions = () => makeOptions({
    receptionistPingText: '📢 Chào bạn {username}!',
    receptionistTitle: '🌟 CHÀO MỪNG {server}',
    receptionistText: 'Chúc mừng {member} là thành viên thứ {memberCount}!',
  });
  await notifyReceptionist(makeMember({ id: 'user-002', username: 'Bob' }));
  assert.ok(sentContent.includes('Bob'), 'Dòng ping phải hiển thị username');
  assert.ok(sentEmbeds[0].data.title.includes('🌟 CHÀO MỪNG Test Server'), 'Embed title phải áp dụng mẫu mới');
  assert.ok(sentEmbeds[0].data.description.includes('thứ 42'), 'Embed description phải chứa memberCount');

  // ────────────────────────────────────────────────
  // 7. Không có role lễ tân → vẫn gửi bình thường, không crash
  // ────────────────────────────────────────────────
  sentContent = null; sentOptions = null; sentEmbeds = null;
  cust.getOptions = () => makeOptions({ receptionistRole: '' });
  await notifyReceptionist(makeMember({ id: 'user-003' }));
  assert.ok(sentContent !== null, 'Vẫn gửi dù không có role lễ tân');
  assert.deepEqual(sentOptions.roles, [], 'allowedMentions.roles rỗng khi không có role');

  // ────────────────────────────────────────────────
  // 8. Thiếu quyền EmbedLinks → Tự động fallback sang text thuần, không bỏ sót
  // ────────────────────────────────────────────────
  sentContent = null; sentOptions = null; sentEmbeds = null;
  cust.getOptions = () => makeOptions();
  await notifyReceptionist(makeMember({
    id: 'user-004',
    username: 'Charlie',
    hasEmbed: false,
  }));
  assert.ok(sentContent !== null, 'Vẫn phải gửi tin khi thiếu quyền EmbedLinks (fallback text)');
  assert.equal(sentEmbeds, undefined, 'Không đính kèm embed khi thiếu quyền EmbedLinks');
  assert.ok(sentContent.includes('<@user-004>'), 'Text fallback phải tag người mới');
  assert.ok(sentContent.includes('<@&role-letan>'), 'Text fallback phải tag role lễ tân');

  // Khôi phục getOptions gốc
  cust.getOptions = origGet;

  console.log('PASS receptionist notice: bật/tắt, bỏ qua bot, thiếu kênh, thiếu quyền, tag role, embed layout, avatar thumbnail, biến tùy chỉnh, fallback text.');
}

run().catch(error => { console.error('FAIL receptionist:', error.message); process.exit(1); });
