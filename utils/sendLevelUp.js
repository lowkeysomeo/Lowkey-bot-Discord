const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { getGuildSetting } = require('./guildSettings');
const { getOptions, template } = require('./customization');
const { createLevelUpCard } = require('./createLevelUpCard');

async function sendLevelUp(client, member, type, profile) {
  if (!member || member.user?.bot) return;
  const options = getOptions(member.guild.id);
  const mode = type === 'voice' ? 'voice' : 'chat';
  if (!options[`${mode}Notice`]) return;
  const channelId = options[`${mode}NoticeChannel`] || getGuildSetting(member.guild.id, 'LEVEL_CHANNEL_ID');
  if (!channelId) return;
  try {
    const channel = await member.guild.channels.fetch(channelId);
    if (!channel?.isTextBased() || channel.guildId !== member.guild.id) return;
    const values = { user: `<@${member.id}>`, username: member.displayName || member.user.username,
      level: profile.level, xp: profile.totalXp, server: member.guild.name, type: mode === 'voice' ? 'VOICE' : 'CHAT' };
    const content = template(options[`${mode}NoticeText`], values).slice(0, 2000);
    const title = template(options.noticeTitle, values).slice(0, 256);
    const payload = { allowedMentions: { parse: [], users: options.noticeMention ? [member.id] : [] } };
    if (options[`${mode}NoticeStyle`] === 'embed') {
      payload.embeds = [new EmbedBuilder().setTitle(title).setDescription(content).setColor(options.noticeColor)];
      if (options.noticeMention) payload.content = `<@${member.id}>`;
    } else {
      payload.content = content;
      if (options[`${mode}NoticeStyle`] === 'card') {
        const buffer = await createLevelUpCard({ avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
          username: values.username, level: profile.level, totalXp: profile.totalXp, type: mode,
          minutes: profile.minutes || 0, title, accentColor: options.noticeColor, serverName: member.guild.name });
        payload.files = [new AttachmentBuilder(buffer, { name: `${mode}-level-up.png` })];
      }
    }
    await channel.send(payload);
  } catch (error) { console.error('[LEVEL UP] Không gửi được thông báo:', error.message); }
}
module.exports = { sendLevelUp };
