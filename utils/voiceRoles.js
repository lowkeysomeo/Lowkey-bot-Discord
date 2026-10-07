const { syncRewards } = require('./customization');
const VOICE_ROLE_LEVELS = [1, 10, 20, 40, 65, 80, 100];
const syncVoiceLevelRole = (member, level) => syncRewards(member, level, 'voice');
module.exports = { syncVoiceLevelRole, VOICE_ROLE_LEVELS };
