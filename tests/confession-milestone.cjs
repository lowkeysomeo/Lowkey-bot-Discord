/**
 * tests/confession-milestone.cjs
 * Kiểm tra:
 *  1. Đếm số lượng confession gửi vào kênh 1556975173767270450
 *  2. Khi đạt mốc 100, tự động cấp role 1558809856973082737
 *  3. Gửi thông báo chúc mừng lên kênh 1558774418379903086
 *  4. Không trao lặp lại ở lần confession thứ 101, 102...
 */

const assert = require('node:assert/strict');
process.env.DB_PATH = ':memory:';
delete process.env.GUILD_ID;

const { PermissionFlagsBits: P, Collection } = require('discord.js');
const { getDb } = require('../utils/database');
const {
  recordAndCheckMilestone,
  getUserConfessionCount,
  hasUserReceivedAward,
  DEFAULT_CONFESSION_CHANNEL,
  DEFAULT_AWARD_ROLE,
  DEFAULT_NOTICE_CHANNEL,
  DEFAULT_MILESTONE,
} = require('../utils/confessionRewards');
const { saveOptions } = require('../utils/customization');

assert.equal(DEFAULT_CONFESSION_CHANNEL, '1556975173767270450');
assert.equal(DEFAULT_AWARD_ROLE, '1558809856973082737');
assert.equal(DEFAULT_NOTICE_CHANNEL, '1558774418379903086');
assert.equal(DEFAULT_MILESTONE, 100);

const sentMessages = [];
const rolesAdded = [];

const mockNoticeChannel = {
  id: DEFAULT_NOTICE_CHANNEL,
  type: 0, // GuildText
  send: async (payload) => {
    sentMessages.push(payload);
    return { id: 'notice-msg-1' };
  },
};

const mockMember = {
  id: 'user-writer',
  user: {
    id: 'user-writer',
    bot: false,
    displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/test.png',
  },
  roles: {
    cache: new Collection(),
    add: async (roleId, reason) => {
      mockMember.roles.cache.set(roleId, { id: roleId });
      rolesAdded.push({ roleId, reason });
    },
  },
};

const mockGuild = {
  id: 'guild-test',
  name: 'Lowkey Server',
  members: {
    me: {
      permissions: {
        has: (perm) => perm === P.ManageRoles,
      },
    },
    fetch: async (id) => (id === 'user-writer' ? mockMember : null),
    fetchMe: async () => mockGuild.members.me,
  },
  channels: {
    fetch: async (id) => (id === DEFAULT_NOTICE_CHANNEL ? mockNoticeChannel : null),
  },
};

async function main() {
  const userId = 'user-writer';
  const guildId = mockGuild.id;

  // 1. Gửi vào sai kênh -> không tính
  const wrongChannelResult = await recordAndCheckMilestone(mockGuild, userId, 'wrong-channel-id');
  assert.equal(wrongChannelResult, null, 'Sai kênh không được ghi nhận mốc');
  assert.equal(getUserConfessionCount(guildId, userId), 0);

  // 2. Gửi vào đúng kênh confession -> tăng biến đếm
  for (let i = 1; i <= 99; i++) {
    const res = await recordAndCheckMilestone(mockGuild, userId, DEFAULT_CONFESSION_CHANNEL);
    assert.equal(res.count, i);
    assert.equal(res.awarded, false);
  }
  assert.equal(getUserConfessionCount(guildId, userId), 99);
  assert.equal(rolesAdded.length, 0, 'Chưa đủ 100 thì chưa cấp role');
  assert.equal(sentMessages.length, 0, 'Chưa đủ 100 thì chưa gửi thông báo');

  // 3. Đạt mốc 100 confession!
  const res100 = await recordAndCheckMilestone(mockGuild, userId, DEFAULT_CONFESSION_CHANNEL);
  assert.equal(res100.count, 100);
  assert.equal(res100.awarded, true);
  assert.equal(getUserConfessionCount(guildId, userId), 100);

  // Kiểm tra role được cấp
  assert.equal(rolesAdded.length, 1);
  assert.equal(rolesAdded[0].roleId, DEFAULT_AWARD_ROLE);
  assert.ok(rolesAdded[0].reason.includes('100 confession'));
  assert.ok(mockMember.roles.cache.has(DEFAULT_AWARD_ROLE));

  // Kiểm tra thông báo được gửi vào kênh 1558774418379903086
  assert.equal(sentMessages.length, 1);
  const noticeMsg = sentMessages[0];
  assert.ok(noticeMsg.content.includes(userId), 'Có ping thành viên');
  const embed = noticeMsg.embeds[0].data;
  assert.ok(embed.title.includes('100 Confession'));
  assert.ok(embed.description.includes(DEFAULT_CONFESSION_CHANNEL));
  assert.ok(embed.description.includes(DEFAULT_AWARD_ROLE));

  // Kiểm tra lưu vào confession_awards
  assert.equal(hasUserReceivedAward(guildId, userId, 100), true);

  // 4. Lần gửi thứ 101, 102 không được trao thưởng lặp lại
  const res101 = await recordAndCheckMilestone(mockGuild, userId, DEFAULT_CONFESSION_CHANNEL);
  assert.equal(res101.count, 101);
  assert.equal(res101.awarded, false);
  assert.equal(rolesAdded.length, 1, 'Không cấp role lần 2');
  assert.equal(sentMessages.length, 1, 'Không gửi thông báo lần 2');

  console.log('PASS confession milestone rewards (100 confessions -> role 1558809856973082737 -> notice 1558774418379903086).');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
}).finally(() => {
  try { getDb().close(); } catch {}
});
