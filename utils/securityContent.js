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

function trackAndCheckContinuousMentions(guildId, authorId, targetIds, windowMs = 120000, threshold = 10, now = Date.now()) {
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
  const norm = normalize(text);
  const discordRegex = /(?:^|[^a-z0-9_.-])(?:https?:\/\/)?(?:www\.)?(?:discord\.gg\/|(?:discord\.com|discordapp\.com)\/invite\/|dsc\.gg\/|discord\.me\/|discord\.io\/|discord\.link\/|invite\.gg\/)[a-z0-9-_]+/i;
  const otherPlatformRegex = /(?:^|[^a-z0-9_.-])(?:https?:\/\/)?(?:www\.)?(?:t\.me\/|telegram\.me\/|guilded\.gg\/|revolt\.chat\/)[a-z0-9-_]+/i;
  return discordRegex.test(norm) || otherPlatformRegex.test(norm);
}

function hasSuspiciousAd(text) {
  const norm = normalize(text);
  const SHORTENERS = /(?:^|[^a-z0-9_.-])(?:https?:\/\/)?(?:www\.)?(?:bit\.ly|tinyurl\.com|t\.co|cutt\.ly|shorturl\.at|is\.gd|buff\.ly|ow\.ly|linkvertise\.com|adf\.ly|bc\.vc|tiny\.cc|shorte\.st|bitly\.com)\/[a-z0-9-_]+/i;
  if (SHORTENERS.test(norm)) return true;

  const PHISHING_OR_SCAM = /(?:https?:\/\/)?(?:www\.)?[a-z0-9-]*?(?:dlscord|discorcl|discocl|discord-gift|discord-nitro|free-nitro|nitro-discord|discordapp-gift|steamcommunity-[a-z0-9-]+|steam-nitro|steam-trade-gift)[a-z0-9-]*\.[a-z]{2,}[^\s]*/i;
  if (PHISHING_OR_SCAM.test(norm)) return true;

  const HAS_ANY_URL = /(?:https?:\/\/|www\.)[^\s]+|[a-z0-9-]+\.(?:com|net|org|vn|xyz|top|store|shop|me|site|info|online|vip|pro)(?:\/[^\s]*)?/i;
  const AD_KEYWORDS = /(?:qu[aả]ng\s*c[aá]o|mua\s*b[aá]n|b[aá]n\s*(?:acc|nick|bot|code|clone|mail)|shop\s*(?:acc|uy\s*t[ií]n|gi[aá]\s*r[eẻ]|bot)|d[iị]ch\s*v[uụ]\s*(?:c[aà]y|t[aă]ng|fb|discord)|tuy[eể]n\s*ref|ki[eế]m\s*ti[eề]n|nh[aậ]n\s*(?:qu[aà]|nitro|th[uư][oở]ng)|free\s*nitro|tham\s*gia\s*server|join\s*server|server\s*m[oớ]i|v[aà]o\s*server|link\s*server|gh[eé]\s*th[aă]m\s*server|v[aà]o\s*nh[oó]m|link\s*nh[oó]m|c[oộ]ng\s*[đd][oồ]ng\s*m[oớ]i|group\s*zalo|nh[oó]m\s*zalo|k[eê]nh\s*telegram|inbox\s*mua|li[eê]n\s*h[eệ]\s*shop|mua\s*ngay\s*t[aạ]i|gi[aá]\s*si[eê]u\s*r[eẻ]|website\s*b[aá]n|web\s*b[aá]n)/i;

  return HAS_ANY_URL.test(norm) && AD_KEYWORDS.test(norm);
}

async function inspect(msg, tools) {
  if (!msg.guild || !msg.author || msg.author.bot || !msg.member) return false;
  const o = getOptions(msg.guild.id);
  if (!o.securityEnabled || tools.trusted(msg.guild, msg.author.id, o)) return false;

  const now = (typeof tools.now === 'function' ? tools.now() : (Number(tools.now) || msg._now || msg.createdTimestamp || Date.now()));
  let violation = '', action = o.securityChatAction, violationCategory = '';

  const isInvite = hasInvite(msg.content);
  const isSuspiciousAd = hasSuspiciousAd(msg.content);
  if (o.securityInvites && !exempt(msg, o.securityInviteChannels, o.securityInviteRoles) && (isInvite || isSuspiciousAd)) {
    violation = isInvite ? 'quảng cáo server khác (link mời)' : 'nghi ngờ quảng cáo web hoặc liên kết lạ';
    action = o.securityInviteAction || 'timeout';
    violationCategory = 'invite';
  }

  if (!violation && !exempt(msg, o.securityChatChannels, o.securityChatRoles)) {
    // Xác định ID người được reply nếu tin nhắn là một reply
    const repliedUserId = msg.mentions?.repliedUser?.id
      || (msg.reference?.messageId && msg.channel?.messages?.cache?.get(msg.reference.messageId)?.author?.id)
      || null;

    let userMentions = extractUserMentions(msg.content);
    // Bỏ qua lượt tag phát sinh từ Reply tin nhắn
    if (repliedUserId) {
      userMentions = userMentions.filter(id => id !== repliedUserId);
    }

    const maxSingle = getMaxSingleUserMentions(userMentions);
    const continuousLimit = Number(o.securityContinuousMentionLimit) || 10;
    const isContinuous = (o.securitySpam && o.securityMentionEnabled && userMentions.length > 0)
      ? trackAndCheckContinuousMentions(msg.guild.id, msg.author.id, userMentions, 120000, continuousLimit, now)
      : false;

    let mentionViolation = '';
    if (o.securitySpam && o.securityMentionEnabled) {
      if (maxSingle >= 3) {
        mentionViolation = 'tag 1 người 3 lần trong 1 tin nhắn';
      } else if (isContinuous) {
        mentionViolation = `tag liên tục ${continuousLimit} người trong vòng 2 phút`;
      }
    }

    // Đếm số lượng mention trực tiếp (loại trừ lượt tag tự động do Reply)
    let directUsersCount = 0;
    if (msg.mentions?.users) {
      const userEntries = msg.mentions.users instanceof Map
        ? [...msg.mentions.users.keys()]
        : (Array.isArray(msg.mentions.users)
          ? msg.mentions.users.map(u => (typeof u === 'string' ? u : u.id))
          : (typeof msg.mentions.users.keys === 'function' ? [...msg.mentions.users.keys()] : []));

      for (const uid of userEntries) {
        if (repliedUserId && uid === repliedUserId) continue;
        directUsersCount++;
      }
    }

    const mentions = directUsersCount + (msg.mentions?.roles?.size || 0);
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

  if (violationCategory === 'mention' || violationCategory === 'invite') {
    const window24h = 24 * 60 * 60 * 1000;
    const prevViolations = countRecentViolations(msg.guild.id, msg.author.id, violationCategory, window24h, now);
    if (prevViolations >= 1) {
      const repeatHours = Number(o.securityRepeatTimeoutHours) || 12;
      timeoutMs = repeatHours * 60 * 60 * 1000;
      durationText = `${repeatHours} giờ`;
    } else {
      const baseMinutes = Number(o.securityTimeoutMinutes) || 10;
      timeoutMs = baseMinutes * 60 * 1000;
      durationText = `${baseMinutes} phút`;
    }
    recordViolation(msg.guild.id, msg.author.id, violationCategory, timeoutMs, now);
    if (violationCategory === 'mention') resetRecentMentions(msg.guild.id, msg.author.id);
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
  hasSuspiciousAd,
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
