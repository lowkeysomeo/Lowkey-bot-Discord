const { EmbedBuilder, PermissionFlagsBits: P } = require('discord.js');
const { getOptions, getRewards, template } = require('./customization');
const { getDb } = require('./database');

const pending = new Map();
function history() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS role_notice_history (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL, role_id TEXT NOT NULL,
    sent_at INTEGER NOT NULL, PRIMARY KEY (guild_id, user_id, role_id))`);
  return db;
}

async function notifyRoles(member, added) {
  if (!member || member.user?.bot || !added.length) return;
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
    const values = { user: `<@${member.id}>`, username: member.displayName || member.user.username,
      roles: roles.map(id => `<@&${id}>`).join(' · '), server: member.guild.name };
    await channel.send({
      content: options.roleNoticeMention ? `🎊 <@${member.id}>` : undefined,
      embeds: [new EmbedBuilder().setColor(options.roleNoticeColor)
        .setTitle(template(options.roleNoticeTitle, values).slice(0, 256))
        .setDescription(template(options.roleNoticeText, values).slice(0, 4096))
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

module.exports = { notifyRoles, handleRoleUpdate };
