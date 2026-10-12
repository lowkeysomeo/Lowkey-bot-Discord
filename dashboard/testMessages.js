const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits: P, ChannelType } = require('discord.js');
const { getOptions, template } = require('../utils/customization');
const { sendLevelUp } = require('../utils/sendLevelUp');
const { sendMonthlyAnnouncement, getCurrentMonthKey } = require('../utils/monthlySystem');
function invalid(status, message) { const error = new Error(message); error.status = status; throw error; }

const VALID_TYPES = ['chat', 'voice', 'monthly', 'confession', 'receptionist', 'confessionMilestone', 'roleNotice', 'invite'];

async function sendTestMessage(guild, actorId, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || !VALID_TYPES.includes(input.type)
    || typeof input.channelId !== 'string' || !/^\d+$/.test(input.channelId)) invalid(400, 'Chọn loại thông báo và kênh nhận hợp lệ.');
  const channel = await guild.channels.fetch(input.channelId).catch(() => null);
  if (!channel || channel.guildId !== guild.id || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) invalid(400, 'Kênh gửi thử phải thuộc server này.');
  const me = await guild.members.fetchMe();
  const options = getOptions(guild.id), style = options[`${input.type}NoticeStyle`];
  const perms = [P.ViewChannel, P.SendMessages];
  if (['confession', 'monthly', 'receptionist', 'confessionMilestone', 'roleNotice', 'invite'].includes(input.type) || style === 'embed') perms.push(P.EmbedLinks);
  if ((input.type === 'monthly' && options.monthlyImage) || style === 'card') perms.push(P.AttachFiles);
  if (!channel.permissionsFor(me)?.has(perms)) invalid(400, 'Bot thiếu quyền gửi kiểu thông báo này trong kênh đã chọn.');
  let message;
  if (input.type === 'chat' || input.type === 'voice') {
    const level = input.level === undefined ? 25 : input.level;
    if (!Number.isInteger(level) || level < 1 || level > 100000) invalid(400, 'Level gửi thử phải từ 1 đến 100000.');
    const member = await guild.members.fetch(actorId);
    message = await sendLevelUp(null, member, input.type, { level, totalXp: 15000, minutes: 120 }, { channel });
  } else if (input.type === 'monthly') {
    const sample = type => Array.from({ length: 10 }, (_, index) => ({
      username: `Thành viên mẫu ${type} ${index + 1}`, score: 25000 - index * 1700,
    }));
    message = await sendMonthlyAnnouncement(guild, getCurrentMonthKey(), sample('Chat'), sample('Voice'), { channel });
  } else if (input.type === 'receptionist') {
    const member = await guild.members.fetch(actorId).catch(() => null);
    const roleId = options.receptionistRole;
    const format = (text) => (text || '')
      .replace(/\{member\}/g, member ? `<@${member.id}>` : '@ThànhViênMới')
      .replace(/\{role\}/g, roleId ? `<@&${roleId}>` : '@LễTân')
      .replace(/\{server\}/g, guild.name)
      .replace(/\{username\}/g, member?.displayName || member?.user?.username || 'Thành viên')
      .replace(/\{memberCount\}/g, String(guild.memberCount));

    const pingText = format(options.receptionistPingText || '👋 Welcome {member} đến với **{server}**! {role}');
    const title = format(options.receptionistTitle || '✨ Welcome to {server}');
    const desc = format(options.receptionistText || '🌸 Chào mừng bạn gia nhập **{server}**!\n\nMỗi thành viên đều là một phần quan trọng của cộng đồng. Đừng ngần ngại gửi lời chào và trò chuyện cùng {role} và mọi người nhé!\n\n✨ Chúc bạn có những phút giây thật vui vẻ tại đây!');

    const embed = new EmbedBuilder()
      .setColor(options.receptionistColor || '#54a0ff')
      .setTitle(title.slice(0, 256))
      .setDescription(desc.slice(0, 4096))
      .setFooter({ text: `${guild.name} • Thành viên #${guild.memberCount} (Bản thử)` })
      .setTimestamp();

    const avatar = member?.user?.displayAvatarURL?.({ extension: 'png', size: 256 });
    if (avatar) embed.setThumbnail(avatar);

    message = await channel.send({
      content: `🧪 **[TEST — Lễ tân chào thành viên mới]**\n${pingText}`,
      embeds: [embed],
      allowedMentions: { parse: [], users: [], roles: [] },
    });
  } else if (input.type === 'confessionMilestone') {
    const member = await guild.members.fetch(actorId).catch(() => null);
    const milestone = options.confessionMilestone || 100;
    const roleId = options.confessionRole || '1558809856973082737';
    const embed = new EmbedBuilder()
      .setColor(options.confessionColor || 0xe891b2)
      .setTitle(`🎉 Chúc mừng đạt mốc ${milestone} Confession!`)
      .setDescription(
        `Chúc mừng <@${actorId}> đã đạt mốc **${milestone} confession**! ✨\n\n` +
        `Bạn đã được trao role <@&${roleId}> vì sự đồng hành và những chia sẻ quý giá cùng **${guild.name}**! 💖`
      )
      .addFields(
        { name: '🏅 Role vinh danh', value: `<@&${roleId}>`, inline: true },
        { name: '💌 Cột mốc', value: `Đã gửi **${milestone} bài**`, inline: true },
      )
      .setFooter({ text: 'VietNam Legacy • Trạm sẻ chia cảm xúc (Bản thử)' })
      .setTimestamp();

    if (member?.user?.displayAvatarURL) {
      embed.setThumbnail(member.user.displayAvatarURL({ extension: 'png', size: 128 }));
    }

    message = await channel.send({
      content: `🧪 **[TEST — Thưởng mốc Confession]** 🎊 <@${actorId}>`,
      embeds: [embed],
      allowedMentions: { parse: [], users: [], roles: [] },
    });
  } else if (input.type === 'roleNotice') {
    const member = await guild.members.fetch(actorId).catch(() => null);
    const sampleRoleId = options.roleNoticeRoles?.[0] || guild.roles.cache.filter(r => !r.managed && r.id !== guild.id).first()?.id || guild.id;
    const reasons = `<@&${sampleRoleId}> — Đạt mốc **Level thưởng mẫu** (Bản thử).`;
    const grantors = `<@&${sampleRoleId}> — <@${me.id}>`;
    const values = {
      reason: reasons,
      grantedBy: grantors,
      user: `<@${actorId}>`,
      username: member?.displayName || member?.user?.username || 'Thành viên',
      roles: `<@&${sampleRoleId}>`,
      server: guild.name,
    };
    const embed = new EmbedBuilder()
      .setColor(options.roleNoticeColor)
      .setTitle(template(options.roleNoticeTitle, values).slice(0, 256))
      .setDescription(template(options.roleNoticeText, values).slice(0, 3000))
      .addFields(
        ...(!options.roleNoticeText.includes('{reason}') ? [{ name: '🏅 Lý do nhận role', value: reasons.slice(0, 1024) }] : []),
        ...(!options.roleNoticeText.includes('{grantedBy}') ? [{ name: '🤝 Người cấp role', value: grantors.slice(0, 1024) }] : []),
      )
      .setFooter({ text: 'VietNam Legacy • Cùng ghi dấu những điều đáng nhớ (Bản thử)' });

    if (member?.user?.displayAvatarURL) {
      embed.setThumbnail(member.user.displayAvatarURL({ extension: 'png', size: 128 }));
    }

    message = await channel.send({
      content: `🧪 **[TEST — Chúc mừng nhận Role]** 🎊 <@${actorId}>`,
      embeds: [embed],
      allowedMentions: { parse: [], users: [], roles: [] },
    });
  } else if (input.type === 'invite') {
    const embed = new EmbedBuilder()
      .setColor(options.inviteColor || '#a78bfa')
      .setTitle('💌 Thêm một kết nối mới! (Bản thử)')
      .setDescription(
        `Chào mừng <@${actorId}> đến với **${guild.name}**! 🎉\n\n` +
        `🤝 **Người mời:** <@${actorId}>\n` +
        `💌 **Tổng lượt mời hợp lệ:** **50 người**\n\n` +
        `Cảm ơn đã giúp cộng đồng kết nối thêm một người bạn mới!\n\n` +
        `🏅 Mốc thưởng: **50** và **100** lượt mời · Chỉ giữ role mốc cao nhất.`
      )
      .setFooter({ text: 'VietNam Legacy • Hệ thống lời mời (Bản thử)' })
      .setTimestamp();

    message = await channel.send({
      content: '🧪 **[TEST — Thông báo người mời]**',
      embeds: [embed],
      allowedMentions: { parse: [], users: [], roles: [] },
    });
  } else {
    const content = input.content === undefined ? 'Đây là confession gửi thử từ dashboard. Chúc cộng đồng luôn vui vẻ!' : input.content;
    if (typeof content !== 'string' || !content.trim() || content.length > options.confessionMaxLength) invalid(400, `Nội dung thử cần từ 1 đến ${options.confessionMaxLength} ký tự.`);
    message = await channel.send({ content: '🧪 **TEST — Confession · Không tăng số thứ tự, không tạo luồng hoặc lưu lượt thích.**',
      embeds: [new EmbedBuilder().setTitle(template(options.confessionTitle, { number: 'TEST', server: guild.name }).slice(0, 256))
        .setDescription(content.trim()).setColor(options.confessionColor).setFooter({ text: options.confessionFooter })],
      components: options.confessionLikes ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dashboard-test-like')
        .setLabel('Thích · 0 (bản thử)').setEmoji('❤️').setStyle(ButtonStyle.Secondary).setDisabled(true))] : [],
      allowedMentions: { parse: [] },
    });
  }
  if (!message?.id) invalid(502, 'Chưa gửi được bản thử. Vui lòng kiểm tra quyền và thử lại.');
  return { ok: true, messageUrl: `https://discord.com/channels/${guild.id}/${channel.id}/${message.id}` };
}
module.exports = { sendTestMessage };
