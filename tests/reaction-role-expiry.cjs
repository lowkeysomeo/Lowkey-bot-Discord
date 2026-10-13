'use strict';
process.env.DB_PATH = ':memory:';
const assert = require('node:assert/strict');
const { PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');
const { getDb } = require('../utils/database');
const { ROLE_PICK_LIMITS, isPickExpired } = require('../utils/rolePickLimits');
let rr = require('../utils/reactionRoles');
const limit = ROLE_PICK_LIMITS[0];
const gid = limit.guildId, rid = limit.roleId, otherId = '333333333333333333';
const cid = '222222222222222222';
const role = { id: rid, name: 'VietNam 2026', managed: false, permissions: new PermissionsBitField(0n) };
const otherRole = { ...role, id: otherId, name: 'Miền Bắc' };
const me = { permissions: new PermissionsBitField(P.ManageRoles), roles: { highest: { comparePositionTo: () => 1 } } };
const owned = new Map(), changes = [], messages = new Map();
let next = 0, edits = 0, failEdit = false, afterFetch = null;
const member = { roles: { cache: owned,
  add: async id => { changes.push(['add', id]); owned.set(id, true); },
  remove: async id => { changes.push(['remove', id]); owned.delete(id); },
} };
const channel = { id: cid, type: 0, permissionsFor: () => ({ has: () => true }),
  messages: { fetch: async id => messages.get(id) },
  send: async data => {
    const message = { id: String(++next), author: { id: 'bot' }, data,
      edit: async payload => { if (failEdit) throw new Error('Không sửa được bảng'); edits++; message.data = payload; },
    };
    messages.set(message.id, message); return message;
  },
};
const guild = { id: gid, channels: { fetch: async () => channel },
  roles: { fetch: async id => id === rid ? role : id === otherId ? otherRole : null },
  members: { fetchMe: async () => me, fetch: async () => { afterFetch?.(); return member; } },
};
const client = { user: { id: 'bot' }, guilds: { cache: new Map([[gid, guild]]) } };
const input = { channelId: cid, title: 'Chọn role', description: 'Cùng lưu dấu kỷ niệm',
  choices: [{ roleId: rid, label: 'Kỷ niệm' }, { roleId: otherId, label: 'Miền Bắc' }],
};
function interaction(row, index = 0) {
  return { guild, guildId: gid, channelId: cid, user: { id: 'member' }, client,
    customId: `rr:${row.id}:${index}`, message: messages.get(row.message_id),
    inGuild: () => true, deferReply: async () => {}, editReply: async function (p) { this.response = p; },
  };
}
function buttons(row) { return messages.get(row.message_id).data.components[0].toJSON().components; }

async function main() {
  const originalNow = Date.now;
  let now = limit.endsAt - 1;
  Date.now = () => now;
  try {
    assert.equal(limit.endsAt, Date.parse('2026-12-31T17:00:00Z'));
    assert.equal(isPickExpired(gid, rid), false);
    await rr.create(guild, input);
    const row = rr.list(gid)[0];
    assert.equal(buttons(row)[0].disabled, false);
    assert.match(messages.get(row.message_id).data.embeds[0].data.fields[0].value, /01\/01\/2027/);
    await rr.handleButton(interaction(row)); assert(owned.has(rid));
    await rr.handleButton(interaction(row)); assert(!owned.has(rid));

    // Hạn nhận không phụ thuộc tên role hay tên nút mà admin nhập.
    role.name = 'Role kỷ niệm đã đổi tên';
    now = limit.endsAt;
    assert.equal(isPickExpired(gid, rid), true);
    assert.equal(isPickExpired('server-khac', rid), false);
    assert.equal(isPickExpired(gid, otherId), false);
    const denied = interaction(row);
    await rr.handleButton(denied);
    assert.match(denied.response.content, /đã kết thúc/);
    assert(!owned.has(rid)); assert.equal(changes.length, 2);
    assert.equal(buttons(row)[0].disabled, true);
    assert.equal(buttons(row)[1].disabled, false);

    // Role đã nhận được giữ nguyên, kể cả thao tác đến từ nút cũ còn hiện trên Discord.
    owned.set(rid, true);
    await rr.handleButton(interaction(row)); assert(owned.has(rid));
    assert.equal(changes.length, 2);
    await rr.handleButton(interaction(row, 1)); assert(owned.has(otherId));
    await rr.handleButton(interaction(row, 1)); assert(!owned.has(otherId));

    // Mất quyền sửa tin nhắn vẫn phải chặn cấp role ở máy chủ.
    failEdit = true; owned.delete(rid);
    await rr.handleButton(interaction(row)); assert(!owned.has(rid));
    failEdit = false;
    delete require.cache[require.resolve('../utils/reactionRoles')];
    rr = require('../utils/reactionRoles');
    await rr.handleButton(interaction(row)); assert(!owned.has(rid));

    // Đồng bộ bảng đã đăng và bảng mới; không cần người dùng bấm nút mới khóa.
    await rr.refreshTimedPanels(client);
    const previousEdits = edits;
    await rr.refreshTimedPanels(client); assert.equal(edits, previousEdits);
    assert.equal(buttons(row)[0].disabled, true);
    await rr.create(guild, input);
    assert.equal(buttons(rr.list(gid)[0])[0].disabled, true);

    // Yêu cầu bắt đầu trước giao thừa nhưng lấy thành viên xong sau hạn cũng bị chặn.
    now = limit.endsAt - 1;
    afterFetch = () => { now = limit.endsAt; };
    const count = changes.length;
    await rr.handleButton(interaction(row));
    assert.equal(changes.length, count); assert(!owned.has(rid));
    afterFetch = null;

    // Giả lập bot chạy qua giao thừa: các nút khác trong cùng bảng tiếp tục hoạt động.
    now = limit.endsAt - 1;
    await rr.refreshTimedPanels(client); assert.equal(buttons(row)[0].disabled, false);
    now = limit.endsAt;
    await rr.refreshTimedPanels(client); assert.equal(buttons(row)[0].disabled, true);
    assert.equal(buttons(row)[1].disabled, false);
    console.log('PASS reaction role expiry: Vietnam midnight, renamed role, stale buttons, existing holders, restart, timed refresh, unrelated roles and deadline race.');
  } finally { Date.now = originalNow; getDb().close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
