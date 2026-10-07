const { isXpExcluded } = require('./xpExclusions');
const { addVoiceXp } = require('./voiceLevelSystem');
const { applyBooster, hasBoosterRole } = require('./xpBoost');
const { syncVoiceLevelRole } = require('./voiceRoles');
const { sendLevelUp } = require('./sendLevelUp');
const { formatXp } = require('./levelMath');
const { getOptions } = require('./customization');

let running = false;
async function voiceXpTick(client) {
  if (running) return;
  running = true;
  try {
    for (const guild of client.guilds.cache.values()) {
      const options = getOptions(guild.id);
      if (!options.voiceEnabled) continue;
      for (const channel of guild.channels.cache.values()) {
        if (!channel.isVoiceBased?.() || isXpExcluded(guild.id, channel)) continue;
        const humans = channel.members.filter(member => !member.user.bot && !member.voice.serverDeaf
          && !(options.voiceSkipSelfDeaf && member.voice.selfDeaf)
          && !(options.voiceSkipSelfMute && member.voice.selfMute));
        const baseXp = humans.size >= options.voiceMinimum ? options.voiceGroup : options.voiceSolo;
        for (const member of humans.values()) {
          if (member.voice.serverDeaf) continue;
          try {
            const gainedXp = applyBooster(baseXp, member);
            const result = addVoiceXp(guild.id, member.id, gainedXp, { minutes: 1, countMonthly: true });
            await syncVoiceLevelRole(member, result.newLevel);
            if (result.leveledUp) {
              await sendLevelUp(client, member, 'voice', result.profile);
            }
            console.log(`[VOICE XP] ${guild.id}/${member.user.username} +${formatXp(gainedXp)} XP${hasBoosterRole(member) ? ' [BOOSTER]' : ''} | Level ${result.profile.level}`);
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
