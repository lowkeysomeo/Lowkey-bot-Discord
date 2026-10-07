const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const { definitions, getOptions, getRewards } = require('../utils/customization');
const { listXpExclusions } = require('../utils/xpExclusions');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function invalid(message) { const error = new Error(message); error.status = 400; throw error; }
function customizationData(guild, channels) {
  return { options: getOptions(guild.id), optionDefinitions: definitions,
    rewards: { chat: getRewards(guild.id, 'chat'), voice: getRewards(guild.id, 'voice') },
    exclusions: listXpExclusions(guild.id).map(item => item.targetId),
    exclusionChannels: [...channels.values()].filter(Boolean).map(c => ({ id: c.id, name: c.name,
      type: c.type === ChannelType.GuildCategory ? 'category' : 'channel' })) };
}
function validateCustomization(input, guild, channels, roles, me) {
  const patch = input.options === undefined ? {} : input.options;
  if (!object(patch)) invalid('Các tùy chọn phải là một đối tượng hợp lệ.');
  const merged = { ...getOptions(guild.id), ...patch };
  for (const [key, value] of Object.entries(patch)) {
    const def = definitions.find(item => item[0] === key);
    if (!def) invalid('Tùy chọn không được hỗ trợ.');
    const [, , label, type, , a, b] = def;
    if (type === 'boolean' && typeof value !== 'boolean') invalid(`${label}: chọn bật hoặc tắt.`);
    if (type === 'number' && (!Number.isInteger(value) || value < a || value > b)) invalid(`${label}: nhập số nguyên từ ${a} đến ${b}.`);
    if (type === 'select' && !a.includes(value)) invalid(`${label}: lựa chọn không hợp lệ.`);
    if (type === 'text' && (typeof value !== 'string' || !value.trim() || value.length > a)) invalid(`${label}: nhập từ 1 đến ${a} ký tự.`);
    if (type === 'color' && (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))) invalid(`${label}: màu không hợp lệ.`);
    if (type === 'channel') {
      if (typeof value !== 'string') invalid(`${label}: chọn kênh hợp lệ.`);
      if (!value) continue;
      const channel = channels.get(value);
      if (!channel || channel.guildId !== guild.id || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) invalid(`${label}: kênh không hợp lệ.`);
      const mode = key.startsWith('voice') ? 'voice' : 'chat';
      const perms = [P.ViewChannel, P.SendMessages];
      if (merged[`${mode}NoticeStyle`] === 'card') perms.push(P.AttachFiles);
      if (merged[`${mode}NoticeStyle`] === 'embed') perms.push(P.EmbedLinks);
      if (!channel.permissionsFor(me)?.has(perms)) invalid(`${label}: bot thiếu quyền gửi kiểu thông báo đã chọn.`);
    }
  }
  if (merged.chatMin > merged.chatMax) invalid('XP Chat tối thiểu không được lớn hơn XP tối đa.');
  if (input.rewards !== undefined) {
    if (!object(input.rewards)) invalid('Danh sách mốc level không hợp lệ.');
    for (const [type, entries] of Object.entries(input.rewards)) {
      if (!['chat', 'voice'].includes(type) || !Array.isArray(entries) || entries.length > 50) invalid('Mỗi loại Chat/Voice có tối đa 50 mốc role.');
      const levels = new Set();
      const roleIds = new Set();
      for (const entry of entries) {
        if (!object(entry) || !Number.isInteger(entry.level) || entry.level < 1 || entry.level > 100000
          || typeof entry.roleId !== 'string' || !/^\d+$/.test(entry.roleId)) invalid('Mốc level phải từ 1 đến 100000 và có role hợp lệ.');
        if (levels.has(entry.level) || roleIds.has(entry.roleId)) invalid('Không lặp level hoặc role trong cùng danh sách thưởng.');
        levels.add(entry.level); roleIds.add(entry.roleId);
        const role = roles.get(entry.roleId);
        // Existing inaccessible mappings may be kept; new or changed mappings must be assignable.
        const unchanged = getRewards(guild.id, type).some(old => old.level === entry.level && old.roleId === entry.roleId);
        if (!role || role.id === guild.id) invalid('Role thưởng không còn khả dụng trong server.');
        if (!unchanged && (role.managed || !me.permissions.has(P.ManageRoles) || me.roles.highest.comparePositionTo(role) <= 0)) invalid(`Bot không thể cấp role ${role.name}. Đặt role bot cao hơn và cấp Manage Roles.`);
      }
    }
  }
  if (input.exclusions !== undefined) {
    if (!Array.isArray(input.exclusions) || input.exclusions.length > 100 || new Set(input.exclusions).size !== input.exclusions.length) invalid('Chọn tối đa 100 kênh/danh mục bỏ qua XP, không trùng nhau.');
    for (const id of input.exclusions) if (typeof id !== 'string' || !channels.has(id) || channels.get(id)?.guildId !== guild.id) invalid('Kênh bỏ qua XP không thuộc server này.');
  }
  return patch;
}
module.exports = { customizationData, validateCustomization };
