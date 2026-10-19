const { getGuildSetting, setGuildSetting } = require('./guildSettings');
const { PermissionFlagsBits } = require('discord.js');

function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function mediaOrigin(env) {
  try {
    const url = new URL(env.CINEMA_MEDIA_ORIGIN);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash ||
        !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(url.hostname) || /(?:^|\.)(?:localhost|local|internal)$/i.test(url.hostname)) return null;
    return url.origin;
  } catch { return null; }
}
function sourceUrl(value, env) {
  const origin = mediaOrigin(env);
  if (!origin) fail(503, 'Chủ bot cần cấu hình CINEMA_MEDIA_ORIGIN (HTTPS).');
  let url;
  try { url = new URL(value); } catch { fail(400, 'Nguồn phim phải là URL HTTPS đầy đủ.'); }
  if (url.origin !== origin || url.username || url.password || url.search || url.hash || !/\.(mp4|webm)$/i.test(url.pathname) || /%2f|%5c|%2e/i.test(url.pathname)) {
    fail(400, 'Chỉ nhận tệp MP4/WebM trên kho video đã duyệt, không kèm mật khẩu hoặc query.');
  }
  return url.href;
}
function getConfig(guildId) {
  const raw = getGuildSetting(guildId, 'CINEMA_CONFIG');
  const d = { enabled: false, title: 'VNL Cinema', description: '', audience: 'members', roleIds: [], rightsConfirmed: false, voiceChannelId: null, notifyChannelId: null, notifyRoleId: null, notifyMessage: '', shows: [], revision: 0 };
  return raw ? { ...d, ...JSON.parse(raw) } : d;
}
function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, 'Tên hoặc nội dung không hợp lệ.');
  return value.trim();
}
function validate(input, roles, env, channels) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.enabled !== 'boolean' || typeof input.rightsConfirmed !== 'boolean') fail(400, 'Cấu hình Cinema không hợp lệ.');
  if (!['members', 'roles', 'admins'].includes(input.audience)) fail(400, 'Quyền tham gia không hợp lệ.');
  if (!Array.isArray(input.roleIds) || input.roleIds.length > 25 || input.roleIds.some(id => typeof id !== 'string' || !roles.has(id))) fail(400, 'Role phải thuộc server đang quản lý.');
  if (input.audience === 'roles' && !input.roleIds.length) fail(400, 'Hãy chọn ít nhất một role được xem.');
  const voiceChannelId = typeof input.voiceChannelId === 'string' && /^\d+$/.test(input.voiceChannelId) ? input.voiceChannelId : null;
  const notifyChannelId = typeof input.notifyChannelId === 'string' && /^\d+$/.test(input.notifyChannelId) ? input.notifyChannelId : null;
  let notifyRoleId = null;
  if (input.notifyRoleId === 'everyone' || input.notifyRoleId === 'here') {
    notifyRoleId = input.notifyRoleId;
  } else if (typeof input.notifyRoleId === 'string' && /^\d+$/.test(input.notifyRoleId)) {
    if (roles && !roles.has(input.notifyRoleId)) fail(400, 'Role thông báo phải thuộc server này.');
    notifyRoleId = input.notifyRoleId;
  }
  const notifyMessage = typeof input.notifyMessage === 'string' ? text(input.notifyMessage, 1500) : '';
  if (channels) {
    if (voiceChannelId && !channels.has(voiceChannelId)) fail(400, 'Kênh voice rạp phim phải thuộc server này.');
    if (notifyChannelId && !channels.has(notifyChannelId)) fail(400, 'Kênh thông báo phải thuộc server này.');
  }
  if (!Array.isArray(input.shows) || input.shows.length > 20) fail(400, 'Tối đa 20 suất chiếu.');
  const shows = input.shows.map(show => {
    if (!show || typeof show !== 'object') fail(400, 'Suất chiếu không hợp lệ.');
    const start = Date.parse(show.startsAt), end = Date.parse(show.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 24 * 3600000 ||
        !/Z$|[+-]\d\d:\d\d$/.test(show.startsAt) || !/Z$|[+-]\d\d:\d\d$/.test(show.endsAt)) fail(400, 'Lịch chiếu cần múi giờ, giờ kết thúc sau giờ bắt đầu và dài tối đa 24 giờ.');
    return { title: text(show.title, 120, true), source: sourceUrl(text(show.source, 2048, true), env), startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() };
  }).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  for (let i = 1; i < shows.length; i++) if (shows[i].startsAt < shows[i - 1].endsAt) fail(400, 'Các suất chiếu không được trùng giờ.');
  if (input.enabled && (!input.rightsConfirmed || !shows.length)) fail(400, 'Cần ít nhất một suất chiếu và xác nhận quyền sử dụng video để bật Cinema.');
  return { enabled: input.enabled, title: text(input.title, 80, true), description: text(input.description, 1500), audience: input.audience,
    roleIds: [...new Set(input.roleIds)], rightsConfirmed: input.rightsConfirmed, voiceChannelId, notifyChannelId, notifyRoleId, notifyMessage, shows };
}
function saveConfig(guildId, input, roles, env, channels) {
  const next = validate(input, roles, env, channels);
  const current = getConfig(guildId);
  if (input.revision !== current.revision) fail(409, 'Cấu hình đã được admin khác sửa. Hãy tải lại trước khi lưu.');
  next.revision = current.revision + 1;
  setGuildSetting(guildId, 'CINEMA_CONFIG', JSON.stringify(next));
  return next;
}
function isStaffMember(member) {
  if (!member) return false;
  const memberId = member.id || member.user?.id;
  if (memberId && member.guild?.ownerId && memberId === member.guild.ownerId) return true;
  const admin = member.permissions?.has?.(PermissionFlagsBits.Administrator) ||
                member.permissions?.has?.(PermissionFlagsBits.ManageGuild);
  if (admin) return true;
  const roles = member.roles?.cache;
  if (!roles) return false;
  const checkRole = role => {
    if (!role || typeof role === 'string') return false;
    if (role.permissions?.any?.([
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ModerateMembers,
    ])) return true;
    return /(staff|admin|mod|quản\s*trị|bảo\s*vệ|partner\s*management|hỗ\s*trợ|supporter|kiểm\s*duyệt)/i.test(role.name || '');
  };
  if (typeof roles.some === 'function') return roles.some(checkRole);
  if (typeof roles.values === 'function') {
    for (const role of roles.values()) if (checkRole(role)) return true;
  }
  return false;
}

function seekShow(guildId, targetSeconds, now = Date.now()) {
  const config = getConfig(guildId);
  const show = config.shows.find(s => Date.parse(s.startsAt) <= now && now < Date.parse(s.endsAt));
  if (!show) fail(404, 'Hiện không có suất chiếu nào đang phát.');
  const oldDuration = Date.parse(show.endsAt) - Date.parse(show.startsAt);
  const target = Math.max(0, Number(targetSeconds) || 0);
  const newStartsAt = new Date(now - target * 1000).toISOString();
  const newEndsAt = new Date(Date.parse(newStartsAt) + oldDuration).toISOString();
  show.startsAt = newStartsAt;
  show.endsAt = newEndsAt;
  config.revision += 1;
  setGuildSetting(guildId, 'CINEMA_CONFIG', JSON.stringify(config));
  return { position: target, startsAt: newStartsAt, endsAt: newEndsAt };
}

async function viewerState(guild, userId, env, now = Date.now()) {
  const config = getConfig(guild.id);
  if (!config.enabled) fail(403, 'Cinema đang tắt tại server này.');
  let member;
  try { member = await guild.members.fetch({ user: userId, force: true }); }
  catch (error) { if (Number(error.code) === 10007) fail(403, 'Bạn không còn là thành viên server.'); throw error; }
  if (!member || member.user.bot) fail(403, 'Chỉ thành viên server được tham gia.');
  const admin = member.permissions.has(PermissionFlagsBits.Administrator);
  if (config.audience === 'admins' && !admin) fail(403, 'Suất chiếu chỉ dành cho Administrator.');
  if (config.audience === 'roles' && !admin && !config.roleIds.some(id => member.roles.cache.has(id))) fail(403, 'Bạn chưa có role được phép xem Cinema.');
  const canSeek = isStaffMember(member);
  const show = config.shows.find(s => Date.parse(s.startsAt) <= now && now < Date.parse(s.endsAt));
  return { title: config.title, description: config.description, serverTime: now, canSeek,
    upcoming: config.shows.filter(s => Date.parse(s.startsAt) > now).map(({ title, startsAt, endsAt }) => ({ title, startsAt, endsAt })),
    show: show ? { title: show.title, startsAt: show.startsAt, endsAt: show.endsAt,
      mediaPath: '/.proxy/media' + new URL(sourceUrl(show.source, env)).pathname, position: (now - Date.parse(show.startsAt)) / 1000 } : null };
}

function getAnnouncedShows(guildId) {
  try {
    const raw = getGuildSetting(guildId, 'CINEMA_ANNOUNCED_SHOWS');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function isShowAnnounced(guildId, showKey) {
  const list = getAnnouncedShows(guildId);
  return Array.isArray(list) && list.includes(showKey);
}

function markShowAnnounced(guildId, showKey) {
  try {
    const list = getAnnouncedShows(guildId);
    if (!list.includes(showKey)) {
      list.push(showKey);
      const trimmed = list.slice(-100);
      setGuildSetting(guildId, 'CINEMA_ANNOUNCED_SHOWS', JSON.stringify(trimmed));
    }
  } catch (err) {
    console.error('[CINEMA] Lỗi lưu danh sách suất chiếu đã thông báo:', err.message);
  }
}

module.exports = {
  getConfig,
  saveConfig,
  validate,
  viewerState,
  mediaOrigin,
  isStaffMember,
  seekShow,
  getAnnouncedShows,
  isShowAnnounced,
  markShowAnnounced,
};
