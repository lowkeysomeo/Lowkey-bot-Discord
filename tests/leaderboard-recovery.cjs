const assert = require('node:assert/strict');
process.env.DB_PATH = ':memory:';
delete process.env.GUILD_ID;
const { Collection } = require('discord.js');
const { getDb } = require('../utils/database');
const { resolveLeaderboardEntries } = require('../utils/leaderboardHelpers');
const { addChatXp } = require('../utils/levelSystem');
const { setGuildSetting } = require('../utils/guildSettings');
const { saveOptions } = require('../utils/customization');
const { processMonthlyBoundary } = require('../utils/monthlySystem');

function member(id, bot = false) {
  return { id, displayName: id, user: { bot, username: id, displayAvatarURL: () => 'unused' },
    roles: { cache: new Collection(), add: async () => { changes.push(id); }, remove: async () => {} } };
}
const changes = [];
const rows = ['first', 'second'].map(userId => ({ userId, monthlyXp: 10 }));

async function main() {
  const departed = { members: { fetch: async id => {
    if (id === 'first') throw Object.assign(new Error('Đã rời server'), { code: 10007 });
    return member(id);
  } } };
  assert.deepEqual((await resolveLeaderboardEntries(departed, rows, 'monthlyXp')).map(entry => entry.userId), ['second']);
  const bots = { members: { fetch: async id => member(id, id === 'first') } };
  assert.deepEqual((await resolveLeaderboardEntries(bots, rows, 'monthlyXp')).map(entry => entry.userId), ['second']);

  for (const code of [50013, 'ECONNRESET', undefined]) {
    const failure = Object.assign(new Error('Discord tạm thời lỗi'), { code });
    await assert.rejects(resolveLeaderboardEntries({ members: { fetch: async () => { throw failure; } } }, rows, 'monthlyXp'),
      error => error === failure);
  }

  // Mất kết nối lúc đọc người dẫn đầu: giữ kết quả chờ, chưa chuyển role cho hạng sau.
  const gid = 'recovery';
  addChatXp(gid, 'first', 100);
  addChatXp(gid, 'second', 50);
  setGuildSetting(gid, 'MONTHLY_CHAT_TOP1_ROLE_ID', 'winner-role');
  saveOptions(gid, { monthlyAnnounce: false });
  getDb().prepare('INSERT INTO monthly_state VALUES (?, ?)').run(gid, '2000-01');
  let unavailable = true;
  const guild = { id: gid, members: { fetch: async id => {
    if (unavailable && id === 'first') throw new Error('Discord tạm thời lỗi');
    return member(id);
  } } };
  const client = { guilds: { cache: new Collection([[gid, guild]]) } };
  await processMonthlyBoundary(client);
  assert.deepEqual(changes, []);
  assert.equal(getDb().prepare('SELECT roles_assigned FROM monthly_results WHERE guild_id=?').get(gid).roles_assigned, 0);
  unavailable = false;
  await processMonthlyBoundary(client);
  assert.deepEqual(changes, ['first']);
  assert.equal(getDb().prepare('SELECT completed FROM monthly_results WHERE guild_id=?').get(gid).completed, 1);
  console.log('Đạt: bỏ qua người rời server/bot, thử lại lỗi Discord và trao đúng top sau khi kết nối phục hồi.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => getDb().close());
