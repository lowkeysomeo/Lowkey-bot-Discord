const { movieDetails } = require('./movieCatalog');
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
function archiveExpiredShows(guildId, now = Date.now()) {
  try {
    const raw = getGuildSetting(guildId, 'CINEMA_CONFIG');
    if (!raw) return null;
    const config = JSON.parse(raw);
    if (!Array.isArray(config.shows) || config.shows.length === 0) return config;

    let changed = false;
    if (!Array.isArray(config.history)) config.history = [];
    const activeShows = [];

    for (const s of config.shows) {
      const end = Date.parse(s.endsAt);
      if (Number.isFinite(end) && end <= now) {
        changed = true;
        const alreadyInHistory = config.history.some(h =>
          h.startsAt === s.startsAt && h.title === s.title
        );
        if (!alreadyInHistory) {
          config.history.unshift({
            title: s.title,
            source: s.source,
            roomId: s.roomId || 1,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            endedAt: new Date(now).toISOString(),
            status: 'completed',
          });
        }
      } else {
        activeShows.push(s);
      }
    }

    if (changed) {
      config.shows = activeShows;
      config.history = config.history.slice(0, 50);
      setGuildSetting(guildId, 'CINEMA_CONFIG', JSON.stringify(config));
    }
    return config;
  } catch (err) {
    console.error('[CINEMA] Lỗi lưu trữ suất chiếu hết hạn:', err.message);
    return null;
  }
}

function getConfig(guildId) {
  archiveExpiredShows(guildId);
  const raw = getGuildSetting(guildId, 'CINEMA_CONFIG');
  const d = { enabled: false, title: 'VNL Cinema', description: '', audience: 'members', roleIds: [], rightsConfirmed: false, categoryId: null, voiceChannelId: null, notifyChannelId: null, notifyRoleId: null, notifyMessage: '', preReminderHours: 3, remind10m: true, shows: [], history: [], revision: 0 };
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
  const categoryId = typeof input.categoryId === 'string' && /^\d+$/.test(input.categoryId) ? input.categoryId : null;
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
  let preReminderHours = 3;
  if (input.preReminderHours !== undefined && input.preReminderHours !== null && input.preReminderHours !== '') {
    const val = Number(input.preReminderHours);
    if (Number.isFinite(val) && val >= 0 && val <= 72) {
      preReminderHours = Math.round(val);
    }
  }
  const remind10m = input.remind10m !== false && input.remind10m !== 'false';
  if (channels) {
    if (categoryId && !channels.has(categoryId)) fail(400, 'Danh mục Cinema phải thuộc server này.');
    if (voiceChannelId && !channels.has(voiceChannelId)) fail(400, 'Kênh voice rạp phim phải thuộc server này.');
    if (notifyChannelId && !channels.has(notifyChannelId)) fail(400, 'Kênh thông báo phải thuộc server này.');
  }
  if (!Array.isArray(input.shows) || input.shows.length > 20) fail(400, 'Tối đa 20 suất chiếu.');
  const shows = input.shows.map(show => {
    if (!show || typeof show !== 'object') fail(400, 'Suất chiếu không hợp lệ.');
    const start = Date.parse(show.startsAt);
    let end = Date.parse(show.endsAt);
    if (!Number.isFinite(start)) fail(400, 'Giờ bắt đầu không hợp lệ.');
    if (!Number.isFinite(end) || end <= start) {
      end = start + 2.5 * 3600000;
    }
    if (end - start > 24 * 3600000) fail(400, 'Lịch chiếu dài tối đa 24 giờ.');
    const roomId = [1, 2, 3].includes(Number(show.roomId)) ? Number(show.roomId) : 1;
    return { title: text(show.title, 120, true), source: sourceUrl(text(show.source, 2048, true), env), startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), roomId };
  }).sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  // Kiểm tra trùng giờ riêng biệt theo từng phòng (Cinema 1, 2, 3)
  for (const rId of [1, 2, 3]) {
    const roomShows = shows.filter(s => (s.roomId || 1) === rId);
    for (let i = 1; i < roomShows.length; i++) {
      if (roomShows[i].startsAt < roomShows[i - 1].endsAt) {
        fail(400, `Các suất chiếu trong Cinema ${rId} không được trùng giờ.`);
      }
    }
  }

  if (input.enabled && shows.length > 0 && !input.rightsConfirmed) {
    fail(400, 'Vui lòng xác nhận quyền sử dụng video để bật Cinema.');
  }
  return { enabled: input.enabled, title: text(input.title, 80, true), description: text(input.description, 1500), audience: input.audience,
    roleIds: [...new Set(input.roleIds)], rightsConfirmed: input.rightsConfirmed, categoryId, voiceChannelId, notifyChannelId, notifyRoleId, notifyMessage, preReminderHours, remind10m, shows,
    history: Array.isArray(input.history) ? input.history.slice(0, 50) : [] };
}
function saveConfig(guildId, input, roles, env, channels) {
  const next = validate(input, roles, env, channels);
  const current = getConfig(guildId);
  if (input.revision !== current.revision) fail(409, 'Cấu hình đã được admin khác sửa. Hãy tải lại trước khi lưu.');
  next.history = Array.isArray(input.history) && input.history.length > 0
    ? input.history.slice(0, 50)
    : (Array.isArray(current.history) ? current.history : []);
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

function seekShow(guildId, targetSeconds, now = Date.now(), roomNumber = null) {
  const config = getConfig(guildId);
  const show = config.shows.find(s => {
    if (roomNumber !== null && (s.roomId || 1) !== Number(roomNumber)) return false;
    return Date.parse(s.startsAt) <= now && now < Date.parse(s.endsAt);
  });
  if (!show) fail(404, 'Hiện không có suất chiếu nào đang phát.');
  const oldDuration = Date.parse(show.endsAt) - Date.parse(show.startsAt);
  const target = Math.max(0, Number(targetSeconds) || 0);
  const newStartsAt = new Date(now - target * 1000).toISOString();
  const newEndsAt = new Date(Date.parse(newStartsAt) + oldDuration).toISOString();
  show.startsAt = newStartsAt;
  show.endsAt = newEndsAt;
  setGuildSetting(guildId, 'CINEMA_CONFIG', JSON.stringify(config));
  return { position: target, startsAt: newStartsAt, endsAt: newEndsAt, roomId: show.roomId || 1 };
}

async function viewerState(guild, userId, env, now = Date.now(), queryChannelId = null) {
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

  const effectiveChannelId = queryChannelId || member.voice?.channelId;
  let roomNumber = null;
  if (effectiveChannelId) {
    const ch = guild.channels?.cache?.get(effectiveChannelId);
    if (ch) {
      roomNumber = getRoomNumberFromChannel(ch);
    }
  }

  let show = null;
  if (roomNumber !== null) {
    show = config.shows.find(s => (s.roomId || 1) === roomNumber && Date.parse(s.startsAt) <= now && now < Date.parse(s.endsAt));
  }
  if (!show) {
    show = config.shows.find(s => Date.parse(s.startsAt) <= now && now < Date.parse(s.endsAt));
  }

  const activeRoomId = show ? (show.roomId || 1) : (roomNumber || 1);
  const roomTitle = `Cinema ${activeRoomId}`;

  return {
    title: show ? `${show.title} (${roomTitle})` : config.title,
    description: config.description,
    serverTime: now,
    canSeek,
    roomId: activeRoomId,
    shows: (config.shows || []).map(({ title, startsAt, endsAt, roomId }) => ({ title, startsAt, endsAt, roomId: roomId || 1 })),
    upcoming: config.shows.filter(s => Date.parse(s.startsAt) > now).map(({ title, startsAt, endsAt, roomId }) => ({ title, startsAt, endsAt, roomId: roomId || 1 })),
    show: show ? {
      title: show.title,
      roomId: show.roomId || 1,
      startsAt: show.startsAt,
      endsAt: show.endsAt,
      mediaPath: '/.proxy/media' + new URL(sourceUrl(show.source, env)).pathname,
      position: (now - Date.parse(show.startsAt)) / 1000
    } : null
  };
}

function getLastAnnouncedShow(guildId) {
  try {
    const raw = getGuildSetting(guildId, 'CINEMA_LAST_ANNOUNCED');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getAnnouncedShows(guildId) {
  try {
    const raw = getGuildSetting(guildId, 'CINEMA_ANNOUNCED_SHOWS');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function isShowAnnounced(guildId, showOrKey, now = Date.now()) {
  const last = getLastAnnouncedShow(guildId);
  if (last && typeof showOrKey === 'object' && showOrKey !== null) {
    const show = showOrKey;
    const sameTitle = last.title && show.title && last.title.trim().toLowerCase() === show.title.trim().toLowerCase();
    const showStart = Date.parse(show.startsAt);
    const showEnd = Date.parse(show.endsAt);
    const lastStart = Date.parse(last.startsAt);
    const lastEnd = Date.parse(last.endsAt);

    if (sameTitle && Number.isFinite(showEnd) && Number.isFinite(lastEnd)) {
      const isCurrentlyRunning = now >= (showStart - 60000) && now < showEnd;
      const isWithinLastRuntime = now < lastEnd;
      const startTimesClose = Math.abs(showStart - lastStart) < 30 * 60 * 1000;
      if (isCurrentlyRunning && isWithinLastRuntime && startTimesClose) {
        return true;
      }
    }
  }

  const list = getAnnouncedShows(guildId);
  if (typeof showOrKey === 'string') {
    return Array.isArray(list) && list.includes(showOrKey);
  }
  if (typeof showOrKey === 'object' && showOrKey !== null) {
    const rawKey = `${showOrKey.startsAt}_${showOrKey.title}`;
    const minute = Math.floor(Date.parse(showOrKey.startsAt) / 60000);
    const minuteKey = `${minute}_${showOrKey.title}`;
    return Array.isArray(list) && (list.includes(rawKey) || list.includes(minuteKey));
  }
  return false;
}

function markShowAnnounced(guildId, showOrKey) {
  try {
    const now = Date.now();
    let title = '';
    let startsAt = '';
    let endsAt = '';
    let rawKey = '';
    let minuteKey = '';

    if (typeof showOrKey === 'object' && showOrKey !== null) {
      title = showOrKey.title || '';
      startsAt = showOrKey.startsAt || new Date(now).toISOString();
      endsAt = showOrKey.endsAt || new Date(now + 2.5 * 3600000).toISOString();
      rawKey = `${startsAt}_${title}`;
      const minute = Math.floor(Date.parse(startsAt) / 60000);
      minuteKey = `${minute}_${title}`;
    } else if (typeof showOrKey === 'string') {
      rawKey = showOrKey;
      title = showOrKey;
      startsAt = new Date(now).toISOString();
      endsAt = new Date(now + 2.5 * 3600000).toISOString();
    }

    if (title) {
      setGuildSetting(guildId, 'CINEMA_LAST_ANNOUNCED', JSON.stringify({
        title,
        startsAt,
        endsAt,
        announcedAt: now,
      }));
    }

    const list = getAnnouncedShows(guildId);
    if (rawKey && !list.includes(rawKey)) list.push(rawKey);
    if (minuteKey && !list.includes(minuteKey)) list.push(minuteKey);
    const trimmed = list.slice(-100);
    setGuildSetting(guildId, 'CINEMA_ANNOUNCED_SHOWS', JSON.stringify(trimmed));
  } catch (err) {
    console.error('[CINEMA] Lỗi lưu danh sách suất chiếu đã thông báo:', err.message);
  }
}

function getCinemaCategory(guild, config) {
  if (!guild || !guild.channels?.cache) return null;
  const channels = guild.channels.cache;

  // 1. Kiểm tra nếu có categoryId được cấu hình và hợp lệ trong guild
  if (config && config.categoryId) {
    const cat = channels.get(config.categoryId);
    if (cat && (cat.type === 4 || cat.type === 'GUILD_CATEGORY' || (typeof cat.isCategory === 'function' && cat.isCategory()))) {
      return cat;
    }
  }

  // 2. Tự động nhận diện danh mục có chứa chữ "cinema" hoặc "rạp phim"
  return channels.find(c => {
    const isCat = c.type === 4 || c.type === 'GUILD_CATEGORY' || (typeof c.isCategory === 'function' && c.isCategory());
    return isCat && /(?:cinema|rạp\s*phim)/i.test(c.name || '');
  }) || null;
}

function getCinemaVoiceChannels(guild, config) {
  if (!guild || !guild.channels?.cache) return null;
  const category = getCinemaCategory(guild, config);
  if (!category) return null;
  return guild.channels.cache.filter(c =>
    c.parentId === category.id && (c.type === 2 || c.type === 13 || (typeof c.isVoiceBased === 'function' && c.isVoiceBased()))
  );
}

function isAllowedCinemaVoiceChannel(channel, guild, config) {
  if (!channel) return false;
  const category = getCinemaCategory(guild, config);
  if (!category) return true; // Nếu server chưa có danh mục Cinema riêng thì không giới hạn
  return channel.parentId === category.id;
}

function getRoomNumberFromChannel(channel) {
  if (!channel) return null;
  const name = channel.name || '';
  const match = name.match(/(?:cinema|phòng|room)?\s*([123])(?:\D|$)/i);
  if (match) return Number(match[1]);
  // Khớp ID phòng chiếu cố định nếu có
  if (channel.id === '1561644668280774707') return 1;
  if (channel.id === '1561645344796713031') return 2;
  if (channel.id === '1561645508739727461') return 3;
  return null;
}

async function ensureCinemaChannelPermissions(guild, config) {
  if (!guild || !guild.members?.me) return;
  const me = guild.members.me;
  if (!me.permissions?.has?.(PermissionFlagsBits.ManageChannels) && !me.permissions?.has?.(PermissionFlagsBits.Administrator)) {
    return;
  }
  const category = getCinemaCategory(guild, config);
  const voiceChannels = getCinemaVoiceChannels(guild, config);
  const targets = [];
  if (category) targets.push(category);
  if (voiceChannels && voiceChannels.size > 0) {
    for (const vc of voiceChannels.values()) targets.push(vc);
  }
  if (config?.voiceChannelId && guild.channels?.cache) {
    const ch = guild.channels.cache.get(config.voiceChannelId);
    if (ch && !targets.some(t => t.id === ch.id)) targets.push(ch);
  }

  for (const channel of targets) {
    try {
      if (!channel || typeof channel.permissionOverwrites?.edit !== 'function') continue;
      const overwrite = channel.permissionOverwrites.cache?.get(guild.roles.everyone.id);
      const hasAllow = overwrite?.allow?.has?.(PermissionFlagsBits.UseEmbeddedActivities) &&
                       overwrite?.allow?.has?.(PermissionFlagsBits.Connect) &&
                       overwrite?.allow?.has?.(PermissionFlagsBits.Speak);
      const hasDeny = overwrite?.deny?.has?.(PermissionFlagsBits.UseSoundboard);
      if (!hasAllow || !hasDeny) {
        await channel.permissionOverwrites.edit(guild.roles.everyone, {
          ViewChannel: true,
          Connect: true,
          UseEmbeddedActivities: true,
          Speak: true,
          UseSoundboard: false,
          UseExternalSounds: false,
          SendVoiceMessages: false,
        }, { reason: 'VNL Cinema: Cho phép thành viên nói chuyện, mở Activities và chặn soundboard' });
      }
    } catch (err) {
      console.warn(`[CINEMA] Không thể cập nhật quyền Activity cho kênh #${channel?.name}:`, err.message);
    }
  }
}

function getCinemaRoomChannel(guild, config, roomNumber = 1) {
  if (!guild || !guild.channels?.cache) return null;
  const targetRoom = Number(roomNumber) || 1;
  const category = getCinemaCategory(guild, config);
  const voiceChannels = category
    ? guild.channels.cache.filter(c => c.parentId === category.id && (c.type === 2 || c.type === 13 || (typeof c.isVoiceBased === 'function' && c.isVoiceBased())))
    : guild.channels.cache.filter(c => c.type === 2 || c.type === 13 || (typeof c.isVoiceBased === 'function' && c.isVoiceBased()));

  // 1. Tìm kênh voice trong category có số phòng khớp
  const matchedInCat = voiceChannels.find(c => getRoomNumberFromChannel(c) === targetRoom);
  if (matchedInCat) return matchedInCat;

  // 2. Nếu roomNumber === 1 và có voiceChannelId trong config
  if (targetRoom === 1 && config && config.voiceChannelId) {
    const ch = guild.channels.cache.get(config.voiceChannelId);
    if (ch) return ch;
  }

  // 3. Tìm trên toàn server nếu chưa có category
  const matchedInGuild = guild.channels.cache.find(c =>
    (c.type === 2 || c.type === 13 || (typeof c.isVoiceBased === 'function' && c.isVoiceBased())) &&
    getRoomNumberFromChannel(c) === targetRoom
  );
  if (matchedInGuild) return matchedInGuild;

  // 4. Fallback: Kênh voice đầu tiên
  return voiceChannels.first?.() || null;
}

function getActiveShow(config, now = Date.now(), roomNumber = null) {
  if (!config || !Array.isArray(config.shows)) return null;
  return config.shows.find(s => {
    if (roomNumber !== null && (s.roomId || 1) !== Number(roomNumber)) return false;
    const start = Date.parse(s.startsAt);
    const end = Date.parse(s.endsAt);
    return Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end;
  }) || null;
}

function isReminderAnnounced(guildId, showOrKey, type = 'early') {
  if (!showOrKey) return false;
  let key = '';
  if (typeof showOrKey === 'object') {
    const minute = Math.floor(Date.parse(showOrKey.startsAt) / 60000);
    const rId = showOrKey.roomId || 1;
    key = `${type}_r${rId}_${minute}_${showOrKey.title}`;
  } else {
    key = `${type}_${showOrKey}`;
  }
  const list = getAnnouncedShows(guildId);
  return Array.isArray(list) && list.includes(key);
}

function markReminderAnnounced(guildId, showOrKey, type = 'early') {
  try {
    let key = '';
    if (typeof showOrKey === 'object') {
      const minute = Math.floor(Date.parse(showOrKey.startsAt) / 60000);
      const rId = showOrKey.roomId || 1;
      key = `${type}_r${rId}_${minute}_${showOrKey.title}`;
    } else {
      key = `${type}_${showOrKey}`;
    }
    const list = getAnnouncedShows(guildId);
    if (key && !list.includes(key)) {
      list.push(key);
      const trimmed = list.slice(-150);
      setGuildSetting(guildId, 'CINEMA_ANNOUNCED_SHOWS', JSON.stringify(trimmed));
    }
  } catch (err) {
    console.error('[CINEMA] Lỗi lưu trạng thái thông báo nhắc trước:', err.message);
  }
}

function markShowEnded(guildId, now = Date.now(), roomNumber = null) {
  try {
    const raw = getGuildSetting(guildId, 'CINEMA_CONFIG');
    if (!raw) return false;
    const config = JSON.parse(raw);
    let changed = false;
    if (!Array.isArray(config.history)) config.history = [];
    const remainingShows = [];

    for (const s of (config.shows || [])) {
      const showRoom = s.roomId || 1;
      const roomMatches = roomNumber === null || showRoom === Number(roomNumber);
      const start = Date.parse(s.startsAt);
      const end = Date.parse(s.endsAt);
      if (roomMatches && Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end) {
        changed = true;
        config.history.unshift({
          title: s.title,
          source: s.source,
          roomId: showRoom,
          startsAt: s.startsAt,
          endsAt: new Date(now).toISOString(),
          endedAt: new Date(now).toISOString(),
          status: 'completed',
        });
      } else if (Number.isFinite(end) && end <= now) {
        changed = true;
        config.history.unshift({
          title: s.title,
          source: s.source,
          roomId: showRoom,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          endedAt: new Date(now).toISOString(),
          status: 'completed',
        });
      } else {
        remainingShows.push(s);
      }
    }
    if (changed) {
      config.shows = remainingShows;
      config.history = config.history.slice(0, 50);
      setGuildSetting(guildId, 'CINEMA_CONFIG', JSON.stringify(config));
    }
    return changed;
  } catch (err) {
    console.error('[CINEMA] Lỗi đánh dấu kết thúc suất chiếu:', err.message);
    return false;
  }
}

function deleteShow(guildId, criteria = {}) {
  const config = getConfig(guildId);
  const shows = config.shows || [];
  if (!shows.length) return config;

  let targetIdx = -1;
  if (typeof criteria.index === 'number' && criteria.index >= 0 && criteria.index < shows.length) {
    targetIdx = criteria.index;
  } else if (criteria.startsAt) {
    targetIdx = shows.findIndex(s => {
      if (criteria.roomId && (s.roomId || 1) !== Number(criteria.roomId)) return false;
      return s.startsAt === criteria.startsAt;
    });
  } else if (criteria.title) {
    targetIdx = shows.findIndex(s => {
      if (criteria.roomId && (s.roomId || 1) !== Number(criteria.roomId)) return false;
      return s.title === criteria.title;
    });
  }

  if (targetIdx !== -1) {
    const [deleted] = shows.splice(targetIdx, 1);
    if (!Array.isArray(config.history)) config.history = [];
    config.history.unshift({
      title: deleted.title,
      source: deleted.source,
      roomId: deleted.roomId || 1,
      startsAt: deleted.startsAt,
      endsAt: deleted.endsAt,
      endedAt: new Date().toISOString(),
      status: 'deleted',
    });
    config.history = config.history.slice(0, 50);
    config.revision += 1;
    setGuildSetting(guildId, 'CINEMA_CONFIG', JSON.stringify(config));
  }
  return config;
}

function clearHistory(guildId) {
  const config = getConfig(guildId);
  config.history = [];
  config.revision += 1;
  setGuildSetting(guildId, 'CINEMA_CONFIG', JSON.stringify(config));
  return config;
}

function normalizeMovieKey(str) {
  if (!str) return '';
  try { str = decodeURIComponent(str); } catch {}
  return str
    .split('/')
    .pop()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_+]/g, ' ')
    .trim()
    .toLowerCase();
}

async function listUploadedMovies(guildId, env = process.env) {
  const result = [];
  const publicDomain = (env.CINEMA_MEDIA_ORIGIN || 'https://pub-a6f2ebb772de4098b1e01e80864fbf6a.r2.dev').replace(/\/$/, '');
  const config = guildId ? getConfig(guildId) : null;
  const configuredShows = (config && Array.isArray(config.shows)) ? config.shows : [];

  const accountId = env.R2_ACCOUNT_ID || '64c6ad1cf148f3d10b27cc9b5ff9347c';
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  const bucketName = env.R2_BUCKET_NAME || 'vnl-cinema';

  let r2Objects = [];
  if (accessKeyId && secretAccessKey) {
    try {
      const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });

      const res = await s3.send(new ListObjectsV2Command({ Bucket: bucketName }));
      if (Array.isArray(res.Contents)) {
        r2Objects = res.Contents.filter(o => o.Key && /\.(mp4|webm|mkv|mov)$/i.test(o.Key));
      }
    } catch (err) {
      console.warn('[CINEMA] Không thể lấy danh sách phim từ R2:', err.message);
    }
  }

  const seenNorms = new Set();

  if (r2Objects.length > 0) {
    for (const obj of r2Objects) {
      const url = `${publicDomain}/${obj.Key}`;
      const normObjKey = normalizeMovieKey(obj.Key);
      if (normObjKey) seenNorms.add(normObjKey);

      const matchedShow = configuredShows.find(s => {
        if (!s) return false;
        if (s.source && (s.source === url || s.source.endsWith('/' + obj.Key))) return true;
        const normSource = normalizeMovieKey(s.source);
        const normTitle = normalizeMovieKey(s.title);
        return (normSource && normSource === normObjKey) || (normTitle && normTitle === normObjKey);
      });

      result.push({
        key: obj.Key,
        title: movieDetails(obj.Key, obj.Size, matchedShow?.title).title,
        durationSeconds: movieDetails(obj.Key, obj.Size).durationSeconds,
        source: url,
        size: obj.Size || 0,
        lastModified: obj.LastModified ? new Date(obj.LastModified) : null,
        scheduled: Boolean(matchedShow),
        scheduleShow: matchedShow || null,
      });
    }
  }

  // Bổ sung các phim đã lên lịch trong server nhưng chưa có trong danh sách R2 (nếu có nguồn ngoài riêng biệt)
  for (const s of configuredShows) {
    if (s.source) {
      const normSource = normalizeMovieKey(s.source) || normalizeMovieKey(s.title);
      if (normSource && !seenNorms.has(normSource)) {
        seenNorms.add(normSource);
        const fileName = s.source.split('/').pop() || s.title;
        result.push({
          key: fileName,
          title: movieDetails(fileName, null, s.title).title,
          durationSeconds: null,
          source: s.source,
          size: 0,
          lastModified: null,
          scheduled: true,
          scheduleShow: s,
        });
      }
    }
  }

  return result;
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
  getCinemaCategory,
  getCinemaVoiceChannels,
  isAllowedCinemaVoiceChannel,
  isReminderAnnounced,
  markReminderAnnounced,
  markShowEnded,
  listUploadedMovies,
  archiveExpiredShows,
  deleteShow,
  clearHistory,
  getRoomNumberFromChannel,
  getCinemaRoomChannel,
  ensureCinemaChannelPermissions,
  getActiveShow,
};
