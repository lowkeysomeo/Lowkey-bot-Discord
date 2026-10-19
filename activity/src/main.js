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

let session = null;
let guildId = null;
let current = null;
let stopped = false;
let isStaff = false;
let isSyncingFromServer = false;
let toastTimeout = null;

function showToast(msg) {
  if (!toast) return;
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toast.hidden = true; }, 2600);
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
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Không tải được Cinema.');
  return data;
}

function clearVideo() {
  current = null;
  video.pause();
  video.removeAttribute('src');
  video.load();
  if (joinOverlay) joinOverlay.hidden = true;
}

function getSyncedPosition() {
  if (!current) return 0;
  return current.position + (performance.now() - current.receivedAt) / 1000;
}

function sync() {
  if (!current || !video.readyState) return;
  const position = getSyncedPosition();
  if (Number.isFinite(video.duration) && position >= video.duration) {
    video.pause();
    status.textContent = 'Phim đã kết thúc. Đang chờ suất tiếp theo.';
    return;
  }
  if (Math.abs(video.currentTime - position) > 2) {
    video.currentTime = position;
  }
}

async function play() {
  sync();
  try {
    await video.play();
    if (joinOverlay) joinOverlay.hidden = true;
  } catch {
    if (joinOverlay) joinOverlay.hidden = false;
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
      body: JSON.stringify({ position: clamped }),
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

// Attach Video Event Listeners
if (join) join.onclick = play;
video.addEventListener('loadedmetadata', play);
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
    const data = await request(`/guilds/${guildId}/state`);

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
    for (const show of data.upcoming) {
      const row = document.createElement('li');
      row.textContent = `${show.title} · ${new Date(show.startsAt).toLocaleString('vi-VN')}`;
      upcoming.append(row);
    }
    if (!data.upcoming.length) {
      const row = document.createElement('li');
      row.textContent = 'Chưa có suất chiếu tiếp theo.';
      upcoming.append(row);
    }

    if (!data.show) {
      clearVideo();
      status.textContent = 'Chưa tới giờ chiếu. Lịch sẽ tự cập nhật.';
    } else {
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
      } else {
        isSyncingFromServer = true;
        sync();
        setTimeout(() => { isSyncingFromServer = false; }, 300);
        if (video.paused && !video.ended && joinOverlay) {
          joinOverlay.hidden = false;
        }
      }
    }
  } catch (error) {
    clearVideo();
    status.textContent = `${error.message} Nếu phiên hết hạn, hãy đóng và mở lại Activity.`;
  } finally {
    if (!stopped) setTimeout(poll, 4000);
  }
}

// SDK Initialization
async function start() {
  try {
    const { clientId } = await request('/config');
    if (!clientId) throw new Error('Chủ bot chưa cấu hình Client ID.');
    const sdk = new DiscordSDK(clientId);
    await sdk.ready();
    if (!sdk.guildId) throw new Error('Hãy mở Cinema trong một server Discord.');
    guildId = sdk.guildId;
    const state = (window.crypto && typeof window.crypto.randomUUID === 'function')
      ? window.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    const { code } = await sdk.commands.authorize({
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
        await sdk.commands.authenticate({ access_token: auth.access_token });
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
