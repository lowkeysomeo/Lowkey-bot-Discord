'use strict';
const { EmbedBuilder, PermissionFlagsBits: P } = require('discord.js');

/**
 * Gửi thông báo vào kênh chat chung khi có thành viên mới vào server:
 * Dòng ping lễ tân & thành viên mới ở ngoài, kèm khung Embed chào mừng có avatar.
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
  if (!channel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks])) {
    console.error('[RECEPTIONIST] Bot thiếu quyền gửi tin / embed vào kênh:', channelId);
    return;
  }

  const format = (text) => (text || '')
    .replace(/\{member\}/g, `<@${member.id}>`)
    .replace(/\{role\}/g, roleId ? `<@&${roleId}>` : '')
    .replace(/\{server\}/g, guild.name)
    .replace(/\{username\}/g, member.user.username)
    .replace(/\{memberCount\}/g, String(guild.memberCount));

  // 1. Dòng mention bên ngoài Embed (tạo thông báo chuông cho thành viên và lễ tân)
  const pingText = format(options.receptionistPingText || '👋 Welcome {member} đến với **{server}**! {role}');

  // 2. Khung Embed chào mừng đẹp mắt
  const title = format(options.receptionistTitle || '✨ Welcome to {server}');
  const desc = format(options.receptionistText || '🌸 Chào mừng bạn gia nhập **{server}**!\n\nMỗi thành viên đều là một phần quan trọng của cộng đồng. Đừng ngần ngại gửi lời chào và trò chuyện cùng {role} và mọi người nhé!\n\n✨ Chúc bạn có những phút giây thật vui vẻ tại đây!');

  const embed = new EmbedBuilder()
    .setColor(options.receptionistColor || '#54a0ff')
    .setTitle(title.slice(0, 256))
    .setDescription(desc.slice(0, 4096));

  const avatar = typeof member.user?.displayAvatarURL === 'function'
    ? member.user.displayAvatarURL({ extension: 'png', forceStatic: false, size: 256 })
    : null;
  if (avatar) embed.setThumbnail(avatar);

  const iconURL = typeof guild.iconURL === 'function' ? (guild.iconURL() || undefined) : undefined;
  embed.setFooter({
    text: `${guild.name} • Thành viên #${guild.memberCount}`,
    iconURL,
  });
  embed.setTimestamp();

  await channel.send({
    content: pingText.trim(),
    embeds: [embed],
    allowedMentions: {
      parse: [],
      users: [member.id],
      roles: roleId ? [roleId] : [],
    },
  });
}

module.exports = { notifyReceptionist };
