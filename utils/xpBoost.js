const { getGuildSetting } = require('./guildSettings');
const BOOST_MULTIPLIER = 1.10;
const { getOptions } = require('./customization');

function hasBoosterRole(member) {
  const roleId = getGuildSetting(member?.guild?.id, 'VNL_BOOSTER_ROLE_ID');
  return Boolean(roleId && member?.roles?.cache?.has(roleId));
}

function applyBooster(baseXp, member) {
  const amount = Number(baseXp) || 0;
  return hasBoosterRole(member) ? amount * (1 + getOptions(member.guild.id).boosterPercent / 100) : amount;
}

module.exports = {
  BOOST_MULTIPLIER,
  hasBoosterRole,
  applyBooster,
};
