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
} = require('./questTokenWorker');

const TOKEN_CACHE_PATH = path.join(__dirname, '..', 'data', 'saved_quest_token.txt');
const DEFAULT_INTERVAL_MINUTES = 60;

let schedulerTimer = null;
let discordClient = null;
let isScanning = false;

function getIntervalMs() {
  const envVal = parseInt(process.env.QUEST_SCAN_INTERVAL_MINUTES, 10);
  const minutes = Number.isFinite(envVal) && envVal >= 5 ? envVal : DEFAULT_INTERVAL_MINUTES;
  return minutes * 60 * 1000;
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
  const { isApproved } = require('./questAuth');
  const now = Date.now();
  return rows.filter((r) => {
    if (!isApproved(r.user_id)) return false;
    if (r.expires_at && r.expires_at > 0 && r.expires_at < now) {
      return false;
    }
    return true;
  });
}

function registerSubscriber(userId, token, username = null, notifyDm = 1, packageType = 'monthly', expiresAt = 0) {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO quest_subscribers (user_id, token, username, notify_dm, enabled, package_type, expires_at, created_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      token = excluded.token,
      username = coalesce(excluded.username, quest_subscribers.username),
      notify_dm = excluded.notify_dm,
      package_type = coalesce(excluded.package_type, quest_subscribers.package_type),
      expires_at = case when excluded.expires_at > 0 then excluded.expires_at else quest_subscribers.expires_at end,
      enabled = 1
  `).run(userId, token.trim(), username, notifyDm ? 1 : 0, packageType, expiresAt, now);

  // Đồng bộ file cache nếu là bot Owner
  try {
    const { isOwner } = require('./questAuth');
    if (isOwner(userId)) {
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

async function scanUserQuests(subscriber, client) {
  const token = subscriber.token;
  const userId = subscriber.user_id;

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
  const activeQuests = allQuests.filter((q) => {
    const exp = q.config?.expires_at || q.config?.expiresAt;
    if (!exp) return true;
    const expMs = new Date(exp).getTime();
    if (Number.isNaN(expMs)) return true;
    return expMs > now;
  });

  // Một nhiệm vụ chỉ coi là đã kết thúc hoàn toàn khi đã claim phần thưởng (claimed_at).
  // Nếu chưa claim (kể cả có completed_at hoặc đang dở 26%), đều phải đưa vào pendingQuests để bot xử lý hoặc claim!
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
      gamePendingCount: 0,
      actions: [],
    };
  }

  console.log(`[QUEST SCHEDULER] Phát hiện ${pendingQuests.length} nhiệm vụ mới cho User ${userId}...`);

  const actions = [];

  for (const quest of pendingQuests) {
    const questName =
      quest.config?.messages?.quest_name ||
      quest.config?.messages?.game_title ||
      quest.config?.messages?.game_name ||
      quest.config?.application?.name ||
      `Nhiệm vụ #${quest.id}`;

    const tasks = quest.config?.task_config?.tasks || quest.config?.task_config_v2?.tasks || {};
    const isVideo = !!(tasks.WATCH_VIDEO || tasks.WATCH_VIDEO_ON_MOBILE);

    try {
      const res = await completeSingleQuest(token, quest);
      const progressPercent = typeof res.progressPercent === 'number' ? res.progressPercent : (res.completed ? 100 : 0);

      if (res.completed) {
        actions.push({
          questName,
          type: isVideo ? 'video' : (res.type || 'game'),
          completed: true,
          claimed: true,
          progressPercent: 100,
          message: res.message || 'Hoàn thành 100% & Đã nhận thưởng ORB',
        });
      } else if (res.alreadyDone) {
        actions.push({
          questName,
          type: res.type || 'game',
          completed: true,
          claimed: true,
          progressPercent: 100,
          message: res.message || 'Đã hoàn thành trước đó',
        });
      } else if (res.requiresDesktop) {
        actions.push({
          questName,
          type: res.type || 'game',
          enrolled: true,
          completed: false,
          claimed: false,
          requiresDesktop: true,
          progressPercent,
          message: res.message || `Đã tự động nhận (Tiến độ: ${progressPercent}%). Cần mở Discord Desktop hoặc chạy Script F12.`,
        });
      } else {
        actions.push({
          questName,
          type: isVideo ? 'video' : (res.type || 'game'),
          completed: false,
          claimed: false,
          progressPercent,
          message: res.message || 'Không thể tự hoàn thành qua API',
        });
      }
    } catch (err) {
      actions.push({
        questName,
        type: isVideo ? 'video' : 'game',
        completed: false,
        claimed: false,
        error: err.message,
      });
    }
  }

  getDb()
    .prepare('UPDATE quest_subscribers SET last_checked_at = ?, last_quests_json = ? WHERE user_id = ?')
    .run(now, JSON.stringify(actions), userId);

  // Gửi thông báo Direct Message nếu có kết quả
  if (subscriber.notify_dm && actions.length > 0 && client) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (user) {
      const completedList = actions.filter((a) => a.completed);
      const gameList = actions.filter((a) => a.requiresDesktop && !a.completed);

      const embed = new EmbedBuilder()
        .setColor(completedList.length > 0 ? 0x57f287 : 0x5865f2)
        .setTitle('🔔 [LOWKEY QUEST] BÁO CÁO QUÉT TỰ ĐỘNG DISCORD QUESTS')
        .setDescription(
          `Hệ thống vừa quét định kỳ tài khoản Discord của bạn và ghi nhận **${actions.length}** nhiệm vụ:\n\n` +
            actions
              .map((a, i) => {
                const pctText = typeof a.progressPercent === 'number' ? ` (${a.progressPercent}%)` : '';
                if (a.completed) {
                  return `**${i + 1}. ${a.questName}**${pctText}\n↪ ✅ **${a.message}**!`;
                }
                if (a.requiresDesktop) {
                  return `**${i + 1}. ${a.questName}**${pctText}\n↪ 🕹️ **${a.message}**`;
                }
                return `**${i + 1}. ${a.questName}**\n↪ ⚠️ ${a.error || a.message}`;
              })
              .join('\n\n')
        )
        .setFooter({ text: 'Lowkey Auto Quest Scheduler • Tự động quét 24/7' })
        .setTimestamp();

      if (completedList.length > 0) {
        embed.addFields({
          name: '🎁 Phần thưởng',
          value: 'Điểm ORB và phần quà của các nhiệm vụ hoàn thành đã được cộng vào tài khoản của bạn!',
        });
      }
      if (gameList.length > 0) {
        embed.addFields({
          name: '💡 Hướng dẫn làm nhanh Game PC',
          value: 'Do Discord bắt buộc mở client Desktop để nhận diện game, bạn có thể gõ `/quest action:script` trong server để lấy mã script F12 1-click hoàn tất 15 phút ngay trên máy tính mà không cần tải game.',
        });
      }

      user.send({ embeds: [embed] }).catch(() => {});
    }
  }

  const completedCount = actions.filter((a) => a.completed).length;
  const claimedCount = actions.filter((a) => a.claimed).length;
  const gamePendingCount = actions.filter((a) => a.requiresDesktop && !a.completed).length;

  return {
    success: true,
    totalQuests: allQuests.length,
    pendingCount: pendingQuests.length,
    completedCount,
    claimedCount,
    gamePendingCount,
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
};
