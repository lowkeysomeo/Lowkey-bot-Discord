const assert = require('node:assert/strict');
process.env.DB_PATH = ':memory:';
process.env.GUILD_ID = 'home';
process.env.LEVEL_ROLE_1 = 'legacy-role';
const { Collection } = require('discord.js');
const { getDb } = require('../utils/database');
const { saveOptions, saveRewards } = require('../utils/customization');
const { syncLevelRole, updateLevelRole, CHAT_ROLE_LEVELS } = require('../utils/levelRoles');

function member(guildId) {
  const roles = new Collection([['unrelated-role', {}]]);
  return { guild: { id: guildId }, user: { bot: false }, roles: {
    cache: roles,
    add: async id => roles.set(id, {}),
    remove: async id => roles.delete(id),
  } };
}

async function main() {
  // Nạp lại các nơi từng lỗi vì thiếu hàm và danh sách mốc Chat.
  assert.deepEqual(CHAT_ROLE_LEVELS, [1, 10, 20, 40, 65, 80, 95, 100]);
  assert(require('../utils/loadCommands').loadCommands().has('botconfig'));
  assert.equal(typeof require('../dashboard/server').createDashboard, 'function');

  const first = member('home'), second = member('other');
  await syncLevelRole(first, 1);
  assert(first.roles.cache.has('legacy-role'));
  await syncLevelRole(second, 1);
  assert(!second.roles.cache.has('legacy-role'), 'Không dùng role .env của server khác');

  saveRewards('other', 'chat', [{ level: 5, roleId: 'junior' }, { level: 20, roleId: 'senior' }]);
  await syncLevelRole(second, 5);
  assert(second.roles.cache.has('junior'));
  await syncLevelRole(second, 20);
  assert(!second.roles.cache.has('junior'));
  assert(second.roles.cache.has('senior'));

  saveOptions('other', { chatRoleMode: 'all' });
  await updateLevelRole(second, 20);
  assert(second.roles.cache.has('junior') && second.roles.cache.has('senior'));
  await updateLevelRole(second, 1);
  assert.deepEqual([...second.roles.cache.keys()], ['unrelated-role']);

  second.user.bot = true;
  await syncLevelRole(second, 20);
  assert.deepEqual([...second.roles.cache.keys()], ['unrelated-role']);
  await syncLevelRole(null, 20);
  console.log('Đạt: nạp lệnh/dashboard, role theo mốc, chế độ nhiều role, tên hàm cũ và tách cấu hình giữa các server.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => getDb().close());
