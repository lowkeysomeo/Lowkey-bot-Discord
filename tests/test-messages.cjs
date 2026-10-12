'use strict';
/**
 * Test: sendTestMessage cho các tính năng mới trên Dashboard
 * Kiểm tra: receptionist, confessionMilestone, roleNotice, invite, voice, chat, confession
 */
const assert = require('node:assert/strict');
const { ChannelType } = require('discord.js');
const { sendTestMessage } = require('../dashboard/testMessages');

const testPosts = [];

const channel = {
  id: '333',
  name: 'general',
  type: ChannelType.GuildText,
  guildId: '111',
  permissionsFor: () => ({ has: () => true }),
  send: async (payload) => {
    testPosts.push(payload);
    return { id: 'msg-' + (testPosts.length) };
  },
};

const mockGuild = {
  id: '111',
  name: 'Test Server',
  memberCount: 99,
  channels: {
    fetch: async (id) => id === '333' ? channel : null,
  },
  roles: {
    cache: {
      filter: () => ({ first: () => ({ id: 'role-sample', name: 'Sample Role', managed: false }) }),
    },
  },
  members: {
    fetch: async (id) => ({
      id,
      displayName: `Tester ${id}`,
      user: {
        id,
        username: 'tester',
        displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/user.png',
      },
    }),
    fetchMe: async () => ({
      id: 'bot-111',
      permissions: { has: () => true },
    }),
  },
};

async function run() {
  // 1. Test Receptionist
  testPosts.length = 0;
  const res1 = await sendTestMessage(mockGuild, 'user-1', { type: 'receptionist', channelId: '333' });
  assert.equal(res1.ok, true);
  assert.ok(res1.messageUrl.includes('msg-1'));
  const post1 = testPosts[0];
  assert.ok(post1.content.includes('[TEST — Lễ tân chào thành viên mới]'));
  assert.equal(post1.embeds.length, 1);
  assert.deepEqual(post1.allowedMentions, { parse: [], users: [], roles: [] }, 'Không ping người thật');

  // 2. Test Confession Milestone
  testPosts.length = 0;
  const res2 = await sendTestMessage(mockGuild, 'user-1', { type: 'confessionMilestone', channelId: '333' });
  assert.equal(res2.ok, true);
  const post2 = testPosts[0];
  assert.ok(post2.content.includes('[TEST — Thưởng mốc Confession]'));
  assert.ok(post2.embeds[0].data.title.includes('Confession'));
  assert.deepEqual(post2.allowedMentions, { parse: [], users: [], roles: [] });

  // 3. Test Role Notice
  testPosts.length = 0;
  const res3 = await sendTestMessage(mockGuild, 'user-1', { type: 'roleNotice', channelId: '333' });
  assert.equal(res3.ok, true);
  const post3 = testPosts[0];
  assert.ok(post3.content.includes('[TEST — Chúc mừng nhận Role]'));
  assert.equal(post3.embeds.length, 1);
  assert.deepEqual(post3.allowedMentions, { parse: [], users: [], roles: [] });

  // 4. Test Invite Notice
  testPosts.length = 0;
  const res4 = await sendTestMessage(mockGuild, 'user-1', { type: 'invite', channelId: '333' });
  assert.equal(res4.ok, true);
  const post4 = testPosts[0];
  assert.ok(post4.content.includes('[TEST — Thông báo người mời]'));
  assert.ok(post4.embeds[0].data.title.includes('kết nối'));
  assert.deepEqual(post4.allowedMentions, { parse: [], users: [], roles: [] });

  // 5. Test validation loại không hợp lệ
  await assert.rejects(
    async () => sendTestMessage(mockGuild, 'user-1', { type: 'invalid_type', channelId: '333' }),
    /Chọn loại thông báo và kênh nhận hợp lệ/
  );

  console.log('PASS test-messages: receptionist, confessionMilestone, roleNotice, invite, no real pings, valid URL.');
}

run().catch(error => { console.error('FAIL test-messages:', error.message); process.exit(1); });
