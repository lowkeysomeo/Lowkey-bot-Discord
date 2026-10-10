const { syncRewards } = require('./customization');

// Các mốc cũ vẫn dùng được qua /botconfig; mốc riêng lấy từ dashboard.
const CHAT_ROLE_LEVELS = [1, 10, 20, 40, 65, 80, 95, 100];

const syncLevelRole = (member, level) => syncRewards(member, level, 'chat');

// Giữ tên hàm cũ để những chỗ còn gọi updateLevelRole vẫn hoạt động.
const updateLevelRole = syncLevelRole;

module.exports = { syncLevelRole, updateLevelRole, CHAT_ROLE_LEVELS };
