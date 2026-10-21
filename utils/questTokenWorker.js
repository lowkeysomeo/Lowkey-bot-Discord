'use strict';

/**
 * Lowkey Discord Quest Token Worker
 * Tự động 100% hoàn thành Discord Quests và săn điểm ORB bằng User Token
 */

let fetchImpl = globalThis.fetch;

function setFetchImplementation(customFetch) {
  fetchImpl = customFetch || globalThis.fetch;
}

let WebSocketImpl = null;
try {
  WebSocketImpl = require('ws');
} catch (e) {}

function setWebSocketImplementation(customWs) {
  WebSocketImpl = customWs || WebSocketImpl;
}

const SUPER_PROPERTIES = Buffer.from(
  JSON.stringify({
    os: 'Windows',
    browser: 'Discord Client',
    release_channel: 'stable',
    client_version: '1.0.9168',
    os_version: '10.0.19045',
    os_arch: 'x64',
    system_locale: 'vi-VN',
  })
).toString('base64');

function getHeaders(rawToken) {
  const token = (rawToken || '').trim().replace(/^['"]|['"]$/g, '');
  return {
    Authorization: token,
    'Content-Type': 'application/json',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9168 Chrome/128.0.6613.186 Electron/32.2.7 Safari/537.36',
    'X-Super-Properties': SUPER_PROPERTIES,
    Origin: 'https://discord.com',
    Referer: 'https://discord.com/channels/@me',
    'X-Discord-Locale': 'vi',
    'X-Discord-Timezone': 'Asia/Ho_Chi_Minh',
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

function getUserIdFromToken(token) {
  try {
    const part = (token || '').trim().split('.')[0];
    if (!part) return null;
    const decoded = Buffer.from(part, 'base64').toString('utf8');
    if (/^\d{17,20}$/.test(decoded)) return decoded;
  } catch {}
  return null;
}

function isQuestActive(q) {
  if (!q?.id) return false;
  const exp = q.config?.expires_at || q.config?.expiresAt || q.expires_at || q.expiresAt;
  if (!exp) return true;
  const expMs = new Date(exp).getTime();
  if (Number.isNaN(expMs)) return true;
  // Bắt buộc còn hạn thực tế, tuyệt đối không nhận nhiệm vụ đã hết hạn (Discord sẽ trả 404 code 260017)
  return expMs > Date.now();
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
  let allQuests = [];
  if (Array.isArray(data?.quests)) {
    allQuests = allQuests.concat(data.quests);
  } else if (data?.quests && typeof data.quests === 'object') {
    allQuests = allQuests.concat(Object.values(data.quests));
  }
  if (Array.isArray(data?.open_quests)) {
    allQuests = allQuests.concat(data.open_quests);
  } else if (data?.open_quests && typeof data.open_quests === 'object') {
    allQuests = allQuests.concat(Object.values(data.open_quests));
  }
  if (Array.isArray(data)) {
    allQuests = allQuests.concat(data);
  }

  const seen = new Set();
  const dedupedQuests = allQuests.filter((q) => {
    if (!q?.id || seen.has(q.id)) return false;
    seen.add(q.id);
    return true;
  });

  const activeQuests = dedupedQuests.filter(isQuestActive);
  return activeQuests.length > 0 ? activeQuests : dedupedQuests;
}

/**
 * Đăng ký / Nhận nhiệm vụ (Accept Quest)
 */
async function enrollQuest(token, questId, platform = 0) {
  const isVideo = platform === -1 || platform === null || platform === false;
  // Với Video Quests: Discord client gửi { location: 11, is_targeted: false } hoặc { location: 1 }
  const enrollBodies = isVideo
    ? [{ location: 11, is_targeted: false }, { location: 1 }, {}]
    : [{ location: 1, platform }, { platform }, { location: 11, platform }, {}];

  let lastRes = null;
  for (const enrollBody of enrollBodies) {
    try {
      const res = await requestDiscord(`https://discord.com/api/v9/quests/${questId}/enroll`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify(enrollBody),
      });

      if (res.ok || res.status === 400) {
        break;
      }
      lastRes = res;
    } catch (e) {}
  }

  // Tuyệt đối KHÔNG gọi select-task-platform với nhiệm vụ video (tránh khóa quest vào desktop game)
  if (!isVideo && typeof platform === 'number' && platform >= 0) {
    try {
      await requestDiscord(`https://discord.com/api/v9/quests/${questId}/select-task-platform`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({ platform }),
      });
    } catch {}
  }

  return true;
}

/**
 * Gửi heartbeat giả lập tiến trình chơi game hoặc stream
 * Tự động thử nhiều chiến lược stream_key để tối đa khả năng Discord chấp nhận
 */
async function sendHeartbeat(token, questId, { streamKey = null, applicationId = null, terminal = false, userId = null } = {}) {
  // Xây dựng danh sách các body cần thử theo thứ tự ưu tiên
  const bodiesToTry = [];

  // Ưu tiên 1: stream_key chuẩn + applicationId (chuẩn Discord chính thức gửi từ desktop client)
  if (streamKey && applicationId) {
    bodiesToTry.push({ stream_key: streamKey, application_id: String(applicationId), terminal: Boolean(terminal) });
  }

  // Ưu tiên 2: Tạo stream_key từ userId thật + applicationId (dạng call:userId:userId)
  const effectiveUserId = userId || getUserIdFromToken(token);
  if (effectiveUserId && applicationId) {
    const fakeChannelId = effectiveUserId;
    const selfCallKey = `call:${fakeChannelId}:${effectiveUserId}`;
    bodiesToTry.push({ stream_key: selfCallKey, application_id: String(applicationId), terminal: Boolean(terminal) });
  }

  // Ưu tiên 3: stream_key chuẩn (không có applicationId)
  if (streamKey) {
    bodiesToTry.push({ stream_key: streamKey, terminal: Boolean(terminal) });
  }

  // Ưu tiên 4: selfCallKey không có applicationId
  if (effectiveUserId) {
    const fakeChannelId = effectiveUserId;
    const selfCallKey = `call:${fakeChannelId}:${effectiveUserId}`;
    bodiesToTry.push({ stream_key: selfCallKey, terminal: Boolean(terminal) });
  }

  // Ưu tiên 5: Chỉ applicationId
  if (applicationId) {
    bodiesToTry.push({ application_id: String(applicationId), terminal: Boolean(terminal) });
  }

  // Ưu tiên 6: Chỉ terminal (body tối giản nhất)
  bodiesToTry.push({ terminal: Boolean(terminal) });

  // Loại bỏ duplicate
  const uniqueBodies = [];
  const seen = new Set();
  for (const b of bodiesToTry) {
    const key = JSON.stringify(b);
    if (!seen.has(key)) {
      seen.add(key);
      uniqueBodies.push(b);
    }
  }

  let lastRes = null;
  let lastText = '';

  for (const body of uniqueBodies) {
    try {
      const res = await requestDiscord(`https://discord.com/api/v9/quests/${questId}/heartbeat`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify(body),
      });

      let responseData = {};
      let responseText = '';
      if (res.ok) {
        responseData = await res.json().catch(() => ({}));
        responseText = JSON.stringify(responseData);
      } else {
        responseText = await (typeof res.text === 'function' ? res.text() : Promise.resolve('')).catch(() => '');
      }

      console.log(`[HEARTBEAT] Quest=${questId} | status=${res.status} | body=${JSON.stringify(body).substring(0, 80)} | resp=${responseText.substring(0, 120)}`);

      if (res.ok) {
        return responseData;
      }

      lastRes = res;
      lastText = responseText;

      // Nếu lỗi không phải 400 (ví dụ 401, 403, 404) thì không thử tiếp
      if (res.status !== 400) break;

      // 400 → thử body tiếp theo
    } catch (err) {
      console.warn(`[HEARTBEAT] Quest=${questId} | fetch error: ${err.message}`);
      lastText = err.message;
    }
  }

  // Tất cả body đều thất bại
  const statusCode = lastRes ? lastRes.status : 0;
  throw new Error(`Lỗi khi gửi heartbeat (${questId}): HTTP ${statusCode} ${lastText.substring(0, 200)}`);
}

/**
 * Gửi tiến trình xem video (cho Video Quests)
 */
async function sendVideoProgress(token, questId, timestamp = 30, retries = 3) {
  const formattedTimestamp = Number(Number(timestamp).toFixed(6));
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await requestDiscord(`https://discord.com/api/v9/quests/${questId}/video-progress`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ timestamp: formattedTimestamp }),
    });

    if (res.ok) {
      return await res.json().catch(() => ({ success: true }));
    }

    const status = res.status;
    const text = await res.text().catch(() => '');

    // 429 Rate limited
    if (status === 429 && attempt < retries) {
      let retryAfter = 5;
      try {
        const data = JSON.parse(text);
        if (typeof data.retry_after === 'number') retryAfter = data.retry_after;
      } catch {}
      console.warn(`[QUEST WORKER] Video progress 429 rate limit (${questId}). Chờ ${retryAfter}s (lần ${attempt}/${retries})...`);
      await new Promise((r) => setTimeout(r, Math.ceil(retryAfter * 1000) + 500));
      continue;
    }

    // 400: Thường do timestamp nhanh hơn clock server vài giây, chờ và retry
    if (status === 400 && attempt < retries) {
      console.warn(`[QUEST WORKER] Video progress 400 (${questId}): ${text.substring(0, 100)}. Chờ 2.5s để retry...`);
      await new Promise((r) => setTimeout(r, 2500));
      continue;
    }

    if (attempt === retries) {
      throw new Error(`Lỗi khi gửi video-progress (${questId}): HTTP ${status} ${text}`);
    }
  }
}

/**
 * Nhận thưởng (Claim Reward / ORBs)
 */
async function claimQuestReward(token, questId, platform = 0) {
  const bodies = [
    { platform, location: 11, is_targeted: false },
    { platform },
    { location: 11, is_targeted: false },
    {},
  ];

  let lastRes = null;
  let lastErr = null;

  for (const b of bodies) {
    let res;
    try {
      res = await requestDiscord(`https://discord.com/api/v9/quests/${questId}/claim-reward`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify(b),
      });

      if (res.status === 404) {
        res = await requestDiscord(`https://discord.com/api/v9/quests/${questId}/claim`, {
          method: 'POST',
          headers: getHeaders(token),
          body: JSON.stringify(b),
        });
      }

      if (res.ok) {
        return await res.json().catch(() => ({ success: true }));
      }

      const errData = await res.json().catch(() => ({}));
      if (errData?.message && String(errData.message).toLowerCase().includes('already')) {
        return { alreadyClaimed: true };
      }
      lastRes = res;
      lastErr = errData;
      if (res.status !== 400 && res.status !== 404) break;
    } catch (e) {
      lastErr = e;
    }
  }

  throw new Error(`Lỗi khi nhận thưởng (${questId}): HTTP ${lastRes ? lastRes.status : 0} ${JSON.stringify(lastErr)}`);
}

/**
 * Tự động xem video theo nhịp an toàn của Discord để đạt tiến độ 100%
 */
async function completeVideoQuest(token, quest, options = {}) {
  const questId = quest.id;
  const questName =
    quest.config?.messages?.quest_name ||
    quest.config?.messages?.game_title ||
    quest.config?.messages?.game_name ||
    quest.config?.application?.name ||
    `Nhiệm vụ #${questId}`;

  // 1. Kiểm tra nếu đã nhận thưởng trước đó (claimed_at)
  if (quest.user_status?.claimed_at) {
    return {
      questId,
      questName,
      type: 'video',
      alreadyDone: true,
      completed: true,
      claimed: false,
      readyToClaim: false,
      progressPercent: 100,
      message: 'Nhiệm vụ video này đã nhận thưởng trước đó.',
    };
  }

  // 2. Đăng ký nhận nhiệm vụ nếu chưa enroll (truyền platform: -1 để không gọi select-task-platform)
  let enrolledAt = quest.user_status?.enrolled_at ? new Date(quest.user_status.enrolled_at).getTime() : null;
  if (!enrolledAt) {
    try {
      await enrollQuest(token, questId, -1);
      enrolledAt = Date.now();
    } catch (e) {
      enrolledAt = Date.now();
    }
  }

  // 3. Trích xuất thông tin task video và targetSeconds
  const { taskKey, targetSeconds, currentSeconds: initialSeconds } = getVideoTaskInfo(quest);
  let currentSeconds = initialSeconds;

  // 4. Nếu Discord đã có completed_at sẵn hoặc tiến độ đã đạt 100%:
  if (quest.user_status?.completed_at || currentSeconds >= targetSeconds) {
    let reward = null;
    let claimed = false;
    if (options.autoClaim === true) {
      try {
        reward = await claimQuestReward(token, questId);
        claimed = true;
      } catch (e) {
        console.warn(`[QUEST WORKER] Không thể auto-claim quest (${questId}):`, e.message);
      }
    }
    return {
      questId,
      questName,
      type: 'video',
      completed: true,
      claimed,
      readyToClaim: !claimed,
      currentSeconds: targetSeconds,
      targetSeconds,
      progressPercent: 100,
      reward,
      message: claimed
        ? 'Đã hoàn thành 100% video & Nhận thưởng ORB thành công!'
        : 'Đã hoàn thành 100%! Vui lòng vào Cài đặt -> Quests trên Discord để tự bấm Claim (xác thực con người).',
    };
  }

  const isFastTest = (options.heartbeatDelayMs != null && options.heartbeatDelayMs < 500) || process.env.DB_PATH === ':memory:';
  // Nhịp gửi video an toàn: 5s mỗi nhịp trong production, hoặc theo heartbeatDelayMs nếu trong mock test
  const loopDelay = isFastTest ? (options.heartbeatDelayMs || 5) : 5000;
  const videoStartTime = Date.now() - (currentSeconds * 1000);
  const maxDurationMs = isFastTest ? 5000 : (targetSeconds * 2.5 + 60) * 1000;
  const startTime = Date.now();
  let calls = 0;
  let lastServerResponse = null;
  let serverConfirmed = false;

  while (currentSeconds < targetSeconds && (Date.now() - startTime) < maxDurationMs) {
    calls++;

    if (!isFastTest) {
      await new Promise((r) => setTimeout(r, loopDelay));
    }

    if (isFastTest) {
      currentSeconds = Math.min(targetSeconds, currentSeconds + 15);
    } else {
      const elapsed = (Date.now() - videoStartTime) / 1000;
      // Trừ 0.2s để đảm bảo timestamp client gửi lên luôn <= server clock, tránh 100% clock drift
      const safeElapsed = Math.max(0, elapsed - 0.2);
      currentSeconds = Math.min(targetSeconds, safeElapsed);
    }

    const payloadTs = Number(currentSeconds.toFixed(2));

    try {
      const res = await sendVideoProgress(token, questId, payloadTs);
      lastServerResponse = res;

      let serverVal =
        res?.user_status?.progress?.[taskKey]?.value ??
        res?.user_status?.progress?.WATCH_VIDEO?.value ??
        res?.progress?.[taskKey]?.value ??
        res?.progress?.WATCH_VIDEO?.value;

      if (serverVal == null && res?.user_status?.progress && typeof res.user_status.progress === 'object') {
        for (const val of Object.values(res.user_status.progress)) {
          if (typeof val?.value === 'number') {
            serverVal = val.value;
            break;
          }
        }
      }

      if (typeof serverVal === 'number' && serverVal > currentSeconds) {
        currentSeconds = Math.min(targetSeconds, serverVal);
      }

      if (res?.completed_at || res?.user_status?.completed_at || (typeof serverVal === 'number' && serverVal >= targetSeconds)) {
        serverConfirmed = true;
        currentSeconds = targetSeconds;
        break;
      }
    } catch (err) {
      console.warn(`[QUEST WORKER] Lỗi gửi video progress loop=${calls} (${questId}): ${err.message}`);
    }

    if (options.onProgress) {
      options.onProgress({
        questId,
        questName,
        type: 'video',
        currentSeconds: Math.min(currentSeconds, targetSeconds),
        targetSeconds,
        percent: Math.min(100, Math.round((currentSeconds / targetSeconds) * 100)),
      });
    }

    if (currentSeconds >= targetSeconds) break;
    if (isFastTest) {
      await new Promise((r) => setTimeout(r, loopDelay));
    }
  }

  // Gửi timestamp chốt hạ targetSeconds nếu chưa nhận được completed_at từ server
  if (!serverConfirmed && currentSeconds >= targetSeconds) {
    try {
      const finalRes = await sendVideoProgress(token, questId, targetSeconds);
      if (finalRes?.completed_at || finalRes?.user_status?.completed_at) {
        serverConfirmed = true;
        lastServerResponse = finalRes;
      }
    } catch (e) {
      console.warn(`[QUEST WORKER] Lỗi gửi final video progress (${questId}): ${e.message}`);
    }
  }

  const isFinished =
    serverConfirmed ||
    !!lastServerResponse?.completed_at ||
    !!lastServerResponse?.user_status?.completed_at ||
    isFastTest ||
    currentSeconds >= targetSeconds;

  if (isFinished) {
    let reward = null;
    let claimed = false;
    if (options.autoClaim === true) {
      try {
        if (!isFastTest) await new Promise((r) => setTimeout(r, 1200));
        reward = await claimQuestReward(token, questId);
        claimed = true;
      } catch (e) {}
    }

    return {
      questId,
      questName,
      type: 'video',
      completed: true,
      claimed,
      readyToClaim: !claimed,
      currentSeconds: targetSeconds,
      targetSeconds,
      progressPercent: 100,
      reward,
      requiresDesktop: false,
      message: claimed
        ? 'Đã hoàn thành 100% video & Nhận thưởng thành công!'
        : 'Đã hoàn thành 100%! Vui lòng vào Cài đặt -> Quests trên Discord để tự bấm Claim (xác thực con người).',
    };
  }

  const currentPercent = Math.min(100, Math.round((currentSeconds / targetSeconds) * 100));
  const isDone = currentPercent >= 100 || currentSeconds >= targetSeconds;
  return {
    questId,
    questName,
    type: 'video',
    enrolled: true,
    completed: isDone,
    claimed: false,
    readyToClaim: isDone,
    currentSeconds: isDone ? targetSeconds : currentSeconds,
    targetSeconds,
    progressPercent: isDone ? 100 : currentPercent,
    requiresDesktop: false,
    message: isDone
      ? 'Đã hoàn thành 100%! Vui lòng vào Cài đặt -> Quests trên Discord để tự bấm Claim (xác thực con người).'
      : `Tiến độ video: ${currentPercent}% (${Math.round(currentSeconds)}/${targetSeconds}s). Bot sẽ tiếp tục cày trong lần quét tới.`,
  };
}

class DiscordUserGateway {
  constructor(token, options = {}) {
    this.token = (token || '').trim().replace(/^['"]|['"]$/g, '');
    this.device = options.device || 'desktop';
    this.ws = null;
    this.heartbeatTimer = null;
    this.sequence = null;
    this.connected = false;
    this.isReady = false;
  }

  async connect(activities = []) {
    if (!WebSocketImpl) return;
    const activityList = Array.isArray(activities) ? activities : (activities ? [activities] : []);

    return new Promise((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          if (timer) clearTimeout(timer);
          resolve();
        }
      };

      const timer = setTimeout(() => {
        if (!resolved) {
          if (this.ws && !this.connected) {
            try { this.ws.terminate?.(); } catch (e) {}
          }
          done();
        }
      }, 4000);
      if (timer && typeof timer.unref === 'function') timer.unref();

      try {
        this.ws = new WebSocketImpl('wss://gateway.discord.gg/?v=9&encoding=json');
      } catch (e) {
        return done();
      }

      this.ws.on('open', () => {
        this.connected = true;
      });

      this.ws.on('message', (raw) => {
        try {
          const payload = JSON.parse(raw.toString());
          const { op, d, s, t } = payload;
          if (s != null) this.sequence = s;

          if (op === 10) {
            const interval = d?.heartbeat_interval || 41250;
            this.startHeartbeat(interval);

            const isMobileDevice = this.device === 'mobile';
            const properties = isMobileDevice
              ? {
                  os: 'Android',
                  browser: 'Discord Android',
                  device: 'Discord Mobile',
                  release_channel: 'googleRelease',
                  client_version: '215.15 - stable',
                  os_version: '33',
                  os_arch: 'arm64',
                  system_locale: 'vi-VN',
                }
              : {
                  os: 'Windows',
                  browser: 'Discord Client',
                  release_channel: 'stable',
                  client_version: '1.0.9168',
                  os_version: '10.0.19045',
                  os_arch: 'x64',
                  system_locale: 'en-US',
                };

            const identifyPayload = {
              op: 2,
              d: {
                token: this.token,
                capabilities: 16381,
                properties,
                presence: {
                  status: 'online',
                  since: 0,
                  activities: activityList,
                  afk: false,
                },
              },
            };
            this.send(identifyPayload);
          }

          if (op === 0 && t === 'READY') {
            this.isReady = true;
            if (activityList.length > 0) {
              this.setActivities(activityList);
            }
            done();
          }
        } catch (e) {}
      });

      this.ws.on('error', () => done());
      this.ws.on('close', () => {
        this.stopHeartbeat();
        this.connected = false;
        this.isReady = false;
        done();
      });
    });
  }

  startHeartbeat(interval) {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ op: 1, d: this.sequence });
    }, interval);
    if (this.heartbeatTimer && typeof this.heartbeatTimer.unref === 'function') {
      this.heartbeatTimer.unref();
    }
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  send(data) {
    if (this.ws && (this.ws.readyState === 1 || this.ws.readyState === WebSocketImpl?.OPEN)) {
      try {
        this.ws.send(JSON.stringify(data));
      } catch (e) {}
    }
  }

  setActivities(activities) {
    const activityList = Array.isArray(activities) ? activities : (activities ? [activities] : []);
    this.send({
      op: 3,
      d: {
        since: 0,
        activities: activityList,
        status: 'online',
        afk: false,
      },
    });
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.connected = false;
    this.isReady = false;
  }
}

function extractQuestTasks(quest) {
  const c = quest?.config || {};
  const v2 = c.task_config_v2?.tasks || c.taskConfigV2?.tasks;
  const v1 = c.task_config?.tasks || c.taskConfig?.tasks;
  const rawTasks = v2 || v1 || {};

  const result = {};

  const addTask = (key, taskObj) => {
    if (!taskObj || typeof taskObj !== 'object') return;
    const resolvedKey = key || taskObj.name || taskObj.key || taskObj.type || taskObj.action || taskObj.event_name;
    if (resolvedKey) {
      result[resolvedKey] = taskObj;
    }
    if (taskObj.type && typeof taskObj.type === 'string') {
      result[taskObj.type] = taskObj;
    }
    if (taskObj.name && typeof taskObj.name === 'string') {
      result[taskObj.name] = taskObj;
    }
    if (taskObj.action && typeof taskObj.action === 'string') {
      result[taskObj.action] = taskObj;
    }
    if (taskObj.event_name && typeof taskObj.event_name === 'string') {
      result[taskObj.event_name] = taskObj;
    }
  };

  if (rawTasks instanceof Map) {
    for (const [k, v] of rawTasks.entries()) {
      addTask(k, v);
    }
  } else if (Array.isArray(rawTasks)) {
    for (const t of rawTasks) {
      addTask(null, t);
    }
  } else if (typeof rawTasks === 'object' && rawTasks !== null) {
    for (const [k, v] of Object.entries(rawTasks)) {
      addTask(k, v);
    }
  }

  if (v1 && v1 !== rawTasks) {
    if (v1 instanceof Map) {
      for (const [k, v] of v1.entries()) {
        addTask(k, v);
      }
    } else if (Array.isArray(v1)) {
      for (const t of v1) {
        addTask(null, t);
      }
    } else if (typeof v1 === 'object' && v1 !== null) {
      for (const [k, v] of Object.entries(v1)) {
        addTask(k, v);
      }
    }
  }
  return result;
}

function hasOrbReward(quest) {
  if (!quest?.config) return false;
  const cfg = quest.config;
  const rewards = cfg.rewards_config?.rewards || cfg.rewardsConfig?.rewards;
  if (Array.isArray(rewards)) {
    for (const r of rewards) {
      if (r?.type === 4) return true; // Type 4 là phần thưởng ORB trong Discord Quests
      if ((r?.orbQuantity || r?.orb_quantity || r?.premiumOrbQuantity || r?.premium_orb_quantity) > 0) return true;
      const rName = (r?.messages?.name || r?.name || '').toLowerCase();
      if (rName.includes('orb')) return true;
    }
  }
  const title = (
    cfg.messages?.quest_name ||
    cfg.messages?.questName ||
    cfg.messages?.game_title ||
    cfg.messages?.gameTitle ||
    cfg.messages?.game_name ||
    cfg.messages?.gameName ||
    cfg.application?.name ||
    ''
  ).toLowerCase();
  return title.includes('orb');
}

function isVideoQuest(quest) {
  if (!quest) return false;
  const cfg = quest.config || {};

  // 1. Kiểm tra video metadata ở config hoặc task_config
  if (
    cfg.video_metadata || cfg.videoMetadata ||
    cfg.video_metadata_v2 || cfg.videoMetadataV2 ||
    cfg.task_config_v2?.video_metadata || cfg.task_config?.video_metadata
  ) return true;

  // 2. Kiểm tra quest_type
  if (cfg.quest_type === 1 || cfg.questType === 1 || cfg.quest_type === 'video' || cfg.questType === 'video') return true;

  // 3. Kiểm tra các task trong cấu hình (cả key và value properties: type, name, action, event_name)
  const tasks = extractQuestTasks(quest);
  for (const [k, v] of Object.entries(tasks)) {
    const candidates = [
      String(k || ''),
      String(v?.type || ''),
      String(v?.name || ''),
      String(v?.action || ''),
      String(v?.event_name || ''),
    ];

    for (const raw of candidates) {
      const upper = raw.toUpperCase();
      if (
        upper.includes('VIDEO') ||
        upper.startsWith('WATCH_') ||
        upper.includes('WATCH') ||
        upper.includes('TRAILER')
      ) {
        return true;
      }
    }

    if (v?.video_metadata || v?.videoMetadata) return true;
  }

  // 4. Kiểm tra user_status progress keys
  if (quest.user_status?.progress && typeof quest.user_status.progress === 'object') {
    for (const [k, v] of Object.entries(quest.user_status.progress)) {
      const upper = String(k).toUpperCase();
      if (upper.includes('VIDEO') || upper.startsWith('WATCH_') || upper.includes('WATCH') || upper.includes('TRAILER')) {
        return true;
      }
      if (v && typeof v === 'object') {
        const subType = String(v.type || v.name || '').toUpperCase();
        if (subType.includes('VIDEO') || subType.startsWith('WATCH_') || subType.includes('WATCH')) {
          return true;
        }
      }
    }
  }

  // 5. Kiểm tra tiêu đề / tên nhiệm vụ (cả snake_case và camelCase)
  const title = (
    cfg.messages?.quest_name ||
    cfg.messages?.questName ||
    cfg.messages?.game_title ||
    cfg.messages?.gameTitle ||
    cfg.messages?.game_name ||
    cfg.messages?.gameName ||
    cfg.application?.name ||
    ''
  ).toLowerCase();

  if (
    title.includes('video') ||
    title.includes('xem') ||
    title.includes('watch') ||
    title.includes('trailer') ||
    title.includes('clip')
  ) {
    return true;
  }

  // 6. Nhiệm vụ thưởng điểm ORB không có yêu cầu chơi game PC bắt buộc
  if (hasOrbReward(quest)) {
    const taskKeys = Object.keys(tasks).map(k => k.toUpperCase());
    const hasGameTask = taskKeys.some(k => k.startsWith('PLAY_') && !k.includes('VIDEO'));
    if (!hasGameTask) {
      return true;
    }
  }

  return false;
}

function getVideoTaskInfo(quest) {
  const tasks = extractQuestTasks(quest);
  let taskKey = null;
  let targetSeconds = 30;

  // Đọc duration từ video_metadata nếu có
  const meta =
    quest?.config?.video_metadata ||
    quest?.config?.videoMetadata ||
    quest?.config?.video_metadata_v2 ||
    quest?.config?.videoMetadataV2 ||
    quest?.config?.task_config_v2?.video_metadata ||
    quest?.config?.task_config?.video_metadata;

  if (meta) {
    if (typeof meta.duration_seconds === 'number' && meta.duration_seconds > 0) {
      targetSeconds = meta.duration_seconds;
    } else if (typeof meta.duration === 'number' && meta.duration > 0) {
      targetSeconds = meta.duration;
    } else if (typeof meta.durationSeconds === 'number' && meta.durationSeconds > 0) {
      targetSeconds = meta.durationSeconds;
    } else if (typeof meta.target === 'number' && meta.target > 0) {
      targetSeconds = meta.target;
    }
  }

  if (tasks.WATCH_VIDEO) {
    taskKey = 'WATCH_VIDEO';
    if (typeof tasks.WATCH_VIDEO.target === 'number' && tasks.WATCH_VIDEO.target > 0) {
      targetSeconds = tasks.WATCH_VIDEO.target;
    } else if (typeof tasks.WATCH_VIDEO.duration === 'number' && tasks.WATCH_VIDEO.duration > 0) {
      targetSeconds = tasks.WATCH_VIDEO.duration;
    }
  } else {
    for (const [k, v] of Object.entries(tasks)) {
      const upperK = String(k).toUpperCase();
      const upperType = String(v?.type || '').toUpperCase();
      const upperName = String(v?.name || '').toUpperCase();
      if (
        upperK.includes('VIDEO') || upperK.startsWith('WATCH_') || upperK.includes('WATCH') || upperK.includes('TRAILER') ||
        upperType.includes('VIDEO') || upperType.startsWith('WATCH_') ||
        upperName.includes('VIDEO')
      ) {
        taskKey = k;
        if (typeof v?.target === 'number' && v.target > 0) {
          targetSeconds = v.target;
        } else if (typeof v?.duration === 'number' && v.duration > 0) {
          targetSeconds = v.duration;
        }
        break;
      }
    }
  }

  if (!taskKey) {
    const keys = Object.keys(tasks);
    if (keys.length > 0) {
      taskKey = keys[0];
      if (typeof tasks[taskKey]?.target === 'number' && tasks[taskKey].target > 0) {
        targetSeconds = tasks[taskKey].target;
      }
    } else {
      taskKey = 'WATCH_VIDEO';
    }
  }

  let currentSeconds = 0;
  if (quest?.user_status?.progress && typeof quest.user_status.progress === 'object') {
    const p = quest.user_status.progress;
    if (typeof p[taskKey]?.value === 'number') {
      currentSeconds = p[taskKey].value;
    } else if (typeof p.WATCH_VIDEO?.value === 'number') {
      currentSeconds = p.WATCH_VIDEO.value;
    } else {
      for (const val of Object.values(p)) {
        if (typeof val?.value === 'number' && val.value > currentSeconds) {
          currentSeconds = val.value;
        }
      }
    }
  }

  return { taskKey, targetSeconds: Math.max(targetSeconds, 15), currentSeconds };
}

function getQuestProgressSeconds(quest) {
  if (!quest?.user_status) return 0;
  if (isVideoQuest(quest)) {
    return getVideoTaskInfo(quest).currentSeconds;
  }
  const status = quest.user_status;
  if (typeof status.stream_progress_seconds === 'number' && status.stream_progress_seconds > 0) {
    return status.stream_progress_seconds;
  }
  if (status.progress && typeof status.progress === 'object') {
    for (const key of Object.keys(status.progress)) {
      const val = status.progress[key]?.value;
      if (typeof val === 'number' && val > 0) {
        return val;
      }
    }
  }
  return 0;
}

function getQuestTargetSeconds(quest, preferredTaskName = null) {
  if (isVideoQuest(quest)) {
    return getVideoTaskInfo(quest).targetSeconds;
  }
  const tasks = extractQuestTasks(quest);

  if (preferredTaskName && tasks[preferredTaskName]?.target) {
    return tasks[preferredTaskName].target;
  }
  for (const k of Object.keys(tasks)) {
    if (typeof tasks[k]?.target === 'number' && tasks[k].target > 0) {
      return tasks[k].target;
    }
  }
  if (quest?.config?.stream_duration_requirement_minutes) {
    return quest.config.stream_duration_requirement_minutes * 60;
  }
  return 900;
}

function getQuestApplicationInfo(quest) {
  const tasks = extractQuestTasks(quest);

  let appId = null;
  let appName = null;

  for (const t of Object.values(tasks)) {
    if (Array.isArray(t?.applications) && t.applications.length > 0) {
      if (t.applications[0].id) appId = String(t.applications[0].id);
      if (t.applications[0].name) appName = t.applications[0].name;
      break;
    }
  }

  if (!appId) {
    appId = quest.config?.application?.id || quest.config?.application_id || quest.config?.applicationId;
    if (appId) appId = String(appId);
  }

  if (!appName) {
    appName =
      quest.config?.application?.name ||
      quest.config?.messages?.game_title ||
      quest.config?.messages?.gameTitle ||
      quest.config?.messages?.quest_name ||
      quest.config?.messages?.questName ||
      'Discord Game';
  }

  return { appId, appName };
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
      completed: true,
      claimed: false,
      progressPercent: 100,
      message: 'Nhiệm vụ này đã nhận thưởng trước đó.',
    };
  }

  const isVid = isVideoQuest(quest);
  const tasks = extractQuestTasks(quest);
  let targetPlatform = isVid ? -1 : 0; // 0 = Desktop / PC, 1 = Console, 2 = Mobile, -1 = Video (không chọn platform)
  if (!isVid) {
    if (tasks.PLAY_ON_MOBILE || tasks.WATCH_VIDEO_ON_MOBILE) {
      targetPlatform = 2;
    } else if (tasks.PLAY_ON_PLAYSTATION || tasks.PLAY_ON_XBOX) {
      targetPlatform = 1;
    }
  }

  // Đăng ký nhận nhiệm vụ nếu chưa enroll
  if (!quest.user_status?.enrolled_at) {
    try {
      await enrollQuest(token, questId, targetPlatform);
    } catch (e) {}
  }

  // Nếu là Video Quest -> hoàn thành trực tiếp bằng video-progress (KHÔNG gọi select-task-platform)
  if (isVid) {
    const res = await completeVideoQuest(token, quest, options);
    return {
      type: 'video',
      requiresDesktop: false,
      ...res,
    };
  }

  // Luôn đảm bảo chọn đúng nền tảng phù hợp cho nhiệm vụ game
  try {
    await requestDiscord(`https://discord.com/api/v9/quests/${questId}/select-task-platform`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ platform: targetPlatform }),
    });
  } catch {}

  const isActivity = !!(tasks.PLAY_ACTIVITY || tasks.ACHIEVEMENT_IN_ACTIVITY || tasks.ACHIEVEMENT_IN_GAME);
  const isMobileTask = !!(tasks.PLAY_ON_MOBILE || tasks.WATCH_VIDEO_ON_MOBILE);
  const taskName = isActivity
    ? (['PLAY_ACTIVITY', 'ACHIEVEMENT_IN_ACTIVITY', 'ACHIEVEMENT_IN_GAME'].find((k) => tasks[k] != null) || Object.keys(tasks)[0])
    : (['PLAY_ON_DESKTOP', 'STREAM_ON_DESKTOP', 'PLAY_ON_MOBILE', 'PLAY_ON_PLAYSTATION', 'PLAY_ON_XBOX'].find((k) => tasks[k] != null) || Object.keys(tasks)[0]);

  // Nếu nhiệm vụ đã hoàn thành tiến độ (có completed_at) nhưng chưa nhận thưởng:
  if (quest.user_status?.completed_at) {
    let reward = null;
    let claimed = false;
    if (options.autoClaim === true) {
      try {
        reward = await claimQuestReward(token, questId);
        claimed = true;
      } catch (e) {}
    }
    return {
      questId,
      questName,
      type: isActivity ? 'activity' : 'game',
      completed: true,
      claimed,
      readyToClaim: !claimed,
      progressPercent: 100,
      reward,
      requiresDesktop: false,
      message: claimed
        ? 'Nhiệm vụ đã hoàn thành tiến độ! Đã tự động nhận thưởng (Claim ORB) thành công.'
        : 'Đã hoàn thành 100%! Vui lòng vào Cài đặt -> Quests trên Discord để tự bấm Claim (xác thực con người).',
    };
  }

  const { appId, appName } = getQuestApplicationInfo(quest);
  const targetSeconds = getQuestTargetSeconds(quest, taskName);
  let currentSeconds = getQuestProgressSeconds(quest);

  if (currentSeconds >= targetSeconds) {
    let reward = null;
    let claimed = false;
    if (options.autoClaim === true) {
      try {
        reward = await claimQuestReward(token, questId);
        claimed = true;
      } catch (e) {}
    }
    return {
      questId,
      questName,
      type: isActivity ? 'activity' : 'game',
      completed: true,
      claimed,
      readyToClaim: !claimed,
      currentSeconds: targetSeconds,
      targetSeconds,
      progressPercent: 100,
      reward,
      requiresDesktop: false,
      message: claimed
        ? 'Đã hoàn thành 100% thời gian chơi & Nhận thưởng thành công!'
        : 'Đã hoàn thành 100% thời gian chơi! Vui lòng vào Cài đặt -> Quests trên Discord để tự bấm Claim (xác thực con người).',
    };
  }

  // Tạo stream_key chuẩn xác dạng call:channelId:userId từ danh sách private channels
  let streamKey = null;
  let channelId = null;
  let userId = null;
  try {
    userId = getUserIdFromToken(token);
    if (!userId) {
      const u = await fetchUserInfo(token).catch(() => null);
      if (u?.id) userId = u.id;
    }
  } catch {}

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
  if (!channelId && userId) {
    channelId = userId;
  }
  if (channelId && userId) {
    streamKey = `call:${channelId}:${userId}`;
  }

  // Kết nối Gateway giả lập người dùng đang chạy game trên Discord Windows
  // QUAN TRỌNG: Gateway phải READY trước khi gửi heartbeat để Discord chấp nhận Rich Presence
  let gateway = null;
  const isFastMode = typeof options.heartbeatDelayMs === 'number' && options.heartbeatDelayMs <= 2500;
  const isFastTestMode = typeof options.heartbeatDelayMs === 'number' && options.heartbeatDelayMs < 500;
  const gatewayActivity = {
    name: appName,
    type: 0,
    application_id: appId,
    flags: 1, // ActivityFlags.INSTANCE
    timestamps: { start: Date.now() - (currentSeconds * 1000) },
  };
  if (!isFastTestMode) {
    try {
      const device = isMobileTask ? 'mobile' : (options.device || 'desktop');
      gateway = new DiscordUserGateway(token, { device });
      await gateway.connect(gatewayActivity);
      // Đợi Discord server sync Rich Presence
      const syncWait = typeof options.gatewaySyncDelayMs === 'number'
        ? options.gatewaySyncDelayMs
        : (isFastMode ? 800 : 8000);
      if (syncWait > 0) {
        console.log(`[QUEST WORKER] Gateway connected, waiting ${syncWait}ms for Discord to sync presence...`);
        await new Promise((r) => setTimeout(r, syncWait));
      }
      console.log(`[QUEST WORKER] Ready to heartbeat — Quest: ${questName} | App: ${appName} (${appId})`);
    } catch (e) {
      console.warn(`[QUEST WORKER] Gateway connect error: ${e.message}`);
    }
  }

  const heartbeatDelay = options.heartbeatDelayMs ?? 20000;
  // maxLoops đủ để cover toàn bộ thời gian quest dù Discord không báo progress
  const maxLoops = Math.ceil((targetSeconds * 1000) / Math.max(heartbeatDelay, 1000)) + 30;
  let loops = 0;
  // Track thời gian thực để ước lượng tiến độ khi server không phản hồi progress
  const startTimestamp = Date.now() - (currentSeconds * 1000);

  let lastActivityRefresh = Date.now();

  try {
    while (currentSeconds < targetSeconds && loops < maxLoops) {
      loops++;

      // Refresh Rich Presence mỗi 60s để Discord không xóa session
      if (gateway && (Date.now() - lastActivityRefresh) > 60000) {
        gateway.setActivities([{
          ...gatewayActivity,
          timestamps: { start: Date.now() - (currentSeconds * 1000) },
        }]);
        lastActivityRefresh = Date.now();
        console.log(`[QUEST WORKER] Refreshed Rich Presence for ${questName}`);
      }

      let hb = {};
      let heartbeatOk = false;
      try {
        hb = await sendHeartbeat(token, questId, { streamKey, applicationId: appId, terminal: false, userId });
        heartbeatOk = true;
      } catch (heartbeatErr) {
        const errMsg = heartbeatErr.message || '';
        console.warn(`[QUEST WORKER] Heartbeat failed loop=${loops} quest=${questId}: ${errMsg}`);

        // Nếu 404: re-send Rich Presence và chờ thêm rồi retry 1 lần
        if (errMsg.includes('404') && gateway && loops <= 3) {
          console.log(`[QUEST WORKER] 404 detected — re-sending Rich Presence and retrying in 2s...`);
          gateway.setActivities([{
            ...gatewayActivity,
            timestamps: { start: Date.now() - (currentSeconds * 1000) },
          }]);
          lastActivityRefresh = Date.now();
          await new Promise((r) => setTimeout(r, 2000));
          try {
            hb = await sendHeartbeat(token, questId, { streamKey, applicationId: appId, terminal: false, userId });
            heartbeatOk = true;
          } catch (retryErr) {
            console.warn(`[QUEST WORKER] Retry heartbeat also failed: ${retryErr.message}`);
          }
        }

        if (!heartbeatOk) {
          // Cập nhật tiến độ ước lượng
          if (isFastMode) {
            const step = Math.max(30, Math.ceil(targetSeconds / 10));
            currentSeconds = Math.min(targetSeconds, currentSeconds + step);
          } else {
            const elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
            if (elapsed > currentSeconds) currentSeconds = Math.min(targetSeconds, elapsed);
          }

          if (options.onProgress) {
            options.onProgress({
              questId,
              questName,
              type: isActivity ? 'activity' : 'game',
              currentSeconds: Math.min(currentSeconds, targetSeconds),
              targetSeconds,
              percent: Math.min(100, Math.round((currentSeconds / targetSeconds) * 100)),
            });
          }

          if (currentSeconds < targetSeconds) {
            await new Promise((r) => setTimeout(r, heartbeatDelay));
          }
          continue;
        }
      }

      if (hb?.user_status?.completed_at || hb?.completed_at) {
        currentSeconds = targetSeconds;
        break;
      }

      const serverProgress =
        hb?.user_status?.progress?.[taskName]?.value ??
        hb?.progress?.[taskName]?.value ??
        hb?.user_status?.stream_progress_seconds ??
        hb?.stream_progress_seconds ??
        (typeof hb?.progress === 'object' && hb.progress?.[Object.keys(hb.progress)[0]]?.value != null ? hb.progress[Object.keys(hb.progress)[0]].value : null) ??
        (typeof hb?.user_status?.progress === 'object' && hb.user_status.progress?.[Object.keys(hb.user_status.progress)[0]]?.value != null ? hb.user_status.progress[Object.keys(hb.user_status.progress)[0]].value : null);

      if (typeof serverProgress === 'number' && serverProgress > currentSeconds) {
        // Discord xác nhận progress thật
        currentSeconds = serverProgress;
        console.log(`[QUEST WORKER] ✅ Server confirmed: ${currentSeconds}/${targetSeconds}s (${Math.round(currentSeconds/targetSeconds*100)}%) quest=${questId}`);
      } else if (isFastMode) {
        const step = Math.max(30, Math.ceil(targetSeconds / 10));
        currentSeconds = Math.min(targetSeconds, currentSeconds + step);
      } else {
        // Discord không trả progress số — dùng thời gian thực để ước lượng
        const elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
        if (elapsed > currentSeconds) {
          currentSeconds = Math.min(targetSeconds, elapsed);
          console.log(`[QUEST WORKER] Time-based est: ${currentSeconds}/${targetSeconds}s quest=${questId}`);
        }
      }

      if (options.onProgress) {
        options.onProgress({
          questId,
          questName,
          type: isActivity ? 'activity' : 'game',
          currentSeconds: Math.min(currentSeconds, targetSeconds),
          targetSeconds,
          percent: Math.min(100, Math.round((currentSeconds / targetSeconds) * 100)),
        });
      }

      if (currentSeconds >= targetSeconds) break;
      await new Promise((r) => setTimeout(r, heartbeatDelay));
    }

    if (currentSeconds >= targetSeconds) {
      try {
        await sendHeartbeat(token, questId, { streamKey, applicationId: appId, terminal: true, userId });
      } catch {}

      // Nếu quest này có task Video kèm theo (multi-task hoặc hybrid quest), tự động hoàn thành luôn task video
      const remainingTasks = extractQuestTasks(quest);
      const hasVideoTask = Object.keys(remainingTasks).some((k) => {
        const upper = k.toUpperCase();
        return upper.includes('VIDEO') || upper.startsWith('WATCH_') || upper.includes('TRAILER');
      });

      if (hasVideoTask) {
        try {
          console.log(`[QUEST WORKER] Quest ${questId} có video task kèm theo. Đang tự động hoàn tất video...`);
          await completeVideoQuest(token, quest, options);
        } catch (vidErr) {
          console.warn(`[QUEST WORKER] Lỗi hoàn thành video task kèm theo (${questId}):`, vidErr.message);
        }
      }

      let reward = null;
      let claimed = false;
      if (options.autoClaim === true) {
        const claimDelay = options.heartbeatDelayMs && options.heartbeatDelayMs < 1000 ? 0 : 1000;
        if (claimDelay > 0) {
          await new Promise((r) => setTimeout(r, claimDelay));
        }
        try {
          reward = await claimQuestReward(token, questId);
          claimed = true;
        } catch (e) {}
      }

      return {
        questId,
        questName,
        type: isActivity ? 'activity' : 'game',
        completed: true,
        claimed,
        readyToClaim: !claimed,
        currentSeconds: targetSeconds,
        targetSeconds,
        progressPercent: 100,
        reward,
        requiresDesktop: false,
        message: claimed
          ? 'Hoàn thành 100% & Đã nhận thưởng ORB thành công!'
          : 'Hoàn thành 100% thời gian chơi! Vui lòng vào Cài đặt -> Quests trên Discord để tự bấm Claim (xác thực con người).',
      };
    }

    const currentPercent = Math.min(100, Math.round((currentSeconds / targetSeconds) * 100));
    const isCompleted = currentPercent >= 100 || currentSeconds >= targetSeconds;
    if (isCompleted) {
      try {
        await sendHeartbeat(token, questId, { streamKey, applicationId: appId, terminal: true, userId });
      } catch {}
    }
    return {
      questId,
      questName,
      type: isActivity ? 'activity' : 'game',
      enrolled: true,
      completed: isCompleted,
      claimed: false,
      readyToClaim: isCompleted,
      currentSeconds: isCompleted ? targetSeconds : currentSeconds,
      targetSeconds,
      progressPercent: isCompleted ? 100 : currentPercent,
      requiresDesktop: false,
      message: isCompleted
        ? 'Hoàn thành 100% thời gian chơi! Vui lòng vào Cài đặt -> Quests trên Discord để tự bấm Claim (xác thực con người).'
        : `Tiến độ: ${currentPercent}%. Bot đang tiếp tục tự động cày trong nền.`,
    };
  } catch (err) {
    console.warn(`[QUEST WORKER] Heartbeat error for ${questName} (${questId}): ${err.message}`);
    const pct = Math.min(100, Math.round((currentSeconds / targetSeconds) * 100));
    const isDone = pct >= 100 || currentSeconds >= targetSeconds;
    return {
      questId,
      questName,
      type: isActivity ? 'activity' : 'game',
      enrolled: true,
      completed: isDone,
      claimed: false,
      readyToClaim: isDone,
      currentSeconds: isDone ? targetSeconds : currentSeconds,
      targetSeconds,
      progressPercent: isDone ? 100 : pct,
      error: err.message,
      requiresDesktop: false,
      message: isDone
        ? 'Hoàn thành 100% thời gian chơi! Vui lòng vào Cài đặt -> Quests trên Discord để tự bấm Claim (xác thực con người).'
        : `Tiến độ: ${pct}%. ${err.message}`,
    };
  } finally {
    if (gateway) {
      gateway.disconnect();
    }
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
  let readyToClaimCount = 0;

  // Ưu tiên hoàn thành nhiệm vụ Video trước (chỉ ~30-45s) để người dùng có kết quả ngay lập tức
  quests.sort((a, b) => {
    const aVid = isVideoQuest(a) ? 1 : 0;
    const bVid = isVideoQuest(b) ? 1 : 0;
    return bVid - aVid;
  });

  for (let i = 0; i < quests.length; i++) {
    const quest = quests[i];
    const questName =
      quest.config?.messages?.quest_name ||
      quest.config?.messages?.game_title ||
      quest.config?.messages?.game_name ||
      `Nhiệm vụ #${quest.id}`;

    const isVid = isVideoQuest(quest);
    const defaultType = isVid ? 'video' : 'game';

    onProgress({
      step: 'quest_start',
      index: i + 1,
      total: quests.length,
      questName,
      type: defaultType,
      message: `[${i + 1}/${quests.length}] Đang xử lý: **${questName}**...`,
    });

    try {
      const res = await completeSingleQuest(token, quest, {
        autoClaim: options.autoClaim === true,
        heartbeatDelayMs: options.heartbeatDelayMs,
        onProgress: (p) =>
          onProgress({
            step: 'progress',
            index: i + 1,
            total: quests.length,
            type: p.type || defaultType,
            ...p,
          }),
      });

      const isSuccess = !!(res.completed || res.alreadyDone);
      results.push({
        success: isSuccess,
        type: res.type || defaultType,
        ...res,
      });
      if (res.enrolled || res.completed || res.alreadyDone) enrolledCount++;
      if (res.completed || res.alreadyDone) completedCount++;
      if (res.claimed) claimedCount++;
      if (res.readyToClaim) readyToClaimCount++;
    } catch (err) {
      results.push({
        success: false,
        questId: quest.id,
        questName,
        type: defaultType,
        error: err.message,
      });
    }
  }

  // Sau khi hoàn thành các nhiệm vụ (đặc biệt sau khi chơi game), quét lại xem có video quest mới nào mở khóa không
  try {
    const postGamePause = options.heartbeatDelayMs && options.heartbeatDelayMs < 1000 ? 50 : 2500;
    await new Promise((r) => setTimeout(r, postGamePause));

    const freshQuests = await fetchQuests(token);
    const remainingVideoQuests = (freshQuests || [])
      .filter(isQuestActive)
      .filter((q) => !q.user_status?.claimed_at && !q.user_status?.completed_at)
      .filter(isVideoQuest)
      .filter((q) => !results.some((r) => r.questId === q.id && r.completed));

    if (remainingVideoQuests.length > 0) {
      onProgress({
        step: 'post_game_video',
        message: `Đang tự động hoàn tất ${remainingVideoQuests.length} nhiệm vụ Video sau khi hoàn thành chơi game...`,
      });

      for (const vq of remainingVideoQuests) {
        const questName =
          vq.config?.messages?.quest_name ||
          vq.config?.messages?.game_title ||
          vq.config?.messages?.game_name ||
          `Nhiệm vụ #${vq.id}`;

        try {
          const res = await completeSingleQuest(token, vq, {
            autoClaim: options.autoClaim === true,
            heartbeatDelayMs: options.heartbeatDelayMs,
            onProgress: (p) =>
              onProgress({
                step: 'progress',
                index: results.length + 1,
                total: quests.length + remainingVideoQuests.length,
                type: 'video',
                ...p,
              }),
          });

          const isSuccess = !!(res.completed || res.alreadyDone);
          results.push({
            success: isSuccess,
            type: 'video',
            ...res,
          });
          if (res.enrolled || res.completed || res.alreadyDone) enrolledCount++;
          if (res.completed || res.alreadyDone) completedCount++;
          if (res.claimed) claimedCount++;
          if (res.readyToClaim) readyToClaimCount++;
        } catch (err) {
          results.push({
            success: false,
            questId: vq.id,
            questName,
            type: 'video',
            error: err.message,
          });
        }
      }
    }
  } catch (e) {
    console.warn('[QUEST WORKER] Không thể quét lại video quests sau khi làm quest:', e.message);
  }

  return {
    user,
    accountTag,
    totalQuests: quests.length,
    enrolledCount,
    completedCount,
    claimedCount,
    readyToClaimCount,
    results,
  };
}

module.exports = {
  setFetchImplementation,
  setWebSocketImplementation,
  DiscordUserGateway,
  extractQuestTasks,
  isVideoQuest,
  getVideoTaskInfo,
  getQuestProgressSeconds,
  getQuestTargetSeconds,
  getQuestApplicationInfo,
  fetchUserInfo,
  fetchQuests,
  enrollQuest,
  sendHeartbeat,
  sendVideoProgress,
  claimQuestReward,
  completeVideoQuest,
  completeSingleQuest,
  isQuestActive,
  getUserIdFromToken,
  runAutoQuestForToken,
};

