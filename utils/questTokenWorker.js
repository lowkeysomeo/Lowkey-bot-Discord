'use strict';

/**
 * Lowkey Discord Bot — Quest Token Worker (24/7 Full Video & Game Auto-Complete, No-Claim Default)
 * Tự động quét, nhận (Enroll) 100% nhiệm vụ Video & Game mới nhất và hoàn thành toàn bộ tiến trình
 * mà không tự động bấm Claim (trừ khi truyền rõ options.autoClaim = true).
 */

const crypto = require('node:crypto');

let customFetchImpl = null;
let customWebSocketImpl = null;

function setFetchImplementation(fn) {
  customFetchImpl = typeof fn === 'function' ? fn : null;
}

function setWebSocketImplementation(wsClass) {
  customWebSocketImpl = wsClass || null;
}

function getFetch() {
  if (customFetchImpl) return customFetchImpl;
  if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis);
  throw new Error('Môi trường Node.js không hỗ trợ fetch.');
}

function getWebSocketClass() {
  if (customWebSocketImpl) return customWebSocketImpl;
  if (typeof globalThis.WebSocket === 'function') return globalThis.WebSocket;
  try {
    return require('ws');
  } catch {
    return null;
  }
}

const VIDEO_TASK_KEYS = [
  'WATCH_VIDEO',
  'WATCH_VIDEO_ON_MOBILE',
  'WATCH_VIDEO_DESKTOP',
  'WATCH_VIDEO_ON_DESKTOP',
  'WATCH_VIDEO_V2',
  'WATCH_PROMOTIONAL_VIDEO',
];

const GAME_TASK_KEYS = [
  'PLAY_ON_DESKTOP',
  'PLAY_ON_DESKTOP_V2',
  'PLAY_ON_XBOX',
  'PLAY_ON_PLAYSTATION',
  'STREAM_ON_DESKTOP',
  'PLAY_ACTIVITY',
  'ACHIEVEMENT_IN_GAME',
];

const ALL_SUPPORTED_TASK_KEYS = [...VIDEO_TASK_KEYS, ...GAME_TASK_KEYS];

const EXCLUDED_KEYWORDS = ['fanduel', 'draftkings', 'betmgm'];

function randomUUID() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function normalizeToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return '';
  return rawToken
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/^Bearer\s+/i, '')
    .trim();
}

function getUserIdFromToken(rawToken) {
  const clean = normalizeToken(rawToken);
  if (!clean) return null;
  const firstPart = clean.split('.')[0];
  if (!firstPart) return null;
  try {
    const decoded = Buffer.from(firstPart, 'base64').toString('utf8').trim();
    if (/^\d{15,22}$/.test(decoded)) return decoded;
  } catch {}
  return null;
}

function getSuperProperties(platformType = 'desktop') {
  const isMobile = platformType === 'mobile';
  const props = isMobile
    ? {
        os: 'iOS',
        browser: 'Discord iOS',
        device: 'iPhone16,2',
        system_locale: 'vi-VN',
        client_version: '264.0',
        release_channel: 'stable',
        device_vendor_id: randomUUID(),
        browser_user_agent: '',
        browser_version: '',
        os_version: '18.2',
        client_build_number: 365420,
        client_event_source: null,
        design_id: 0,
      }
    : {
        os: 'Windows',
        browser: 'Discord Client',
        release_channel: 'stable',
        client_version: '1.0.9175',
        os_version: '10.0.22631',
        os_arch: 'x64',
        app_arch: 'x64',
        system_locale: 'vi-VN',
        has_client_mods: false,
        browser_user_agent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9175 Chrome/128.0.6613.186 Electron/32.2.7 Safari/537.36',
        browser_version: '32.2.7',
        client_build_number: 365420,
        native_build_number: 56214,
        client_event_source: null,
      };
  return Buffer.from(JSON.stringify(props), 'utf8').toString('base64');
}

function getHeaders(rawToken, referer = 'https://discord.com/quest-home', platformType = 'desktop') {
  const token = normalizeToken(rawToken);
  const isMobile = platformType === 'mobile';
  return {
    Authorization: token,
    'Content-Type': 'application/json',
    Accept: '*/*',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    'User-Agent': isMobile
      ? 'Discord-iOS/264.0 (iPhone; iOS 18.2; Scale/3.00)'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9175 Chrome/128.0.6613.186 Electron/32.2.7 Safari/537.36',
    'X-Super-Properties': getSuperProperties(platformType),
    'X-Discord-Locale': 'vi',
    'X-Discord-Timezone': 'Asia/Ho_Chi_Minh',
    Origin: 'https://discord.com',
    Referer: referer,
  };
}

async function safeJson(res) {
  if (!res) return null;
  try {
    if (typeof res.json === 'function') {
      return await res.json();
    }
  } catch {}
  try {
    if (typeof res.text === 'function') {
      const txt = await res.text();
      return txt ? JSON.parse(txt) : null;
    }
  } catch {}
  return null;
}

/**
 * Giả lập kết nối Discord Gateway từ User Token để duy trì Rich Presence khi làm nhiệm vụ Game/Stream
 */
class DiscordUserGateway {
  constructor(token, options = {}) {
    this.token = normalizeToken(token);
    this.options = options;
    this.ws = null;
    this.heartbeatTimer = null;
    this.connected = false;
    this.ready = false;
    this.sessionId = null;
    this.seq = null;
  }

  async connect(activityInfo = null) {
    const WS = getWebSocketClass();
    if (!WS) return false;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (val) => {
        if (!settled) {
          settled = true;
          resolve(val);
        }
      };

      const timeout = setTimeout(() => finish(false), 8000);

      try {
        const ws = new WS('wss://gateway.discord.gg/?v=9&encoding=json');
        this.ws = ws;

        const onMessage = (raw) => {
          try {
            const str = typeof raw === 'string' ? raw : raw?.data ? String(raw.data) : Buffer.isBuffer(raw) ? raw.toString('utf8') : '';
            if (!str) return;
            const packet = JSON.parse(str);
            if (packet.s !== undefined && packet.s !== null) this.seq = packet.s;

            if (packet.op === 10) {
              const interval = packet.d?.heartbeat_interval || 41250;
              this.startHeartbeat(interval);
              this.sendIdentify(activityInfo);
              this.connected = true;
              clearTimeout(timeout);
              finish(true);
            } else if (packet.t === 'READY') {
              this.ready = true;
              this.sessionId = packet.d?.session_id || null;
              if (activityInfo) {
                this.updatePresence(activityInfo);
              }
            }
          } catch {}
        };

        if (typeof ws.on === 'function') {
          ws.on('message', onMessage);
          ws.on('error', () => {
            clearTimeout(timeout);
            finish(false);
          });
          ws.on('close', () => {
            this.cleanup();
            clearTimeout(timeout);
            finish(false);
          });
        } else {
          ws.onmessage = onMessage;
          ws.onerror = () => {
            clearTimeout(timeout);
            finish(false);
          };
          ws.onclose = () => {
            this.cleanup();
            clearTimeout(timeout);
            finish(false);
          };
        }
      } catch {
        clearTimeout(timeout);
        finish(false);
      }
    });
  }

  startHeartbeat(intervalMs) {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this.sendJson({ op: 1, d: this.seq });
    }, Math.max(10000, intervalMs));
    if (typeof this.heartbeatTimer.unref === 'function') {
      this.heartbeatTimer.unref();
    }
  }

  buildActivities(activityInfo) {
    if (!activityInfo || !activityInfo.id) return [];
    const now = Date.now();
    return [
      {
        name: activityInfo.name || 'Discord Quest Game',
        type: activityInfo.isStream ? 1 : 0,
        application_id: String(activityInfo.id),
        timestamps: { start: now },
      },
    ];
  }

  sendIdentify(activityInfo) {
    this.sendJson({
      op: 2,
      d: {
        token: this.token,
        capabilities: 16381,
        properties: {
          os: 'Windows',
          browser: 'Discord Client',
          device: '',
          system_locale: 'vi-VN',
          client_version: '1.0.9175',
          release_channel: 'stable',
          client_build_number: 365420,
        },
        presence: {
          status: 'online',
          since: 0,
          activities: this.buildActivities(activityInfo),
          afk: false,
        },
        compress: false,
      },
    });
  }

  updatePresence(activityInfo) {
    this.sendJson({
      op: 3,
      d: {
        since: 0,
        activities: this.buildActivities(activityInfo),
        status: 'online',
        afk: false,
      },
    });
  }

  sendJson(payload) {
    try {
      if (this.ws && (this.ws.readyState === 1 || this.ws.OPEN === 1)) {
        this.ws.send(JSON.stringify(payload));
      }
    } catch {}
  }

  cleanup() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.connected = false;
    this.ready = false;
  }

  close() {
    try {
      this.updatePresence(null);
      if (this.ws && typeof this.ws.close === 'function') {
        this.ws.close();
      }
    } catch {}
    this.cleanup();
  }
}

/**
 * Trích xuất chuẩn hóa danh sách các task trong Quest (hỗ trợ cả task_config_v2, task_config, v1/v2/v3)
 */
function extractQuestTasks(quest) {
  if (!quest || typeof quest !== 'object') return {};
  const cfg = quest.config || quest;
  const rawTasks =
    cfg?.task_config_v2?.tasks ||
    cfg?.taskConfigV2?.tasks ||
    cfg?.task_config?.tasks ||
    cfg?.taskConfig?.tasks ||
    quest?.task_config_v2?.tasks ||
    quest?.task_config?.tasks ||
    {};

  const normalized = {};

  if (Array.isArray(rawTasks)) {
    for (const item of rawTasks) {
      if (!item || typeof item !== 'object') continue;
      const key = item.type || item.event_name || item.name || item.task_type;
      if (key) {
        normalized[String(key).toUpperCase()] = item;
      }
    }
  } else if (rawTasks && typeof rawTasks === 'object') {
    for (const [k, v] of Object.entries(rawTasks)) {
      if (!v || typeof v !== 'object') continue;
      const key = String(v.type || v.event_name || k).toUpperCase();
      normalized[key] = { ...v, type: key };
    }
  }

  return normalized;
}

function isVideoQuest(quest) {
  if (!quest || typeof quest !== 'object') return false;
  const tasks = extractQuestTasks(quest);
  for (const key of VIDEO_TASK_KEYS) {
    if (tasks[key]) return true;
  }
  for (const k of Object.keys(tasks)) {
    const upperK = k.toUpperCase();
    if (upperK.startsWith('WATCH_') || (upperK.includes('VIDEO') && !upperK.startsWith('PLAY_'))) {
      return true;
    }
  }
  const cfg = quest.config || quest;
  if (
    cfg?.video_metadata || cfg?.videoMetadata ||
    cfg?.video_metadata_v2 || cfg?.videoMetadataV2 ||
    cfg?.task_config_v2?.video_metadata || cfg?.task_config?.video_metadata ||
    cfg?.features?.includes?.('VIDEO_QUEST') ||
    cfg?.quest_type === 1 || cfg?.questType === 1 || cfg?.quest_type === 'video'
  ) {
    const hasGameTask = GAME_TASK_KEYS.some((k) => Boolean(tasks[k]));
    if (!hasGameTask) return true;
  }
  return false;
}

function isMobileVideoOnlyQuest(quest) {
  const tasks = extractQuestTasks(quest);
  return Boolean(tasks.WATCH_VIDEO_ON_MOBILE && !tasks.WATCH_VIDEO && !tasks.WATCH_VIDEO_DESKTOP);
}

function getVideoTaskInfo(quest) {
  if (!quest || typeof quest !== 'object') return null;
  const tasks = extractQuestTasks(quest);
  const cfg = quest.config || quest;

  let currentSeconds = 0;
  if (quest?.user_status?.progress) {
    const p = quest.user_status.progress;
    for (const [k, val] of Object.entries(p)) {
      if (typeof val?.value === 'number') {
        currentSeconds = Math.max(currentSeconds, val.value);
      }
    }
  }
  if (!currentSeconds && typeof quest?.user_status?.stream_progress_seconds === 'number') {
    currentSeconds = quest.user_status.stream_progress_seconds;
  }

  for (const key of VIDEO_TASK_KEYS) {
    if (tasks[key]) {
      const t = tasks[key];
      const target = Number(t.target ?? t.target_seconds ?? cfg?.video_metadata?.duration ?? cfg?.video_metadata?.duration_seconds ?? 60) || 60;
      const progressSec = quest?.user_status?.progress?.[key]?.value ?? currentSeconds;
      return {
        taskType: key,
        taskKey: key,
        targetSeconds: target,
        target,
        currentSeconds: Number(progressSec) || 0,
        videoId: cfg?.video_metadata?.video_id || cfg?.videoMetadata?.videoId || t.video_id || null,
        title:
          cfg?.video_metadata?.title ||
          cfg?.messages?.quest_name ||
          cfg?.messages?.game_title ||
          quest.id,
      };
    }
  }

  for (const [k, v] of Object.entries(tasks)) {
    const upperK = String(k).toUpperCase();
    if (upperK.startsWith('WATCH_') || upperK.includes('VIDEO')) {
      const target = Number(v?.target ?? v?.target_seconds ?? cfg?.video_metadata?.duration ?? 60) || 60;
      const progressSec = quest?.user_status?.progress?.[k]?.value ?? currentSeconds;
      return {
        taskType: k,
        taskKey: k,
        targetSeconds: target,
        target,
        currentSeconds: Number(progressSec) || 0,
        videoId: cfg?.video_metadata?.video_id || cfg?.videoMetadata?.videoId || v?.video_id || null,
        title: cfg?.video_metadata?.title || cfg?.messages?.quest_name || quest.id,
      };
    }
  }

  if (isVideoQuest(quest)) {
    const duration = Number(cfg?.video_metadata?.duration ?? cfg?.video_metadata?.duration_seconds ?? 60) || 60;
    return {
      taskType: 'WATCH_VIDEO',
      taskKey: 'WATCH_VIDEO',
      targetSeconds: duration,
      target: duration,
      currentSeconds: Number(currentSeconds) || 0,
      videoId: cfg?.video_metadata?.video_id || cfg?.videoMetadata?.videoId || null,
      title: cfg?.messages?.quest_name || quest.id,
    };
  }

  return null;
}

function getQuestTargetSeconds(quest) {
  if (!quest || typeof quest !== 'object') return 0;
  const tasks = extractQuestTasks(quest);

  for (const key of ALL_SUPPORTED_TASK_KEYS) {
    if (tasks[key]) {
      const target = Number(tasks[key].target ?? tasks[key].target_seconds ?? 0);
      if (target > 0) return target;
    }
  }

  for (const taskObj of Object.values(tasks)) {
    const target = Number(taskObj?.target ?? taskObj?.target_seconds ?? 0);
    if (target > 0) return target;
  }

  const cfg = quest.config || quest;
  if (cfg?.video_metadata?.duration) {
    return Number(cfg.video_metadata.duration) || 60;
  }

  return 900; // Mặc định 15 phút (900s) cho quest game nếu không khai báo rõ
}

function getQuestProgressSeconds(quest) {
  if (!quest || typeof quest !== 'object') return 0;
  const userStatus = quest.user_status || quest.userStatus;
  if (!userStatus) return 0;

  if (userStatus.completed_at || userStatus.completedAt) {
    return getQuestTargetSeconds(quest);
  }

  const progressMap = userStatus.progress;
  if (progressMap && typeof progressMap === 'object') {
    let maxVal = 0;
    for (const key of ALL_SUPPORTED_TASK_KEYS) {
      const entry = progressMap[key];
      if (entry && typeof entry === 'object') {
        const val = Number(entry.value ?? entry.progress ?? entry.heartbeat_progress ?? 0);
        if (val > maxVal) maxVal = val;
      } else if (typeof entry === 'number') {
        if (entry > maxVal) maxVal = entry;
      }
    }
    for (const entry of Object.values(progressMap)) {
      if (entry && typeof entry === 'object') {
        const val = Number(entry.value ?? entry.progress ?? entry.heartbeat_progress ?? 0);
        if (val > maxVal) maxVal = val;
      } else if (typeof entry === 'number' && entry > maxVal) {
        maxVal = entry;
      }
    }
    if (maxVal > 0) return maxVal;
  }

  const streamProgress = Number(
    userStatus.stream_progress_seconds ?? userStatus.streamProgressSeconds ?? 0
  );
  return streamProgress > 0 ? streamProgress : 0;
}

function getQuestApplicationInfo(quest) {
  if (!quest || typeof quest !== 'object') return null;
  const cfg = quest.config || quest;
  const app = cfg?.application || quest?.application || {};
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
    appId = app.id || cfg?.application_id || cfg?.applicationId || null;
  }
  if (!appName) {
    appName =
      app.name ||
      cfg?.messages?.game_title ||
      cfg?.messages?.gameTitle ||
      cfg?.messages?.quest_name ||
      cfg?.messages?.questName ||
      'Discord Quest Game';
  }

  let isStream = Boolean(tasks.STREAM_ON_DESKTOP);
  let taskType = null;

  for (const key of GAME_TASK_KEYS) {
    if (tasks[key]) {
      taskType = key;
      const t = tasks[key];
      if (!appId) {
        appId =
          t.application_id ||
          t.app_id ||
          t.external_ids?.[0] ||
          t.applications?.[0]?.id ||
          null;
      }
      break;
    }
  }

  if (!appId && quest.id) {
    appId = String(quest.id);
  }

  return {
    id: appId ? String(appId) : null,
    appId: appId ? String(appId) : null,
    applicationId: appId ? String(appId) : null,
    name: appName,
    appName: appName,
    applicationName: appName,
    taskType: taskType || (isVideoQuest(quest) ? 'WATCH_VIDEO' : 'PLAY_ON_DESKTOP'),
    isStream,
  };
}

function getQuestDisplayName(quest) {
  const cfg = quest?.config || quest || {};
  return (
    cfg?.messages?.quest_name ||
    cfg?.messages?.game_title ||
    cfg?.application?.name ||
    quest?.name ||
    `Quest #${quest?.id || 'unknown'}`
  );
}

function isExcludedQuest(quest) {
  if (!quest || typeof quest !== 'object') return true;
  const name = getQuestDisplayName(quest).toLowerCase();
  const appName = String(quest.config?.application?.name || '').toLowerCase();
  for (const kw of EXCLUDED_KEYWORDS) {
    if (name.includes(kw) || appName.includes(kw)) return true;
  }
  return false;
}

function isQuestActive(quest) {
  if (!quest || !quest.id) return false;
  if (isExcludedQuest(quest)) return false;

  const cfg = quest.config || quest;
  const now = Date.now();

  const exp = cfg.expires_at || cfg.expiresAt || quest.expires_at || quest.expiresAt;
  if (exp) {
    const expMs = new Date(exp).getTime();
    if (!Number.isNaN(expMs) && expMs <= now) {
      return false;
    }
  }

  // Cho phép dung sai lệch múi giờ/đồng hồ 5 phút với nhiệm vụ vừa mới mở
  const starts = cfg.starts_at || cfg.startsAt || quest.starts_at || quest.startsAt;
  if (starts) {
    const startMs = new Date(starts).getTime();
    if (!Number.isNaN(startMs) && startMs > now + 5 * 60 * 1000) {
      return false;
    }
  }

  return true;
}

function isQuestCompleted(quest) {
  const us = quest?.user_status || quest?.userStatus;
  if (!us) return false;
  if (us.completed_at || us.completedAt || us.claimed_at || us.claimedAt) return true;
  const target = getQuestTargetSeconds(quest);
  const current = getQuestProgressSeconds(quest);
  return target > 0 && current >= target;
}

function collectQuestsFromPayload(payload, excludedIdsSet = null) {
  if (!payload) return [];
  const list = [];
  const seen = new Set();
  const excludedIds = excludedIdsSet || new Set();

  if (Array.isArray(payload?.excluded_quests)) {
    for (const ex of payload.excluded_quests) {
      const exId = typeof ex === 'string' ? ex : ex?.id || ex?.quest_id;
      if (exId) excludedIds.add(String(exId));
    }
  }
  if (Array.isArray(payload?.excludedQuests)) {
    for (const ex of payload.excludedQuests) {
      const exId = typeof ex === 'string' ? ex : ex?.id || ex?.quest_id;
      if (exId) excludedIds.add(String(exId));
    }
  }

  const pushCandidate = (candidate, parentMeta = {}) => {
    if (!candidate || typeof candidate !== 'object') return;
    const q = candidate.quest && typeof candidate.quest === 'object' ? candidate.quest : candidate;
    const id = q.id || q.config?.id || candidate.id || candidate.quest_id;
    if (!id) return;
    const strId = String(id);
    if (excludedIds.has(strId)) return;
    if (typeof isExcludedQuest === 'function' && isExcludedQuest(q)) return;

    let config = null;
    if (q.config && typeof q.config === 'object') {
      config = q.config;
    } else if (
      q.task_config_v2 ||
      q.taskConfigV2 ||
      q.messages ||
      q.rewards_config ||
      q.rewardsConfig ||
      q.config_version ||
      q.configVersion
    ) {
      config = q;
    }

    const merged = {
      ...q,
      id: strId,
      config: config || q.config || null,
      traffic_metadata_raw:
        q.traffic_metadata_raw ||
        candidate.traffic_metadata_raw ||
        parentMeta.traffic_metadata_raw ||
        null,
      traffic_metadata_sealed:
        q.traffic_metadata_sealed ||
        candidate.traffic_metadata_sealed ||
        parentMeta.traffic_metadata_sealed ||
        null,
      metadata_raw: q.metadata_raw || candidate.metadata_raw || parentMeta.metadata_raw || null,
      metadata_sealed:
        q.metadata_sealed || candidate.metadata_sealed || parentMeta.metadata_sealed || null,
    };

    if (!seen.has(strId)) {
      seen.add(strId);
      list.push(merged);
    } else {
      const idx = list.findIndex((item) => item.id === strId);
      if (idx !== -1) {
        list[idx] = {
          ...list[idx],
          ...merged,
          user_status: merged.user_status || list[idx].user_status || null,
          config: merged.config || list[idx].config,
        };
      }
    }
  };

  function scan(obj, depth = 0, currentMeta = {}) {
    if (!obj || depth > 10) return;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (item && typeof item === 'object') scan(item, depth + 1, currentMeta);
      }
      return;
    }

    if (typeof obj === 'object') {
      const meta = {
        traffic_metadata_raw: obj.traffic_metadata_raw || currentMeta.traffic_metadata_raw || null,
        traffic_metadata_sealed: obj.traffic_metadata_sealed || currentMeta.traffic_metadata_sealed || null,
        metadata_raw: obj.metadata_raw || currentMeta.metadata_raw || null,
        metadata_sealed: obj.metadata_sealed || currentMeta.metadata_sealed || null,
      };

      // 1. Creative Content trong Ad Decisions
      if (obj.creative && typeof obj.creative === 'object') {
        const cc = obj.creative.creative_content || obj.creative.creativeContent;
        if (cc && typeof cc === 'object') {
          const ct = obj.creative.creative_type ?? obj.creative.creativeType;
          if (ct === 1 || (!ct && !cc.quest_ids && !cc.questIds)) {
            pushCandidate(cc, meta);
          }
          if (Array.isArray(cc.quest_ids)) {
            for (const qid of cc.quest_ids) {
              if (qid) pushCandidate({ id: qid }, meta);
            }
          }
          if (Array.isArray(cc.questIds)) {
            for (const qid of cc.questIds) {
              if (qid) pushCandidate({ id: qid }, meta);
            }
          }
        }
      }

      // 2. Direct quest candidate
      if (obj.quest && typeof obj.quest === 'object') {
        pushCandidate(obj.quest, meta);
      } else if (
        obj.config ||
        obj.task_config_v2 ||
        obj.taskConfigV2 ||
        obj.task_config ||
        obj.messages ||
        obj.rewards_config
      ) {
        pushCandidate(obj, meta);
      }

      // 3. Scan children (bỏ qua excluded_quests)
      for (const [k, val] of Object.entries(obj)) {
        if (k === 'excluded_quests' || k === 'excludedQuests') continue;
        if (val && typeof val === 'object') {
          scan(val, depth + 1, meta);
        }
      }
    }
  }

  scan(payload, 0, {
    traffic_metadata_raw: payload?.traffic_metadata_raw || null,
    traffic_metadata_sealed: payload?.traffic_metadata_sealed || null,
    metadata_raw: payload?.metadata_raw || null,
    metadata_sealed: payload?.metadata_sealed || null,
  });

  return list;
}

async function fetchUserInfo(token) {
  const f = getFetch();
  const res = await f('https://discord.com/api/v9/users/@me', {
    method: 'GET',
    headers: getHeaders(token),
  });
  if (!res.ok) {
    throw new Error(`Token Discord không hợp lệ hoặc đã hết hạn (HTTP ${res.status})`);
  }
  return await safeJson(res);
}

/**
 * Quét đa kênh (Multi-placement + Desktop & Mobile headers) để không bỏ sót bất kỳ Quest Video hoặc Game mới nào
 */
async function fetchQuests(token) {
  const f = getFetch();
  const excludedIds = new Set();
  const questMap = new Map();

  const mergeQuestList = (items) => {
    for (const q of items) {
      if (!q?.id) continue;
      const id = String(q.id);
      if (excludedIds.has(id)) continue;
      const existing = questMap.get(id);
      if (!existing) {
        questMap.set(id, q);
      } else {
        questMap.set(id, {
          ...existing,
          ...q,
          config: q.config || existing.config,
          user_status: q.user_status || existing.user_status || null,
          traffic_metadata_sealed:
            q.traffic_metadata_sealed || existing.traffic_metadata_sealed || null,
          traffic_metadata_raw: q.traffic_metadata_raw || existing.traffic_metadata_raw || null,
        });
      }
    }
  };

  // 1. Endpoint chính /quests/@me (Desktop)
  try {
    const resMain = await f('https://discord.com/api/v9/quests/@me', {
      method: 'GET',
      headers: getHeaders(token, 'https://discord.com/quest-home', 'desktop'),
    });
    if (resMain.ok) {
      const dataMain = await safeJson(resMain);
      mergeQuestList(collectQuestsFromPayload(dataMain, excludedIds));
    }
  } catch {}

  // 2. Quét thêm tất cả các placement của get-decisions & decision (bao gồm cả Mobile header để bắt Mobile Video Quest mới ra)
  const hbSessionId = randomUUID();
  const adSessionId = randomUUID();
  const discoveryRequests = [
    {
      url: `https://discord.com/api/v9/quests/get-decisions?placement=11&client_heartbeat_session_id=${hbSessionId}&client_ad_session_id=${adSessionId}`,
      platform: 'desktop',
    },
    {
      url: `https://discord.com/api/v9/quests/get-decisions?placement=3&client_heartbeat_session_id=${hbSessionId}&client_ad_session_id=${adSessionId}`,
      platform: 'desktop',
    },
    {
      url: `https://discord.com/api/v9/quests/get-decisions?placement=1&client_heartbeat_session_id=${hbSessionId}&client_ad_session_id=${adSessionId}`,
      platform: 'desktop',
    },
    {
      url: `https://discord.com/api/v9/quests/get-decisions?placement=4&client_heartbeat_session_id=${hbSessionId}&client_ad_session_id=${adSessionId}`,
      platform: 'desktop',
    },
    {
      url: `https://discord.com/api/v9/quests/get-decisions?placement=0&client_heartbeat_session_id=${hbSessionId}&client_ad_session_id=${adSessionId}`,
      platform: 'desktop',
    },
    {
      url: `https://discord.com/api/v9/quests/get-decisions?placement=11&client_heartbeat_session_id=${hbSessionId}&client_ad_session_id=${adSessionId}`,
      platform: 'mobile',
    },
    { url: 'https://discord.com/api/v9/quests/@me', platform: 'mobile' },
    { url: 'https://discord.com/api/v9/quests/decision?placement=11', platform: 'desktop' },
    { url: 'https://discord.com/api/v9/quests/decision?placement=3', platform: 'desktop' },
  ];

  const settled = await Promise.allSettled(
    discoveryRequests.map((req) =>
      f(req.url, {
        method: 'GET',
        headers: getHeaders(token, 'https://discord.com/quest-home', req.platform),
      }).then(async (r) => (r.ok ? safeJson(r) : null))
    )
  );

  for (const item of settled) {
    if (item.status === 'fulfilled' && item.value) {
      mergeQuestList(collectQuestsFromPayload(item.value, excludedIds));
    }
  }

  // 3. Với các quest từ get-decisions thiếu config hoặc thiếu task_config, fetch chi tiết từng quest
  const resultList = [];
  for (const [id, q] of questMap.entries()) {
    if (excludedIds.has(id)) continue;
    let enriched = q;
    const hasTasks = Object.keys(extractQuestTasks(enriched)).length > 0;
    if (!hasTasks) {
      try {
        const detailRes = await f(`https://discord.com/api/v9/quests/${id}`, {
          method: 'GET',
          headers: getHeaders(token),
        });
        if (detailRes.ok) {
          const detail = await safeJson(detailRes);
          if (detail) {
            const cfg = detail.config || detail;
            enriched = {
              ...enriched,
              ...detail,
              id,
              config: cfg,
              user_status: detail.user_status || enriched.user_status || null,
            };
          }
        }
      } catch {}
    }
    if (!isExcludedQuest(enriched)) {
      resultList.push(enriched);
    }
  }

  return resultList;
}

/**
 * Tự động nhận (Accept/Enroll) cả nhiệm vụ Video (Desktop/Mobile) và Game,
 * đồng thời cập nhật ngay `questObj.user_status` để bước gửi progress không bao giờ bị lỗi.
 */
async function enrollQuest(token, questId, platformOrQuest = 0, maybeQuest = null) {
  const f = getFetch();
  let platform = 0;
  let questObj = null;

  if (typeof platformOrQuest === 'object' && platformOrQuest !== null) {
    questObj = platformOrQuest;
    platform = 0;
  } else {
    platform = typeof platformOrQuest === 'number' ? platformOrQuest : 0;
    questObj = maybeQuest;
  }

  const tasks = questObj ? extractQuestTasks(questObj) : {};
  const isVideo = questObj ? isVideoQuest(questObj) : (platform === -1 || platform === null || platform === false);
  const isMobileVideo = questObj ? isMobileVideoOnlyQuest(questObj) : false;
  const platformType = isMobileVideo ? 'mobile' : 'desktop';

  let selectedPlatform = platform;
  if (questObj && !isVideo) {
    if (tasks.PLAY_ON_MOBILE || tasks.WATCH_VIDEO_ON_MOBILE) {
      selectedPlatform = 2;
    } else if (tasks.PLAY_ON_PLAYSTATION || tasks.PLAY_ON_XBOX) {
      selectedPlatform = 1;
    } else {
      selectedPlatform = typeof platform === 'number' && platform >= 0 ? platform : 0;
    }
  }

  const sealed = questObj?.traffic_metadata_sealed || questObj?.metadata_sealed || null;
  const rawMeta = questObj?.traffic_metadata_raw || questObj?.metadata_raw || null;

  const enrollBodies = [];
  if (sealed) {
    enrollBodies.push(
      {
        location: 11,
        is_targeted: true,
        metadata_raw: rawMeta,
        metadata_sealed: sealed,
        traffic_metadata_raw: rawMeta,
        traffic_metadata_sealed: sealed,
      },
      { location: 11, is_targeted: false, metadata_sealed: null, traffic_metadata_sealed: sealed },
      { location: 3, is_targeted: false, metadata_sealed: null, traffic_metadata_sealed: sealed }
    );
  }

  enrollBodies.push(
    { location: 11, is_targeted: false, metadata_raw: null, metadata_sealed: null },
    { location: 3, is_targeted: false, metadata_raw: null, metadata_sealed: null },
    { location: 11, is_targeted: false, metadata_sealed: null },
    { location: 3, is_targeted: false, metadata_sealed: null },
    { location: 11 },
    { location: 3 },
    { location: 1 },
    { location: 0 },
    {}
  );

  if (!isVideo) {
    enrollBodies.push({ location: 11, platform: selectedPlatform, is_targeted: false, metadata_sealed: null });
    enrollBodies.push({ platform: selectedPlatform });
  }

  let enrolledData = null;
  let lastStatus = 0;
  let lastErrorText = '';

  const platformOrder = isMobileVideo ? ['mobile', 'desktop'] : ['desktop', 'mobile'];

  outerLoop: for (const pType of platformOrder) {
    for (const bodyObj of enrollBodies) {
      try {
        const res = await f(`https://discord.com/api/v9/quests/${questId}/enroll`, {
          method: 'POST',
          headers: getHeaders(token, 'https://discord.com/quest-home', pType),
          body: JSON.stringify(bodyObj),
        });
        lastStatus = res.status;

        if (res.ok) {
          enrolledData = (await safeJson(res)) || { enrolled_at: new Date().toISOString() };
          break outerLoop;
        }

        const errData = await safeJson(res);
        const errMsg = String(errData?.message || '').toLowerCase();
        lastErrorText = errData?.message || `HTTP ${res.status}`;

        // Đã đăng ký trước đó -> coi như enroll thành công
        if (
          res.status === 400 &&
          (errData?.code === 260002 || errMsg.includes('already') || errMsg.includes('enrolled'))
        ) {
          enrolledData = { enrolled_at: new Date().toISOString(), alreadyEnrolled: true };
          break outerLoop;
        }

        if (res.status === 429) {
          const retryAfter = Number(errData?.retry_after || 2) * 1000;
          await sleep(Math.min(8000, Math.max(1500, retryAfter)));
        }
      } catch (err) {
        lastErrorText = err.message;
      }
    }
  }

  if (!enrolledData) {
    return {
      ok: false,
      success: false,
      status: lastStatus,
      error: lastErrorText || 'Không thể enroll nhiệm vụ',
    };
  }

  // Tuyệt đối KHÔNG gọi select-task-platform với nhiệm vụ video (tránh khóa quest vào desktop game)
  if (!isVideo && typeof selectedPlatform === 'number' && selectedPlatform >= 0) {
    try {
      await f(`https://discord.com/api/v9/quests/${questId}/select-task-platform`, {
        method: 'POST',
        headers: getHeaders(token, 'https://discord.com/quest-home', selectedPlatform === 2 ? 'mobile' : 'desktop'),
        body: JSON.stringify({ platform: selectedPlatform }),
      });
    } catch {}
  }

  // Đồng bộ trực tiếp vào questObj.user_status để tránh lỗi null user_status ở bước làm nhiệm vụ
  if (questObj && typeof questObj === 'object') {
    questObj.user_status = {
      ...(questObj.user_status || {}),
      ...(typeof enrolledData === 'object' ? enrolledData : {}),
      enrolled_at:
        enrolledData?.enrolled_at ||
        questObj.user_status?.enrolled_at ||
        new Date().toISOString(),
    };
  }

  return {
    ok: true,
    success: true,
    status: lastStatus || 200,
    data: enrolledData,
  };
}

async function sendVideoProgress(token, questId, timestampSeconds, platformTypeOrRetries = 'desktop', maybeRetries = 3) {
  let platformType = 'desktop';
  let retries = 3;
  if (typeof platformTypeOrRetries === 'number') {
    retries = platformTypeOrRetries;
    platformType = 'desktop';
  } else if (typeof platformTypeOrRetries === 'string') {
    platformType = platformTypeOrRetries;
    retries = typeof maybeRetries === 'number' ? maybeRetries : 3;
  }

  const f = getFetch();
  const payloadTs = Number(Math.max(0, Number(timestampSeconds) || 0).toFixed(6));

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await f(`https://discord.com/api/v9/quests/${questId}/video-progress`, {
        method: 'POST',
        headers: getHeaders(token, 'https://discord.com/quest-home', platformType),
        body: JSON.stringify({ timestamp: payloadTs }),
      });

      const data = await safeJson(res);
      if (res.ok) {
        return {
          ok: true,
          success: true,
          status: res.status,
          timestamp: payloadTs,
          data,
          completed: data?.completed !== undefined ? Boolean(data.completed) : true,
          ...(typeof data === 'object' ? data : {}),
        };
      }

      if (attempt < retries && (res.status === 400 || res.status === 429)) {
        const waitMs = res.status === 429 ? Number(data?.retry_after || 2) * 1000 : 200;
        await sleep(waitMs);
        continue;
      }

      return {
        ok: false,
        success: false,
        status: res.status,
        timestamp: payloadTs,
        data,
        completed: false,
        ...(typeof data === 'object' ? data : {}),
      };
    } catch (err) {
      if (attempt < retries) {
        await sleep(200);
        continue;
      }
      return {
        ok: false,
        success: false,
        status: 0,
        error: err.message,
        completed: false,
      };
    }
  }
}

async function sendHeartbeat(token, questId, streamKey = null, options = {}) {
  const f = getFetch();
  const applicationId = options.applicationId || options.appId || null;
  const terminal = Boolean(options.terminal);
  const effectiveUserId = options.userId || getUserIdFromToken(token) || '0';
  const fakeChannelId = options.channelId || '1000000000000000000';
  const selfCallKey = `call:${fakeChannelId}:${effectiveUserId}`;

  const candidateBodies = [];
  if (streamKey && applicationId) {
    candidateBodies.push({
      stream_key: streamKey,
      application_id: String(applicationId),
      terminal,
    });
  }
  if (streamKey) {
    candidateBodies.push({
      stream_key: streamKey,
      terminal,
    });
  }
  if (applicationId) {
    candidateBodies.push({
      stream_key: selfCallKey,
      application_id: String(applicationId),
      terminal,
    });
    candidateBodies.push({
      application_id: String(applicationId),
      terminal,
    });
  }
  candidateBodies.push({
    stream_key: selfCallKey,
    terminal,
  });
  candidateBodies.push({ terminal });

  let lastStatus = 0;
  let lastData = null;

  for (const bodyObj of candidateBodies) {
    try {
      const res = await f(`https://discord.com/api/v9/quests/${questId}/heartbeat`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify(bodyObj),
      });
      lastStatus = res.status;
      lastData = await safeJson(res);

      if (res.ok) {
        return {
          ok: true,
          status: res.status,
          data: lastData,
        };
      }

      if (res.status === 429) {
        const retryMs = Number(lastData?.retry_after || 2) * 1000;
        await sleep(Math.min(8000, Math.max(1500, retryMs)));
      }
    } catch {}
  }

  return {
    ok: false,
    status: lastStatus,
    data: lastData,
  };
}

async function claimQuestReward(token, questId, platform = 0) {
  const f = getFetch();
  const bodies = [{ platform, location: 11 }, { platform }, {}];
  for (const body of bodies) {
    try {
      const res = await f(`https://discord.com/api/v9/quests/${questId}/claim-reward`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify(body),
      });
      if (res.ok) {
        return { ok: true, success: true, data: await safeJson(res) };
      }
    } catch {}
  }
  return { ok: false, success: false };
}

/**
 * Hoàn thành 100% nhiệm vụ Video (Hỗ trợ cả WATCH_VIDEO & WATCH_VIDEO_ON_MOBILE).
 * Mặc định KHÔNG gọi claimQuestReward (autoClaim = false).
 */
async function completeVideoQuest(token, quest, options = {}) {
  const questId = String(quest.id);
  const questName = getQuestDisplayName(quest);
  const videoInfo = getVideoTaskInfo(quest);
  const targetSeconds = Math.max(1, Number(videoInfo?.targetSeconds || getQuestTargetSeconds(quest) || 60));
  const platformType = isMobileVideoOnlyQuest(quest) ? 'mobile' : 'desktop';
  const isFastTest = Boolean(options.fastTest);
  const stepDelayMs = isFastTest ? 5 : Math.max(250, Number(options.videoStepDelayMs ?? 1000));
  const stepSeconds = isFastTest ? 15 : Math.max(5, Math.min(15, Number(options.videoStepSeconds ?? 10)));
  // Mặc định KHÔNG claim trừ khi options.autoClaim === true
  const shouldClaim = options.autoClaim === true;

  // Đảm bảo quest đã được enroll trước khi gửi tiến độ video
  if (!quest.user_status?.enrolled_at) {
    const enrollRes = await enrollQuest(token, questId, quest);
    if (!enrollRes.ok) {
      return {
        success: false,
        questId,
        questName,
        type: 'video',
        enrolled: false,
        completed: false,
        claimed: false,
        error: enrollRes.error || 'Không thể nhận (enroll) nhiệm vụ Video',
      };
    }
  }

  let currentSeconds = getQuestProgressSeconds(quest);
  if (isQuestCompleted(quest)) {
    let claimed = Boolean(quest.user_status?.claimed_at);
    if (!claimed && shouldClaim) {
      const claimRes = await claimQuestReward(token, questId, 0);
      claimed = Boolean(claimRes.ok);
    }
    return {
      success: true,
      questId,
      questName,
      type: 'video',
      enrolled: true,
      completed: true,
      alreadyDone: true,
      claimed,
      readyToClaim: !claimed,
      requiresDesktop: false,
      currentSeconds: targetSeconds,
      progressSeconds: targetSeconds,
      targetSeconds,
      progressPercent: 100,
      message: claimed ? 'Nhiệm vụ đã hoàn thành tiến độ! Đã nhận thưởng thành công.' : 'Nhiệm vụ video này đã hoàn thành từ trước.',
    };
  }

  if (typeof options.onProgress === 'function') {
    options.onProgress({
      step: 'quest_start',
      type: 'video',
      questId,
      questName,
      message: `Đang xử lý Video Quest: ${questName} (${currentSeconds}/${targetSeconds}s)`,
    });
  }

  // Gửi mốc khởi đầu (nếu đang ở 0s) để kích hoạt phiên xem video trên server Discord
  if (currentSeconds <= 0) {
    await sendVideoProgress(token, questId, Math.min(1, targetSeconds), platformType);
  }

  let serverCompleted = false;
  let safetyCounter = 0;
  const maxSteps = Math.ceil(targetSeconds / stepSeconds) + 8;

  while (currentSeconds < targetSeconds && safetyCounter < maxSteps) {
    safetyCounter++;
    currentSeconds = Math.min(targetSeconds, currentSeconds + stepSeconds);

    const res = await sendVideoProgress(token, questId, currentSeconds, platformType);
    if (!res.ok && platformType === 'desktop') {
      // Fallback sang mobile header nếu video yêu cầu mobile
      await sendVideoProgress(token, questId, currentSeconds, 'mobile');
    }

    if (res.data && typeof res.data === 'object') {
      quest.user_status = { ...(quest.user_status || {}), ...res.data };
      if (res.data.completed_at) {
        serverCompleted = true;
      }
    }

    const percent = Math.min(100, Math.round((currentSeconds / targetSeconds) * 100));
    if (typeof options.onProgress === 'function') {
      options.onProgress({
        step: 'progress',
        type: 'video',
        questId,
        questName,
        currentSeconds: Math.round(currentSeconds),
        targetSeconds,
        percent,
      });
    }

    if (serverCompleted || currentSeconds >= targetSeconds) break;
    await sleep(stepDelayMs);
  }

  // Chốt mốc cuối cùng tại đúng targetSeconds để đảm bảo server ghi nhận 100%
  const finalRes = await sendVideoProgress(token, questId, targetSeconds, platformType);
  if (finalRes.data && typeof finalRes.data === 'object') {
    quest.user_status = { ...(quest.user_status || {}), ...finalRes.data };
    if (finalRes.data.completed_at) serverCompleted = true;
  }

  let claimed = false;
  if (shouldClaim) {
    const claimRes = await claimQuestReward(token, questId, 0);
    claimed = Boolean(claimRes.ok);
  }

  return {
    success: true,
    questId,
    questName,
    type: 'video',
    enrolled: true,
    completed: true,
    claimed,
    readyToClaim: !claimed,
    requiresDesktop: false,
    currentSeconds: targetSeconds,
    progressSeconds: targetSeconds,
    targetSeconds,
    progressPercent: 100,
    message: claimed ? 'Nhiệm vụ đã hoàn thành tiến độ! Đã nhận thưởng thành công.' : 'Hoàn thành 100% Video Quest (Không tự động Claim)',
  };
}

/**
 * Hoàn thành nhiệm vụ đơn lẻ (Tự động phân nhánh Video Quest hoặc Game/Stream/Activity Quest).
 * Mặc định KHÔNG gọi claimQuestReward (autoClaim = false).
 */
async function completeSingleQuest(token, quest, options = {}) {
  if (!quest || !quest.id) {
    return { success: false, error: 'Quest không hợp lệ' };
  }

  if (isVideoQuest(quest)) {
    return await completeVideoQuest(token, quest, options);
  }

  const tasks = extractQuestTasks(quest);
  const isActivity = Boolean(tasks.PLAY_ACTIVITY);
  const questId = String(quest.id);
  const questName = getQuestDisplayName(quest);
  const appInfo = getQuestApplicationInfo(quest);
  const targetSeconds = Math.max(1, getQuestTargetSeconds(quest));
  const isFastTest = Boolean(options.fastTest);
  const heartbeatDelayMs = isFastTest ? 10 : Math.max(500, Number(options.heartbeatDelayMs ?? 20000));
  // Mặc định KHÔNG claim trừ khi options.autoClaim === true
  const shouldClaim = options.autoClaim === true;

  if (!quest.user_status?.enrolled_at) {
    const enrollRes = await enrollQuest(token, questId, quest);
    if (!enrollRes.ok) {
      return {
        success: false,
        questId,
        questName,
        type: isActivity ? 'activity' : 'game',
        enrolled: false,
        completed: false,
        claimed: false,
        requiresDesktop: false,
        error: enrollRes.error || 'Không thể nhận (enroll) nhiệm vụ Game',
      };
    }
  }

  let currentSeconds = getQuestProgressSeconds(quest);
  if (isQuestCompleted(quest)) {
    let claimed = Boolean(quest.user_status?.claimed_at);
    if (!claimed && shouldClaim) {
      const claimRes = await claimQuestReward(token, questId, 0);
      claimed = Boolean(claimRes.ok);
    }
    return {
      success: true,
      questId,
      questName,
      type: isActivity ? 'activity' : 'game',
      enrolled: true,
      completed: true,
      alreadyDone: true,
      claimed,
      readyToClaim: !claimed,
      requiresDesktop: false,
      currentSeconds: targetSeconds,
      progressSeconds: targetSeconds,
      targetSeconds,
      progressPercent: 100,
      message: claimed ? 'Nhiệm vụ đã hoàn thành tiến độ! Đã nhận thưởng thành công.' : 'Nhiệm vụ này đã hoàn thành từ trước.',
    };
  }

  if (typeof options.onProgress === 'function') {
    options.onProgress({
      step: 'quest_start',
      type: 'game',
      questId,
      questName,
      message: `Đang xử lý Game Quest: ${questName} (${currentSeconds}/${targetSeconds}s)`,
    });
  }

  const gateway = new DiscordUserGateway(token);
  await gateway.connect(appInfo);

  const userId = options.userId || getUserIdFromToken(token) || '0';
  const streamKey = options.streamKey || `call:1000000000000000000:${userId}`;
  const maxAttempts = isFastTest ? 10 : Math.max(60, Math.ceil(targetSeconds / 15) + 25);

  let completed = false;
  let attempts = 0;

  try {
    while (currentSeconds < targetSeconds && attempts < maxAttempts) {
      attempts++;
      const hbRes = await sendHeartbeat(token, questId, streamKey, {
        applicationId: appInfo?.id,
        userId,
        terminal: false,
      });

      if (hbRes.ok && hbRes.data && typeof hbRes.data === 'object') {
        quest.user_status = {
          ...(quest.user_status || {}),
          ...hbRes.data,
          progress: hbRes.data.progress || quest.user_status?.progress,
        };
        const updatedProgress = getQuestProgressSeconds(quest);
        if (updatedProgress > currentSeconds) {
          currentSeconds = updatedProgress;
        } else {
          currentSeconds = Math.min(targetSeconds, currentSeconds + (isFastTest ? 300 : 30));
        }

        if (hbRes.data.completed_at || currentSeconds >= targetSeconds) {
          completed = true;
        }
      } else if (isFastTest && hbRes.ok) {
        currentSeconds = targetSeconds;
        completed = true;
      } else {
        // Nếu heartbeat trả lỗi tạm thời, thử refresh tiến độ từ API quest detail
        try {
          const f = getFetch();
          const checkRes = await f('https://discord.com/api/v9/quests/@me', {
            method: 'GET',
            headers: getHeaders(token),
          });
          if (checkRes.ok) {
            const payload = await safeJson(checkRes);
            const freshList = collectQuestsFromPayload(payload);
            const matched = freshList.find((q) => String(q.id) === questId);
            if (matched) {
              quest.user_status = matched.user_status || quest.user_status;
              currentSeconds = getQuestProgressSeconds(quest);
              if (isQuestCompleted(quest)) completed = true;
            }
          }
        } catch {}
      }

      const percent = Math.min(100, Math.round((currentSeconds / targetSeconds) * 100));
      if (typeof options.onProgress === 'function') {
        options.onProgress({
          step: 'progress',
          type: 'game',
          questId,
          questName,
          currentSeconds: Math.round(currentSeconds),
          targetSeconds,
          percent,
        });
      }

      if (completed || currentSeconds >= targetSeconds) {
        completed = true;
        break;
      }

      await sleep(heartbeatDelayMs);
    }

    // Gửi gói heartbeat kết thúc (terminal: true)
    await sendHeartbeat(token, questId, streamKey, {
      applicationId: appInfo?.id,
      userId,
      terminal: true,
    });
  } finally {
    gateway.close();
  }

  let claimed = false;
  if (completed && shouldClaim) {
    const claimRes = await claimQuestReward(token, questId, 0);
    claimed = Boolean(claimRes.ok);
  }

  return {
    success: completed,
    questId,
    questName,
    type: isActivity ? 'activity' : 'game',
    enrolled: true,
    completed,
    claimed,
    readyToClaim: completed && !claimed,
    requiresDesktop: false,
    currentSeconds: Math.min(targetSeconds, Math.round(currentSeconds)),
    progressSeconds: Math.min(targetSeconds, Math.round(currentSeconds)),
    targetSeconds,
    progressPercent: Math.min(100, Math.round((currentSeconds / targetSeconds) * 100)),
    message: completed
      ? (claimed ? 'Đã hoàn thành 100% thời gian chơi & Nhận thưởng thành công!' : 'Hoàn thành 100% Game Quest (Không tự động Claim)')
      : `Tiến độ đạt ${Math.round(currentSeconds)}/${targetSeconds}s (sẽ tiếp tục ở chu kỳ quét kế tiếp)`,
  };
}

/**
 * Luồng chạy tổng hợp đa vòng (Multi-Pass) cho User Token:
 * - Tự động nhận (Enroll) 100% nhiệm vụ Video + Game ngay lập tức.
 * - Đồng bộ lại danh sách từ `/quests/@me` sau khi Enroll để có `user_status` chuẩn.
 * - Hoàn thành toàn bộ Video Quests và Game Quests (quét vét tới 3 vòng nếu có nhiệm vụ mới/sót).
 * - Mặc định `autoClaim = false` (chỉ hoàn thành 100%, không tự động Claim).
 */
async function runAutoQuestForToken(token, options = {}) {
  const cleanToken = normalizeToken(token);
  if (!cleanToken) {
    throw new Error('User Token không được để trống.');
  }

  // Mặc định KHÔNG claim theo yêu cầu
  const runOptions = {
    ...options,
    autoClaim: options.autoClaim === true,
  };

  const user = await fetchUserInfo(cleanToken);
  const accountTag = user.global_name
    ? `${user.global_name} (@${user.username})`
    : `${user.username}#${user.discriminator || '0'}`;

  if (typeof runOptions.onProgress === 'function') {
    runOptions.onProgress({
      step: 'auth',
      message: `Đã xác thực tài khoản: ${accountTag} (ID: ${user.id})`,
    });
  }

  const maxPasses = Number(runOptions.maxPasses ?? 2);
  const resultsMap = new Map();
  let totalEnrolledCount = 0;

  for (let pass = 1; pass <= maxPasses; pass++) {
    let allQuests = await fetchQuests(cleanToken);
    let activeQuests = allQuests.filter((q) => isQuestActive(q));

    if (activeQuests.length === 0) break;

    // PHASE 1: Tự động nhận (Enroll) toàn bộ nhiệm vụ Video & Game chưa nhận
    let newlyEnrolledInPass = 0;
    for (const q of activeQuests) {
      if (isQuestCompleted(q)) continue;
      if (!q.user_status?.enrolled_at) {
        const enrollRes = await enrollQuest(cleanToken, q.id, q);
        if (enrollRes.ok) {
          newlyEnrolledInPass++;
          totalEnrolledCount++;
        }
      } else if (pass === 1) {
        totalEnrolledCount++;
      }
    }

    // Nếu vừa enroll nhiệm vụ mới, fetch lại `/quests/@me` để đồng bộ `user_status` chuẩn từ Discord server
    if (newlyEnrolledInPass > 0) {
      await sleep(runOptions.fastTest ? 5 : 600);
      const syncedQuests = await fetchQuests(cleanToken);
      if (syncedQuests.length > 0) {
        const syncMap = new Map(syncedQuests.map((sq) => [String(sq.id), sq]));
        activeQuests = activeQuests.map((oldQ) => {
          const freshQ = syncMap.get(String(oldQ.id));
          if (!freshQ) return oldQ;
          return {
            ...oldQ,
            ...freshQ,
            user_status: freshQ.user_status || oldQ.user_status,
          };
        });
      }
    }

    // Phân loại nhiệm vụ: ưu tiên Video Quests và Game Quests chưa xong lên trước, alreadyDone gom sau
    const pendingVideoQuests = [];
    const pendingGameQuests = [];
    const alreadyDoneQuests = [];

    for (const q of activeQuests) {
      if (isQuestCompleted(q)) {
        alreadyDoneQuests.push(q);
        continue;
      }

      if (isVideoQuest(q)) {
        pendingVideoQuests.push(q);
      } else {
        pendingGameQuests.push(q);
      }
    }

    // PHASE 2: Hoàn thành 100% toàn bộ Video Quests trước (vì Video Quest xử lý rất nhanh)
    for (const vq of pendingVideoQuests) {
      const res = await completeVideoQuest(cleanToken, vq, {
        ...runOptions,
        userId: user.id,
      });
      resultsMap.set(String(vq.id), res);
    }

    // PHASE 3: Hoàn thành 100% toàn bộ Game / Stream / Activity Quests
    for (const gq of pendingGameQuests) {
      const res = await completeSingleQuest(cleanToken, gq, {
        ...runOptions,
        userId: user.id,
      });
      resultsMap.set(String(gq.id), res);
    }

    // PHASE 4: Ghi nhận các nhiệm vụ đã hoàn thành từ trước (alreadyDone)
    for (const q of alreadyDoneQuests) {
      if (!resultsMap.has(String(q.id))) {
        resultsMap.set(String(q.id), {
          success: true,
          questId: String(q.id),
          questName: getQuestDisplayName(q),
          type: isVideoQuest(q) ? 'video' : 'game',
          enrolled: true,
          completed: true,
          alreadyDone: true,
          claimed: false,
          readyToClaim: false,
          requiresDesktop: false,
          progressPercent: 100,
          message: 'Đã hoàn thành từ trước',
        });
      }
    }

    if (pendingVideoQuests.length === 0 && pendingGameQuests.length === 0) {
      break;
    }
  }

  const results = Array.from(resultsMap.values());
  const completedCount = results.filter((r) => r.completed).length;
  const claimedCount = results.filter((r) => r.claimed && !r.alreadyDone).length;
  const readyToClaimCount = results.filter((r) => r.readyToClaim || (r.completed && !r.claimed && !r.alreadyDone)).length;

  return {
    success: true,
    user,
    accountTag,
    totalQuests: results.length,
    questsCount: results.length,
    enrolledCount: totalEnrolledCount,
    completedCount,
    claimedCount,
    readyToClaimCount,
    results,
    actions: results,
  };
}

module.exports = {
  setFetchImplementation,
  setWebSocketImplementation,
  DiscordUserGateway,
  extractQuestTasks,
  isVideoQuest,
  isMobileVideoOnlyQuest,
  getVideoTaskInfo,
  getQuestProgressSeconds,
  getQuestTargetSeconds,
  getQuestApplicationInfo,
  getQuestDisplayName,
  fetchUserInfo,
  collectQuestsFromPayload,
  fetchQuests,
  enrollQuest,
  sendHeartbeat,
  sendVideoProgress,
  claimQuestReward,
  completeVideoQuest,
  completeSingleQuest,
  isQuestActive,
  isQuestCompleted,
  isExcludedQuest,
  getUserIdFromToken,
  runAutoQuestForToken,
  executeAutoQuestFlow: runAutoQuestForToken,
  getSuperProperties,
  getHeaders,
};