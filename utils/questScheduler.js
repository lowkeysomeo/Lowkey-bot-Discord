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
  return db.prepare('SELECT * FROM quest_subscribers WHERE user_id = ?').get(userId);
}

function listSubscribers(onlyEnabled = true) {
  const db = getDb();
  const rows = onlyEnabled
    ? db.prepare('SELECT * FROM quest_subscribers WHERE enabled = 1').all()
    : db.prepare('SELECT * FROM quest_subscribers').all();
  const { isApproved } = require('./questAuth');
  return rows.filter((r) => isApproved(r.user_id));
}

function registerSubscriber(userId, token, username = null, notifyDm = 1) {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO quest_subscribers (user_id, token, username, notify_dm, enabled, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      token = excluded.token,
      username = coalesce(excluded.username, quest_subscribers.username),
      notify_dm = excluded.notify_dm,
      enabled = 1
  `).run(userId, token.trim(), username, notifyDm ? 1 : 0, now);
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
        const userId = getUserIdFromToken(token);
        if (userId) {
          registerSubscriber(userId, token, 'Host User', 1);
          console.log(`[QUEST SCHEDULER] Đã đồng bộ tài khoản máy chủ (ID: ${userId}) vào hệ thống tự động.`);
        }
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
      if (subscriber.notify_dm && client) {
        const u = await client.users.fetch(userId).catch(() => null);
        if (u) {
          u.send(
            '⚠️ **[Lowkey Quest]** Discord User Token của bạn đã hết hạn hoặc mật khẩu đã đổi. Vui lòng vào server gõ `/quest action:token` để cập nhật lại token mới nhé!'
          ).catch(() => {});
        }
      }
    }
    return { success: false, error: err.message };
  }

  const now = Date.now();
  const activeQuests = allQuests.filter((q) => {
    if (!q.config?.expires_at) return true;
    return new Date(q.config.expires_at).getTime() > now;
  });

  const pendingQuests = activeQuests.filter((q) => !q.user_status?.completed_at);

  if (pendingQuests.length === 0) {
    getDb()
      .prepare('UPDATE quest_subscribers SET last_checked_at = ? WHERE user_id = ?')
      .run(now, userId);
    return { success: true, pendingCount: 0, actionsTaken: [] };
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

    // 1. Tự động nhận nhiệm vụ nếu chưa enroll
    let enrolled = false;
    if (!quest.user_status?.enrolled_at) {
      try {
        await enrollQuest(token, quest.id);
        enrolled = true;
      } catch (e) {}
    }

    const tasks = quest.config?.task_config?.tasks || quest.config?.task_config_v2?.tasks || {};
    const isVideo = !!(tasks.WATCH_VIDEO || tasks.WATCH_VIDEO_ON_MOBILE);

    if (isVideo) {
      // 2. Video Quest: Tự động hoàn thành và nhận ORB
      const targetSec = tasks.WATCH_VIDEO?.target || tasks.WATCH_VIDEO_ON_MOBILE?.target || 30;
      try {
        await sendVideoProgress(token, quest.id, targetSec);
        await new Promise((r) => setTimeout(r, 1200));
        await claimQuestReward(token, quest.id);
        actions.push({
          questName,
          type: 'video',
          completed: true,
          claimed: true,
          message: 'Hoàn thành 100% & Đã nhận thưởng ORB',
        });
      } catch (err) {
        actions.push({
          questName,
          type: 'video',
          completed: false,
          claimed: false,
          error: err.message,
        });
      }
    } else {
      // 3. Game Quest: Đã tự enroll, cần desktop để chạy
      actions.push({
        questName,
        type: 'game',
        enrolled: true,
        requiresDesktop: true,
        message: 'Đã tự động nhận (Accept). Mở app trên Desktop để hoàn tất',
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
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🔔 [LOWKEY QUEST] PHÁT HIỆN & TỰ ĐỘNG XỬ LÝ NHIỆM VỤ MỚI')
        .setDescription(
          `Hệ thống vừa quét định kỳ tài khoản Discord của bạn và tự động xử lý **${actions.length}** nhiệm vụ:\n\n` +
            actions
              .map((a, i) => {
                if (a.completed) {
                  return `**${i + 1}. ${a.questName}** (Video)\n↪ ✅ **${a.message}**!`;
                }
                if (a.requiresDesktop) {
                  return `**${i + 1}. ${a.questName}** (Game)\n↪ 🎯 **${a.message}** (bấm 1-click ngoài Desktop).`;
                }
                return `**${i + 1}. ${a.questName}**\n↪ ⚠️ ${a.error || a.message}`;
              })
              .join('\n\n')
        )
        .addFields({
          name: '🎁 Phần thưởng',
          value: 'Điểm ORB và phần quà đã được cộng vào tài khoản. Bạn có thể kiểm tra tại **Cài đặt -> Quests** trên Discord!',
        })
        .setFooter({ text: 'Lowkey Auto Quest Scheduler • Tự động quét 24/7' })
        .setTimestamp();

      user.send({ embeds: [embed] }).catch(() => {});
    }
  }

  return { success: true, pendingCount: pendingQuests.length, actions };
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
      name: '⚠️ Lưu ý',
      value: 'Tài khoản của bạn chưa nạp Token vào hệ thống bot. Hãy bấm nút **Nhập Token** bên dưới để kích hoạt tự động!',
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
      .setCustomId('quest:modal')
      .setLabel('Đổi Token')
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
