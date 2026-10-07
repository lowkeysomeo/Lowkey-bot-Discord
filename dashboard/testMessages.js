const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits: P, ChannelType } = require('discord.js');
const { getOptions, template } = require('../utils/customization');
const { sendLevelUp } = require('../utils/sendLevelUp');
const { sendMonthlyAnnouncement, getCurrentMonthKey } = require('../utils/monthlySystem');
function invalid(status, message) { const error = new Error(message); error.status = status; throw error; }
async function sendTestMessage(guild, actorId, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || !['chat', 'voice', 'monthly', 'confession'].includes(input.type)
    || typeof input.channelId !== 'string' || !/^\d+$/.test(input.channelId)) invalid(400, 'Chọn loại thông báo và kênh nhận hợp lệ.');
  const channel = await guild.channels.fetch(input.channelId).catch(() => null);
  if (!channel || channel.guildId !== guild.id || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) invalid(400, 'Kênh gửi thử phải thuộc server này.');
  const me = await guild.members.fetchMe();
  const options = getOptions(guild.id), style = options[`${input.type}NoticeStyle`];
  const perms = [P.ViewChannel, P.SendMessages];
  if (input.type === 'confession' || input.type === 'monthly' || style === 'embed') perms.push(P.EmbedLinks);
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
