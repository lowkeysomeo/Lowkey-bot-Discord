const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { MessageFlags } = require('discord.js');

const root = path.resolve(__dirname, '..');
process.chdir(root);
process.env.DB_PATH = ':memory:';
const { loadCommands } = require('../utils/loadCommands');
const { LEVEL_COMMAND_CHANNEL_ID } = require('../utils/requireLevelChannel');
const expected = ['leaderboard', 'rank', 'totalleaderboard', 'voiceleaderboard', 'voicerank'];

async function main() {
  assert.equal(LEVEL_COMMAND_CHANNEL_ID, '1556699295212896289');
  const commands = loadCommands();
  const files = fs.readdirSync(path.join(root, 'commands/level')).filter(file => file.endsWith('.js'));
  const levelNames = files.map(file => require(path.join(root, 'commands/level', file)).data.name);
  assert.deepEqual(levelNames.sort(), expected, 'Every current level/rank command is covered');

  for (const name of expected) {
    const command = commands.get(name);
    for (const channelId of ['wrong-channel', 'thread-under-allowed-channel', null]) {
      const replies = [];
      await command.execute({
        channelId,
        channel: { parentId: LEVEL_COMMAND_CHANNEL_ID },
        commandName: name,
        memberPermissions: { has: () => true }, // Admin cũng phải dùng đúng kênh.
        reply: async payload => replies.push(payload),
        deferReply() { assert.fail(`${name}: public defer in wrong channel`); },
        editReply() { assert.fail(`${name}: result/image in wrong channel`); },
        get guild() { assert.fail(`${name}: fetched guild/data before rejecting`); },
        get options() { assert.fail(`${name}: inspected command options before rejecting`); },
      });
      assert.equal(replies.length, 1);
      assert.equal(replies[0].flags, MessageFlags.Ephemeral);
      assert(replies[0].content.includes(`<#${LEVEL_COMMAND_CHANNEL_ID}>`));
      assert.deepEqual(replies[0].allowedMentions, { parse: [] });
      assert.equal(replies[0].files, undefined);
      assert.equal(replies[0].embeds, undefined);
    }
    await assert.rejects(command.execute({ channelId: 'wrong', reply: async () => { throw new Error('reply unavailable'); },
      deferReply() { assert.fail('A failed denial must never fall through to execution'); },
    }), /reply unavailable/);
  }

  // Chạy lệnh trong đúng kênh; dùng dữ liệu và bộ vẽ giả để không gọi Discord.
  for (const file of files) {
    const filename = path.join(root, 'commands/level', file);
    const localRequire = createRequire(filename);
    const events = [];
    const profiles = { level: 2, xp: 5, totalXp: 25, monthlyXp: 10 };
    const mockQueries = {};
    for (const mode of ['Chat', 'Voice']) {
      mockQueries[`get${mode}Profile`] = () => { events.push('profile'); return profiles; };
      mockQueries[`get${mode}RankPosition`] = () => { events.push('position'); return 1; };
      mockQueries[`get${mode}Leaderboard`] = (guildId, period) => {
        assert.equal(guildId, 'server');
        assert.equal(period, file === 'totalleaderboard.js' ? 'total' : 'monthly');
        events.push('leaderboard'); return [{ userId: 'member', ...profiles }];
      };
    }
    const renderers = {};
    for (const key of ['createRankCard', 'createVoiceRankCard', 'createLeaderboardCard', 'createVoiceLeaderboardCard', 'createTotalLeaderboardCard']) {
      renderers[key] = async () => { events.push('render'); return Buffer.from('test-image'); };
    }
    const exported = {};
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
      module: { exports: exported },
      require: request => {
        if (/\/(levelSystem|voiceLevelSystem)$/.test(request)) return mockQueries;
        if (/\/create\w+Card$/.test(request)) return renderers;
        if (request.endsWith('/leaderboardHelpers')) return { resolveLeaderboardEntries: async (guild, rows) => rows };
        if (request.endsWith('/monthlySystem')) return { getCurrentMonthKey: () => '2026-10', monthLabel: key => key };
        return localRequire(request);
      },
    }, { filename });
    let output;
    await exported.execute({
      channelId: LEVEL_COMMAND_CHANNEL_ID,
      user: { id: 'member' }, options: { getUser: () => null },
      guild: { id: 'server', members: { fetch: async () => ({ id: 'member' }) } },
      reply() { assert.fail('Allowed channel must not receive a denial'); },
      deferReply: async () => events.push('defer'),
      editReply: async payload => { events.push('send'); output = payload; },
    });
    assert.equal(events[0], 'defer');
    assert.equal(events.filter(event => event === 'render').length, 1);
    assert.equal(events.at(-1), 'send');
    assert.equal(output.files.length, 1);
  }

  // Chỉ giới hạn lệnh xem rank; các lệnh quản trị, nhạc và confession vẫn như cũ.
  for (const [name, command] of commands) {
    if (!expected.includes(name)) assert(!command.execute.toString().includes('requireLevelChannel'), `${name} unexpectedly restricted`);
  }
  console.log('PASS: all 5 rank/leaderboard commands reject wrong channels privately before work; exact channel retains images; threads/admins cannot bypass; other commands unrestricted.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
