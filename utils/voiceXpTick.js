const { isXpExcluded } = require('./xpExclusions');
const { addVoiceXp } = require('./voiceLevelSystem');
const { applyBooster, hasBoosterRole } = require('./xpBoost');
const { syncVoiceLevelRole } = require('./voiceRoles');
const { sendLevelUp } = require('./sendLevelUp');
const { formatXp } = require('./levelMath');

let running = false;
async function voiceXpTick(client) {
  if (running) return;
  running = true;
  try {
    for (const guild of client.guilds.cache.values()) {
      for (const channel of guild.channels.cache.values()) {
        if (!channel.isVoiceBased?.() || isXpExcluded(guild.id, channel)) continue;
        const humans = channel.members.filter(member => !member.user.bot);
        const baseXp = humans.size >= 2 ? 5 : 1;
        for (const member of humans.values()) {
          if (member.voice.serverDeaf) continue;
          try {
            const gainedXp = applyBooster(baseXp, member);
            const result = addVoiceXp(guild.id, member.id, gainedXp, { minutes: 1, countMonthly: true });
            if (result.leveledUp) {
              await syncVoiceLevelRole(member, result.newLevel);
              await sendLevelUp(client, member, 'voice', result.profile);
            }
            console.log(`[VOICE XP] ${guild.id}/${member.user.username} +${formatXp(gainedXp)} XP${hasBoosterRole(member) ? ' [BOOSTER +10%]' : ''} | Level ${result.profile.level}`);
          } catch (error) {
            console.error(`[VOICE XP] ${guild.id}/${member.id}:`, error.message);
          }
        }
      }
    }
  } finally {
    running = false;
  }
}

module.exports = { voiceXpTick };
