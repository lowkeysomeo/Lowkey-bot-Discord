'use strict';

// Mốc kết thúc dùng giờ Việt Nam; gắn ID để đổi tên role cũng không mất hạn nhận.
const ROLE_PICK_LIMITS = Object.freeze([
  Object.freeze({
    guildId: '1555173619129122866',
    roleId: '1558729536345079888',
    endsAt: Date.parse('2027-01-01T00:00:00+07:00'),
    deadlineLabel: '00:00 ngày 01/01/2027 (giờ Việt Nam)',
  }),
]);

function getPickLimit(guildId, roleId) {
  return ROLE_PICK_LIMITS.find(limit => limit.guildId === guildId && limit.roleId === roleId);
}

function isPickExpired(guildId, roleId, now = Date.now()) {
  const limit = getPickLimit(guildId, roleId);
  return Boolean(limit && now >= limit.endsAt);
}

module.exports = { ROLE_PICK_LIMITS, getPickLimit, isPickExpired };
