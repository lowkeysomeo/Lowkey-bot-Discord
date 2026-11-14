'use strict';
const { createHash } = require('node:crypto');
const { getOptions } = require('./customization');
const { getDb } = require('./database');

const cooldown = new Map();
const recentMentions = new Map();
const inviteGuildCache = new Map();
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

const OFFICIAL_DISCORD_INVITE_RE = /(?:^|[^a-z0-9_.-])((?:https?:\/\/)?(?:(?:www|ptb|canary)\.)?(?:discord\.gg\/|(?:discord\.com|discordapp\.com)\/invite\/)([a-z0-9-_]+)(?:\?[^\s)>\]]*)?)/gi;
const EXTERNAL_INVITE_RE = /(?:^|[^a-z0-9_.-])(?:https?:\/\/)?(?:www\.)?(?:dsc\.gg\/|discord\.me\/|discord\.io\/|discord\.link\/|invite\.gg\/|t\.me\/|telegram\.me\/|guilded\.gg\/|revolt\.chat\/)[a-z0-9-_]+/i;

function extractDiscordInvites(text) {
  const norm = normalize(text);
  const matches = [];
  for (const m of norm.matchAll(OFFICIAL_DISCORD_INVITE_RE)) {
    matches.push({ url: m[1], code: m[2] });
  }
  return matches;
}

function hasInvite(text) {
  const norm = normalize(text);
  return extractDiscordInvites(norm).length > 0 || EXTERNAL_INVITE_RE.test(norm);
}

function setInviteCache(code, guildId, ttlMs = 300000) {
  if (inviteGuildCache.size >= 5000) inviteGuildCache.delete(inviteGuildCache.keys().next().value);
  inviteGuildCache.set(code, { guildId, expiresAt: Date.now() + ttlMs });
}

function clearInviteCache() {
  inviteGuildCache.clear();
}

async function resolveInviteGuildId(guild, code) {
  if (!guild || !code) return undefined;
  const guildId = String(guild.id || '');
  if (guild.vanityURLCode && code.toLowerCase() === String(guild.vanityURLCode).toLowerCase()) {
    return guildId;
  }

  const cachedGuildInvite = guild.invites?.cache?.get?.(code);
  if (cachedGuildInvite) {
    return String(cachedGuildInvite.guildId || cachedGuildInvite.guild?.id || guildId);
  }

  const cached = inviteGuildCache.get(code);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.guildId;
  }

  if (typeof guild.client?.fetchInvite === 'function') {
    try {
      const fetched = await guild.client.fetchInvite(code);
      const targetGuildId = fetched?.guildId || fetched?.guild?.id || null;
      const resolved = targetGuildId ? String(targetGuildId) : null;
      setInviteCache(code, resolved, 300000);
      return resolved;
    } catch (error) {
      if (error?.code === 10006 || error?.status === 404) {
        setInviteCache(code, null, 60000);
        return null;
      }
      // Fall through to guild.invites.fetch if transient error
    }
  }

  if (typeof guild.invites?.fetch === 'function') {
    try {
      const guildInvites = await guild.invites.fetch();
      const found = guildInvites?.get?.(code);
      if (found) {
        const resolved = String(found.guildId || found.guild?.id || guildId);
        setInviteCache(code, resolved, 300000);
        return resolved;
      }
    } catch {}
  }

  return undefined;
}

function stripSameGuildLinks(text, guildId, sameGuildInviteUrls) {
  let clean = normalize(text);
  for (const url of [...sameGuildInviteUrls].sort((a, b) => b.length - a.length)) {
    clean = clean.split(url).join(' ');
  }
  if (/^\d{17,20}$/.test(String(guildId || ''))) {
    const channelOrEventRe = new RegExp(`(?:https?:\\/\\/)?(?:(?:www|ptb|canary)\\.)?(?:discord\\.com|discordapp\\.com)\\/(?:channels|events)\\/${guildId}(?:\\/[^\\s]*)?`, 'gi');
    clean = clean.replace(channelOrEventRe, ' ');
  }
  return clean;
}

async function analyzeInviteAndAd(msg) {
  const norm = normalize(msg.content);
  if (EXTERNAL_INVITE_RE.test(norm)) {
    return { isInvite: true, isSuspiciousAd: false };
  }

  const discordInvites = extractDiscordInvites(norm);
  const guildId = String(msg.guild?.id || '');
  const sameGuildInviteUrls = [];

  if (discordInvites.length > 0) {
    const uniqueCodes = [...new Set(discordInvites.map(item => item.code))];
    const resolvedByCode = new Map();
    for (const code of uniqueCodes) {
      resolvedByCode.set(code, await resolveInviteGuildId(msg.guild, code));
    }

    for (const item of discordInvites) {
      const targetGuildId = resolvedByCode.get(item.code);
      if (!targetGuildId || targetGuildId !== guildId) {
        return { isInvite: true, isSuspiciousAd: false };
      }
      sameGuildInviteUrls.push(item.url);
    }
  }

  const sanitized = stripSameGuildLinks(norm, guildId, sameGuildInviteUrls);
  return { isInvite: false, isSuspiciousAd: hasSuspiciousAd(sanitized) };
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

function formatSafeSnippet(text, maxLen = 200) {
  const clean = String(text || '')
    .replace(/<@!?(\d{17,20})>/g, '[@user:$1]')
    .replace(/<@&(\d{17,20})>/g, '[@role:$1]')
    .replace(/@everyone/gi, '@\u200Beveryone')
    .replace(/@here/gi, '@\u200Bhere')
    .replace(/`/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  return clean.length > maxLen ? `${clean.slice(0, maxLen - 1)}…` : clean;
}

async function inspect(msg, tools) {
  if (!msg.guild || !msg.author || msg.author.bot || !msg.member) return false;
  const o = getOptions(msg.guild.id);
  if (!o.securityEnabled || tools.trusted(msg.guild, msg.author.id, o)) return false;

  const now = (typeof tools.now === 'function' ? tools.now() : (Number(tools.now) || msg._now || msg.createdTimestamp || Date.now()));
  let violation = '', action = o.securityChatAction, violationCategory = '', violationDetail = '';

  if (o.securityInvites && !exempt(msg, o.securityInviteChannels, o.securityInviteRoles)) {
    const { isInvite, isSuspiciousAd } = await analyzeInviteAndAd(msg);
    if (isInvite || isSuspiciousAd) {
      violation = isInvite ? 'quảng cáo server khác (link mời)' : 'nghi ngờ quảng cáo web hoặc liên kết lạ';
      action = o.securityInviteAction || 'timeout';
      violationCategory = 'invite';
    }
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

    const roleMentionsCount = msg.mentions?.roles?.size || 0;
    const mentions = directUsersCount + roleMentionsCount;
    const isEveryoneMention = Boolean(msg.mentions?.everyone);
    const isMassMention = mentions >= o.securityMentionLimit;
    const mass = o.securitySpam && o.securityMentionEnabled && (isMassMention || isEveryoneMention);
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
      violation = isEveryoneMention ? 'tag @everyone/@here' : 'tag hàng loạt';
      violationCategory = 'mention';
      action = 'timeout';
    } else if (burst) {
      violation = 'gửi tin quá nhanh';
      violationCategory = 'spam';
    } else if (duplicate) {
      violation = 'lặp nội dung nhiều lần';
      violationCategory = 'duplicate';
    }

    if (violationCategory === 'mention') {
      violationDetail = ` (user: ${directUsersCount}, role: ${roleMentionsCount}, @everyone/@here: ${isEveryoneMention ? 'có' : 'không'})`;
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

  const safeSnippet = formatSafeSnippet(msg.content);
  const snippetLine = safeSnippet ? `\n> ${canDelete ? 'Nội dung đã xóa' : 'Nội dung'}: \`${safeSnippet}\`` : '';

  try {
    if (action === 'timeout') await tools.punish(msg.member, 'timeout', 'Bảo vệ chat: ' + violation, timeoutMs);
    await tools.alert(msg.guild, msg.author.id + ' tại <#' + msg.channelId + '>: ' + violation + violationDetail + '. ' + (action === 'timeout' ? 'Timeout ' + durationText + '.' : 'Chỉ xóa tin vi phạm.') + (!canDelete ? ' Bot thiếu quyền xóa tin.' : '') + snippetLine);
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
  analyzeInviteAndAd,
  extractDiscordInvites,
  resolveInviteGuildId,
  clearInviteCache,
  exempt,
  normalize,
  formatSafeSnippet,
  extractUserMentions,
  getMaxSingleUserMentions,
  trackAndCheckContinuousMentions,
  resetRecentMentions,
  recordViolation,
  countRecentViolations,
  clearCooldown,
};
