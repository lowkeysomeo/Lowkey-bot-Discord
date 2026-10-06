const BOOST_MULTIPLIER = 1.10;

function hasBoosterRole(member) {
  const roleId = process.env.VNL_BOOSTER_ROLE_ID;
  return Boolean(roleId && member?.roles?.cache?.has(roleId));
}

function applyBooster(baseXp, member) {
  const amount = Number(baseXp) || 0;
  return hasBoosterRole(member) ? amount * BOOST_MULTIPLIER : amount;
}

module.exports = {
  BOOST_MULTIPLIER,
  hasBoosterRole,
  applyBooster,
};
