'use strict';

/**
 * Lowkey Discord Quest Token Worker
 * Tự động 100% hoàn thành Discord Quests và săn điểm ORB bằng User Token
 */

let fetchImpl = globalThis.fetch;

function setFetchImplementation(customFetch) {
  fetchImpl = customFetch || globalThis.fetch;
}

const SUPER_PROPERTIES = Buffer.from(
  JSON.stringify({
    os: 'Windows',
    browser: 'Discord Client',
    release_channel: 'stable',
    system_locale: 'en-US',
  })
).toString('base64');

function getHeaders(rawToken) {
  const token = (rawToken || '').trim().replace(/^['"]|['"]$/g, '');
  return {
    Authorization: token,
    'Content-Type': 'application/json',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'X-Super-Properties': SUPER_PROPERTIES,
    Accept: '*/*',
  };
}

async function requestDiscord(url, options = {}, retries = 2) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Môi trường runtime không hỗ trợ Fetch API.');
  }

  let res;
  try {
    res = await fetchImpl(url, options);
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 1500));
      return requestDiscord(url, options, retries - 1);
    }
    throw err;
  }

  // Giới hạn tốc độ yêu cầu (429 Rate Limit)
  if (res.status === 429) {
    const data = await res.json().catch(() => ({}));
    const retryAfter = Math.ceil((data.retry_after || 2) * 1000);
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, retryAfter + 200));
      return requestDiscord(url, options, retries - 1);
    }
    throw new Error(`Bị giới hạn tốc độ yêu cầu (Rate Limit 429). Thử lại sau ${Math.ceil(retryAfter / 1000)}s.`);
  }

  return res;
}

/**
 * Lấy thông tin tài khoản người dùng từ Token
 */
async function fetchUserInfo(token) {
  const res = await requestDiscord('https://discord.com/api/v9/users/@me', {
    method: 'GET',
    headers: getHeaders(token),
  });

  if (res.status === 401) {
    throw new Error('Token Discord không hợp lệ hoặc đã hết hạn (401 Unauthorized).');
  }
  if (!res.ok) {
    throw new Error(`Không thể lấy thông tin tài khoản: HTTP ${res.status}`);
  }

  return await res.json();
}

/**
 * Lấy danh sách nhiệm vụ hiện tại của tài khoản
 */
async function fetchQuests(token) {
  const res = await requestDiscord('https://discord.com/api/v9/quests/@me', {
    method: 'GET',
    headers: getHeaders(token),
  });

  if (res.status === 401) {
    throw new Error('Token không hợp lệ hoặc đã hết hạn.');
  }
  if (!res.ok) {
    throw new Error(`Không thể lấy danh sách Quests: HTTP ${res.status}`);
  }

  const data = await res.json();
  const allQuests = Array.isArray(data?.quests) ? data.quests : [];
  const now = Date.now();
  const activeQuests = allQuests.filter((q) => {
    if (!q.config?.expires_at) return true;
    return new Date(q.config.expires_at).getTime() > now;
  });
  return activeQuests.length > 0 ? activeQuests : allQuests;
}

/**
 * Đăng ký / Nhận nhiệm vụ (Accept Quest)
 */
async function enrollQuest(token, questId) {
  const res = await requestDiscord(`https://discord.com/api/v9/quests/${questId}/enroll`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ location: 1, platform: 0 }),
  });

  if (!res.ok && res.status !== 400) {
    const text = await res.text().catch(() => '');
    throw new Error(`Lỗi khi nhận nhiệm vụ (${questId}): HTTP ${res.status} ${text}`);
  }

  // Tự động chọn Desktop/PC platform cho nhiệm vụ đa nền tảng
  try {
    await requestDiscord(`https://discord.com/api/v9/quests/${questId}/select-task-platform`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ platform: 0 }),
    });
  } catch {}

  return true;
}

/**
 * Gửi heartbeat giả lập tiến trình chơi game hoặc stream
 */
async function sendHeartbeat(token, questId, { streamKey = null, terminal = false, applicationId = null } = {}) {
  const body = {};
  if (applicationId) body.application_id = applicationId;
  if (streamKey) body.stream_key = streamKey;
  if (terminal) body.terminal = terminal;

  const res = await requestDiscord(`https://discord.com/api/v9/quests/${questId}/heartbeat`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Lỗi khi gửi heartbeat (${questId}): HTTP ${res.status} ${text}`);
  }

  return await res.json().catch(() => ({}));
}

/**
 * Gửi tiến trình xem video (cho Video Quests)
 */
async function sendVideoProgress(token, questId, timestamp = 30) {
  const res = await requestDiscord(`https://discord.com/api/v9/quests/${questId}/video-progress`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ timestamp }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Lỗi khi gửi video-progress (${questId}): HTTP ${res.status} ${text}`);
  }

  return await res.json().catch(() => ({}));
}

/**
 * Nhận thưởng (Claim Reward / ORBs)
 */
async function claimQuestReward(token, questId, platform = 0) {
  let res = await requestDiscord(`https://discord.com/api/v9/quests/${questId}/claim-reward`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ platform }),
  });

  if (res.status === 404) {
    res = await requestDiscord(`https://discord.com/api/v9/quests/${questId}/claim`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({}),
    });
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    if (errData?.message && String(errData.message).toLowerCase().includes('already')) {
      return { alreadyClaimed: true };
    }
    throw new Error(`Lỗi khi nhận thưởng (${questId}): HTTP ${res.status} ${JSON.stringify(errData)}`);
  }

  return await res.json().catch(() => ({ success: true }));
}

/**
 * Tự động xem video theo nhịp an toàn (bước nhảy ~7s) để Discord chấp thuận tiến độ 100%
 */
async function completeVideoQuest(token, quest, options = {}) {
  const questId = quest.id;
  const questName =
    quest.config?.messages?.quest_name ||
    quest.config?.messages?.game_title ||
    quest.config?.messages?.game_name ||
    quest.config?.application?.name ||
    `Nhiệm vụ #${questId}`;

  // Đăng ký nhận nhiệm vụ nếu chưa enroll
  let enrolledAt = quest.user_status?.enrolled_at ? new Date(quest.user_status.enrolled_at).getTime() : null;
  if (!enrolledAt) {
    try {
      await enrollQuest(token, questId);
      enrolledAt = Date.now();
    } catch (e) {
      enrolledAt = Date.now();
    }
  }

  const tasks = quest.config?.task_config?.tasks || quest.config?.task_config_v2?.tasks || {};
  const targetSeconds = tasks.WATCH_VIDEO?.target || tasks.WATCH_VIDEO_ON_MOBILE?.target || 30;
  const taskName = tasks.WATCH_VIDEO ? 'WATCH_VIDEO' : 'WATCH_VIDEO_ON_MOBILE';

  let currentSeconds = quest.user_status?.progress?.[taskName]?.value ?? 0;

  const maxLoops = Math.ceil(targetSeconds / 5) + 20;
  let loops = 0;

  while (currentSeconds < targetSeconds && loops < maxLoops) {
    loops++;
    const maxAllowed = Math.floor((Date.now() - enrolledAt) / 1000) + 10;
    const speed = 7;
    const nextTimestamp = Math.min(targetSeconds, currentSeconds + speed);

    if (maxAllowed >= nextTimestamp) {
      const jitter = Math.min(targetSeconds, nextTimestamp + (Math.random() * 0.4));
      await sendVideoProgress(token, questId, jitter);
      currentSeconds = nextTimestamp;

      if (options.onProgress) {
        options.onProgress({
          questId,
          questName,
          currentSeconds: Math.min(currentSeconds, targetSeconds),
          targetSeconds,
          percent: Math.min(100, Math.round((currentSeconds / targetSeconds) * 100)),
        });
      }
    }

    if (currentSeconds >= targetSeconds) break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Chờ 1.2s trước khi nhận thưởng để tránh xung đột
  await new Promise((r) => setTimeout(r, 1200));
  const reward = await claimQuestReward(token, questId);

  return {
    questId,
    questName,
    completed: true,
    claimed: true,
    reward,
  };
}

/**
 * Tự động hoàn thành một nhiệm vụ cụ thể
 */
async function completeSingleQuest(token, quest, options = {}) {
  const questId = quest.id;
  const questName =
    quest.config?.messages?.quest_name ||
    quest.config?.messages?.game_title ||
    quest.config?.messages?.game_name ||
    quest.config?.application?.name ||
    `Nhiệm vụ #${questId}`;

  // Kiểm tra nếu đã nhận thưởng trước đó
  if (quest.user_status?.claimed_at) {
    return {
      questId,
      questName,
      alreadyDone: true,
      message: 'Nhiệm vụ này đã nhận thưởng trước đó.',
    };
  }

  // Đăng ký nhận nhiệm vụ nếu chưa enroll
  if (!quest.user_status?.enrolled_at) {
    try {
      await enrollQuest(token, questId);
    } catch (e) {
      // Bỏ qua lỗi nếu đã enroll
    }
  }

  // Luôn đảm bảo chọn nền tảng PC/Desktop (platform: 0) cho nhiệm vụ đa nền tảng
  try {
    await requestDiscord(`https://discord.com/api/v9/quests/${questId}/select-task-platform`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ platform: 0 }),
    });
  } catch {}

  const tasks = quest.config?.task_config?.tasks || quest.config?.task_config_v2?.tasks || {};
  const isVideo = !!(tasks.WATCH_VIDEO || tasks.WATCH_VIDEO_ON_MOBILE);

  // Xử lý nhiệm vụ xem video
  if (isVideo) {
    return await completeVideoQuest(token, quest, options);
  }

  // Xử lý nhiệm vụ Discord Activity hoặc Mini-game (Valorant Aces, v.v.)
  const isActivity = !!(tasks.PLAY_ACTIVITY || tasks.ACHIEVEMENT_IN_ACTIVITY || tasks.ACHIEVEMENT_IN_GAME);
  if (isActivity) {
    const actTaskName = ['PLAY_ACTIVITY', 'ACHIEVEMENT_IN_ACTIVITY', 'ACHIEVEMENT_IN_GAME'].find((k) => tasks[k] != null) || Object.keys(tasks)[0];
    const actTaskData = tasks[actTaskName] || {};
    const actAppId = actTaskData.applications?.[0]?.id || quest.config?.application?.id || quest.config?.application_id;
    const targetSeconds = actTaskData.target || 900;
    let currentSeconds = quest.user_status?.progress?.[actTaskName]?.value ?? quest.user_status?.stream_progress_seconds ?? 0;

    // Tìm DM channel của user để mô phỏng stream_key
    let channelId = null;
    try {
      const dmRes = await requestDiscord('https://discord.com/api/v9/users/@me/channels', {
        method: 'GET',
        headers: getHeaders(token),
      });
      if (dmRes.ok) {
        const dms = await dmRes.json();
        if (Array.isArray(dms) && dms.length > 0) channelId = dms[0].id;
      }
    } catch {}
    if (!channelId) channelId = '1000000000000000000';
    const streamKey = `call:${channelId}:${Math.floor(Math.random() * 9000) + 1000}`;

    const maxLoops = Math.ceil(targetSeconds / 20) + 10;
    let loops = 0;

    try {
      while (currentSeconds < targetSeconds && loops < maxLoops) {
        loops++;
        const hb = await sendHeartbeat(token, questId, { streamKey, terminal: false, applicationId: actAppId });
        if (hb?.user_status?.completed_at || hb?.completed_at) {
          currentSeconds = targetSeconds;
          break;
        }

        const prog =
          hb?.user_status?.progress?.[actTaskName]?.value ??
          hb?.progress?.[actTaskName]?.value ??
          hb?.user_status?.stream_progress_seconds ??
          hb?.stream_progress_seconds;

        if (typeof prog === 'number' && prog > currentSeconds) {
          currentSeconds = prog;
        } else {
          currentSeconds += 20;
        }

        if (options.onProgress) {
          options.onProgress({
            questId,
            questName,
            currentSeconds: Math.min(currentSeconds, targetSeconds),
            targetSeconds,
            percent: Math.min(100, Math.round((currentSeconds / targetSeconds) * 100)),
          });
        }

        if (currentSeconds >= targetSeconds) break;
        await new Promise((r) => setTimeout(r, options.heartbeatDelayMs ?? 20000));
      }

      try {
        await sendHeartbeat(token, questId, { streamKey, terminal: true, applicationId: actAppId });
      } catch {}

      const reward = await claimQuestReward(token, questId);
      return {
        questId,
        questName,
        completed: true,
        claimed: true,
        reward,
      };
    } catch (err) {
      return {
        questId,
        questName,
        enrolled: true,
        completed: false,
        claimed: false,
        requiresDesktop: true,
        message: 'Đã tự động nhận (Accept). Nhiệm vụ Hoạt động yêu cầu mở Discord Desktop hoặc chạy Script F12.',
      };
    }
  }

  // Nhiệm vụ chơi game hoặc stream (Where Winds Meet, Clean Crew Roblox, v.v.)
  const taskName =
    ['PLAY_ON_DESKTOP', 'STREAM_ON_DESKTOP', 'PLAY_ON_PLAYSTATION', 'PLAY_ON_XBOX']
      .find((k) => tasks[k] != null) || Object.keys(tasks)[0];
  const taskData = tasks[taskName] || {};
  // Ưu tiên application ID từ taskConfigV2 (cho phép nhận đúng app Roblox thay vì Clean Crew)
  const applicationId =
    taskData?.applications?.[0]?.id ||
    quest.config?.application?.id ||
    quest.config?.application_id;

  const targetSeconds =
    taskData.target ||
    (quest.config?.stream_duration_requirement_minutes ? quest.config.stream_duration_requirement_minutes * 60 : 900);

  let currentSeconds =
    quest.user_status?.progress?.[taskName]?.value ??
    quest.user_status?.stream_progress_seconds ??
    0;

  const heartbeatDelay = options.heartbeatDelayMs ?? 20000;
  const maxLoops = Math.ceil(targetSeconds / 20) + 10;
  let loops = 0;

  try {
    while (currentSeconds < targetSeconds && loops < maxLoops) {
      loops++;
      const hb = await sendHeartbeat(token, questId, { terminal: false, applicationId });

      if (hb?.user_status?.completed_at || hb?.completed_at) {
        currentSeconds = targetSeconds;
        break;
      }

      const serverProgress =
        hb?.user_status?.progress?.[taskName]?.value ??
        hb?.progress?.[taskName]?.value ??
        hb?.user_status?.stream_progress_seconds ??
        hb?.stream_progress_seconds;

      if (typeof serverProgress === 'number' && serverProgress > currentSeconds) {
        currentSeconds = serverProgress;
      } else {
        currentSeconds += 30;
      }

      if (options.onProgress) {
        options.onProgress({
          questId,
          questName,
          currentSeconds: Math.min(currentSeconds, targetSeconds),
          targetSeconds,
          percent: Math.min(100, Math.round((currentSeconds / targetSeconds) * 100)),
        });
      }

      if (currentSeconds >= targetSeconds) break;
      await new Promise((r) => setTimeout(r, heartbeatDelay));
    }

    try {
      await sendHeartbeat(token, questId, { terminal: true, applicationId });
    } catch {}

    const reward = await claimQuestReward(token, questId);
    return {
      questId,
      questName,
      completed: true,
      claimed: true,
      reward,
    };
  } catch (err) {
    return {
      questId,
      questName,
      enrolled: true,
      completed: false,
      claimed: false,
      requiresDesktop: true,
      message: 'Đã tự động nhận (Accept). Nhiệm vụ game PC bảo mật cao yêu cầu mở Discord Desktop hoặc chạy Script F12.',
    };
  }
}

/**
 * Quy trình Auto 100% tất cả Quest cho một User Token
 */
async function runAutoQuestForToken(token, options = {}) {
  const onProgress = options.onProgress || (() => {});

  onProgress({ step: 'auth', message: 'Đang kết nối và xác thực tài khoản...' });
  const user = await fetchUserInfo(token);

  const accountTag =
    user.discriminator && user.discriminator !== '0'
      ? `${user.username}#${user.discriminator}`
      : user.global_name
      ? `${user.global_name} (@${user.username})`
      : `@${user.username}`;

  onProgress({
    step: 'fetch',
    message: `Đã kết nối tài khoản: **${accountTag}**. Đang tải danh sách Quest...`,
    user,
    accountTag,
  });

  const quests = await fetchQuests(token);

  if (!quests || quests.length === 0) {
    return {
      user,
      accountTag,
      totalQuests: 0,
      completedCount: 0,
      claimedCount: 0,
      results: [],
      message: 'Hiện không có nhiệm vụ Discord nào khả dụng cho tài khoản này.',
    };
  }

  const results = [];
  let enrolledCount = 0;
  let completedCount = 0;
  let claimedCount = 0;

  for (let i = 0; i < quests.length; i++) {
    const quest = quests[i];
    const questName =
      quest.config?.messages?.quest_name ||
      quest.config?.messages?.game_title ||
      quest.config?.messages?.game_name ||
      `Nhiệm vụ #${quest.id}`;

    onProgress({
      step: 'quest_start',
      index: i + 1,
      total: quests.length,
      questName,
      message: `[${i + 1}/${quests.length}] Đang xử lý: **${questName}**...`,
    });

    try {
      const res = await completeSingleQuest(token, quest, {
        heartbeatDelayMs: options.heartbeatDelayMs,
        onProgress: (p) =>
          onProgress({
            step: 'progress',
            index: i + 1,
            total: quests.length,
            ...p,
          }),
      });

      results.push({ success: true, ...res });
      if (res.enrolled || res.completed || res.alreadyDone) enrolledCount++;
      if (res.completed || res.alreadyDone) completedCount++;
      if (res.claimed) claimedCount++;
    } catch (err) {
      results.push({
        success: false,
        questId: quest.id,
        questName,
        error: err.message,
      });
    }
  }

  return {
    user,
    accountTag,
    totalQuests: quests.length,
    enrolledCount,
    completedCount,
    claimedCount,
    results,
  };
}

module.exports = {
  setFetchImplementation,
  fetchUserInfo,
  fetchQuests,
  enrollQuest,
  sendHeartbeat,
  sendVideoProgress,
  claimQuestReward,
  completeVideoQuest,
  completeSingleQuest,
  runAutoQuestForToken,
};
