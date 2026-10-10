const { EmbedBuilder, AuditLogEvent, PermissionFlagsBits: P } = require('discord.js');
const { getOptions, getRewards, template } = require('./customization');
const { getDb } = require('./database');

const pending = new Map();
const grants = new Map();
const grantKey = (member, roleId) => member.guild.id + ':' + member.id + ':' + roleId;

async function grantLevelRole(member, roleId, type, level, threshold) {
  const key = grantKey(member, roleId);
  grants.set(key, { type, level, threshold });
  try {
    await member.roles.add(roleId, 'Thưởng ' + (type === 'voice' ? 'Voice' : 'Chat') + ' Level ' + threshold);
    await notifyRoles(member, [roleId]);
  } finally { grants.delete(key); }
}

async function findGrantors(member, roleIds, since) {
  const found = new Map();
  if (!roleIds.length) return found;
  const me = member.guild.members.me || await member.guild.members.fetchMe();
  if (!me?.permissions?.has(P.ViewAuditLog)) return found;
  // Nhật ký Discord có thể đến chậm hơn sự kiện role một chút.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 800));
    let logs;
    try { logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 10 }); }
    catch { return found; }
    for (const entry of logs.entries.values()) {
      if ((entry.targetId || entry.target?.id) !== member.id || !entry.executor?.id
        || entry.createdTimestamp < since - 5000 || entry.createdTimestamp > since + 5000) continue;
      const added = entry.changes?.find(change => change.key === '$add')?.new || [];
      for (const id of roleIds) if (!found.has(id) && added.some(role => role.id === id)) found.set(id, entry.executor.id);
    }
    if (roleIds.every(id => found.has(id))) break;
  }
  return found;
}
function history() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS role_notice_history (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL, role_id TEXT NOT NULL,
    sent_at INTEGER NOT NULL, PRIMARY KEY (guild_id, user_id, role_id))`);
  return db;
}

async function notifyRoles(member, added) {
  if (!member || member.user?.bot || !added.length) return;
  const receivedAt = Date.now();
  const key = `${member.guild.id}:${member.id}`;
  const task = (pending.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    const options = getOptions(member.guild.id);
    if (!options.roleNoticeEnabled || !options.roleNoticeChannel) return;
    const allowed = new Set(options.roleNoticeRoles);
    if (options.roleNoticeLevelRewards) {
      for (const type of ['chat', 'voice']) for (const reward of getRewards(member.guild.id, type)) allowed.add(reward.roleId);
    }
    const excluded = new Set(options.roleNoticeExcludedRoles);
    const candidates = [...new Set(added)].filter(id => allowed.has(id) && !excluded.has(id) && id !== member.guild.id);
    if (!candidates.length) return;
    const db = history();
    const roles = candidates.filter(id => {
      const role = member.guild.roles.cache.get(id);
      if (!role || role.managed) return false;
      const previous = db.prepare('SELECT sent_at FROM role_notice_history WHERE guild_id=? AND user_id=? AND role_id=?').get(member.guild.id, member.id, id);
      // Cấp role qua lệnh và sự kiện Discord có thể đến cùng lúc.
      return !previous || Date.now() - previous.sent_at > 15000;
    });
    if (!roles.length) return;
    const channel = await member.guild.channels.fetch(options.roleNoticeChannel);
    const me = member.guild.members.me || await member.guild.members.fetchMe();
    if (!channel || channel.guildId !== member.guild.id || ![0, 5].includes(channel.type)
      || !channel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks])) return;
    const sources = new Map(roles.map(id => [id, grants.get(grantKey(member, id))]));
    const actors = await findGrantors(member, roles.filter(id => !sources.get(id)), receivedAt);
    const reasons = roles.map(id => {
      const source = sources.get(id);
      const reason = source
        ? 'Đạt mốc **' + (source.type === 'voice' ? 'Voice' : 'Chat') + ' Level ' + source.threshold + '**' + (source.level > source.threshold ? ' (hiện tại Level ' + source.level + ')' : '') + '.'
        : 'Admin bổ nhiệm';
      return '<@&' + id + '> — ' + reason;
    }).join('\n');
    const grantors = roles.map(id => {
      const actor = sources.get(id) ? (me.id || me.user?.id) : actors.get(id);
      return '<@&' + id + '> — ' + (actor ? '<@' + actor + '>' : 'Chưa xác định được người cấp.');
    }).join('\n');
    const values = { reason: reasons, grantedBy: grantors, user: `<@${member.id}>`, username: member.displayName || member.user.username,
      roles: roles.map(id => `<@&${id}>`).join(' · '), server: member.guild.name };
    await channel.send({
      content: options.roleNoticeMention ? `🎊 <@${member.id}>` : undefined,
      embeds: [new EmbedBuilder().setColor(options.roleNoticeColor)
        .setTitle(template(options.roleNoticeTitle, values).slice(0, 256))
        .setDescription(template(options.roleNoticeText, values).slice(0, 3000))
        .addFields(
          ...(!options.roleNoticeText.includes('{reason}') ? [{ name: '🏅 Lý do nhận role', value: reasons.slice(0, 1024) }] : []),
          ...(!options.roleNoticeText.includes('{grantedBy}') ? [{ name: '🤝 Người cấp role', value: grantors.slice(0, 1024) }] : []),
        )
        .setThumbnail(member.user.displayAvatarURL({ extension: 'png', size: 128 }))
        .setFooter({ text: 'VietNam Legacy • Cùng ghi dấu những điều đáng nhớ' })],
      allowedMentions: { parse: [], users: options.roleNoticeMention ? [member.id] : [], roles: [] },
    });
    const now = Date.now();
    db.transaction(() => {
      db.prepare('DELETE FROM role_notice_history WHERE sent_at < ?').run(now - 60000);
      for (const id of roles) db.prepare('INSERT INTO role_notice_history VALUES (?,?,?,?) ON CONFLICT(guild_id,user_id,role_id) DO UPDATE SET sent_at=excluded.sent_at').run(member.guild.id, member.id, id, now);
    })();
  });
  pending.set(key, task);
  try { await task; } catch (error) { console.error('[ROLE NOTICE]', error.message); }
  finally { if (pending.get(key) === task) pending.delete(key); }
}

async function handleRoleUpdate(before, after) {
  // Không suy đoán role mới nếu chưa biết trạng thái cũ, tránh chúc mừng lại cả bộ role.
  if (!before || before.partial || after.partial || after.user?.bot) return;
  const added = [...after.roles.cache.keys()].filter(id => !before.roles.cache.has(id));
  return notifyRoles(after, added);
}

module.exports = { notifyRoles, handleRoleUpdate, grantLevelRole, findGrantors };
