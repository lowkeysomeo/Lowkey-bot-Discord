const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
process.chdir(root);
process.env.DB_PATH = ':memory:';
process.env.GUILD_ID = 'home';
process.env.LEVEL_CHANNEL_ID = 'home-level';
process.env.VNL_BOOSTER_ROLE_ID = 'home-booster';
process.env.TOKEN = 'test-token';
process.env.CLIENT_ID = 'test-app';
delete process.env.MONTHLY_RANK_CHANNEL_ID;
const { Collection, Events, ChannelType } = require('discord.js');
const { getGuildSetting, setGuildSetting } = require('../utils/guildSettings');
const { getDb } = require('../utils/database');
const { getChatProfile } = require('../utils/levelSystem');
const { getVoiceProfile } = require('../utils/voiceLevelSystem');
const { voiceXpTick } = require('../utils/voiceXpTick');
const { processMonthlyBoundary } = require('../utils/monthlySystem');
const { deployCommands } = require('../utils/deployCommands');
const { loadCommands } = require('../utils/loadCommands');

function guild(id) {
  const value = { id, channels: { cache: new Collection() }, members: {} };
  const member = { id: 'same-user', guild: value,
    user: { id: 'same-user', bot: false, username: 'reader', displayAvatarURL: () => 'unused' },
    voice: { serverDeaf: false }, roles: { cache: new Collection(), add: async () => {}, remove: async () => {} },
  };
  const channel = { id: `${id}-voice`, guild: value, isVoiceBased: () => true, members: new Collection([[member.id, member]]) };
  value.channels.cache.set(channel.id, channel);
  value.members.fetch = async () => member;
  return { guild: value, member, channel };
}

async function main() {
  assert.equal(getGuildSetting('home', 'LEVEL_CHANNEL_ID'), 'home-level');
  assert.equal(getGuildSetting('other', 'LEVEL_CHANNEL_ID'), null);
  setGuildSetting('other', 'LEVEL_CHANNEL_ID', 'other-level');
  assert.equal(getGuildSetting('other', 'LEVEL_CHANNEL_ID'), 'other-level');
  setGuildSetting('home', 'LEVEL_CHANNEL_ID', null);
  assert.equal(getGuildSetting('home', 'LEVEL_CHANNEL_ID'), null);
  const a = guild('home');
  const b = guild('other');
  const client = { guilds: { cache: new Collection([['home', a.guild], ['other', b.guild]]) } };
  a.member.roles.cache.set('home-booster', {});
  b.member.roles.cache.set('home-booster', {});
  await voiceXpTick(client);
  assert.equal(getVoiceProfile('home', 'same-user').totalXp, 1.1);
  assert.equal(getVoiceProfile('other', 'same-user').totalXp, 1);
  const { addXpExclusion } = require('../utils/xpExclusions');
  addXpExclusion('other', b.channel.id, 'channel');
  await voiceXpTick(client);
  assert.equal(getVoiceProfile('home', 'same-user').totalXp, 2.2);
  assert.equal(getVoiceProfile('other', 'same-user').totalXp, 1);

  // Execute the real event handler with a fake gateway: never log in or load .env.
  const handlers = new Map();
  const localRequire = createRequire(path.join(root, 'index.js'));
  class FakeClient {
    constructor() { this.guilds = client.guilds; }
    on(event, handler) { handlers.set(event, handler); }
    once() {}
    login() {}
  }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'index.js'), 'utf8'), {
    require: name => name === 'discord.js' ? { ...require('discord.js'), Client: FakeClient }
      : name === 'dotenv' ? { config() {} } : localRequire(name),
    process: { env: process.env, on() {} }, console, setInterval, clearInterval,
  });
  const chat = handlers.get(Events.MessageCreate);
  await chat({ guild: a.guild, author: a.member.user, member: a.member, channel: { id: 'text-a' } });
  await chat({ guild: b.guild, author: b.member.user, member: b.member, channel: { id: 'text-b' } });
  const before = getChatProfile('home', 'same-user').totalXp;
  assert(before > 0);
  assert(getChatProfile('other', 'same-user').totalXp > 0);
  await chat({ guild: a.guild, author: a.member.user, member: a.member, channel: { id: 'text-a' } });
  assert.equal(getChatProfile('home', 'same-user').totalXp, before);
  const { saveOptions } = require('../utils/customization');
  saveOptions('other', { chatMin: 7, chatMax: 7, chatCooldown: 1 });
  const anotherAuthor = { ...b.member.user, id: 'custom-rate-user' };
  await chat({ guild: b.guild, author: anotherAuthor, member: b.member, channel: { id: 'text-b' } });
  assert.equal(getChatProfile('other', anotherAuthor.id).totalXp, 7, 'Chat handler uses custom XP rate');
  saveOptions('other', { chatEnabled: false });
  await chat({ guild: b.guild, author: { ...anotherAuthor, id: 'disabled-user' }, member: b.member, channel: { id: 'text-b' } });
  assert.equal(getChatProfile('other', 'disabled-user').totalXp, 0, 'Disabled Chat XP does not award points');
  await chat({ guild: null, author: a.member.user });
  let dmReply;
  await handlers.get(Events.InteractionCreate)({ isButton: () => false, isChatInputCommand: () => true,
    inGuild: () => false, reply: async value => { dmReply = value; } });
  assert.equal(dmReply.flags, 64);

  const commands = loadCommands();
  const calls = [];
  await deployCommands(commands, { put: async (route, payload) => { calls.push({ route, payload }); } });
  assert.equal(calls[0].route, '/applications/test-app/commands');
  assert(calls[0].payload.body.some(command => command.name === 'botconfig'));
  assert(calls[0].payload.body.every(command => command.contexts[0] === 0 && command.dm_permission === false));
  assert.equal(calls[1].route, '/applications/test-app/guilds/home/commands');
  assert.deepEqual(calls[1].payload.body, []);
  let failedCalls = 0;
  await assert.rejects(deployCommands(commands, { put: async () => { failedCalls++; throw new Error('offline'); } }));
  assert.equal(failedCalls, 1, 'Never remove legacy commands when global deployment fails');

  const config = commands.get('botconfig');
  let response;
  await config.execute({ inGuild: () => true, memberPermissions: { has: () => false }, reply: async value => { response = value; } });
  assert.match(response.content, /Chỉ admin/);
  await config.execute({ inGuild: () => true, guildId: 'other', guild: { members: { me: {} } },
    memberPermissions: { has: () => true }, deferReply: async () => {}, editReply: async value => { response = value; },
    options: { getString: () => 'LEVEL_CHANNEL_ID', getRole: () => null, getBoolean: () => false,
      getChannel: () => ({ id: 'foreign', guildId: 'home', type: ChannelType.GuildText }) },
  });
  assert.match(response, /server này/);
  assert.equal(getGuildSetting('other', 'LEVEL_CHANNEL_ID'), 'other-level');

  // A failure in one server must not prevent the other server closing its month.
  for (const id of ['home', 'other']) getDb().prepare('INSERT INTO monthly_state VALUES (?, ?)').run(id, '2000-01');
  setGuildSetting('home', 'MONTHLY_RANK_CHANNEL_ID', 'bad-channel');
  a.guild.channels.fetch = async () => { throw new Error('expected test failure'); };
  await processMonthlyBoundary(client);
  for (const id of ['home', 'other']) {
    assert.equal(getChatProfile(id, 'same-user').monthlyXp, 0);
    assert(getChatProfile(id, 'same-user').totalXp > 0);
  }
  assert.equal(getDb().prepare('SELECT completed FROM monthly_results WHERE guild_id = ?').get('other').completed, 1);
  assert.equal(getDb().prepare('SELECT completed FROM monthly_results WHERE guild_id = ?').get('home').completed, 0);
  getDb().close();
  console.log('PASS: multi-server Chat/Voice XP, per-server cooldown and exclusions, scoped settings, admin validation, global deployment, DM guard, isolated monthly rollover');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
