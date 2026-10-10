const { getGuildSetting, setGuildSetting } = require('./guildSettings');
const definitions = [
  ['chatEnabled', 'xp', 'Bật XP Chat', 'boolean', true],
  ['chatMin', 'xp', 'XP Chat tối thiểu / lượt', 'number', 10, 0, 1000],
  ['chatMax', 'xp', 'XP Chat tối đa / lượt', 'number', 20, 0, 1000],
  ['chatCooldown', 'xp', 'Thời gian chờ Chat (giây)', 'number', 60, 1, 3600],
  ['voiceEnabled', 'xp', 'Bật XP Voice', 'boolean', true],
  ['voiceSolo', 'xp', 'XP Voice / phút khi một mình', 'number', 1, 0, 1000],
  ['voiceGroup', 'xp', 'XP Voice / phút khi đủ người', 'number', 5, 0, 1000],
  ['voiceMinimum', 'xp', 'Số người để nhận XP Voice nhóm', 'number', 2, 2, 100],
  ['voiceSkipSelfDeaf', 'xp', 'Bỏ qua người tự tắt nghe', 'boolean', false],
  ['voiceSkipSelfMute', 'xp', 'Bỏ qua người tự tắt mic', 'boolean', false],
  ['boosterPercent', 'xp', 'XP cộng thêm cho Booster (%)', 'number', 10, 0, 1000],
  ['chatRoleMode', 'rewards', 'Cấp role Chat', 'select', 'highest', ['highest', 'all']],
  ['voiceRoleMode', 'rewards', 'Cấp role Voice', 'select', 'highest', ['highest', 'all']],
  ['chatNotice', 'notifications', 'Bật thông báo lên cấp Chat', 'boolean', true],
  ['voiceNotice', 'notifications', 'Bật thông báo lên cấp Voice', 'boolean', true],
  ['chatNoticeChannel', 'notifications', 'Kênh thông báo Chat riêng', 'channel', ''],
  ['voiceNoticeChannel', 'notifications', 'Kênh thông báo Voice riêng', 'channel', ''],
  ['chatNoticeStyle', 'notifications', 'Kiểu thông báo Chat', 'select', 'card', ['card', 'embed', 'text']],
  ['voiceNoticeStyle', 'notifications', 'Kiểu thông báo Voice', 'select', 'card', ['card', 'embed', 'text']],
  ['chatNoticeText', 'notifications', 'Nội dung lên cấp Chat', 'text', '🎉 Chúc mừng {user} đã đạt **Chat Level {level}**!', 1500],
  ['voiceNoticeText', 'notifications', 'Nội dung lên cấp Voice', 'text', '🎙️ Chúc mừng {user} đã đạt **Voice Level {level}**!', 1500],
  ['noticeTitle', 'notifications', 'Tiêu đề thông báo / ảnh', 'text', '{type} LEVEL UP!', 100],
  ['noticeColor', 'notifications', 'Màu nhấn thông báo / ảnh', 'color', '#ffd54d'],
  ['noticeMention', 'notifications', 'Thông báo nhắc tên người lên cấp', 'boolean', true],
  ['monthlyAnnounce', 'monthly', 'Đăng tổng kết mỗi tháng', 'boolean', true],
  ['monthlyImage', 'monthly', 'Kèm ảnh bảng xếp hạng tháng', 'boolean', true],
  ['monthlyRoles', 'monthly', 'Chuyển role cho Top 1/2/3 mỗi tháng', 'boolean', true],
  ['monthlyTitle', 'monthly', 'Tiêu đề tổng kết tháng', 'text', '🏆 {server} — VINH DANH {month}', 180],
  ['monthlyText', 'monthly', 'Nội dung tổng kết tháng', 'text', '✨ Một tháng sôi nổi đã khép lại! Cảm ơn những thành viên đã góp phần giữ ngọn lửa cộng đồng luôn rực sáng.\n\n👑 Xin vinh danh **Top 3 Chat** và **Top 3 Voice** với thành tích nổi bật nhất tháng. Các bạn nhận **role vinh danh tương ứng với thứ hạng** được ghi bên dưới.\n\n🔥 Hành trình tháng mới đã bắt đầu — tiếp tục trò chuyện, kết nối và chinh phục vị trí tiếp theo!', 1500],
  ['monthlyColor', 'monthly', 'Màu tổng kết tháng', 'color', '#c31822'],
  ['confessionEnabled', 'confession', 'Bật gửi confession', 'boolean', true],
  ['confessionCooldown', 'confession', 'Chờ giữa hai confession (giây)', 'number', 0, 0, 86400],
  ['confessionMaxLength', 'confession', 'Độ dài confession tối đa', 'number', 4000, 1, 4000],
  ['confessionThreads', 'confession', 'Tạo luồng bình luận cho bài mới', 'boolean', true],
  ['confessionLikes', 'confession', 'Bật nút thích', 'boolean', true],
  ['confessionTitle', 'confession', 'Tiêu đề confession', 'text', '💌 CONFESSION #{number}', 150],
  ['confessionFooter', 'confession', 'Chân trang confession', 'text', '— Ẩn danh', 300],
  ['confessionPanelTitle', 'confession', 'Tiêu đề bảng gửi confession', 'text', '💌 Trạm sẻ chia · {server}', 150],
  ['confessionPanelText', 'confession', 'Lời giới thiệu bảng gửi confession', 'text', 'Có một câu chuyện bạn muốn kể, một lời cảm ơn chưa kịp nói hay đôi điều cần được lắng nghe? Hãy để lại những dòng của bạn tại đây.\n\nChọn cách chia sẻ bên dưới. Cùng giữ góc nhỏ này tử tế, tôn trọng và không tiết lộ thông tin riêng tư của người khác.', 2000],
  ['confessionColor', 'confession', 'Màu confession', 'color', '#e891b2'],
];
const defaults = Object.fromEntries(definitions.map(([key, , , , value]) => [key, value]));
function getOptions(guildId) {
  let saved = {};
  try { saved = JSON.parse(getGuildSetting(guildId, 'DASHBOARD_OPTIONS') || '{}'); } catch { /* Dùng cấu hình mặc định nếu dữ liệu cũ bị lỗi. */ }
  // Đổi mẫu thông báo cũ, giữ nguyên nội dung người dùng đã tự sửa.
  if (saved.monthlyTitle === '🏆 {server} — TỔNG KẾT {month}') delete saved.monthlyTitle;
  if (saved.monthlyText === 'Xếp hạng theo XP tháng. XP tổng và level của thành viên được giữ nguyên.') delete saved.monthlyText;
  return { ...defaults, ...saved };
}
function saveOptions(guildId, patch) {
  setGuildSetting(guildId, 'DASHBOARD_OPTIONS', JSON.stringify({ ...getOptions(guildId), ...patch }));
}
function getRewards(guildId, type) {
  const saved = getGuildSetting(guildId, type === 'voice' ? 'VOICE_REWARDS' : 'CHAT_REWARDS');
  if (saved !== null) {
    try { const parsed = JSON.parse(saved); if (Array.isArray(parsed)) return parsed; } catch { /* Đọc các mốc cũ nếu danh sách mới bị lỗi. */ }
  }
  const levels = type === 'voice' ? [1, 10, 20, 40, 65, 80, 100] : [1, 10, 20, 40, 65, 80, 95, 100];
  return levels.map(level => ({ level,
    roleId: getGuildSetting(guildId, `${type === 'voice' ? 'VOICE_ROLE' : 'LEVEL_ROLE'}_${level}`),
  })).filter(item => item.roleId);
}
function saveRewards(guildId, type, rewards) {
  setGuildSetting(guildId, type === 'voice' ? 'VOICE_REWARDS' : 'CHAT_REWARDS', JSON.stringify(rewards));
}
function updateLegacyReward(guildId, key, roleId) {
  const match = /^(LEVEL|VOICE)_ROLE_(\d+)$/.exec(key);
  if (!match) return;
  const type = match[1] === 'VOICE' ? 'voice' : 'chat';
  if (getGuildSetting(guildId, type === 'voice' ? 'VOICE_REWARDS' : 'CHAT_REWARDS') === null) return;
  const level = Number(match[2]);
  const rewards = getRewards(guildId, type).filter(item => item.level !== level);
  if (roleId) rewards.push({ level, roleId });
  saveRewards(guildId, type, rewards.sort((a, b) => a.level - b.level));
}
function template(text, values) {
  return text.replace(/\{([a-zA-Z]+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
}
async function syncRewards(member, level, type) {
  if (!member || member.user?.bot) return;
  const rewards = getRewards(member.guild.id, type);
  const eligible = rewards.filter(item => Number(level) >= item.level).sort((a, b) => b.level - a.level);
  const mode = getOptions(member.guild.id)[`${type}RoleMode`];
  const targets = new Set((mode === 'all' ? eligible : eligible.slice(0, 1)).map(item => item.roleId));
  for (const roleId of new Set(rewards.map(item => item.roleId))) {
    if (targets.has(roleId) === member.roles.cache.has(roleId)) continue;
    try {
      if (targets.has(roleId)) await member.roles.add(roleId);
      else await member.roles.remove(roleId);
    } catch (error) { console.error(`[${type.toUpperCase()} ROLE] ${roleId}:`, error.message); }
  }
}
module.exports = { definitions, getOptions, saveOptions, getRewards, saveRewards, updateLegacyReward, template, syncRewards };
