/**
 * tests/channel-guard.cjs
 * Kiểm tra Channel Guard: phát hiện xóa kênh, tạo lại và cảnh báo.
 */
const assert = require('node:assert/strict');
process.env.DB_PATH = ':memory:';
delete process.env.GUILD_ID;

const { Collection } = require('discord.js');
const { saveOptions } = require('../utils/customization');
const { handleChannelDelete, trusted } = require('../utils/channelGuard');

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────
const logs = [];
function makeGuild({ ownerId = 'owner', trustedList = [], clientId = 'bot',
  canManage = true, logChannel = 'log-ch' } = {}) {
  const created = [];
  const guild = {
    id: 'guild1',
    ownerId,
    name: 'Test Server',
    members: {
      me: {
        permissions: {
          has: () => canManage,
        },
      },
      fetchMe: async () => guild.members.me,
    },
    channels: {
      fetch: async () => ({
        send: async (msg) => { logs.push(msg); },
      }),
      create: async (opts) => {
        created.push(opts);
        return { id: 'new-ch-id', name: opts.name };
      },
    },
    client: { user: { id: clientId } },
    _created: created,
  };
  saveOptions('guild1', {
    channelGuardEnabled: true,
    securityLogChannel: logChannel,
    securityTrusted: trustedList.join(',') || 'none',
  });
  return guild;
}

function makeDeletedChannel(overrides = {}) {
  return {
    id: 'ch-123',
    name: 'general',
    type: 0, // GuildText
    parentId: null,
    topic: null,
    nsfw: false,
    rateLimitPerUser: 0,
    rawPosition: 1,
    permissionOverwrites: { cache: new Map() },
    ...overrides,
  };
}

// ──────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────
async function main() {
  // 1. Chủ server xóa → không làm gì.
  {
    logs.length = 0;
    const guild = makeGuild({ ownerId: 'owner' });
    guild._created.length = 0;
    await handleChannelDelete({ ...makeDeletedChannel(), guild }, 'owner');
    assert.equal(guild._created.length, 0, 'Chủ server xóa → không tạo lại');
    assert.equal(logs.length, 0, 'Chủ server xóa → không cảnh báo');
  }

  // 2. Bot xóa → không làm gì.
  {
    logs.length = 0;
    const guild = makeGuild({ clientId: 'bot' });
    guild._created.length = 0;
    await handleChannelDelete({ ...makeDeletedChannel(), guild }, 'bot');
    assert.equal(guild._created.length, 0, 'Bot xóa → không tạo lại');
    assert.equal(logs.length, 0, 'Bot xóa → không cảnh báo');
  }

  // 3. ID tin cậy xóa → không làm gì.
  {
    logs.length = 0;
    const guild = makeGuild({ trustedList: ['trusted-user'] });
    guild._created.length = 0;
    await handleChannelDelete({ ...makeDeletedChannel(), guild }, 'trusted-user');
    assert.equal(guild._created.length, 0, 'ID tin cậy xóa → không tạo lại');
    assert.equal(logs.length, 0, 'ID tin cậy xóa → không cảnh báo');
  }

  // 4. Người lạ xóa → tạo lại + cảnh báo.
  {
    logs.length = 0;
    const guild = makeGuild();
    guild._created.length = 0;
    await handleChannelDelete({ ...makeDeletedChannel(), guild }, 'stranger-123');
    assert.equal(guild._created.length, 1, 'Người lạ xóa → tạo lại kênh');
    assert.equal(guild._created[0].name, 'general', 'Tên kênh tạo lại đúng');
    assert.equal(logs.length, 1, 'Gửi cảnh báo');
    const embed = logs[0].embeds?.[0];
    assert.ok(embed?.data?.description?.includes('stranger-123'), 'Cảnh báo chứa ID người xóa');
    assert.ok(embed?.data?.description?.includes('new-ch-id'), 'Cảnh báo chứa ID kênh mới');
  }

  // 5. Tắt channelGuardEnabled → không làm gì.
  {
    logs.length = 0;
    const guild = makeGuild();
    saveOptions('guild1', { channelGuardEnabled: false });
    guild._created.length = 0;
    await handleChannelDelete({ ...makeDeletedChannel(), guild }, 'stranger-456');
    assert.equal(guild._created.length, 0, 'Guard tắt → không tạo lại');
    assert.equal(logs.length, 0, 'Guard tắt → không cảnh báo');
    saveOptions('guild1', { channelGuardEnabled: true }); // Bật lại cho test tiếp.
  }

  // 6. Bot thiếu quyền ManageChannels → cảnh báo nhưng không tạo lại.
  {
    logs.length = 0;
    const guild = makeGuild({ canManage: false });
    guild._created.length = 0;
    await handleChannelDelete({ ...makeDeletedChannel(), guild }, 'stranger-789');
    assert.equal(guild._created.length, 0, 'Thiếu quyền → không tạo lại');
    assert.equal(logs.length, 1, 'Thiếu quyền → vẫn cảnh báo');
    const embed = logs[0].embeds?.[0];
    assert.ok(embed?.data?.description?.includes('❌'), 'Cảnh báo báo không tạo được kênh');
  }

  // 7. Hàm trusted hoạt động đúng.
  {
    const guild = { ownerId: 'owner', client: { user: { id: 'bot' } } };
    const options = { securityTrusted: 'alice,bob' };
    assert.ok(trusted(guild, 'owner', options), 'Chủ server → trusted');
    assert.ok(trusted(guild, 'bot', options), 'Bot → trusted');
    assert.ok(trusted(guild, 'alice', options), 'alice → trusted');
    assert.ok(trusted(guild, 'bob', options), 'bob → trusted');
    assert.ok(!trusted(guild, 'charlie', options), 'charlie → không trusted');
  }

  // 8. Sau khi tạo lại kênh, setting trỏ kênh cũ được cập nhật sang kênh mới.
  {
    logs.length = 0;
    const guild = makeGuild();
    // Lưu roleNoticeChannel = ID kênh cũ.
    saveOptions('guild1', { channelGuardEnabled: true, roleNoticeChannel: 'ch-123', securityLogChannel: 'log-ch', securityTrusted: 'none' });
    guild._created.length = 0;

    await handleChannelDelete({ ...makeDeletedChannel(), guild }, 'stranger-remap');

    // Sau khi tạo lại (ID mới = 'new-ch-id'), roleNoticeChannel phải đổi thành 'new-ch-id'.
    const { getOptions: getOpts } = require('../utils/customization');
    const updated = getOpts('guild1');
    assert.equal(updated.roleNoticeChannel, 'new-ch-id', 'roleNoticeChannel cập nhật sang ID kênh mới');
    assert.equal(guild._created.length, 1, 'Đã tạo lại kênh');
  }

  console.log('Đạt: phát hiện đúng người xóa, tạo lại kênh, cảnh báo, kiểm tra quyền và bật/tắt guard.');
}

const { getDb } = require('../utils/database');
main()
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => getDb().close());
