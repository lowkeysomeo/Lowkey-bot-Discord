const { syncRewards } = require('./customization');
const CHAT_ROLE_LEVELS = [1, 10, 20, 40, 65, 80, 95, 100];
const syncLevelRole = (member, level) => syncRewards(member, level, 'chat');
module.exports = { syncLevelRole, CHAT_ROLE_LEVELS };
