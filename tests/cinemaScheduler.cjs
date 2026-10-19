'use strict';

const assert = require('node:assert/strict');
const { Collection } = require('discord.js');
const cinema = require('../utils/cinema');
const scheduler = require('../utils/cinemaScheduler');
const { getGuildSetting, setGuildSetting } = require('../utils/guildSettings');

process.env.DB_PATH = ':memory:';
process.env.CINEMA_ENABLED = 'true';
process.env.CINEMA_MEDIA_ORIGIN = 'https://pub-a6f2ebb772de4098b1e01e80864fbf6a.r2.dev';

async function testScheduler() {
  const guildId = '123456';
  let joinedVoice = false;
  let voiceDestroyed = false;
  let inviteCreated = false;
  const sentMessages = [];

  const voiceChannel = {
    id: 'voice-1',
    name: 'Phòng Chiếu Phim',
    isVoiceBased: () => true,
    createInvite: async () => {
      inviteCreated = true;
      return { url: 'https://discord.gg/test-activity-invite' };
    },
    send: async (msg) => {
      sentMessages.push({ target: 'voice', msg });
    },
  };

  const textChannel = {
    id: 'text-1',
    name: 'thông-báo',
    isVoiceBased: () => false,
    send: async (msg) => {
      sentMessages.push({ target: 'text', msg });
    },
  };

  const channels = new Collection([
    ['voice-1', voiceChannel],
    ['text-1', textChannel],
  ]);

  const guild = {
    id: guildId,
    name: 'Test Guild',
    channels: { cache: channels },
    voiceAdapterCreator: {},
  };

  const client = {
    isReady: () => true,
    user: { id: 'bot-123' },
    guilds: { cache: new Collection([[guildId, guild]]) },
  };

  // Mock @discordjs/voice in node require cache for testing joinVoiceChannel
  const voiceMock = {
    joinVoiceChannel: () => {
      joinedVoice = true;
      return {
        destroy: () => {
          voiceDestroyed = true;
        },
      };
    },
    getVoiceConnection: () => null,
  };
  require('@discordjs/voice');
  require.cache[require.resolve('@discordjs/voice')].exports = voiceMock;

  const now = Date.now();
  const startsAt = new Date(now - 10000).toISOString();
  const endsAt = new Date(now + 3600000).toISOString();

  // Test 1: Config with active show
  const config = {
    enabled: true,
    title: 'Rạp Test',
    description: '',
    audience: 'members',
    roleIds: [],
    rightsConfirmed: true,
    voiceChannelId: 'voice-1',
    notifyChannelId: 'text-1',
    notifyRoleId: 'everyone',
    notifyMessage: '🍿 Đang chiếu {phim} tại {kenh_voice}! Bấm xem ngay nhé!',
    shows: [
      {
        title: 'Thanh xuân 18x2',
        source: 'https://pub-a6f2ebb772de4098b1e01e80864fbf6a.r2.dev/thanh-xuan-18-2.mp4',
        startsAt,
        endsAt,
      },
    ],
  };

  setGuildSetting(guildId, 'CINEMA_CONFIG', JSON.stringify(config));

  scheduler.checkShows(client);

  assert.equal(joinedVoice, true, 'Bot must join voice channel');
  assert.equal(scheduler.activeSessions.has(guildId), true, 'Session must be active');

  // Wait for async invite & send
  await new Promise(r => setTimeout(r, 50));

  assert.equal(inviteCreated, true, 'Activity invite must be created');
  assert.equal(sentMessages.length, 1, 'Exactly 1 announcement message must be sent per show');
  assert.equal(sentMessages[0].target, 'text', 'Announcement must target notify channel when specified');
  assert.equal(sentMessages[0].msg.content, '@everyone', 'Role tag @everyone must be included in message content');
  assert.match(sentMessages[0].msg.embeds[0].data.title, /Thanh xuân 18x2/);
  assert.match(sentMessages[0].msg.embeds[0].data.description, /Đang chiếu Thanh xuân 18x2 tại <#voice-1>!/);

  // Test 2: Subsequent ticks must NOT send duplicate announcement
  scheduler.checkShows(client);
  await new Promise(r => setTimeout(r, 50));
  assert.equal(sentMessages.length, 1, 'Tick 2 must not re-announce an ongoing show');

  // Test 3: Simulated bot restart (clearing activeSessions Map) must NOT re-announce
  scheduler.activeSessions.clear();
  assert.equal(scheduler.activeSessions.size, 0, 'Active sessions cleared to simulate bot restart');
  scheduler.checkShows(client);
  await new Promise(r => setTimeout(r, 50));
  assert.equal(sentMessages.length, 1, 'Persistent storage must prevent duplicate announcement after restart');

  // Test 4: Show finishes
  config.shows[0].startsAt = new Date(now - 7200000).toISOString();
  config.shows[0].endsAt = new Date(now - 1000).toISOString(); // ended 1s ago
  setGuildSetting(guildId, 'CINEMA_CONFIG', JSON.stringify(config));

  scheduler.checkShows(client);

  assert.equal(voiceDestroyed, true, 'Voice connection must be destroyed on movie end');
  assert.equal(scheduler.activeSessions.has(guildId), false, 'Session must be removed from map');

  console.log('PASS cinemaScheduler: 1 announcement per show, persistent restart dedup, custom role tag & message template, auto-join & leave.');
}

testScheduler().catch(err => {
  console.error(err);
  process.exit(1);
});
