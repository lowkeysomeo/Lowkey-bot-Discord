'use strict';
const { PermissionFlagsBits: P } = require('discord.js');

/**
 * Gửi thông báo vào kênh chat chung khi có thành viên mới vào server,
 * tag role lễ tân để lễ tân biết có người cần chào hỏi.
 * @param {import('discord.js').GuildMember} member
 */
async function notifyReceptionist(member) {
  if (member.user.bot) return;
  const guild = member.guild;
  const options = require('./customization').getOptions(guild.id);

  if (!options.receptionistEnabled) return;

  const channelId = options.receptionistChannel;
  const roleId = options.receptionistRole;

  if (!channelId) return;

  const me = guild.members.me || await guild.members.fetchMe();
  let channel;
  try {
    channel = await guild.channels.fetch(channelId);
  } catch {
    console.error('[RECEPTIONIST] Không lấy được kênh:', channelId);
    return;
  }

  if (!channel || channel.guildId !== guild.id) return;
  if (!channel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages])) {
    console.error('[RECEPTIONIST] Bot thiếu quyền gửi tin vào kênh:', channelId);
    return;
  }

  // Xây nội dung thông báo theo mẫu người dùng tuỳ chỉnh
  let text = options.receptionistText || '👋 {member} vừa vào server! {role} chào thành viên mới nhé~';
  text = text
    .replace(/\{member\}/g, `<@${member.id}>`)
    .replace(/\{role\}/g, roleId ? `<@&${roleId}>` : '')
    .replace(/\{server\}/g, guild.name)
    .replace(/\{username\}/g, member.user.username)
    .replace(/\{memberCount\}/g, String(guild.memberCount));

  // Khi gửi: mention role lễ tân (có ping) nhưng KHÔNG ping @member để không tạo cảm giác bị gọi
  await channel.send({
    content: text.trim(),
    allowedMentions: {
      parse: [],
      roles: roleId ? [roleId] : [],
    },
  });
}

module.exports = { notifyReceptionist };
