const { AttachmentBuilder } = require('discord.js');
const { createLevelUpCard } = require('./createLevelUpCard');

async function sendLevelUp(client, member, type, profile) {
    if (!member || member.user?.bot) return;

  const channelId = process.env.LEVEL_CHANNEL_ID;

  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);

    if (!channel?.isTextBased()) return;

    const isVoice = type === 'voice';

    const cardBuffer = await createLevelUpCard({
      avatarUrl: member.user.displayAvatarURL({
        extension: 'png',
        size: 256,
      }),

      username:
        member.displayName ||
        member.user.username,

      level: profile.level,
      totalXp: profile.totalXp,

      type: isVoice
        ? 'voice'
        : 'chat',

      minutes: isVoice
        ? profile.minutes || 0
        : 0,
    });

    const attachment = new AttachmentBuilder(
      cardBuffer,
      {
        name: isVoice
          ? 'voice-level-up.png'
          : 'chat-level-up.png',
      }
    );

    await channel.send({
      content: isVoice
        ? `🎙️ Chúc mừng ${member} đã đạt **Voice Level ${profile.level}**!`
        : `🎉 Chúc mừng ${member} đã đạt **Chat Level ${profile.level}**!`,

      files: [attachment],
    });

  } catch (error) {
    console.error(
      '[LEVEL UP CARD] Không gửi được thông báo:',
      error
    );
  }
}

module.exports = {
  sendLevelUp,
};