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
    members: {
      fetch: async () => ({
        permissions: { has: () => true },
        user: { bot: false },
        roles: { cache: new Collection() },
      }),
    },
    voiceAdapterCreator: {},
  };

  const voiceStatusCalls = [];
  const client = {
    isReady: () => true,
    user: { id: 'bot-123' },
    guilds: { cache: new Collection([[guildId, guild]]) },
    rest: {
      put: async (route, data) => {
        voiceStatusCalls.push({ route, body: data?.body });
        return {};
      },
    },
  };
  guild.client = client;

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

  // Test 5: /cinema command creates immediate show WITHOUT deleting future scheduled shows
  const cinemaCommand = require('../commands/fun/cinema');
  const futureStart = new Date(now + 18000000).toISOString(); // 5 hours in future
  const futureEnd = new Date(now + 27000000).toISOString();
  const scheduledShow = {
    title: 'Thanh xuân 18x2 (Suất tối)',
    source: 'https://pub-a6f2ebb772de4098b1e01e80864fbf6a.r2.dev/thanh-xuan-18-2.mp4',
    startsAt: futureStart,
    endsAt: futureEnd,
  };
  config.shows = [scheduledShow];
  setGuildSetting(guildId, 'CINEMA_CONFIG', JSON.stringify(config));

  const selectInteraction = {
    isStringSelectMenu: () => true,
    customId: 'cinema:select_movie:u123',
    user: { id: 'u123' },
    guildId,
    guild,
    member: { voice: { channel: voiceChannel } },
    values: ['0'],
    deferUpdate: async () => {},
    editReply: async () => {},
    channelId: 'text-1',
    client,
  };

  await cinemaCommand.handleSelect(selectInteraction);

  const updatedConfig = cinema.getConfig(guildId);
  assert.equal(updatedConfig.shows.length, 2, 'Must have 2 shows: the immediate show AND the future scheduled show');
  const foundFuture = updatedConfig.shows.find(s => s.startsAt === futureStart);
  assert(foundFuture, 'Future scheduled show must not be deleted');
  assert.equal(foundFuture.startsAt, futureStart, 'Future scheduled show start time must remain unchanged');
  assert.equal(foundFuture.endsAt, futureEnd, 'Future scheduled show end time must remain unchanged');

  const foundImmediate = updatedConfig.shows.find(s => s.startsAt !== futureStart);
  assert(foundImmediate, 'Immediate show must be created and added to schedule');
  assert(Date.parse(foundImmediate.startsAt) <= Date.now(), 'Immediate show starts now');

  // Test 6: Category restriction on /cinema command when starting a new show (no active show)
  config.shows = [scheduledShow]; // only future show, no active show
  setGuildSetting(guildId, 'CINEMA_CONFIG', JSON.stringify(config));

  const categoryChannel = { id: 'cat-cinema', name: '╭─ VNL Cinema ─╮', type: 4, isCategory: () => true };
  voiceChannel.parentId = 'cat-cinema';
  const outsideVoice = { id: 'voice-outside', name: 'Phòng ngoài', isVoiceBased: () => true, parentId: 'cat-other' };
  channels.set('cat-cinema', categoryChannel);
  channels.set('voice-outside', outsideVoice);

  let replyPayload = null;
  const outsideInteraction = {
    inGuild: () => true,
    guildId,
    guild,
    client,
    user: { id: 'u123' },
    member: {
      voice: { channel: outsideVoice },
      roles: { cache: new Collection() },
      permissions: { has: () => true },
    },
    reply: async (payload) => { replyPayload = payload; },
  };

  await cinemaCommand.execute(outsideInteraction);
  assert(replyPayload && replyPayload.content.includes('không thuộc danh mục rạp phim'), 'Must reject voice channels outside cinema category');

  // When not in any voice channel
  outsideInteraction.member.voice = { channel: null };
  await cinemaCommand.execute(outsideInteraction);
  assert(replyPayload && replyPayload.content.includes('cần tham gia vào một trong các phòng chiếu'), 'Must prompt user to join cinema category voice channel');

  // When in cinema voice channel -> shows selection menu
  outsideInteraction.member.voice = { channel: voiceChannel };
  await cinemaCommand.execute(outsideInteraction);
  assert(replyPayload && replyPayload.embeds && replyPayload.embeds[0].data.title.includes('CHỌN PHIM PHÁT NGAY'), 'Must show select menu when no movie is playing');

  // Test 7: When a movie IS currently screening, /cinema routes directly to current show with watch button & blocks new show
  const activeMovie = {
    title: 'Phim Đang Chiếu Hot',
    source: 'https://pub-a6f2ebb772de4098b1e01e80864fbf6a.r2.dev/test.mp4',
    startsAt: new Date(now - 120000).toISOString(),
    endsAt: new Date(now + 3600000).toISOString(),
  };
  config.shows = [activeMovie];
  setGuildSetting(guildId, 'CINEMA_CONFIG', JSON.stringify(config));

  replyPayload = null;
  await cinemaCommand.execute(outsideInteraction);
  assert(replyPayload && replyPayload.embeds && replyPayload.embeds[0].data.title.includes('ĐANG CHIẾU: Phim Đang Chiếu Hot'), 'Must display active movie card');
  assert(replyPayload.components[0].components[0].data.label.includes('Vào xem phim ngay'), 'Must offer Vào xem phim ngay button');

  // Any attempt to create new show via handleSelect while movie is screening is rejected
  let editReplyPayload = null;
  const selectWhileActive = {
    ...selectInteraction,
    editReply: async (payload) => { editReplyPayload = payload; },
  };
  await cinemaCommand.handleSelect(selectWhileActive);
  assert(editReplyPayload && editReplyPayload.content.includes('Không thể tạo suất chiếu mới trong thời gian suất chiếu hiện tại đang diễn ra'), 'Must reject creating new show during active movie');

  // Test 8: 2 advance reminder notifications (Early reminder ~3h & 10m reminder)
  sentMessages.length = 0;
  const earlyShow = {
    title: 'Phim Tối Nay 3h',
    source: 'https://pub-a6f2ebb772de4098b1e01e80864fbf6a.r2.dev/test.mp4',
    startsAt: new Date(now + 2 * 3600 * 1000).toISOString(), // 2 hours in future (<= 3h)
    endsAt: new Date(now + 4 * 3600 * 1000).toISOString(),
  };
  const tenMinShow = {
    title: 'Phim Sắp Chiếu 10p',
    source: 'https://pub-a6f2ebb772de4098b1e01e80864fbf6a.r2.dev/test.mp4',
    startsAt: new Date(now + 8 * 60 * 1000).toISOString(), // 8 minutes in future (<= 10m)
    endsAt: new Date(now + 2 * 3600 * 1000).toISOString(),
  };

  config.shows = [earlyShow, tenMinShow];
  config.preReminderHours = 3;
  config.remind10m = true;
  setGuildSetting(guildId, 'CINEMA_CONFIG', JSON.stringify(config));

  scheduler.checkShows(client);

  const earlyNotice = sentMessages.find(m => m.msg.embeds?.[0]?.data?.title?.includes('SẮP CÔNG CHIẾU: Phim Tối Nay 3h'));
  assert(earlyNotice, 'Must send early reminder (~3h) for upcoming show');

  const tenMinNotice = sentMessages.find(m => m.msg.embeds?.[0]?.data?.title?.includes('CHUẨN BỊ LÊN SÓNG: Phim Sắp Chiếu 10p'));
  assert(tenMinNotice, 'Must send 10-minute reminder for imminent show');

  // Test 9: Deleting an ongoing show from the schedule immediately cleans up session and leaves voice
  voiceDestroyed = false;
  const ongoingShow = {
    title: 'Phim Đang Chiếu Cần Xóa',
    source: 'https://pub-a6f2ebb772de4098b1e01e80864fbf6a.r2.dev/test.mp4',
    startsAt: new Date(now - 60000).toISOString(),
    endsAt: new Date(now + 3600000).toISOString(),
  };
  config.shows = [ongoingShow];
  setGuildSetting(guildId, 'CINEMA_CONFIG', JSON.stringify(config));
  scheduler.checkShows(client);
  assert.equal(scheduler.activeSessions.has(guildId), true, 'Session must be active for ongoing show');

  // Admin deletes ongoing show on dashboard -> config.shows becomes []
  config.shows = [];
  setGuildSetting(guildId, 'CINEMA_CONFIG', JSON.stringify(config));
  scheduler.checkShows(client);
  assert.equal(scheduler.activeSessions.has(guildId), false, 'Active session must be destroyed when ongoing show is deleted');
  assert.equal(voiceDestroyed, true, 'Voice connection must be destroyed when ongoing show is deleted');

  // Test 10: Mark show ended when video finishes -> updates endsAt, disconnects bot, disables watch button
  voiceDestroyed = false;
  let announcementMsgEdited = false;
  let disabledButtonLabel = '';
  const mockAnnouncementMsg = {
    edit: async ({ components }) => {
      announcementMsgEdited = true;
      const btn = components?.[0]?.components?.[0];
      if (btn) disabledButtonLabel = btn.data?.label || btn.label;
      return true;
    }
  };

  const finishingShow = {
    title: 'Phim Sắp Hết Giờ',
    source: 'https://pub-a6f2ebb772de4098b1e01e80864fbf6a.r2.dev/test.mp4',
    startsAt: new Date(now - 1800000).toISOString(),
    endsAt: new Date(now + 1800000).toISOString(),
  };
  config.shows = [finishingShow];
  setGuildSetting(guildId, 'CINEMA_CONFIG', JSON.stringify(config));
  scheduler.checkShows(client);
  assert.equal(scheduler.activeSessions.has(guildId), true, 'Session must be active');

  const sess = scheduler.activeSessions.get(guildId);
  sess.announcementMessage = mockAnnouncementMsg;

  // Movie finishes (e.g. video ended event triggers markShowEnded & cleanupSession)
  const marked = cinema.markShowEnded(guildId);
  assert.equal(marked, true, 'markShowEnded must successfully update running show');

  scheduler.cleanupSession(guild, true);
  assert.equal(scheduler.activeSessions.has(guildId), false, 'Session must be cleaned up on movie end');
  assert.equal(voiceDestroyed, true, 'Bot must disconnect from voice on movie end');
  assert.equal(announcementMsgEdited, true, 'Announcement message must be edited');
  assert.equal(disabledButtonLabel, '⏹️ Suất chiếu đã kết thúc', 'Button must be changed to disabled ended label');

  // Verify viewerState returns no current show
  const vState = await cinema.viewerState(guild, 'user-1', process.env);
  assert.equal(vState.show, null, 'viewerState must return show: null after show has ended');

  // Verify voice status was updated to movie title and cleared on cleanup
  const setCall = voiceStatusCalls.find(c => c.body?.status?.includes('Phim Sắp Hết Giờ'));
  assert.ok(setCall, 'Voice status must be set with movie title when movie starts');
  assert.equal(setCall.body.status, '🎬 Đang chiếu: Phim Sắp Hết Giờ');
  const lastCall = voiceStatusCalls[voiceStatusCalls.length - 1];
  assert.equal(lastCall?.body?.status, '', 'Voice status must be cleared when movie finishes');

  console.log('PASS cinemaScheduler: 1 announcement per show, persistent restart dedup, custom role tag & message template, auto-join & leave, /cinema preserves scheduled shows, category restriction, active show direct watch routing, 2 advance reminders, deleting ongoing show cleanup, & movie end bot-out and button disabling.');
}

testScheduler().catch(err => {
  console.error(err);
  process.exit(1);
});
