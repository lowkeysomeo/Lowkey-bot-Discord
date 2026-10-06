const { getGuildSetting } = require('./guildSettings');
const CHAT_ROLE_LEVELS = [1, 10, 20, 40, 65, 80, 95, 100];

function getConfiguredRoles(guildId) {
  return CHAT_ROLE_LEVELS
    .map((level) => ({
      level,
      roleId: getGuildSetting(guildId, `LEVEL_ROLE_${level}`),
    }))
    .filter((item) => item.roleId);
}

async function syncLevelRole(member, level) {
  if (!member) return;

  const configured = getConfiguredRoles(member.guild.id);
  if (configured.length === 0) return;

  const eligible = configured
    .filter((item) => Number(level) >= item.level)
    .sort((a, b) => b.level - a.level)[0];

  const targetRoleId = eligible?.roleId || null;

  for (const { roleId } of configured) {
    if (roleId === targetRoleId) continue;
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId).catch((error) => {
        console.error(`[CHAT ROLE] Không gỡ được role ${roleId} khỏi ${member.user.tag}:`, error.message);
      });
    }
  }

  if (targetRoleId && !member.roles.cache.has(targetRoleId)) {
    await member.roles.add(targetRoleId).catch((error) => {
      console.error(`[CHAT ROLE] Không cấp được role ${targetRoleId} cho ${member.user.tag}:`, error.message);
    });
  }
}

module.exports = {
  syncLevelRole,
  CHAT_ROLE_LEVELS,
};
