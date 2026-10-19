import { DiscordSDK } from '@discord/embedded-app-sdk';

const video = document.querySelector('#video');
const status = document.querySelector('#status');
const join = document.querySelector('#join');
const joinOverlay = document.querySelector('#join-overlay');
const theaterExit = document.querySelector('#theater-exit');
const toast = document.querySelector('#toast');
const roleBadge = document.querySelector('#role-badge');
const btnZoom = document.querySelector('#btn-zoom');
const btnSeekBack = document.querySelector('#btn-seek-back');
const btnSeekFwd = document.querySelector('#btn-seek-fwd');
const endedOverlay = document.querySelector('#ended-overlay');
const endedTitle = document.querySelector('#ended-title');

let session = null;
let guildId = null;
let channelId = null;
let current = null;
let stopped = false;
let isStaff = false;
let isSyncingFromServer = false;
let hasStarted = false;
let hasEndedNotified = false;
let toastTimeout = null;
let discordSdk = null;
let currentClientId = null;
let consecutivePollErrors = 0;
let isReauthing = false;

function showToast(msg) {
  if (!toast) return;
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toast.hidden = true; }, 2600);
}

function showEndedScreen(movieTitle) {
  if (endedOverlay) {
    if (endedTitle && movieTitle) {
      endedTitle.textContent = `Suất chiếu "${movieTitle}" đã kết thúc`;
    }
    endedOverlay.hidden = false;
    endedOverlay.style.setProperty('display', 'flex', 'important');
  }
  hideJoinOverlay();
  if (status) {
    status.textContent = 'Suất chiếu đã kết thúc. Rạp đã đóng cửa.';
  }
}

function hideEndedScreen() {
  if (endedOverlay) {
    endedOverlay.hidden = true;
    endedOverlay.style.setProperty('display', 'none', 'important');
  }
}

async function handleMovieEnded() {
  const finishedTitle = current?.title;
  clearVideo();
  showEndedScreen(finishedTitle);
  if (!hasEndedNotified && guildId) {
    hasEndedNotified = true;
    try {
      await request(`/guilds/${guildId}/ended`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
    } catch (err) {
      console.warn('Không thể gửi thông báo kết thúc suất chiếu lên server:', err.message);
    }
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = n => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

async function request(route, options = {}) {
  const response = await fetch('/.proxy/cinema-api' + route, {
    ...options,
    credentials: 'omit',
    signal: AbortSignal.timeout(15000),
    headers: {
      ...(session ? { Authorization: `Bearer ${session}` } : {}),
      ...options.headers,
    },
  });
  let data = null;
  const rawText = await response.text();
  if (rawText && rawText.trim()) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { error: `Máy chủ phản hồi trạng thái ${response.status}` };
    }
  } else {
    data = {};
  }
  if (!response.ok) {
    const err = new Error(data.error || `Lỗi kết nối (${response.status})`);
    err.status = response.status;
    throw err;
  }
  return data;
}

function hideJoinOverlay() {
  hasStarted = true;
  if (joinOverlay) {
    joinOverlay.hidden = true;
    joinOverlay.classList.add('hidden');
    joinOverlay.style.setProperty('display', 'none', 'important');
  }
}

function showJoinOverlay() {
  if (hasStarted || (endedOverlay && !endedOverlay.hidden)) return;
  if (joinOverlay) {
    joinOverlay.hidden = false;
    joinOverlay.classList.remove('hidden');
    joinOverlay.style.setProperty('display', 'flex', 'important');
  }
}

function clearVideo() {
  current = null;
  hasStarted = false;
  video.pause();
  video.removeAttribute('src');
  video.load();
  hideJoinOverlay();
}

function getSyncedPosition() {
  if (!current) return 0;
  return current.position + (performance.now() - current.receivedAt) / 1000;
}

function sync() {
  if (!current || !video.readyState) return;
  const position = getSyncedPosition();
  if (Number.isFinite(video.duration) && video.duration > 0 && position >= video.duration) {
    handleMovieEnded();
    return;
  }
  if (Math.abs(video.currentTime - position) > 2) {
    video.currentTime = position;
  }
}

async function play() {
  hideJoinOverlay();
  try {
    await video.play();
    sync();
  } catch (err) {
    // If unmuted playback is blocked by browser autoplay policy, fallback to muted play
    try {
      video.muted = true;
      await video.play();
      sync();
      showToast('🔊 Video đã phát. Hãy bấm biểu tượng loa để bật tiếng nhé!');
    } catch (e) {
      console.warn('Playback error:', e);
      // Giữ ẩn bảng bắt đầu xem để người dùng tương tác trực tiếp với thanh điều khiển video
    }
  }
}

// Staff Seeking
async function sendStaffSeek(targetSeconds) {
  if (!isStaff) {
    showToast('⚠️ Chỉ đội ngũ Staff mới có quyền tua video.');
    return;
  }
  const max = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 86400;
  const clamped = Math.max(0, Math.min(max, targetSeconds));
  isSyncingFromServer = true;
  video.currentTime = clamped;
  try {
    const res = await request(`/guilds/${guildId}/seek`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: clamped, channelId }),
    });
    if (current) {
      current.position = res.position;
      current.receivedAt = performance.now();
    }
    showToast(`⏩ Đã tua đến ${formatTime(clamped)}`);
  } catch (err) {
    showToast(`❌ ${err.message}`);
    sync();
  } finally {
    setTimeout(() => { isSyncingFromServer = false; }, 800);
  }
}

// Theater Mode (Phóng to màn hình)
function toggleTheater(force) {
  const isTheater = typeof force === 'boolean' ? force : !document.body.classList.contains('theater-mode');
  if (isTheater) {
    document.body.classList.add('theater-mode');
    if (theaterExit) theaterExit.hidden = false;
    if (btnZoom) btnZoom.textContent = '🗗 Thu nhỏ';
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {}
  } else {
    document.body.classList.remove('theater-mode');
    if (theaterExit) theaterExit.hidden = true;
    if (btnZoom) btnZoom.textContent = '🗖 Phóng to màn hình';
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } catch {}
  }
}

// Global window helpers for inline onclick resilience
window.vnlPlay = play;
window.vnlDismissOverlay = play;
window.vnlToggleTheater = toggleTheater;
window.vnlSeekBack = () => sendStaffSeek(video.currentTime - 10);
window.vnlSeekFwd = () => sendStaffSeek(video.currentTime + 10);

// Attach Video Event Listeners
if (join) {
  join.onclick = e => {
    e.stopPropagation();
    play();
  };
}
if (joinOverlay) {
  joinOverlay.onclick = () => {
    play();
  };
}

video.addEventListener('loadedmetadata', () => {
  const position = getSyncedPosition();
  if (Number.isFinite(video.duration) && video.duration > 0 && position >= video.duration) {
    handleMovieEnded();
    return;
  }
  if (hasStarted) sync();
  else play();
});

video.addEventListener('ended', () => {
  handleMovieEnded();
});

video.addEventListener('error', () => {
  status.textContent = 'Không tải được video. Admin cần kiểm tra URL mapping /media và định dạng tệp.';
});

// Guard non-staff seeking on native controls
video.addEventListener('seeking', () => {
  if (!isStaff && current && !isSyncingFromServer) {
    const target = getSyncedPosition();
    if (Math.abs(video.currentTime - target) > 1.5) {
      isSyncingFromServer = true;
      video.currentTime = target;
      showToast('⚠️ Chỉ đội ngũ Staff mới có quyền tua video.');
      setTimeout(() => { isSyncingFromServer = false; }, 400);
    }
  }
});

// Allow staff seeking on native controls
video.addEventListener('seeked', () => {
  if (isStaff && current && !isSyncingFromServer) {
    const target = video.currentTime;
    const synced = getSyncedPosition();
    if (Math.abs(target - synced) > 2) {
      sendStaffSeek(target);
    }
  }
});

// Double click video to toggle theater
video.addEventListener('dblclick', () => toggleTheater());

// Button listeners
if (btnZoom) btnZoom.onclick = () => toggleTheater();
if (theaterExit) theaterExit.onclick = () => toggleTheater(false);

if (btnSeekBack) {
  btnSeekBack.onclick = () => sendStaffSeek(video.currentTime - 10);
}
if (btnSeekFwd) {
  btnSeekFwd.onclick = () => sendStaffSeek(video.currentTime + 10);
}

// Keyboard shortcuts
window.addEventListener('keydown', e => {
  if (e.target && ['input', 'textarea'].includes(e.target.tagName?.toLowerCase())) return;
  if (e.code === 'KeyF') {
    e.preventDefault();
    toggleTheater();
  } else if (e.code === 'Escape') {
    if (document.body.classList.contains('theater-mode')) {
      e.preventDefault();
      toggleTheater(false);
    }
  } else if (e.code === 'ArrowLeft' && isStaff) {
    e.preventDefault();
    sendStaffSeek(video.currentTime - 10);
  } else if (e.code === 'ArrowRight' && isStaff) {
    e.preventDefault();
    sendStaffSeek(video.currentTime + 10);
  }
});

// Periodic State Polling
async function poll() {
  try {
    const sent = performance.now();
    const query = channelId ? `?channelId=${encodeURIComponent(channelId)}` : '';
    const data = await request(`/guilds/${guildId}/state${query}`);
    consecutivePollErrors = 0;

    // Staff Permissions
    isStaff = Boolean(data.canSeek);
    if (btnSeekBack) btnSeekBack.hidden = !isStaff;
    if (btnSeekFwd) btnSeekFwd.hidden = !isStaff;
    if (roleBadge) {
      if (isStaff) {
        roleBadge.className = 'badge-sync staff';
        roleBadge.textContent = '👑 STAFF CONTROL';
        roleBadge.title = 'Bạn có quyền tua video cho toàn bộ phòng chiếu';
      } else {
        roleBadge.className = 'badge-sync';
        roleBadge.textContent = '🔴 ĐỒNG BỘ TRỰC TIẾP';
        roleBadge.title = 'Phim phát đồng bộ. Chỉ Staff mới có quyền tua.';
      }
    }

    document.querySelector('#title').textContent = data.title;
    document.querySelector('#description').textContent = data.description;

    const upcoming = document.querySelector('#upcoming');
    upcoming.replaceChildren();

    const formatTimeRange = (startsAt, endsAt) => {
      try {
        const s = new Date(startsAt);
        const e = new Date(endsAt);
        const sTime = s.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const sDate = s.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
        const eTime = e.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        return `${sTime} – ${eTime} · ${sDate}`;
      } catch {
        return `${new Date(startsAt).toLocaleString('vi-VN')}`;
      }
    };

    const allShows = Array.isArray(data.shows) && data.shows.length > 0
      ? data.shows
      : [
          ...(data.show ? [data.show] : []),
          ...(Array.isArray(data.upcoming) ? data.upcoming : [])
        ];

    let hasAnyShow = false;
    const nowMs = Date.now();

    for (const item of allShows) {
      hasAnyShow = true;
      const row = document.createElement('li');
      const badge = document.createElement('span');
      badge.className = 'badge-show';

      const sStart = Date.parse(item.startsAt);
      const sEnd = Date.parse(item.endsAt);
      const isCurrent = data.show && item.title === data.show.title &&
        (Math.abs(Date.parse(data.show.startsAt) - sStart) < 60000 || (Number.isFinite(sStart) && Number.isFinite(sEnd) && sStart <= nowMs && nowMs < sEnd));
      const isUpcoming = Number.isFinite(sStart) && sStart > nowMs;
      const isPast = Number.isFinite(sEnd) && sEnd <= nowMs;

      if (isCurrent) {
        row.className = 'show-item live';
        badge.className = 'badge-show badge-live';
        badge.textContent = '🔴 Đang chiếu';
      } else if (isUpcoming) {
        row.className = 'show-item upcoming';
        badge.className = 'badge-show badge-upcoming';
        badge.textContent = '⏳ Sắp chiếu';
      } else if (isPast) {
        row.className = 'show-item past';
        badge.className = 'badge-show badge-past';
        badge.style.background = 'rgba(255, 255, 255, 0.12)';
        badge.style.color = '#bbb';
        badge.textContent = '🎬 Đã kết thúc';
      } else {
        row.className = 'show-item past';
        badge.className = 'badge-show';
        badge.style.background = 'rgba(255, 255, 255, 0.12)';
        badge.style.color = '#bbb';
        badge.textContent = '🎬 Suất chiếu';
      }

      const info = document.createElement('span');
      info.className = 'show-info';
      info.textContent = `${item.title} (${formatTimeRange(item.startsAt, item.endsAt)})`;

      row.append(badge, info);
      upcoming.append(row);
    }

    if (!hasAnyShow) {
      const row = document.createElement('li');
      row.className = 'show-empty';
      row.textContent = 'Chưa có suất chiếu nào trong lịch.';
      upcoming.append(row);
    }

    if (!data.show) {
      clearVideo();
      const pastShows = allShows.filter(s => Number.isFinite(Date.parse(s.endsAt)) && Date.parse(s.endsAt) <= nowMs);
      const upcomingShows = allShows.filter(s => Number.isFinite(Date.parse(s.startsAt)) && Date.parse(s.startsAt) > nowMs);
      if (hasEndedNotified || (pastShows.length > 0 && upcomingShows.length === 0)) {
        showEndedScreen(pastShows[pastShows.length - 1]?.title);
      } else {
        hideEndedScreen();
        status.textContent = upcomingShows.length > 0
          ? 'Chưa tới giờ chiếu. Lịch sẽ tự cập nhật khi tới giờ.'
          : 'Chưa có suất chiếu nào được lên lịch.';
      }
    } else {
      hideEndedScreen();
      hasEndedNotified = false;
      const changed = !current || current.mediaPath !== data.show.mediaPath || current.startsAt !== data.show.startsAt;
      current = {
        ...data.show,
        position: data.show.position + (performance.now() - sent) / 2000,
        receivedAt: performance.now(),
      };
      status.textContent = `Đang chiếu · ${current.title}`;
      if (changed) {
        video.src = current.mediaPath;
        video.load();
        if (!hasStarted) {
          showJoinOverlay();
        }
      } else {
        isSyncingFromServer = true;
        sync();
        setTimeout(() => { isSyncingFromServer = false; }, 300);
        if (!hasStarted && video.paused && !video.ended) {
          showJoinOverlay();
        }
      }
    }
  } catch (error) {
    consecutivePollErrors++;
    console.warn(`[CINEMA POLL] Thử lại (${consecutivePollErrors}):`, error.message);

    // NẾU VIDEO ĐANG PHÁT HOẶC ĐÃ NẠP: TUYỆT ĐỐI KHÔNG GỠ / KHÔNG DỪNG VIDEO!
    // Giữ nguyên nguồn video để người dùng xem liên tục, không bị ngắt quãng khi mạng lag hoặc server khởi động lại.
    if (!current || !hasStarted) {
      if (consecutivePollErrors >= 3) {
        status.textContent = `${error.message}. Đang thử kết nối lại...`;
      }
    } else {
      if (consecutivePollErrors >= 5) {
        showToast('⚠️ Mất kết nối tới máy chủ. Đang tự động kết nối lại...');
      }
    }

    // Nếu lỗi 401 (phiên hết hạn), tự động gia hạn phiên trong nền mà không làm gián đoạn phim
    if (error.status === 401 && discordSdk) {
      tryReauth().catch(() => {});
    }
  } finally {
    if (!stopped) setTimeout(poll, 4000);
  }
}

// Background session re-authentication
async function tryReauth() {
  if (isReauthing || !discordSdk || !currentClientId) return;
  isReauthing = true;
  try {
    const state = (window.crypto && typeof window.crypto.randomUUID === 'function')
      ? window.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    const { code } = await discordSdk.commands.authorize({
      client_id: currentClientId,
      response_type: 'code',
      state,
      prompt: 'none',
      scope: ['identify'],
    });
    const auth = await request('/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (auth.session) {
      session = auth.session;
      if (auth.access_token) {
        try { await discordSdk.commands.authenticate({ access_token: auth.access_token }); } catch {}
      }
      consecutivePollErrors = 0;
      console.log('[CINEMA] Đã tự động gia hạn phiên thành công.');
    }
  } catch (err) {
    console.warn('[CINEMA] Không thể tự động gia hạn phiên:', err.message);
  } finally {
    isReauthing = false;
  }
}

// SDK Initialization
async function start() {
  try {
    const { clientId } = await request('/config');
    if (!clientId) throw new Error('Chủ bot chưa cấu hình Client ID.');
    currentClientId = clientId;
    discordSdk = new DiscordSDK(clientId);
    await discordSdk.ready();
    if (!discordSdk.guildId) throw new Error('Hãy mở Cinema trong một server Discord.');
    guildId = discordSdk.guildId;
    channelId = discordSdk.channelId || null;
    const state = (window.crypto && typeof window.crypto.randomUUID === 'function')
      ? window.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    const { code } = await discordSdk.commands.authorize({
      client_id: clientId,
      response_type: 'code',
      state,
      prompt: 'none',
      scope: ['identify'],
    });
    const auth = await request('/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (auth.access_token) {
      try {
        await discordSdk.commands.authenticate({ access_token: auth.access_token });
      } catch {}
    }
    session = auth.session;
    await poll();
  } catch (error) {
    clearVideo();
    status.textContent = error.message;
  }
}

window.addEventListener('pagehide', () => {
  stopped = true;
  clearVideo();
});

start();
