'use strict';
const { EmbedBuilder, PermissionFlagsBits: P } = require('discord.js');

/**
 * Gửi thông báo vào kênh chat chung khi có thành viên mới vào server:
 * Dòng ping lễ tân & thành viên mới ở ngoài, kèm khung Embed chào mừng có avatar.
 * @param {import('discord.js').GuildMember} member
 */
async function notifyReceptionist(member) {
  if (!member || member.user?.bot) return;
  const guild = member.guild;
  if (!guild) return;

  const { getOptions } = require('./customization');
  const { getGuildSetting } = require('./guildSettings');
  const options = getOptions(guild.id);

  // Hỗ trợ cả Dashboard options và biến môi trường/guild_settings
  const channelId = options.receptionistChannel || getGuildSetting(guild.id, 'RECEPTIONIST_CHANNEL_ID');
  const roleId = options.receptionistRole || getGuildSetting(guild.id, 'RECEPTIONIST_ROLE_ID');
  const isEnabled = options.receptionistEnabled || (getGuildSetting(guild.id, 'RECEPTIONIST_ENABLED') === 'true');

  if (!isEnabled) return;
  if (!channelId) return;

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  let channel;
  try {
    channel = await guild.channels.fetch(channelId);
  } catch (error) {
    console.error(`[RECEPTIONIST] Không lấy được kênh: ${channelId} (${error.message})`);
    return;
  }

  if (!channel || channel.guildId !== guild.id) return;
  const perms = me ? channel.permissionsFor(me) : null;
  if (perms && !perms.has([P.ViewChannel, P.SendMessages])) {
    console.error(`[RECEPTIONIST] Bot thiếu quyền Xem kênh hoặc Gửi tin vào #${channel.name} (${channelId})`);
    return;
  }

  const format = (text) => (text || '')
    .replace(/\{member\}/g, `<@${member.id}>`)
    .replace(/\{role\}/g, roleId ? `<@&${roleId}>` : '')
    .replace(/\{server\}/g, guild.name)
    .replace(/\{username\}/g, member.displayName || member.user.username)
    .replace(/\{memberCount\}/g, String(guild.memberCount));

  // 1. Dòng mention bên ngoài (tạo thông báo chuông cho thành viên và lễ tân)
  let pingText = format(options.receptionistPingText || '👋 Welcome {member} đến với **{server}**! {role}');
  // Đảm bảo nếu có cấu hình role lễ tân thì role lễ tân chắc chắn xuất hiện trong pingText
  if (roleId && !pingText.includes(roleId)) {
    pingText = `${pingText.trim()} <@&${roleId}>`;
  }

  // 2. Nội dung chào mừng
  const title = format(options.receptionistTitle || '✨ Welcome to {server}');
  const desc = format(options.receptionistText || '🌸 Chào mừng bạn gia nhập **{server}**!\n\nMỗi thành viên đều là một phần quan trọng của cộng đồng. Đừng ngần ngại gửi lời chào và trò chuyện cùng {role} và mọi người nhé!\n\n✨ Chúc bạn có những phút giây thật vui vẻ tại đây!');

  const canEmbed = !perms || perms.has(P.EmbedLinks);
  const payload = {
    content: pingText.trim(),
    allowedMentions: {
      parse: [],
      users: [member.id],
      roles: roleId ? [roleId] : [],
    },
  };

  if (canEmbed) {
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
    payload.embeds = [embed];
  } else {
    // Nếu thiếu quyền EmbedLinks, fallback gửi dạng tin nhắn văn bản hoàn chỉnh
    payload.content = `${pingText.trim()}\n\n**${title}**\n${desc}`;
  }

  await channel.send(payload);
  console.log(`[RECEPTIONIST] Đã gửi thông báo chào mừng và tag lễ tân cho ${member.user?.tag || member.id} tại #${channel.name}`);
}

module.exports = { notifyReceptionist };
