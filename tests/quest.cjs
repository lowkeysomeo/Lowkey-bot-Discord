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
  isVideoQuest,
  getVideoTaskInfo,
  extractQuestTasks,
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
  let lastPlatformSelected = null;
  const heartbeatBodies = [];

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

  const mainMockFetch = async (url, options = {}) => {
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

    // GET /quests/get-decisions or /decision
    if (urlStr.includes('get-decisions') || urlStr.includes('/decision')) {
      return {
        status: 200,
        ok: true,
        json: async () => ({ decisions: [] }),
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

    // POST /quests/{id}/select-task-platform
    if (urlStr.includes('/select-task-platform')) {
      const body = JSON.parse(options.body || '{}');
      lastPlatformSelected = body.platform;
      return { status: 200, ok: true, json: async () => ({}) };
    }

    // POST /quests/{id}/heartbeat
    if (urlStr.includes('/heartbeat')) {
      heartbeatCount++;
      const body = JSON.parse(options.body || '{}');
      heartbeatBodies.push(body);
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
  };
  setFetchImplementation(mainMockFetch);

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
    assert.equal(report.results[0].type, 'video', 'Quest video phải có type là video');
    assert.equal(report.results[1].type, 'game', 'Quest game phải có type là game');
    assert(enrollCalled, 'Enroll phải được gọi cho quest chưa nhận');
    assert(videoProgressSent, 'Video progress phải được gửi cho video quest');
    assert(heartbeatCount >= 2, 'Heartbeat phải được gửi cho game quest');
    assert.equal(claimCalled, false, 'Claim reward không được gọi tự động (cần xác thực con người)');
    assert(progressLogs.length > 0, 'Phải có callback tiến độ');
    assert(progressLogs.some((p) => p.type === 'video'), 'Phải có progress log cho video quest');
    assert(progressLogs.some((p) => p.type === 'game'), 'Phải có progress log cho game quest');

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
    assert.equal(wwmRes.requiresDesktop, false, 'Game quest không được yêu cầu desktop');

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
    assert.equal(robloxRes.requiresDesktop, false, 'Roblox quest không được yêu cầu desktop');
    assert.equal(lastPlatformSelected, 0, 'Roblox PLAY_ON_DESKTOP phải chọn platform: 0');

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
    assert.equal(valRes.requiresDesktop, false);

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
    assert.equal(mobileRes.requiresDesktop, false);
    assert.equal(lastPlatformSelected, 2, 'PLAY_ON_MOBILE phải chọn platform: 2 (mobile)');
    assert(heartbeatBodies.some(b => b.application_id === '55667788'), 'Heartbeat phải kèm application_id');

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

    // 9.5 Kiểm tra helper isVideoQuest và getVideoTaskInfo
    const desktopVideoQuest = {
      id: 'quest-desktop-video',
      config: {
        messages: { quest_name: 'Watch Desktop Trailer' },
        task_config_v2: {
          tasks: {
            WATCH_VIDEO_ON_DESKTOP: { target: 60 },
          },
        },
      },
      user_status: { enrolled_at: '2026-10-18T00:00:00Z', completed_at: null, claimed_at: null, progress: { WATCH_VIDEO_ON_DESKTOP: { value: 15 } } },
    };

    assert.equal(isVideoQuest(desktopVideoQuest), true, 'WATCH_VIDEO_ON_DESKTOP phải được nhận diện là Video Quest');
    const dTaskInfo = getVideoTaskInfo(desktopVideoQuest);
    assert.equal(dTaskInfo.taskKey, 'WATCH_VIDEO_ON_DESKTOP');
    assert.equal(dTaskInfo.targetSeconds, 60);
    assert.equal(dTaskInfo.currentSeconds, 15);

    const promotionalVideoQuest = {
      id: 'quest-promo-video',
      config: {
        video_metadata: { url: 'https://example.com/video.mp4' },
        task_config: {
          tasks: {
            WATCH_PROMOTIONAL_VIDEO: { target: 45 },
          },
        },
      },
    };
    assert.equal(isVideoQuest(promotionalVideoQuest), true, 'video_metadata hoặc WATCH_PROMOTIONAL_VIDEO phải là video quest');

    assert.equal(isVideoQuest(whereWindsMeetQuest), false, 'Where Winds Meet không phải là video quest');
    assert.equal(isVideoQuest(robloxQuest), false, 'Roblox không phải là video quest');

    // Hoàn thành desktop video quest 60s
    const dVidRes = await completeSingleQuest('valid_token_xyz', desktopVideoQuest, { heartbeatDelayMs: 10 });
    assert.equal(dVidRes.completed, true);
    assert.equal(dVidRes.type, 'video');
    assert.equal(dVidRes.currentSeconds, 60);

    // 9.6 Kiểm tra cơ chế tự động phục hồi retry của sendVideoProgress khi gặp 400 tạm thời
    let failOnce = true;
    const retryTestFetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('/video-progress')) {
        if (failOnce) {
          failOnce = false;
          return { status: 400, ok: false, json: async () => ({ message: 'Bad request clock drift' }), text: async () => 'clock drift' };
        }
        return { status: 200, ok: true, json: async () => ({ completed: true }) };
      }
      return { status: 200, ok: true, json: async () => ({}) };
    };
    setFetchImplementation(retryTestFetch);
    const retryRes = await sendVideoProgress('valid_token_xyz', 'quest-retry-test', 30, 2);
    assert.equal(retryRes.completed, true, 'sendVideoProgress phải tự động retry và hoàn tất khi gặp 400 tạm thời');

    // Khôi phục mainMockFetch cho các bài kiểm tra tiếp theo
    setFetchImplementation(mainMockFetch);

    // 9.7 Kiểm tra Hybrid Quest (Game + Video như Enshrouded): Phải tự động ưu tiên Video 45s và KHÔNG gọi select-task-platform
    lastPlatformSelected = null;
    const enshroudedQuest = {
      id: 'quest-enshrouded-hybrid',
      config: {
        messages: { quest_name: 'Enshrouded Quest (Chơi 15p hoặc Xem 45s)' },
        task_config: {
          tasks: {
            PLAY_ON_DESKTOP: { target: 900, applications: [{ id: '999888777', name: 'Enshrouded' }] },
          },
        },
        task_config_v2: {
          tasks: {
            WATCH_VIDEO: { target: 45 },
          },
        },
      },
      user_status: { enrolled_at: null, completed_at: null, claimed_at: null },
    };

    assert.equal(isVideoQuest(enshroudedQuest), true, 'Hybrid quest có task WATCH_VIDEO phải được nhận diện là Video Quest');
    const enshroudedRes = await completeSingleQuest('valid_token_xyz', enshroudedQuest, { heartbeatDelayMs: 10 });
    assert.equal(enshroudedRes.completed, true);
    assert.equal(enshroudedRes.type, 'video', 'Hybrid quest phải hoàn thành qua luồng video nhanh');
    assert.equal(enshroudedRes.currentSeconds, 45);
    assert.equal(lastPlatformSelected, null, 'Video quest tuyệt đối không được gọi select-task-platform');

    // 9.8 Kiểm tra nút bấm Quét Ngay (quest:auto_scan_now) chạy trực tiếp executeAutoQuestFlow
    approveUser('user-scan-btn', 'test-suite');
    const { registerSubscriber } = require('../utils/questScheduler');
    registerSubscriber('user-scan-btn', 'valid_token_xyz', 'ScanButtonUser', 1);
    let scanEditReply = null;
    const mockScanBtnInteraction = {
      customId: 'quest:auto_scan_now',
      user: { id: 'user-scan-btn', username: 'ScanButtonUser' },
      isButton: () => true,
      reply: async (p) => { scanEditReply = p; },
      deferUpdate: async () => {},
      deferReply: async () => {},
      editReply: async (p) => { scanEditReply = p; },
    };
    await handleButtonInteraction(mockScanBtnInteraction);
    assert(scanEditReply && scanEditReply.embeds && scanEditReply.embeds.length === 1, 'auto_scan_now phải trả về kết quả quét');
    assert.match(scanEditReply.embeds[0].data.title, /KẾT QUẢ AUTO QUEST DISCORD/);

    // 9.9 Kiểm tra slash command /quest action:scan chạy trực tiếp executeAutoQuestFlow
    let questScanReply = null;
    const mockQuestScanInteraction = {
      options: { getString: (name) => (name === 'action' ? 'scan' : null) },
      user: { id: 'user-scan-btn', username: 'ScanButtonUser' },
      reply: async (p) => { questScanReply = p; },
      deferReply: async () => {},
      editReply: async (p) => { questScanReply = p; },
    };
    await questCmd.execute(mockQuestScanInteraction);
    assert(questScanReply && questScanReply.embeds && questScanReply.embeds.length === 1, '/quest action:scan phải trả về kết quả');
    assert.match(questScanReply.embeds[0].data.title, /KẾT QUẢ AUTO QUEST DISCORD/);

    // 9.10 Kiểm tra nhận diện nhiệm vụ Video săn ORBs (camelCase questName, type: 4 ORB reward)
    const orbVideoQuest = {
      id: 'quest-orb-video-test',
      config: {
        messages: { questName: 'Watch the Trailer & Earn 100 Orbs' },
        rewards_config: {
          rewards: [
            { type: 4, orb_quantity: 100, messages: { name: '100 Discord Orbs' } }
          ],
        },
        task_config_v2: {
          tasks: {
            WATCH_VIDEO: { target: 30 },
          },
        },
      },
      user_status: { enrolled_at: null, completed_at: null, claimed_at: null },
    };

    assert.equal(isVideoQuest(orbVideoQuest), true, 'Nhiệm vụ xem trailer nhận ORB phải được nhận diện là Video Quest');
    const orbVidRes = await completeSingleQuest('valid_token_xyz', orbVideoQuest, {
      autoClaim: true,
      heartbeatDelayMs: 10,
    });
    assert.equal(orbVidRes.completed, true, 'Video quest ORB phải hoàn thành 100%');
    assert.equal(orbVidRes.type, 'video');
    assert.equal(orbVidRes.claimed, true, 'Video quest với autoClaim: true phải nhận thưởng thành công');
    assert(orbVidRes.reward !== null, 'Phải có object reward trả về');

    // 9.11 Kiểm tra completeSingleQuest tự động nhận thưởng ngay nếu quest đã đạt 100% tiến độ trước đó
    const alreadyCompletedQuest = {
      id: 'quest-unclaimed-orb',
      config: {
        messages: { quest_name: 'Unclaimed Orbs Quest' },
        rewards_config: { rewards: [{ type: 4, orbQuantity: 50 }] },
        task_config: { tasks: { WATCH_VIDEO: { target: 30 } } },
      },
      user_status: {
        enrolled_at: '2026-10-18T00:00:00Z',
        completed_at: '2026-10-18T00:01:00Z',
        claimed_at: null,
      },
    };
    const unclaimedRes = await completeSingleQuest('valid_token_xyz', alreadyCompletedQuest, {
      autoClaim: true,
    });
    assert.equal(unclaimedRes.completed, true);
    assert.equal(unclaimedRes.claimed, true, 'Quest đã đạt 100% nhưng chưa claim phải được tự động claim ngay lập tức');

    // 9.12 Kiểm tra questScheduler scanUserQuests tự động quét và làm nhiệm vụ cho subscriber
    const { scanUserQuests } = require('../utils/questScheduler');
    const schedulerScanRes = await scanUserQuests('user-scan-btn', { heartbeatDelayMs: 10 });
    assert.equal(schedulerScanRes.success, true);
    assert(schedulerScanRes.totalQuests >= 1);

    // 9.13 Kiểm tra chống gửi thông báo lặp lại khi quest đã hoàn thành rồi (20 phút sau không lặp lại)
    const sentDMs = [];
    const mockDiscordClient = {
      users: {
        fetch: async () => ({
          send: async (payload) => { sentDMs.push(payload); },
        }),
      },
    };
    await scanUserQuests('user-scan-btn', { heartbeatDelayMs: 10 }, mockDiscordClient);
    const dmsAfterFirst = sentDMs.length;
    // Lần quét tiếp theo (mô phỏng 20 phút sau): quest đã được ghi nhớ -> KHÔNG gửi thêm DM
    await scanUserQuests('user-scan-btn', { heartbeatDelayMs: 10 }, mockDiscordClient);
    assert.equal(sentDMs.length, dmsAfterFirst, 'Không được gửi thông báo lặp lại sau 20 phút');

    // 9.14 Kiểm tra khách mua Gói Tháng tự động làm cả Video Quest (dạng modern numeric keys & array tasks)
    const modernNumericVideoQuest = {
      id: 'quest-modern-numeric-video',
      config: {
        messages: { quest_name: 'Apex Legends Modern Trailer 30s' },
        task_config_v2: {
          tasks: {
            '134812345678901234': {
              type: 'WATCH_VIDEO',
              target: 30,
            },
          },
        },
      },
      user_status: { enrolled_at: null, completed_at: null, claimed_at: null },
    };

    const modernArrayVideoQuest = {
      id: 'quest-modern-array-video',
      config: {
        messages: { quest_name: 'Valorant Champions Promo Video' },
        task_config_v2: {
          tasks: [
            {
              type: 'WATCH_VIDEO',
              target: 30,
            },
          ],
        },
      },
      user_status: { enrolled_at: null, completed_at: null, claimed_at: null },
    };

    assert.equal(isVideoQuest(modernNumericVideoQuest), true, 'Nhiệm vụ Video với numeric task key phải nhận diện đúng');
    assert.equal(isVideoQuest(modernArrayVideoQuest), true, 'Nhiệm vụ Video với array tasks phải nhận diện đúng');

    const numVidRes = await completeSingleQuest('valid_token_xyz', modernNumericVideoQuest, { heartbeatDelayMs: 10 });
    assert.equal(numVidRes.completed, true);
    assert.equal(numVidRes.type, 'video');

    const arrVidRes = await completeSingleQuest('valid_token_xyz', modernArrayVideoQuest, { heartbeatDelayMs: 10 });
    assert.equal(arrVidRes.completed, true);
    assert.equal(arrVidRes.type, 'video');

    // Đăng ký khách hàng mua gói tháng (package_type: monthly)
    approveUser('user-monthly-vip', 'test-suite');
    registerSubscriber('user-monthly-vip', 'valid_token_xyz', 'MonthlyVIP', 1, 'monthly');
    const monthlyScanRes = await scanUserQuests('user-monthly-vip', { heartbeatDelayMs: 10 });
    assert.equal(monthlyScanRes.success, true);
    assert(monthlyScanRes.actions.some((a) => a.type === 'video' && a.completed), 'Gói tháng phải tự động hoàn thành video quests');

    // 9.15 Kiểm tra nhiệm vụ Magic: The Gathering | Star Trek (Xem 2 phút - 120s video, 240 Orbs)
    const magicStarTrekQuest = {
      id: 'quest-magic-star-trek-120s',
      config: {
        messages: {
          quest_name: 'NHIỆM VỤ MAGIC: THE GATHERING | STAR TREK',
          sub_title: 'Xem video để nhận được 240 Orbs!',
          cta_title: 'Xem 2 phút',
        },
        rewards_config: {
          rewards: [
            { type: 4, orb_quantity: 240, messages: { name: '240 Orbs' } },
          ],
        },
        task_config_v2: {
          tasks: {
            WATCH_VIDEO: { target: 120 },
          },
        },
      },
      user_status: { enrolled_at: null, completed_at: null, claimed_at: null },
    };

    assert.equal(isVideoQuest(magicStarTrekQuest), true, 'Magic Star Trek phải được nhận diện là Video Quest');
    const { targetSeconds: magicDuration } = getVideoTaskInfo(magicStarTrekQuest);
    assert.equal(magicDuration, 120, 'Thời lượng video nhiệm vụ Magic Star Trek phải là 120 giây (2 phút)');

    const magicRes = await completeSingleQuest('valid_token_xyz', magicStarTrekQuest, {
      autoClaim: true,
      heartbeatDelayMs: 10,
    });
    assert.equal(magicRes.completed, true, 'Magic Star Trek video phải hoàn thành 100%');
    assert.equal(magicRes.type, 'video');
    assert.equal(magicRes.claimed, true, 'Phải tự động claim 240 Orbs');

    // 9.16 Kiểm tra nhiệm vụ Video đã nhận thưởng trước đó (như Call of Duty MW4 Video) phải trả về type: 'video'
    const codVideoClaimedQuest = {
      id: 'quest-cod-mw4-video-claimed',
      config: {
        messages: {
          quest_name: 'Call of Duty: Modern Warfare 4 Video',
          game_title: 'Call of Duty: Modern Warfare 4',
        },
        task_config_v2: {
          tasks: {
            WATCH_VIDEO: { target: 60 },
          },
        },
      },
      user_status: {
        enrolled_at: '2026-10-18T00:00:00Z',
        completed_at: '2026-10-18T00:01:00Z',
        claimed_at: '2026-10-18T00:01:05Z',
      },
    };
    const codClaimedRes = await completeSingleQuest('valid_token_xyz', codVideoClaimedQuest);
    assert.equal(codClaimedRes.alreadyDone, true);
    assert.equal(codClaimedRes.type, 'video', 'Nhiệm vụ video đã claim phải giữ đúng type: video (không bị nhầm sang game)');

    // 9.17 Kiểm tra fetchQuests tự động quét và khám phá nhiệm vụ từ Quest Home (placement=11)
    const questHomeCustomFetch = async (url) => {
      const u = String(url);
      if (u.includes('/quests/@me')) {
        return { status: 200, ok: true, json: async () => ({ quests: [codVideoClaimedQuest] }) };
      }
      if (u.includes('get-decisions?placement=11')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            decisions: [
              { quest: magicStarTrekQuest },
            ],
          }),
        };
      }
      return { status: 200, ok: true, json: async () => ({}) };
    };

    setFetchImplementation(questHomeCustomFetch);
    const discoveredQuests = await fetchQuests('valid_token_xyz');
    assert(discoveredQuests.some((q) => q.id === 'quest-magic-star-trek-120s'), 'fetchQuests phải khám phá được Magic Star Trek từ Quest Home (placement=11)');
    setFetchImplementation(mainMockFetch);
  } finally {
    setFetchImplementation(null);
  }

  console.log('PASS quest: /quest, /autoquest, Hub Embed, Auto Quest Script, Voice Stream Helper (15m timer), Quest Token Worker (100% Auto), Modal & Button interactions');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
