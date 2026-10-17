'use strict';
const { createHash } = require('node:crypto');
const { getOptions } = require('./customization');
const { getDb } = require('./database');

const cooldown = new Map();
const recentMentions = new Map();
const ids = value => new Set(String(value || '').split(/[\s,]+/).filter(x => /^\d{17,20}$/.test(x)));

function getSecurityDb() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_violations (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      violation_type TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_security_violations
      ON security_violations(guild_id, user_id, violation_type, created_at);
  `);
  return db;
}

function recordViolation(guildId, userId, violationType, durationMs, createdAt = Date.now()) {
  try {
    const db = getSecurityDb();
    const id = `${guildId}:${userId}:${createdAt}:${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(`
      INSERT INTO security_violations (id, guild_id, user_id, violation_type, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, String(guildId), String(userId), String(violationType), Number(durationMs), Number(createdAt));
  } catch (error) {
    console.error('[SECURITY DB ERROR] recordViolation:', error.message);
  }
}

function countRecentViolations(guildId, userId, violationType, windowMs = 24 * 60 * 60 * 1000, now = Date.now()) {
  try {
    const db = getSecurityDb();
    const since = now - windowMs;
    const row = db.prepare(`
      SELECT COUNT(*) AS count
      FROM security_violations
      WHERE guild_id = ? AND user_id = ? AND violation_type = ? AND created_at > ?
    `).get(String(guildId), String(userId), String(violationType), since);
    return Number(row?.count) || 0;
  } catch (error) {
    console.error('[SECURITY DB ERROR] countRecentViolations:', error.message);
    return 0;
  }
}

function extractUserMentions(text) {
  const raw = String(text || '');
  const matches = [];
  const regex = /<@!?(\d{17,20})>/g;
  let m;
  while ((m = regex.exec(raw)) !== null) {
    matches.push(m[1]);
  }
  return matches;
}

function getMaxSingleUserMentions(userIds) {
  const counts = new Map();
  let max = 0;
  for (const id of userIds) {
    const c = (counts.get(id) || 0) + 1;
    counts.set(id, c);
    if (c > max) max = c;
  }
  return max;
}

function trackAndCheckContinuousMentions(guildId, authorId, targetIds, windowMs = 120000, threshold = 3, now = Date.now()) {
  if (!targetIds || !targetIds.length) return false;
  const key = `${guildId}:${authorId}`;
  const cutoff = now - windowMs;
  let list = (recentMentions.get(key) || []).filter(item => item.time > cutoff);
  for (const tid of targetIds) {
    list.push({ targetId: tid, time: now });
  }
  if (list.length > 100) list = list.slice(-100);
  recentMentions.set(key, list);

  const distinctTargets = new Set(list.map(item => item.targetId));
  return distinctTargets.size >= threshold;
}

function resetRecentMentions(guildId, authorId) {
  recentMentions.delete(`${guildId}:${authorId}`);
}

function clearCooldown(guildId, authorId) {
  if (guildId && authorId) {
    cooldown.delete(`${guildId}:${authorId}`);
  } else {
    cooldown.clear();
  }
}

function exempt(msg, channelIds, roleIds) {
  const channels = ids(channelIds), roles = ids(roleIds);
  return channels.has(msg.channelId) || channels.has(msg.channel?.parentId) ||
    [...(msg.member?.roles?.cache?.keys() || [])].some(id => roles.has(id));
}

function normalize(text) {
  let value = String(text || '').normalize('NFKC').replace(/[\u200B-\u200F\u2060\uFEFF]/g, '');
  try { value = decodeURIComponent(value); } catch {}
  return value;
}

function hasInvite(text) {
  return /(?:^|[^a-z0-9_.-])(?:https?:\/\/)?(?:www\.)?(?:discord\.gg\/|(?:discord\.com|discordapp\.com)\/invite\/)[a-z0-9-]+/i.test(normalize(text));
}

async function inspect(msg, tools) {
  if (!msg.guild || !msg.author || msg.author.bot || !msg.member) return false;
  const o = getOptions(msg.guild.id);
  if (!o.securityEnabled || tools.trusted(msg.guild, msg.author.id, o)) return false;

  const now = (typeof tools.now === 'function' ? tools.now() : (Number(tools.now) || msg._now || msg.createdTimestamp || Date.now()));
  let violation = '', action = o.securityChatAction, violationCategory = '';

  if (o.securityInvites && !exempt(msg, o.securityInviteChannels, o.securityInviteRoles) && hasInvite(msg.content)) {
    violation = 'link mời Discord ngoài khu vực cho phép';
    action = o.securityInviteAction;
    violationCategory = 'invite';
  }

  if (!violation && !exempt(msg, o.securityChatChannels, o.securityChatRoles)) {
    const userMentions = extractUserMentions(msg.content);
    const maxSingle = getMaxSingleUserMentions(userMentions);
    const isContinuous = (o.securitySpam && o.securityMentionEnabled && userMentions.length > 0)
      ? trackAndCheckContinuousMentions(msg.guild.id, msg.author.id, userMentions, 120000, 3, now)
      : false;

    let mentionViolation = '';
    if (o.securitySpam && o.securityMentionEnabled) {
      if (maxSingle >= 3) {
        mentionViolation = 'tag 1 người 3 lần trong 1 tin nhắn';
      } else if (isContinuous) {
        mentionViolation = 'tag liên tục nhiều người trong vòng 2 phút';
      }
    }

    const mentions = (msg.mentions?.users?.size || 0) + (msg.mentions?.roles?.size || 0);
    const mass = o.securitySpam && o.securityMentionEnabled && (mentions >= o.securityMentionLimit || msg.mentions?.everyone);
    const burst = !tools.edited && o.securitySpam && tools.hit('spam:' + msg.guild.id + ':' + msg.author.id, o.securitySpamWindow, o.securitySpamLimit, now);
    const normalized = normalize(msg.content).toLowerCase().replace(/\s+/g, ' ').trim();
    const duplicate = !tools.edited && o.securityDuplicate && normalized.length >= 4 && tools.hit(
      'duplicate:' + msg.guild.id + ':' + msg.author.id + ':' + createHash('sha256').update(normalized).digest('hex').slice(0, 24),
      o.securityDuplicateWindow, o.securityDuplicateLimit, now);

    if (mentionViolation) {
      violation = mentionViolation;
      violationCategory = 'mention';
      action = 'timeout';
    } else if (mass) {
      violation = 'tag hàng loạt';
      violationCategory = 'mention';
      action = 'timeout';
    } else if (burst) {
      violation = 'gửi tin quá nhanh';
      violationCategory = 'spam';
    } else if (duplicate) {
      violation = 'lặp nội dung nhiều lần';
      violationCategory = 'duplicate';
    }
  }

  if (!violation) return false;

  const canDelete = Boolean(msg.deletable);
  try { if (canDelete) await msg.delete(); } catch (error) { console.warn('[SECURITY DELETE]', error.code || error.message); }

  const key = msg.guild.id + ':' + msg.author.id;
  if ((cooldown.get(key) || 0) > now || tools.busy.has(key)) return true;
  if (cooldown.size >= 10000) for (const [id, until] of cooldown) if (until <= now) cooldown.delete(id);
  if (cooldown.size >= 10000) cooldown.delete(cooldown.keys().next().value);
  cooldown.set(key, now + 30000);
  tools.busy.add(key);

  let timeoutMs = (Number(o.securityTimeoutMinutes) || 10) * 60000;
  let durationText = `${Number(o.securityTimeoutMinutes) || 10} phút`;

  if (violationCategory === 'mention') {
    const window24h = 24 * 60 * 60 * 1000;
    const prevViolations = countRecentViolations(msg.guild.id, msg.author.id, 'mention', window24h, now);
    if (prevViolations >= 1) {
      const repeatHours = Number(o.securityRepeatTimeoutHours) || 12;
      timeoutMs = repeatHours * 60 * 60 * 1000;
      durationText = `${repeatHours} giờ`;
    } else {
      const baseMinutes = Number(o.securityTimeoutMinutes) || 10;
      timeoutMs = baseMinutes * 60 * 1000;
      durationText = `${baseMinutes} phút`;
    }
    recordViolation(msg.guild.id, msg.author.id, 'mention', timeoutMs, now);
    resetRecentMentions(msg.guild.id, msg.author.id);
  }

  try {
    if (action === 'timeout') await tools.punish(msg.member, 'timeout', 'Bảo vệ chat: ' + violation, timeoutMs);
    await tools.alert(msg.guild, msg.author.id + ' tại <#' + msg.channelId + '>: ' + violation + '. ' + (action === 'timeout' ? 'Timeout ' + durationText + '.' : 'Chỉ xóa tin vi phạm.') + (!canDelete ? ' Bot thiếu quyền xóa tin.' : ''));
  } catch (error) {
    await tools.alert(msg.guild, 'Không xử lý được ' + msg.author.id + ': ' + error.message);
  } finally {
    tools.busy.delete(key);
  }

  return true;
}

module.exports = {
  inspect,
  hasInvite,
  exempt,
  normalize,
  extractUserMentions,
  getMaxSingleUserMentions,
  trackAndCheckContinuousMentions,
  resetRecentMentions,
  recordViolation,
  countRecentViolations,
  clearCooldown,
};
