const { getGuildSetting } = require('./guildSettings');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createMonthlyRankCard } = require('./createMonthlyRankCard');
const { getDb } = require('./database');
const { getChatLeaderboard, resetChatMonthlyXp } = require('./levelSystem');
const { getVoiceLeaderboard, resetVoiceMonthlyXp } = require('./voiceLevelSystem');
const { resolveLeaderboardEntries } = require('./leaderboardHelpers');
const { formatXp } = require('./levelMath');
const { getOptions, template } = require('./customization');

const TIME_ZONE = 'Asia/Ho_Chi_Minh';
let timer = null;
let running = false;

function getCurrentMonthKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  return `${year}-${month}`;
}

function monthLabel(monthKey) {
  const [year, month] = String(monthKey).split('-');
  return `Tháng ${Number(month)}/${year}`;
}

function ensureMonthlyState(guildId) {
  const db = getDb();
  const currentMonth = getCurrentMonthKey();

  db.prepare(`
    INSERT OR IGNORE INTO monthly_state (guild_id, current_month)
    VALUES (?, ?)
  `).run(guildId, currentMonth);

  return db.prepare(`
    SELECT * FROM monthly_state WHERE guild_id = ?
  `).get(guildId);
}

function saveRawSnapshot(guildId, monthKey, chatRows, voiceRows) {
  const db = getDb();

  db.prepare(`
    INSERT OR IGNORE INTO monthly_results
      (guild_id, month_key, chat_json, voice_json, announcement_message_id, roles_assigned, completed)
    VALUES (?, ?, ?, ?, NULL, 0, 0)
  `).run(
    guildId,
    monthKey,
    JSON.stringify(chatRows),
    JSON.stringify(voiceRows),
  );
}

/**
 * Đóng tháng hoàn toàn trong SQLite trước khi làm bất kỳ Discord API call nào.
 * Nhờ vậy XP tháng mới không bao giờ bị trộn vào tháng cũ nếu Railway restart
 * hoặc channel/role Discord tạm thời lỗi.
 */
function closeMonthIfNeeded(guildId) {
  const db = getDb();
  const state = ensureMonthlyState(guildId);
  const currentMonth = getCurrentMonthKey();

  if (state.current_month === currentMonth) return null;

  const monthToClose = state.current_month;

  let result = db.prepare(`
    SELECT *
    FROM monthly_results
    WHERE guild_id = ? AND month_key = ?
  `).get(guildId, monthToClose);

  if (!result) {
    const chatRows = getChatLeaderboard(guildId, 'monthly', 100);
    const voiceRows = getVoiceLeaderboard(guildId, 'monthly', 100);
    saveRawSnapshot(guildId, monthToClose, chatRows, voiceRows);
  }

  const finalize = db.transaction(() => {
    resetChatMonthlyXp(guildId);
    resetVoiceMonthlyXp(guildId);

    db.prepare(`
      UPDATE monthly_state
      SET current_month = ?
      WHERE guild_id = ?
    `).run(currentMonth, guildId);
  });

  finalize();

  console.log(
    `[MONTHLY] Đã chốt dữ liệu ${monthToClose} và bắt đầu ${currentMonth}. ` +
    'XP tổng không thay đổi.',
  );

  return monthToClose;
}

function formatTop(entries, guildId, type, options, preview = false) {
  if (!entries.length) return 'Chưa có dữ liệu trong tháng này.';

  const medals = ['🥇', '🥈', '🥉'];
  return entries
    .slice(0, 3)
    .map((entry, index) => {
      const prefix = medals[index] || `**#${index + 1}**`;
      const roleId = getGuildSetting(guildId, `MONTHLY_${type}_TOP${index + 1}_ROLE_ID`);
      const reward = !options.monthlyRoles ? 'Trao role tháng đang tắt.'
        : roleId ? `🎁 **Role vinh danh:** <@&${roleId}>` : '🎖️ Vinh danh Top tháng · Chưa cấu hình role thưởng.';
      return `${prefix} **TOP ${index + 1}** — ${preview ? entry.username : `<@${entry.userId}>`}\n✦ **${formatXp(entry.score)} XP tháng**\n${reward}`;
    })
    .join('\n\n');
}

async function sendMonthlyAnnouncement(guild, monthKey, chatTop, voiceTop, preview = null) {
  const channelId = getGuildSetting(guild.id, 'MONTHLY_RANK_CHANNEL_ID');
  if (!channelId && !preview) {
    throw new Error('Thiếu MONTHLY_RANK_CHANNEL_ID trong Railway/.env.');
  }

  const channel = preview?.channel || await guild.channels.fetch(channelId);
  if (!channel?.isTextBased() || channel.guildId !== guild.id) {
    throw new Error('MONTHLY_RANK_CHANNEL_ID không phải text channel hợp lệ.');
  }

  const options = getOptions(guild.id);
  const values = { server: guild.name, month: monthLabel(monthKey) };
  const embed = new EmbedBuilder()
    .setColor(options.monthlyColor)
    .setTitle(template(options.monthlyTitle, values).slice(0, 256))
    .setDescription(template(options.monthlyText, values).slice(0, 4096))
    .addFields(
      {
        name: '💬 ĐẠI SẢNH VINH DANH — TOP 3 CHAT',
        value: formatTop(chatTop, guild.id, 'CHAT', options, Boolean(preview)),
        inline: false,
      },
      {
        name: '\u200b',
        value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        inline: false,
      },
      {
        name: '🎙️ ĐẠI SẢNH VINH DANH — TOP 3 VOICE',
        value: formatTop(voiceTop, guild.id, 'VOICE', options, Boolean(preview)),
        inline: false,
      },
    )
    .setFooter({ text: 'Role vinh danh được chuyển theo kết quả mỗi tháng • XP tổng và level được giữ nguyên.' })
    .setTimestamp();

  const winners = preview ? [] : [...new Set([...chatTop.slice(0, 3), ...voiceTop.slice(0, 3)].map(entry => entry.userId))];
  const files = [];
  if (options.monthlyImage) {
    try {
      const roles = await guild.roles.fetch();
      const withRewards = (entries, type) => entries.slice(0, 10).map((entry, index) => ({
        ...entry, rewardRole: index < 3 ? roles.get(getGuildSetting(guild.id, `MONTHLY_${type}_TOP${index + 1}_ROLE_ID`))?.name : undefined,
      }));
      const image = await createMonthlyRankCard({ serverName: guild.name, month: monthLabel(monthKey),
        chat: withRewards(chatTop, 'CHAT'), voice: withRewards(voiceTop, 'VOICE'),
        color: options.monthlyColor, rolesEnabled: options.monthlyRoles });
      const name = `monthly-rank-${monthKey}.png`;
      files.push(new AttachmentBuilder(image, { name }));
      embed.setImage(`attachment://${name}`);
    } catch (error) {
      console.warn('[MONTHLY IMAGE] Không tạo được ảnh; vẫn gửi bài vinh danh:', error.message);
    }
  }
  return channel.send({
    content: preview ? '🧪 **TEST — Vinh danh tháng · Dữ liệu minh họa, không trao role hoặc chốt tháng.**' : winners.length ? `🎊 **Xin chúc mừng những gương mặt xuất sắc của ${monthLabel(monthKey)}!**\n${winners.map(id => `<@${id}>`).join(' ')}` : '🏆 Đại sảnh vinh danh tháng',
    embeds: [embed],
    files,
    allowedMentions: { parse: [], users: winners },
  });
}

const MONTHLY_ROLE_CONFIG = [
  { key: 'chat_1', env: 'MONTHLY_CHAT_TOP1_ROLE_ID', source: 'chat', index: 0 },
  { key: 'chat_2', env: 'MONTHLY_CHAT_TOP2_ROLE_ID', source: 'chat', index: 1 },
  { key: 'chat_3', env: 'MONTHLY_CHAT_TOP3_ROLE_ID', source: 'chat', index: 2 },
  { key: 'voice_1', env: 'MONTHLY_VOICE_TOP1_ROLE_ID', source: 'voice', index: 0 },
  { key: 'voice_2', env: 'MONTHLY_VOICE_TOP2_ROLE_ID', source: 'voice', index: 1 },
  { key: 'voice_3', env: 'MONTHLY_VOICE_TOP3_ROLE_ID', source: 'voice', index: 2 },
];

async function updateMonthlyWinnerRoles(guild, chatTop, voiceTop) {
  const db = getDb();

  for (const config of MONTHLY_ROLE_CONFIG) {
    const roleId = getGuildSetting(guild.id, config.env);
    if (!roleId) continue;

    const entries = config.source === 'chat' ? chatTop : voiceTop;
    const newWinnerId = entries[config.index]?.userId || null;

    const oldHolder = db.prepare(`
      SELECT user_id
      FROM monthly_role_holders
      WHERE guild_id = ? AND role_key = ?
    `).get(guild.id, config.key);

    if (oldHolder?.user_id && oldHolder.user_id !== newWinnerId) {
      try {
        const oldMember = await guild.members.fetch(oldHolder.user_id);
        if (oldMember.roles.cache.has(roleId)) {
          await oldMember.roles.remove(roleId);
        }
      } catch (error) {
        console.warn(
          `[MONTHLY ROLE] Không gỡ được ${config.key} khỏi ${oldHolder.user_id}:`,
          error.message,
        );
        // Departed members no longer hold server roles. Other errors must retry
        // before recording a different holder, or the old role could be stranded.
        if (error.code !== 10007) throw error;
      }
    }

    if (newWinnerId) {
      const newMember = await guild.members.fetch(newWinnerId);

      if (!newMember.roles.cache.has(roleId)) {
        await newMember.roles.add(roleId);
      }

      db.prepare(`
        INSERT INTO monthly_role_holders (guild_id, role_key, user_id)
        VALUES (?, ?, ?)
        ON CONFLICT(guild_id, role_key)
        DO UPDATE SET user_id = excluded.user_id
      `).run(guild.id, config.key, newWinnerId);
    } else {
      db.prepare(`
        DELETE FROM monthly_role_holders
        WHERE guild_id = ? AND role_key = ?
      `).run(guild.id, config.key);
    }
  }
}

async function processPendingResults(guild) {
  const db = getDb();

  const pending = db.prepare(`
    SELECT *
    FROM monthly_results
    WHERE guild_id = ? AND completed = 0
    ORDER BY month_key ASC
  `).all(guild.id);

  for (const result of pending) {
    const chatRows = JSON.parse(result.chat_json || '[]');
    const voiceRows = JSON.parse(result.voice_json || '[]');

    const chatTop = await resolveLeaderboardEntries(
      guild,
      chatRows,
      'monthlyXp',
      10,
    );

    const voiceTop = await resolveLeaderboardEntries(
      guild,
      voiceRows,
      'monthlyXp',
      10,
    );

    let announcementMessageId = result.announcement_message_id;
    let rolesAssigned = Boolean(result.roles_assigned);
    const options = getOptions(guild.id);

    // Role rotation must not depend on the announcement channel being available.
    if (!rolesAssigned) {
      if (options.monthlyRoles) await updateMonthlyWinnerRoles(guild, chatTop, voiceTop);
      rolesAssigned = true;
      db.prepare('UPDATE monthly_results SET roles_assigned = 1 WHERE guild_id = ? AND month_key = ?')
        .run(guild.id, result.month_key);
    }

    if (!announcementMessageId) {
      const channelId = getGuildSetting(guild.id, 'MONTHLY_RANK_CHANNEL_ID');
      const message = channelId && options.monthlyAnnounce ? await sendMonthlyAnnouncement(
        guild,
        result.month_key,
        chatTop,
        voiceTop,
      ) : { id: 'disabled' };

      announcementMessageId = message.id;

      db.prepare(`
        UPDATE monthly_results
        SET announcement_message_id = ?
        WHERE guild_id = ? AND month_key = ?
      `).run(message.id, guild.id, result.month_key);
    }

    if (announcementMessageId && rolesAssigned) {
      db.prepare(`
        UPDATE monthly_results
        SET completed = 1
        WHERE guild_id = ? AND month_key = ?
      `).run(guild.id, result.month_key);

      console.log(`[MONTHLY] Hoàn tất thông báo + role cho ${result.month_key}.`);
    }
  }
}

async function processMonthlyBoundary(client) {
  if (running) return;
  running = true;

  try {
    const guilds = [...client.guilds.cache.values()];
    const ready = [];
    // Close every server synchronously before awaiting any Discord request.
    for (const guild of guilds) {
      try {
        closeMonthIfNeeded(guild.id);
        ready.push(guild);
      } catch (error) {
        console.error('[MONTHLY] Close month failed:', guild.id, error.message);
      }
    }
    for (const guild of ready) {
      try { await processPendingResults(guild); }
      catch (error) { console.error('[MONTHLY] Announcement/roles failed:', guild.id, error.message); }
    }
  } finally {
    running = false;
  }
}

async function startMonthlySystem(client) {

  // Chạy ngay khi bot ready để chốt tháng cũ trước khi hệ thống hoạt động lâu.
  await processMonthlyBoundary(client);

  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    processMonthlyBoundary(client).catch(console.error);
  }, 60_000);

  console.log('[MONTHLY] Monthly Rank System đã hoạt động (Asia/Ho_Chi_Minh).');
}

module.exports = {
  startMonthlySystem,
  processMonthlyBoundary,
  getCurrentMonthKey,
  monthLabel,
  sendMonthlyAnnouncement,
};
