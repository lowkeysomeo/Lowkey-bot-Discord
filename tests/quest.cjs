'use strict';

process.env.DB_PATH = ':memory:';

const assert = require('node:assert/strict');
const { loadCommands } = require('../utils/loadCommands');
const {
  buildMainHubPayload,
  buildScriptPayload,
  buildInfoPayload,
  buildTokenModal,
  buildTokenGuidePayload,
  handleButtonInteraction,
  handleModalInteraction,
} = require('../utils/questManager');
const {
  startQuestStream,
  stopQuestStream,
  getQuestStreamStatus,
  setVoiceAdapter,
  activeSessions,
} = require('../utils/questVoiceHelper');
const {
  setFetchImplementation,
  setWebSocketImplementation,
  fetchUserInfo,
  fetchQuests,
  enrollQuest,
  sendHeartbeat,
  sendVideoProgress,
  claimQuestReward,
  completeSingleQuest,
  runAutoQuestForToken,
  getQuestProgressSeconds,
  getQuestApplicationInfo,
} = require('../utils/questTokenWorker');

const EventEmitter = require('node:events');
class MockWebSocket extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 1;
    process.nextTick(() => {
      this.emit('open');
      this.emit('message', Buffer.from(JSON.stringify({ op: 10, d: { heartbeat_interval: 40000 } })));
    });
  }
  send(data) {
    try {
      const parsed = JSON.parse(data);
      if (parsed.op === 2) {
        process.nextTick(() => {
          this.emit('message', Buffer.from(JSON.stringify({ op: 0, t: 'READY', d: { session_id: 'mock-session-id' } })));
        });
      }
    } catch (e) {}
  }
  close() {
    this.readyState = 3;
    this.emit('close');
  }
  terminate() {
    this.close();
  }
}
setWebSocketImplementation(MockWebSocket);

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
  assert.equal(hubPayload.components.length, 2);

  const scriptPayload = buildScriptPayload();
  assert.equal(scriptPayload.embeds.length, 1);
  assert(
    scriptPayload.content.includes('webpackChunkdiscord_app') ||
    scriptPayload.content.includes('quest_completer.js') ||
    (scriptPayload.files && scriptPayload.files[0]?.attachment?.toString('utf8')?.includes('webpackChunkdiscord_app'))
  );

  const infoPayload = buildInfoPayload();
  assert.equal(infoPayload.embeds.length, 1);
  assert.match(infoPayload.embeds[0].data.title, /DISCORD QUESTS & ĐIỂM ORB/);

  const modal = buildTokenModal();
  assert.equal(modal.data.custom_id, 'quest:modal_submit');

  const guidePayload = buildTokenGuidePayload();
  assert.equal(guidePayload.embeds.length, 1);
  assert.match(guidePayload.embeds[0].data.title, /HƯỚNG DẪN LẤY DISCORD USER TOKEN/);

  // 3. Kiểm tra thực thi lệnh slash /quest
  let replyData = null;
  let modalShown = null;
  const mockInteraction = (action) => ({
    guildId: 'guild-123',
    member: { id: 'user-123', guild: { id: 'guild-123', voiceAdapterCreator: {} }, voice: { channel: null } },
    options: { getString: () => action },
    reply: async (data) => { replyData = data; },
    deferReply: async () => {},
    editReply: async (data) => { replyData = data; },
    showModal: async (m) => { modalShown = m; },
  });

  const { approveUser } = require('../utils/questAuth');
  approveUser('user-123', 'test-suite');

  // /quest hub
  await questCmd.execute(mockInteraction('hub'));
  assert.match(replyData.embeds[0].data.title, /TRUNG TÂM AUTO QUEST/);

  // /quest script
  await questCmd.execute(mockInteraction('script'));
  assert.match(replyData.embeds[0].data.title, /MÃ SCRIPT AUTO/);

  // /quest info
  await questCmd.execute(mockInteraction('info'));
  assert.match(replyData.embeds[0].data.title, /DISCORD QUESTS/);

  // /quest token (mở modal)
  modalShown = null;
  await questCmd.execute(mockInteraction('token'));
  assert(modalShown !== null);
  assert.equal(modalShown.data.custom_id, 'quest:modal_submit');

  // /quest token_guide
  await questCmd.execute(mockInteraction('token_guide'));
  assert.match(replyData.embeds[0].data.title, /HƯỚNG DẪN LẤY DISCORD USER TOKEN/);

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
    approveUser('user-in-vc', 'test-suite');
    let updatedPayload = null;
    let deferred = false;
    let editedReply = null;
    let buttonModalShown = null;
    const buttonInteraction = (customId) => ({
      customId,
      guildId: 'g1',
      member: mockMemberInVoice,
      channel: { id: 'text-1', send: async () => {} },
      update: async (p) => { updatedPayload = p; },
      reply: async (p) => { updatedPayload = p; },
      deferReply: async () => { deferred = true; },
      editReply: async (p) => { editedReply = p; },
      showModal: async (m) => { buttonModalShown = m; },
    });

    await handleButtonInteraction(buttonInteraction('quest:hub'));
    assert.match(updatedPayload.embeds[0].data.title, /TRUNG TÂM AUTO QUEST/);

    await handleButtonInteraction(buttonInteraction('quest:script'));
    assert.match(updatedPayload.embeds[0].data.title, /MÃ SCRIPT AUTO/);

    await handleButtonInteraction(buttonInteraction('quest:info'));
    assert.match(updatedPayload.embeds[0].data.title, /DISCORD QUESTS/);

    await handleButtonInteraction(buttonInteraction('quest:token_guide'));
    assert.match(updatedPayload.embeds[0].data.title, /HƯỚNG DẪN LẤY DISCORD USER TOKEN/);

    await handleButtonInteraction(buttonInteraction('quest:modal'));
    assert.equal(buttonModalShown.data.custom_id, 'quest:modal_submit');

    await handleButtonInteraction(buttonInteraction('quest:stream'));
    assert.match(editedReply.content, /Bot đã tham gia kênh/);

    await handleButtonInteraction(buttonInteraction('quest:leave'));
    assert.match(editedReply.content, /Bot đã ngắt kết nối/);

  } finally {
    setVoiceAdapter(null);
    stopQuestStream('g1');
  }

  // 7. Kiểm tra Quest Token Worker Engine (Mock API Fetch)
  let heartbeatCount = 0;
  let videoProgressSent = false;
  let enrollCalled = false;
  let claimCalled = false;

  const mockQuests = [
    {
      id: 'quest-video-1',
      config: {
        messages: { quest_name: 'Watch Trailer for 30 Orbs' },
        task_config: { tasks: { WATCH_VIDEO: { target: 30 } } },
      },
      user_status: { enrolled_at: null, completed_at: null, claimed_at: null },
    },
    {
      id: 'quest-game-2',
      config: {
        messages: { quest_name: 'Play Genshin Impact for 15m' },
        task_config: { tasks: { PLAY_ON_DESKTOP: { target: 60 } } },
      },
      user_status: { enrolled_at: '2026-10-17T00:00:00Z', completed_at: null, claimed_at: null, stream_progress_seconds: 0 },
    },
    {
      id: 'quest-done-3',
      config: {
        messages: { quest_name: 'Already Done Quest' },
      },
      user_status: { enrolled_at: '2026-10-17T00:00:00Z', completed_at: '2026-10-17T00:15:00Z', claimed_at: '2026-10-17T00:15:10Z' },
    },
  ];

  setFetchImplementation(async (url, options = {}) => {
    const urlStr = String(url);

    // 401 Unauthorized test
    if (options.headers?.Authorization === 'invalid_token') {
      return { status: 401, ok: false, json: async () => ({ message: '401: Unauthorized' }), text: async () => '401' };
    }

    // GET /users/@me
    if (urlStr.includes('/users/@me')) {
      return {
        status: 200,
        ok: true,
        json: async () => ({ id: 'user-token-123', username: 'lowkey_tester', discriminator: '0', global_name: 'Lowkey Tester' }),
      };
    }

    // GET /quests/@me
    if (urlStr.includes('/quests/@me')) {
      return {
        status: 200,
        ok: true,
        json: async () => ({ quests: mockQuests }),
      };
    }

    // POST /quests/{id}/enroll
    if (urlStr.includes('/enroll')) {
      enrollCalled = true;
      return { status: 200, ok: true, json: async () => ({ enrolled: true }) };
    }

    // POST /quests/{id}/video-progress
    if (urlStr.includes('/video-progress')) {
      videoProgressSent = true;
      return { status: 200, ok: true, json: async () => ({ completed: true }) };
    }

    // POST /quests/{id}/heartbeat
    if (urlStr.includes('/heartbeat')) {
      heartbeatCount++;
      const body = JSON.parse(options.body || '{}');
      if (body.application_id !== undefined) {
        assert.equal(typeof body.application_id, 'string', 'application_id nếu có phải là chuỗi');
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({
          stream_progress_seconds: heartbeatCount * 300 + 60,
          user_status: { stream_progress_seconds: heartbeatCount * 300 + 60 },
        }),
      };
    }

    // POST /quests/{id}/claim-reward
    if (urlStr.includes('/claim-reward') || urlStr.includes('/claim')) {
      claimCalled = true;
      return { status: 200, ok: true, json: async () => ({ reward_code: 'ORB_100_COUPON', claimed: true }) };
    }

    return { status: 200, ok: true, json: async () => ({}) };
  });

  try {
    // 7.1 Kiểm tra fetchUserInfo & bắt lỗi 401
    await assert.rejects(
      async () => { await fetchUserInfo('invalid_token'); },
      /Token Discord không hợp lệ/
    );

    const userInfo = await fetchUserInfo('valid_token_xyz');
    assert.equal(userInfo.username, 'lowkey_tester');

    // 7.2 Kiểm tra fetchQuests
    const quests = await fetchQuests('valid_token_xyz');
    assert.equal(quests.length, 3);

    // 7.3 Kiểm tra quy trình Auto 100% bằng User Token (mặc định không tự claim vì claim cần captcha)
    const progressLogs = [];
    const report = await runAutoQuestForToken('valid_token_xyz', {
      heartbeatDelayMs: 10,
      onProgress: (p) => progressLogs.push(p),
    });

    assert.equal(report.totalQuests, 3);
    assert.equal(report.completedCount, 3); // 2 quests vừa xong + 1 quest alreadyDone
    assert.equal(report.claimedCount, 0); // Không tự động claim
    assert.equal(report.readyToClaimCount, 2); // 2 quests đã hoàn thành 100% sẵn sàng cho người dùng tự claim
    assert(enrollCalled, 'Enroll phải được gọi cho quest chưa nhận');
    assert(videoProgressSent, 'Video progress phải được gửi cho video quest');
    assert(heartbeatCount >= 2, 'Heartbeat phải được gửi cho game quest');
    assert.equal(claimCalled, false, 'Claim reward không được gọi tự động (cần xác thực con người)');
    assert(progressLogs.length > 0, 'Phải có callback tiến độ');

    // 8. Kiểm tra Modal interaction xử lý form nhập token
    let modalReply = null;
    const mockModalSubmit = (tokenVal) => ({
      customId: 'quest:modal_submit',
      user: { id: 'user-123', tag: 'Tester#0001' },
      fields: { getTextInputValue: () => tokenVal },
      deferReply: async () => {},
      editReply: async (d) => { modalReply = d; },
    });

    // Trường hợp token rỗng
    await handleModalInteraction(mockModalSubmit(''));
    assert.match(modalReply.content, /Token không được để trống/);

    // Trường hợp token hợp lệ chạy thành công
    await handleModalInteraction(mockModalSubmit('valid_token_xyz'));
    assert(modalReply.embeds && modalReply.embeds.length === 1);
    assert.match(modalReply.embeds[0].data.title, /KẾT QUẢ AUTO QUEST DISCORD/);
    assert.match(modalReply.embeds[0].data.description, /lowkey_tester/);
    assert.match(modalReply.embeds[0].data.description, /Watch Trailer for 30 Orbs/);

    // 9. Kiểm tra xử lý chuyên sâu 3 loại nhiệm vụ của người dùng:
    // 9.1 Where Winds Meet (đã có 26% / 234s tiến độ từ trước, nhiệm vụ PLAY_ON_DESKTOP)
    const whereWindsMeetQuest = {
      id: 'quest-wwm-26',
      config: {
        messages: { quest_name: 'Bản 2.3 Hải Đại Bằng Lai' },
        task_config: {
          tasks: {
            PLAY_ON_DESKTOP: {
              target: 900,
              applications: [{ id: '99887766', name: 'Where Winds Meet' }],
            },
          },
        },
      },
      user_status: {
        enrolled_at: '2026-10-18T00:00:00Z',
        completed_at: null,
        claimed_at: null,
        progress: {
          PLAY_ON_DESKTOP: { value: 234 },
        },
        stream_progress_seconds: 234,
      },
    };

    const initialSec = getQuestProgressSeconds(whereWindsMeetQuest);
    assert.equal(initialSec, 234, 'getQuestProgressSeconds phải nhận đúng 234s (26%)');
    const wwmApp = getQuestApplicationInfo(whereWindsMeetQuest);
    assert.equal(wwmApp.appId, '99887766');
    assert.equal(wwmApp.appName, 'Where Winds Meet');

    // Chạy hoàn thành Where Winds Meet từ 26% lên 100% (mặc định không tự claim vì claim cần captcha)
    const wwmRes = await completeSingleQuest('valid_token_xyz', whereWindsMeetQuest, { heartbeatDelayMs: 10 });
    assert.equal(wwmRes.completed, true);
    assert.equal(wwmRes.claimed, false);
    assert.equal(wwmRes.readyToClaim, true);
    assert.equal(wwmRes.progressPercent, 100);

    // 9.2 Clean Crew on Roblox (ứng dụng Roblox task_config_v2)
    const robloxQuest = {
      id: 'quest-roblox-clean-crew',
      config: {
        messages: { quest_name: 'Clean Crew on Roblox' },
        task_config_v2: {
          tasks: {
            PLAY_ON_DESKTOP: {
              target: 900,
              applications: [{ id: '432980957394370572', name: 'Roblox' }],
            },
          },
        },
      },
      user_status: {
        enrolled_at: null,
        completed_at: null,
        claimed_at: null,
      },
    };

    const robloxApp = getQuestApplicationInfo(robloxQuest);
    assert.equal(robloxApp.appId, '432980957394370572');
    assert.equal(robloxApp.appName, 'Roblox');
    const robloxRes = await completeSingleQuest('valid_token_xyz', robloxQuest, { heartbeatDelayMs: 10 });
    assert.equal(robloxRes.completed, true);
    assert.equal(robloxRes.claimed, false);
    assert.equal(robloxRes.readyToClaim, true);

    // 9.3 VALORANT Quét Sạch Vòng 3 (PLAY_ACTIVITY)
    const valorantQuest = {
      id: 'quest-valorant-aces-3',
      config: {
        messages: { quest_name: 'VALORANT Quét Sạch Vòng 3' },
        task_config: {
          tasks: {
            PLAY_ACTIVITY: {
              target: 900,
              applications: [{ id: '1122334455', name: 'VALORANT' }],
            },
          },
        },
      },
      user_status: {
        enrolled_at: null,
        completed_at: null,
        claimed_at: null,
      },
    };

    const valRes = await completeSingleQuest('valid_token_xyz', valorantQuest, { heartbeatDelayMs: 10 });
    assert.equal(valRes.completed, true);
    assert.equal(valRes.claimed, false);
    assert.equal(valRes.readyToClaim, true);
    assert.equal(valRes.type, 'activity');

    // Kiểm tra chế độ opt-in autoClaim: true vẫn hoạt động nếu được chỉ định
    const optInRes = await completeSingleQuest('valid_token_xyz', valorantQuest, { autoClaim: true, heartbeatDelayMs: 10 });
    assert.equal(optInRes.completed, true);
    assert.equal(optInRes.claimed, true);

    // 9.4 Kiểm tra nhiệm vụ Mobile (PLAY_ON_MOBILE / WATCH_VIDEO_ON_MOBILE)
    const mobileGameQuest = {
      id: 'quest-mobile-game',
      config: {
        messages: { quest_name: 'Mobile Legends Quest' },
        task_config: {
          tasks: {
            PLAY_ON_MOBILE: {
              target: 900,
              applications: [{ id: '55667788', name: 'Mobile Legends' }],
            },
          },
        },
      },
      user_status: { enrolled_at: null, completed_at: null, claimed_at: null },
    };

    const mobileRes = await completeSingleQuest('valid_token_xyz', mobileGameQuest, { heartbeatDelayMs: 10 });
    assert.equal(mobileRes.completed, true);
    assert.equal(mobileRes.type, 'game');

    const mobileVideoQuest = {
      id: 'quest-mobile-video',
      config: {
        messages: { quest_name: 'Watch Mobile Video' },
        task_config: {
          tasks: {
            WATCH_VIDEO_ON_MOBILE: {
              target: 30,
            },
          },
        },
      },
      user_status: { enrolled_at: null, completed_at: null, claimed_at: null },
    };

    const mobileVidRes = await completeSingleQuest('valid_token_xyz', mobileVideoQuest, { heartbeatDelayMs: 10 });
    assert.equal(mobileVidRes.completed, true);
    assert.equal(mobileVidRes.type, 'video');
  } finally {
    setFetchImplementation(null);
  }

  console.log('PASS quest: /quest, /autoquest, Hub Embed, Auto Quest Script, Voice Stream Helper (15m timer), Quest Token Worker (100% Auto), Modal & Button interactions');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
