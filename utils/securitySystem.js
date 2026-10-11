const { AuditLogEvent: A, Events, PermissionFlagsBits: P } = require('discord.js');
const { getOptions } = require('./customization');
const { getGuildSetting, setGuildSetting } = require('./guildSettings');
const buckets = new Map(), seen = new Map(), busy = new Set();
const watched = new Set([A.ChannelCreate,A.ChannelUpdate,A.ChannelDelete,A.ChannelOverwriteCreate,A.ChannelOverwriteUpdate,A.ChannelOverwriteDelete,A.RoleCreate,A.RoleUpdate,A.RoleDelete,A.MemberKick,A.MemberBanAdd,A.MemberPrune,A.MemberRoleUpdate,A.BotAdd,A.WebhookCreate,A.WebhookUpdate,A.WebhookDelete,A.GuildUpdate,A.AutoModerationRuleDelete]);
const reason = 'Bảo vệ server: phát hiện hành vi vượt ngưỡng';
function hit(key, seconds, limit, now = Date.now()) {
  const list = (buckets.get(key) || []).filter(t => t > now - seconds * 1000);
  list.push(now); buckets.set(key, list.slice(-limit)); return list.length >= limit;
}
function trusted(guild, id, o) { return id === guild.ownerId || id === guild.client.user.id || o.securityTrusted.split(/[\s,]+/).includes(id); }
async function alert(guild, text) {
  console.warn('[SECURITY]', guild.id, text);
  const id = getOptions(guild.id).securityLogChannel;
  if (!id) return;
  try { const channel = await guild.channels.fetch(id); await channel.send({ content: `🛡️ ${text}`.slice(0,1900), allowedMentions: { parse: [] } }); }
  catch (error) { console.error('[SECURITY LOG]', error.message); }
}
async function punish(member, kind) {
  if (kind === 'ban') { if (!member.bannable) throw Error('Bot không đủ quyền/vị trí role để ban.'); await member.ban({ reason }); }
  else if (kind === 'kick') { if (!member.kickable) throw Error('Bot không đủ quyền/vị trí role để kick.'); await member.kick(reason); }
  else { if (!member.moderatable) throw Error('Bot không thể timeout thành viên này.'); await member.timeout(10 * 60 * 1000, reason); }
}
async function audit(entry, guild) {
  const o = getOptions(guild.id), id = entry.executorId;
  if (!o.securityEnabled || !o.securityNuke || !id || trusted(guild,id,o) || !watched.has(entry.action)) return;
  if (Date.now() - entry.createdTimestamp > 15000 || seen.has(entry.id)) return;
  seen.set(entry.id, Date.now());
  if (!hit(`audit:${guild.id}:${id}`,o.securityNukeWindow,o.securityNukeLimit)) return;
  const key = `actor:${guild.id}:${id}`;
  if (busy.has(key)) return;
  busy.add(key);
  try {
    const member = await guild.members.fetch(id);
    await punish(member,o.securityNukeAction);
    await alert(guild,`Anti-nuke: ${o.securityNukeAction} ${id}; hành động Audit Log ${entry.action}.`);
  } catch (error) { await alert(guild,`KHÔNG CHẶN ĐƯỢC ${id}: ${error.message}`); }
  finally { busy.delete(key); }
}
async function joined(member) {
  const guild = member.guild, o = getOptions(guild.id);
  if (!o.securityEnabled || !o.securityRaid || trusted(guild,member.id,o)) return;
  let until = Number(getGuildSetting(guild.id,'SECURITY_GATE_UNTIL') || 0);
  if (hit(`joins:${guild.id}`,o.securityRaidWindow,o.securityRaidLimit) && until <= Date.now()) {
    until = Date.now() + o.securityGateMinutes * 60000;
    setGuildSetting(guild.id,'SECURITY_GATE_UNTIL',String(until));
    await alert(guild,`Phát hiện raid: chặn người vào mới trong ${o.securityGateMinutes} phút. Người đã vào trước ngưỡng vẫn chịu kiểm tra spam.`);
  }
  if (until > Date.now()) {
    try { await punish(member,'kick'); }
    catch (error) { await alert(guild,`Không kick được thành viên raid ${member.id}: ${error.message}`); }
  }
}
async function message(msg) {
  if (!msg.guild || msg.author.bot || !msg.member) return;
  const o = getOptions(msg.guild.id);
  if (!o.securityEnabled || !o.securitySpam || trusted(msg.guild,msg.author.id,o)) return;
  const burst = hit(`spam:${msg.guild.id}:${msg.author.id}`,o.securitySpamWindow,o.securitySpamLimit);
  const mentions = msg.mentions.users.size + msg.mentions.roles.size;
  if (!burst && mentions < o.securityMentionLimit && !msg.mentions.everyone) return;
  const key = `spam-action:${msg.guild.id}:${msg.author.id}`;
  // Xóa cả các tin đến trong khi thao tác timeout đang chạy.
  try { if (msg.deletable) await msg.delete(); } catch (error) { console.error('[SECURITY DELETE]',error.message); }
  if (busy.has(key)) return;
  busy.add(key);
  try { await punish(msg.member,'timeout'); await alert(msg.guild,`Đã timeout ${msg.author.id} 10 phút do spam/mass mention.`); }
  catch (error) { await alert(msg.guild,`Không timeout được ${msg.author.id}: ${error.message}`); }
  finally { busy.delete(key); }
}
function start(client) {
  if (client.__securityStarted) return; client.__securityStarted = true;
  const safe = fn => (...args) => Promise.resolve().then(()=>fn(...args)).catch(error=>console.error('[SECURITY]',error.message));
  client.on(Events.GuildAuditLogEntryCreate,safe(audit));
  client.on(Events.GuildMemberAdd,safe(async member=>{
    await joined(member);
    if(member.user.bot)await require('./securityReview').botJoined(member);
  }));
  client.on(Events.GuildMemberUpdate,safe(require('./securityReview').memberUpdated));
  client.on(Events.GuildRoleUpdate,safe(require('./securityReview').roleUpdated));
  client.on(Events.GuildMemberRemove,safe(require('./securityReview').memberLeft));
  client.on(Events.MessageCreate,safe(message));
  const timer = setInterval(()=>{
    const now = Date.now();
    for (const [key,list] of buckets) if (!list.length || now-list.at(-1)>300000) buckets.delete(key);
    for (const [key,time] of seen) if (now-time>60000) seen.delete(key);
  },60000); timer.unref();
}
function requiredPermissions() { return [P.ViewAuditLog,P.BanMembers,P.KickMembers,P.ModerateMembers,P.ManageMessages,P.ManageRoles]; }
module.exports = { start, audit, joined, message, hit, trusted, requiredPermissions };
