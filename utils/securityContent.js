'use strict';
const { createHash } = require('node:crypto');
const { getOptions } = require('./customization');
const cooldown = new Map();
const ids = value => new Set(String(value || '').split(/[\s,]+/).filter(x => /^\d{17,20}$/.test(x)));
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
  let violation = '', action = o.securityChatAction;
  if (o.securityInvites && !exempt(msg, o.securityInviteChannels, o.securityInviteRoles) && hasInvite(msg.content)) {
    violation = 'link mời Discord ngoài khu vực cho phép'; action = o.securityInviteAction;
  }
  if (!violation && !exempt(msg, o.securityChatChannels, o.securityChatRoles)) {
    const mentions = (msg.mentions?.users?.size || 0) + (msg.mentions?.roles?.size || 0);
    const mass = o.securitySpam && o.securityMentionEnabled && (mentions >= o.securityMentionLimit || msg.mentions?.everyone);
    const burst = !tools.edited && o.securitySpam && tools.hit('spam:' + msg.guild.id + ':' + msg.author.id, o.securitySpamWindow, o.securitySpamLimit);
    const normalized = normalize(msg.content).toLowerCase().replace(/\s+/g, ' ').trim();
    const duplicate = !tools.edited && o.securityDuplicate && normalized.length >= 4 && tools.hit(
      'duplicate:' + msg.guild.id + ':' + msg.author.id + ':' + createHash('sha256').update(normalized).digest('hex').slice(0,24),
      o.securityDuplicateWindow, o.securityDuplicateLimit);
    violation = mass ? 'tag hàng loạt' : burst ? 'gửi tin quá nhanh' : duplicate ? 'lặp nội dung nhiều lần' : '';
  }
  if (!violation) return false;
  try { if (msg.deletable) await msg.delete(); } catch (error) { console.warn('[SECURITY DELETE]', error.code || error.message); }
  const key = msg.guild.id + ':' + msg.author.id;
  const now = Date.now();
  if ((cooldown.get(key) || 0) > now || tools.busy.has(key)) return true;
  if (cooldown.size >= 10000) for (const [id, until] of cooldown) if (until <= now) cooldown.delete(id);
  if (cooldown.size >= 10000) cooldown.delete(cooldown.keys().next().value);
  cooldown.set(key, now + 30000); tools.busy.add(key);
  try {
    if (action === 'timeout') await tools.punish(msg.member, 'timeout', 'Bảo vệ chat: ' + violation, o.securityTimeoutMinutes * 60000);
    await tools.alert(msg.guild, msg.author.id + ' tại <#' + msg.channelId + '>: ' + violation + '. ' + (action === 'timeout' ? 'Timeout ' + o.securityTimeoutMinutes + ' phút.' : 'Chỉ xóa tin vi phạm.') + (!msg.deletable ? ' Bot thiếu quyền xóa tin.' : ''));
  } catch (error) { await tools.alert(msg.guild, 'Không xử lý được ' + msg.author.id + ': ' + error.message); }
  finally { tools.busy.delete(key); }
  return true;
}
module.exports = { inspect, hasInvite, exempt, normalize };
