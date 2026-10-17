'use strict';

process.env.DB_PATH = ':memory:';

const assert = require('node:assert/strict');
const { loadCommands } = require('../utils/loadCommands');
const {
  buildMainHubPayload,
  buildScriptPayload,
  buildInfoPayload,
  handleButtonInteraction,
} = require('../utils/questManager');
const {
  startQuestStream,
  stopQuestStream,
  getQuestStreamStatus,
  setVoiceAdapter,
  activeSessions,
} = require('../utils/questVoiceHelper');

(async () => {
  // 1. Kiểm tra load command
  const commands = loadCommands();
  assert(commands.has('quest'), 'Command /quest phải tồn tại trong danh sách lệnh');
  assert(commands.has('autoquest'), 'Command /autoquest phải tồn tại trong danh sách lệnh');

  const questCmd = commands.get('quest');
  const autoquestCmd = commands.get('autoquest');
  assert.equal(typeof questCmd.execute, 'function');
  assert.equal(typeof autoquestCmd.execute, 'function');

  // 2. Kiểm tra các payload giao diện
  const hubPayload = buildMainHubPayload('test-guild');
  assert.equal(hubPayload.embeds.length, 1);
  assert.match(hubPayload.embeds[0].data.title, /TRUNG TÂM AUTO QUEST & SĂN ORB/);
  assert.equal(hubPayload.components[0].components.length, 4);

  const scriptPayload = buildScriptPayload();
  assert.equal(scriptPayload.embeds.length, 1);
  assert.match(scriptPayload.embeds[0].data.title, /MÃ SCRIPT AUTO HOÀN THÀNH/);
  assert(scriptPayload.content.includes('webpackChunkdiscord_app'));

  const infoPayload = buildInfoPayload();
  assert.equal(infoPayload.embeds.length, 1);
  assert.match(infoPayload.embeds[0].data.title, /DISCORD QUESTS & ĐIỂM ORB/);

  // 3. Kiểm tra thực thi lệnh slash /quest
  let replyData = null;
  const mockInteraction = (action) => ({
    guildId: 'guild-123',
    member: { id: 'user-123', guild: { id: 'guild-123', voiceAdapterCreator: {} }, voice: { channel: null } },
    options: { getString: () => action },
    reply: async (data) => { replyData = data; },
    deferReply: async () => {},
    editReply: async (data) => { replyData = data; },
  });

  // /quest hub
  await questCmd.execute(mockInteraction('hub'));
  assert.match(replyData.embeds[0].data.title, /TRUNG TÂM AUTO QUEST/);

  // /quest script
  await questCmd.execute(mockInteraction('script'));
  assert.match(replyData.embeds[0].data.title, /MÃ SCRIPT AUTO/);

  // /quest info
  await questCmd.execute(mockInteraction('info'));
  assert.match(replyData.embeds[0].data.title, /DISCORD QUESTS/);

  // /autoquest alias
  await autoquestCmd.execute(mockInteraction('hub'));
  assert.match(replyData.embeds[0].data.title, /TRUNG TÂM AUTO QUEST/);

  // 4. Kiểm tra Voice Stream Helper khi chưa vào voice
  await assert.rejects(
    async () => {
      await startQuestStream({ guild: { id: 'g1' }, voice: { channel: null } }, {});
    },
    /tham gia vào một kênh Voice/
  );

  // 5. Kiểm tra Voice Stream Helper khi đã vào voice
  let destroyed = false;
  const mockVoiceChannel = { id: 'vc-1', name: 'Phòng Voice 1' };
  const mockMemberInVoice = {
    id: 'user-in-vc',
    guild: {
      id: 'g1',
      voiceAdapterCreator: {},
    },
    voice: {
      channel: mockVoiceChannel,
    },
  };

  // Mock joinVoiceChannel thông qua setVoiceAdapter
  setVoiceAdapter({
    joinVoiceChannel: () => ({
      destroy: () => { destroyed = true; },
    }),
  });

  try {
    const res = await startQuestStream(mockMemberInVoice, { send: async () => {} });
    assert.equal(res.alreadyRunning, false);
    assert.equal(res.channelName, 'Phòng Voice 1');
    assert.equal(res.durationMinutes, 15);

    // Kiểm tra status
    const status = getQuestStreamStatus('g1');
    assert(status !== null);
    assert.equal(status.userId, 'user-in-vc');
    assert.equal(status.channelId, 'vc-1');
    assert.equal(status.remainingMinutes, 15);

    // Gọi lại khi đang chạy
    const resAgain = await startQuestStream(mockMemberInVoice, {});
    assert.equal(resAgain.alreadyRunning, true);
    assert(resAgain.remainingMinutes <= 15);

    // Dừng treo voice
    const stopped = stopQuestStream('g1');
    assert.equal(stopped, true);
    assert.equal(destroyed, true);
    assert.equal(getQuestStreamStatus('g1'), null);

    // 6. Kiểm tra Button interactions
    let updatedPayload = null;
    let deferred = false;
    let editedReply = null;
    const buttonInteraction = (customId) => ({
      customId,
      guildId: 'g1',
      member: mockMemberInVoice,
      channel: { id: 'text-1', send: async () => {} },
      update: async (p) => { updatedPayload = p; },
      deferReply: async () => { deferred = true; },
      editReply: async (p) => { editedReply = p; },
    });

    await handleButtonInteraction(buttonInteraction('quest:hub'));
    assert.match(updatedPayload.embeds[0].data.title, /TRUNG TÂM AUTO QUEST/);

    await handleButtonInteraction(buttonInteraction('quest:script'));
    assert.match(updatedPayload.embeds[0].data.title, /MÃ SCRIPT AUTO/);

    await handleButtonInteraction(buttonInteraction('quest:info'));
    assert.match(updatedPayload.embeds[0].data.title, /DISCORD QUESTS/);

    await handleButtonInteraction(buttonInteraction('quest:stream'));
    assert.match(editedReply.content, /Bot đã tham gia kênh/);

    await handleButtonInteraction(buttonInteraction('quest:leave'));
    assert.match(editedReply.content, /Bot đã ngắt kết nối/);

  } finally {
    setVoiceAdapter(null);
    stopQuestStream('g1');
  }

  console.log('PASS quest: /quest, /autoquest, Hub Embed, Auto Quest Script, Voice Stream Helper (15m timer) & Button interactions');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
