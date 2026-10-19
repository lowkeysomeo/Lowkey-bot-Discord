'use strict';

/**
 * Lowkey Quest Scheduler
 * Hệ thống quét định kỳ tự động làm Discord Quests và săn ORBs khi có nhiệm vụ mới
 */

const fs = require('node:fs');
const path = require('node:path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getDb } = require('./database');
const {
  fetchQuests,
  enrollQuest,
  sendVideoProgress,
  claimQuestReward,
  completeVideoQuest,
  completeSingleQuest,
  fetchUserInfo,
  isQuestActive,
  isVideoQuest,
  extractQuestTasks,
} = require('./questTokenWorker');

const TOKEN_CACHE_PATH = path.join(__dirname, '..', 'data', 'saved_quest_token.txt');
const DEFAULT_INTERVAL_MINUTES = 20;

let schedulerTimer = null;
let discordClient = null;
let isScanning = false;
const activeUserJobs = new Map();

function isUserJobRunning(userId) {
  return activeUserJobs.has(userId);
}

function getIntervalMs() {
  const envVal = parseInt(process.env.QUEST_SCAN_INTERVAL_MINUTES, 10);
  const minutes = Number.isFinite(envVal) && envVal >= 5 ? envVal : DEFAULT_INTERVAL_MINUTES;
  return minutes * 60 * 1000;
}

function isQuestNotified(userId, questId) {
  try {
    const row = getDb()
      .prepare('SELECT 1 FROM quest_notified_completions WHERE user_id = ? AND quest_id = ?')
      .get(String(userId), String(questId));
    return !!row;
  } catch {
    return false;
  }
}

function markQuestNotified(userId, questId) {
  try {
    getDb()
      .prepare('INSERT OR REPLACE INTO quest_notified_completions (user_id, quest_id, notified_at) VALUES (?, ?, ?)')
      .run(String(userId), String(questId), Date.now());
  } catch (e) {
    console.warn('[QUEST SCHEDULER] markQuestNotified error:', e.message);
  }
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

function getSubscriber(userId) {
  const db = getDb();
  let sub = db.prepare('SELECT * FROM quest_subscribers WHERE user_id = ?').get(userId);
  if (!sub) {
    const { isOwner } = require('./questAuth');
    if (isOwner(userId) && fs.existsSync(TOKEN_CACHE_PATH)) {
      try {
        const token = fs.readFileSync(TOKEN_CACHE_PATH, 'utf8').trim();
        if (token && token.length > 20) {
          registerSubscriber(userId, token, 'Bot Owner', 1);
          sub = db.prepare('SELECT * FROM quest_subscribers WHERE user_id = ?').get(userId);
        }
      } catch (e) {}
    }
  }
  return sub;
}

function listSubscribers(onlyEnabled = true) {
  const db = getDb();
  const rows = onlyEnabled
    ? db.prepare('SELECT * FROM quest_subscribers WHERE enabled = 1').all()
    : db.prepare('SELECT * FROM quest_subscribers').all();
  const { isApproved, isOwner } = require('./questAuth');
  const now = Date.now();
  return rows.filter((r) => {
    if (!isApproved(r.user_id)) return false;
    // CHỈ ADMIN MỚI ĐƯỢC GÓI VÔ THỜI HẠN (expires_at = 0)
    if (!isOwner(r.user_id)) {
      if (!r.expires_at || r.expires_at <= 0 || r.expires_at < now) {
        return false;
      }
    }
    return true;
  });
}

function registerSubscriber(userId, token, username = null, notifyDm = 1, packageType = 'monthly', expiresAt = null) {
  const db = getDb();
  const now = Date.now();
  const { isOwner } = require('./questAuth');
  const isAdmin = isOwner(userId);

  // CHỈ ADMIN MỚI ĐƯỢC GÓI VÔ THỜI HẠN (expires_at = 0).
  // Thành viên thông thường: Không được phép có expires_at = 0.
  let finalExpiresAt;
  if (isAdmin) {
    finalExpiresAt = (expiresAt !== null && expiresAt !== undefined) ? expiresAt : 0;
  } else {
    if (expiresAt && expiresAt > 0) {
      finalExpiresAt = expiresAt;
    } else {
      // Giữ nguyên hạn nếu tài khoản đang có hạn còn hiệu lực
      const existing = db.prepare('SELECT expires_at FROM quest_subscribers WHERE user_id = ?').get(String(userId));
      if (existing && existing.expires_at && existing.expires_at > now) {
        finalExpiresAt = existing.expires_at;
      } else {
        const perm = db.prepare('SELECT expires_at FROM quest_permissions WHERE user_id = ?').get(String(userId));
        if (perm && perm.expires_at && perm.expires_at > now) {
          finalExpiresAt = perm.expires_at;
        } else {
          // Mặc định gói trải nghiệm 10 ngày cho thành viên thường
          finalExpiresAt = now + (10 * 24 * 60 * 60 * 1000);
        }
      }
    }
  }

  db.prepare(`
    INSERT INTO quest_subscribers (user_id, token, username, notify_dm, enabled, package_type, expires_at, created_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      token = excluded.token,
      username = coalesce(excluded.username, quest_subscribers.username),
      notify_dm = excluded.notify_dm,
      package_type = coalesce(excluded.package_type, quest_subscribers.package_type),
      expires_at = excluded.expires_at,
      enabled = 1
  `).run(String(userId), token.trim(), username, notifyDm ? 1 : 0, packageType, finalExpiresAt, now);

  // Đồng bộ file cache nếu là bot Owner
  try {
    if (isAdmin) {
      const dir = path.dirname(TOKEN_CACHE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(TOKEN_CACHE_PATH, token.trim(), 'utf8');
    }
  } catch (e) {
    console.warn('[QUEST SCHEDULER] Không thể đồng bộ TOKEN_CACHE_PATH:', e.message);
  }
}

function toggleSubscriber(userId, enabled = null) {
  const db = getDb();
  const sub = getSubscriber(userId);
  if (!sub) return null;
  const newEnabled = enabled !== null ? (enabled ? 1 : 0) : (sub.enabled ? 0 : 1);
  db.prepare('UPDATE quest_subscribers SET enabled = ? WHERE user_id = ?').run(newEnabled, userId);
  return newEnabled === 1;
}

function toggleNotifyDm(userId) {
  const db = getDb();
  const sub = getSubscriber(userId);
  if (!sub) return null;
  const newNotify = sub.notify_dm ? 0 : 1;
  db.prepare('UPDATE quest_subscribers SET notify_dm = ? WHERE user_id = ?').run(newNotify, userId);
  return newNotify === 1;
}

function autoEnrollLocalToken() {
  try {
    if (fs.existsSync(TOKEN_CACHE_PATH)) {
      const token = fs.readFileSync(TOKEN_CACHE_PATH, 'utf8').trim();
      if (token && token.length > 20) {
        const { OWNER_ID } = require('./questAuth');
        const tokenUserId = getUserIdFromToken(token);
        if (tokenUserId) {
          registerSubscriber(tokenUserId, token, 'Host User', 1);
        }
        if (OWNER_ID) {
          registerSubscriber(OWNER_ID, token, 'Bot Owner', 1);
        }
        console.log(`[QUEST SCHEDULER] Đã đồng bộ tài khoản máy chủ vào hệ thống tự động.`);
      }
    }
  } catch (err) {
    console.warn('[QUEST SCHEDULER] Không thể đồng bộ saved_quest_token.txt:', err.message);
  }
}

async function scanUserQuests(subscriber, client, options = {}) {
  const token = subscriber.token;
  const userId = subscriber.user_id;

  if (activeUserJobs.has(userId)) {
    return {
      success: true,
      alreadyRunning: true,
      message: 'Tiến trình làm quest tự động đang chạy ngầm cho tài khoản này.',
    };
  }

  let allQuests = [];
  try {
    allQuests = await fetchQuests(token);
  } catch (err) {
    if (err.message && err.message.includes('401')) {
      console.warn(`[QUEST SCHEDULER] Token của User ${userId} đã hết hạn.`);
      try {
        getDb().prepare('UPDATE quest_subscribers SET enabled = 0 WHERE user_id = ?').run(userId);
      } catch (e) {}
      if (subscriber.notify_dm && client) {
        const u = await client.users.fetch(userId).catch(() => null);
        if (u) {
          u.send(
            '⚠️ **[Lowkey Quest]** Discord User Token của bạn đã hết hạn hoặc bạn vừa đổi mật khẩu Discord. Bot đã tạm ngưng tự động làm quest. Vui lòng vào server gõ `/quest action:token` và bấm **Đổi Token Mới** để cập nhật lại nhé!'
          ).catch(() => {});
        }
      }
    }
    return { success: false, error: err.message };
  }

  const now = Date.now();
  const activeQuests = allQuests.filter(isQuestActive);

  // Ghi nhận các quest đã đạt 100% (completed_at) hoặc đã nhận thưởng (claimed_at) từ trước lần quét này
  const alreadyCompletedIds = new Set(
    activeQuests
      .filter((q) => q.user_status?.completed_at || q.user_status?.claimed_at)
      .map((q) => q.id)
  );

  // Tự động ghi nhớ vào DB các quest đã hoàn thành từ trước để vĩnh viễn không bao giờ thông báo lặp
  for (const qId of alreadyCompletedIds) {
    if (!isQuestNotified(userId, qId)) {
      markQuestNotified(userId, qId);
    }
  }

  // Một nhiệm vụ cần làm hoặc cần nhận thưởng (chưa claim):
  const pendingQuests = activeQuests.filter((q) => !q.user_status?.claimed_at);

  if (pendingQuests.length === 0) {
    getDb()
      .prepare('UPDATE quest_subscribers SET last_checked_at = ? WHERE user_id = ?')
      .run(now, userId);
    return {
      success: true,
      totalQuests: allQuests.length,
      pendingCount: 0,
      completedCount: 0,
      claimedCount: 0,
      actions: [],
    };
  }

  console.log(`[QUEST SCHEDULER] Bắt đầu tự động làm ${pendingQuests.length} nhiệm vụ cho User ${userId}...`);

  // Sắp xếp ưu tiên các nhiệm vụ Video làm trước
  pendingQuests.sort((a, b) => {
    const aVid = isVideoQuest(a) ? 1 : 0;
    const bVid = isVideoQuest(b) ? 1 : 0;
    return bVid - aVid;
  });

  // Tự động Enroll trước cho tất cả các nhiệm vụ chưa nhận
  for (const q of pendingQuests) {
    if (!q.user_status?.enrolled_at) {
      try {
        const isVid = isVideoQuest(q);
        const tasks = extractQuestTasks(q);
        const platform = isVid ? -1 : (tasks.PLAY_ON_MOBILE ? 2 : 0);
        await enrollQuest(token, q.id, platform);
      } catch (e) {}
    }
  }

  activeUserJobs.set(userId, {
    startTime: Date.now(),
    totalQuests: pendingQuests.length,
  });

  const actions = [];

  try {
    // Chạy song song có giãn cách (stagger 2.5s) để cày đồng thời các nhiệm vụ an toàn tuyệt đối
    const results = await Promise.allSettled(
      pendingQuests.map((quest, idx) => {
        return (async () => {
          if (idx > 0) {
            const staggerDelay = options.heartbeatDelayMs && options.heartbeatDelayMs < 1000 ? 5 : 2500;
            await new Promise((r) => setTimeout(r, idx * staggerDelay));
          }
          return completeSingleQuest(token, quest, { autoClaim: true, ...options });
        })();
      })
    );

    for (let i = 0; i < pendingQuests.length; i++) {
      const quest = pendingQuests[i];
      const questName =
        quest.config?.messages?.quest_name ||
        quest.config?.messages?.game_title ||
        quest.config?.messages?.game_name ||
        quest.config?.application?.name ||
        `Nhiệm vụ #${quest.id}`;

      const isVid = isVideoQuest(quest);
      const resItem = results[i];
      if (resItem.status === 'fulfilled') {
        const res = resItem.value;
        const progressPercent = typeof res.progressPercent === 'number' ? res.progressPercent : (res.completed ? 100 : 0);
        actions.push({
          questId: quest.id,
          questName,
          type: res.type || (isVid ? 'video' : 'game'),
          completed: !!res.completed,
          claimed: !!res.claimed,
          progressPercent,
          message: res.message || (res.completed ? 'Hoàn thành 100% & Đã nhận thưởng ORB' : 'Tiến độ cập nhật'),
        });
      } else {
        actions.push({
          questId: quest.id,
          questName,
          type: isVid ? 'video' : 'game',
          completed: false,
          claimed: false,
          error: resItem.reason?.message || 'Lỗi không xác định',
          message: `Lỗi: ${resItem.reason?.message || 'Không thành công'}`,
        });
      }
    }
  } finally {
    activeUserJobs.delete(userId);
  }

  getDb()
    .prepare('UPDATE quest_subscribers SET last_checked_at = ?, last_quests_json = ? WHERE user_id = ?')
    .run(Date.now(), JSON.stringify(actions), userId);

  // Lọc các nhiệm vụ MỚI hoàn thành trong chu kỳ quét này mà CHƯA TỪNG gửi thông báo
  const newlyCompletedList = actions.filter((a) => {
    if (!a.completed) return false;
    if (alreadyCompletedIds.has(a.questId) || isQuestNotified(userId, a.questId)) {
      return false;
    }
    return true;
  });

  // CHỈ gửi thông báo DM nếu thực sự có nhiệm vụ MỚI hoàn thành trong lần quét này (tránh gửi lặp lại sau 20 phút)
  if (subscriber.notify_dm && newlyCompletedList.length > 0 && client) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (user) {
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🔔 [LOWKEY QUEST] BÁO CÁO TỰ ĐỘNG HOÀN THÀNH DISCORD QUESTS')
        .setDescription(
          `Hệ thống vừa tự động cày hoàn thành 100% thời gian cho **${newlyCompletedList.length}** nhiệm vụ (Video & Game):\n\n` +
            newlyCompletedList
              .map((a, i) => {
                const pctText = typeof a.progressPercent === 'number' ? ` (${a.progressPercent}%)` : '';
                const typeBadge = a.type === 'video' ? '🎬 [Video]' : '🎮 [Game]';
                return `**${i + 1}.** ${typeBadge} **${a.questName}**${pctText}\n↪ ✅ **${a.message}**!`;
              })
              .join('\n\n')
        )
        .setFooter({ text: 'Lowkey Auto Quest Scheduler • Tự động 100% không cần mở game' })
        .setTimestamp();

      embed.addFields({
        name: '🎁 Nhận phần thưởng (Claim ORB)',
        value: 'Nhiệm vụ đã hoàn thành 100%! Vui lòng mở **Cài đặt -> Quests** trên Discord để tự bấm **Claim** nhận quà (Discord yêu cầu xác thực con người khi nhận quà).',
      });

      const pendingQuestsList = actions.filter((a) => !a.completed);
      if (pendingQuestsList.length > 0) {
        embed.addFields({
          name: '🔄 Tiến trình tự động',
          value: 'Bot đang tiếp tục tự động cày các nhiệm vụ còn lại trong nền ở chu kỳ quét kế tiếp (20 phút/lần).',
        });
      }

      user.send({ embeds: [embed] }).catch(() => {});

      // Đánh dấu đã gửi thông báo thành công cho các nhiệm vụ này để không bao giờ gửi lặp lại
      for (const a of newlyCompletedList) {
        markQuestNotified(userId, a.questId);
      }
    }
  }

  const completedCount = actions.filter((a) => a.completed).length;
  const claimedCount = actions.filter((a) => a.claimed).length;

  return {
    success: true,
    totalQuests: allQuests.length,
    pendingCount: pendingQuests.length,
    completedCount,
    claimedCount,
    actions,
  };
}

async function scanAll(client = discordClient) {
  if (isScanning) return;
  isScanning = true;

  try {
    const subscribers = listSubscribers(true);
    if (subscribers.length === 0) return;

    for (const sub of subscribers) {
      try {
        await scanUserQuests(sub, client);
      } catch (err) {
        console.error(`[QUEST SCHEDULER] Lỗi quét cho User ${sub.user_id}:`, err.message);
      }
      // Nghỉ 3 giây giữa các tài khoản để tránh Rate Limit
      await new Promise((r) => setTimeout(r, 3000));
    }
  } finally {
    isScanning = false;
  }
}

function start(client) {
  discordClient = client;

  autoEnrollLocalToken();

  const intervalMs = getIntervalMs();
  const minutes = Math.round(intervalMs / 60000);

  if (schedulerTimer) clearInterval(schedulerTimer);

  schedulerTimer = setInterval(() => {
    scanAll(client).catch((e) => console.error('[QUEST SCHEDULER ERROR]', e));
  }, intervalMs);

  console.log(`[QUEST SCHEDULER] Đã khởi động hệ thống tự động quét Quests định kỳ (Mỗi ${minutes} phút).`);

  // Quét lần đầu sau 12 giây khi bot vừa online
  setTimeout(() => {
    scanAll(client).catch((e) => console.error('[QUEST INITIAL SCAN ERROR]', e));
  }, 12000);
}

function buildAutoStatusPayload(userId) {
  const sub = getSubscriber(userId);
  const minutes = Math.round(getIntervalMs() / 60000);

  const isEnabled = !!sub?.enabled;
  const isNotify = !!sub?.notify_dm;
  const lastChecked = sub?.last_checked_at
    ? `<t:${Math.floor(sub.last_checked_at / 1000)}:R>`
    : 'Chưa quét lần nào';

  const embed = new EmbedBuilder()
    .setColor(isEnabled ? 0x57f287 : 0x747f8d)
    .setTitle('⏰ CÀI ĐẶT TỰ ĐỘNG QUÉT & LÀM QUEST ĐỊNH KỲ')
    .setDescription(
      'Hệ thống sẽ chạy ngầm định kỳ 24/7 trên bot. Ngay khi Discord vừa tung ra nhiệm vụ mới:\n' +
        '• 🎬 **Video Quests:** Bot tự động nhận, cày tiến độ và nhận điểm ORB ngay lập tức.\n' +
        '• 🎮 **Game Quests:** Bot tự động nhận (Enroll) và gửi tin nhắn nhắc bạn mở app 1-click trên Desktop.\n' +
        '• 🔔 **Thông báo:** Gửi tin nhắn riêng (DM) chúc mừng khi hoàn thành nhiệm vụ.'
    )
    .addFields(
      {
        name: '⚡ Trạng thái Tự Động',
        value: isEnabled ? '🟢 **Đang BẬT**' : '⚪ **Đang TẮT**',
        inline: true,
      },
      {
        name: '⏱️ Chu kỳ quét',
        value: `Mỗi **${minutes} phút**/lần`,
        inline: true,
      },
      {
        name: '🔔 Báo qua DM',
        value: isNotify ? '🟢 **Bật**' : '⚪ **Tắt**',
        inline: true,
      },
      {
        name: '🕒 Lần quét gần nhất',
        value: lastChecked,
        inline: false,
      }
    )
    .setFooter({ text: 'Lowkey Auto Quest • Tiết kiệm thời gian, không bao giờ bỏ lỡ ORB' })
    .setTimestamp();

  if (!sub) {
    embed.addFields({
      name: '⚠️ Lưu ý Token',
      value: 'Tài khoản của bạn chưa nạp Token vào hệ thống bot. Hãy bấm nút **Nhập Token** bên dưới để bot ghi nhớ và tự động làm quest!',
    });
  } else if (sub.enabled === 0) {
    const masked = sub.token?.length > 8 ? `••••••••${sub.token.slice(-4)}` : '••••••••';
    embed.addFields({
      name: '⚠️ Token Không Thể Sử Dụng',
      value: `Token đã lưu (\`${masked}\` — \`${sub.username || 'User'}\`) **đã hết hạn hoặc đổi mật khẩu (401)**.\n👉 Bấm nút **Đổi Token Mới** bên dưới để cập nhật lại!`,
    });
  } else {
    const masked = sub.token?.length > 8 ? `••••••••${sub.token.slice(-4)}` : '••••••••';
    embed.addFields({
      name: '🔑 Token Đã Ghi Nhớ',
      value: `\`${masked}\` (${sub.username || 'User'}) — ✅ **Đang hoạt động tốt**. Bot sẽ tự động dùng token này khi có quest mới mà không cần bạn nhập lại!`,
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('quest:auto_toggle')
      .setLabel(isEnabled ? 'Tắt Tự Động' : 'Bật Tự Động')
      .setEmoji(isEnabled ? '⏸️' : '▶️')
      .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('quest:auto_scan_now')
      .setLabel('Quét Ngay Lập Tức')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('quest:auto_dm_toggle')
      .setLabel(isNotify ? 'Tắt Báo DM' : 'Bật Báo DM')
      .setEmoji('🔔')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(sub ? 'quest:change_token' : 'quest:modal')
      .setLabel(sub ? 'Đổi Token Mới' : 'Nhập Token')
      .setEmoji('🔑')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('quest:hub')
      .setLabel('Về Menu')
      .setEmoji('↩️')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = {
  start,
  scanAll,
  scanUserQuests,
  getSubscriber,
  listSubscribers,
  registerSubscriber,
  toggleSubscriber,
  toggleNotifyDm,
  buildAutoStatusPayload,
  isUserJobRunning,
};
