import { DiscordSDK } from '@discord/embedded-app-sdk';

const screen = document.querySelector('#screen');
const video = document.querySelector('#video');
const videoContainer = document.querySelector('#video-container');
const status = document.querySelector('#status');
const join = document.querySelector('#join');
const joinOverlay = document.querySelector('#join-overlay');
const theaterExit = document.querySelector('#theater-exit');
const toast = document.querySelector('#toast');
const controls = document.querySelector('#controls');
const timelineContainer = document.querySelector('#timeline-container');
const timelineProgress = document.querySelector('#timeline-progress');
const btnPlay = document.querySelector('#btn-play');
const btnSeekBack = document.querySelector('#btn-seek-back');
const btnSeekFwd = document.querySelector('#btn-seek-fwd');
const btnMute = document.querySelector('#btn-mute');
const volumeSlider = document.querySelector('#volume-slider');
const timeCurrent = document.querySelector('#time-current');
const timeDuration = document.querySelector('#time-duration');
const roleBadge = document.querySelector('#role-badge');
const btnZoom = document.querySelector('#btn-zoom');

let session = null;
let guildId = null;
let current = null;
let stopped = false;
let isStaff = false;
let isSeekingLocally = false;
let controlsTimeout = null;
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
  updatePlayButton();
}

function getSyncedPosition() {
  if (!current) return 0;
  return current.position + (performance.now() - current.receivedAt) / 1000;
}

function sync() {
  if (!current || !video.readyState || isSeekingLocally) return;
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
  updatePlayButton();
}

function updatePlayButton() {
  if (!btnPlay) return;
  btnPlay.textContent = video.paused ? '▶' : '⏸';
  btnPlay.title = video.paused ? 'Phát video' : 'Tạm dừng';
}

function updateTimeline() {
  const cur = video.currentTime || 0;
  const dur = video.duration || 0;
  if (timeCurrent) timeCurrent.textContent = formatTime(cur);
  if (timeDuration) timeDuration.textContent = formatTime(dur);
  if (timelineProgress && dur > 0) {
    const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
    timelineProgress.style.width = `${pct}%`;
  }
}

// Staff-only seek handler
async function handleStaffSeek(targetSeconds) {
  if (!isStaff) {
    showToast('⚠️ Chỉ đội ngũ Staff mới có quyền tua video.');
    return;
  }
  const max = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 86400;
  const clamped = Math.max(0, Math.min(max, targetSeconds));
  isSeekingLocally = true;
  video.currentTime = clamped;
  updateTimeline();
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
    setTimeout(() => { isSeekingLocally = false; }, 800);
  }
}

// Theater / Zoom Mode
function toggleTheater(force) {
  const isTheater = typeof force === 'boolean' ? force : !screen.classList.contains('theater-mode');
  if (isTheater) {
    screen.classList.add('theater-mode');
    if (theaterExit) theaterExit.hidden = false;
    if (btnZoom) btnZoom.textContent = '🗗 Thu nhỏ';
    try {
      if (!document.fullscreenElement && screen.requestFullscreen) {
        screen.requestFullscreen().catch(() => {});
      }
    } catch {}
  } else {
    screen.classList.remove('theater-mode');
    if (theaterExit) theaterExit.hidden = true;
    if (btnZoom) btnZoom.textContent = '🗖 Phóng to';
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } catch {}
  }
}

// Controls Auto-hide
function wakeControls() {
  if (!controls) return;
  controls.classList.remove('autohide');
  clearTimeout(controlsTimeout);
  if (!video.paused) {
    controlsTimeout = setTimeout(() => {
      controls.classList.add('autohide');
    }, 3200);
  }
}

// Volume & Mute
function initAudio() {
  try {
    const savedVol = localStorage.getItem('vnl_cinema_volume');
    const savedMuted = localStorage.getItem('vnl_cinema_muted');
    if (savedVol !== null) {
      video.volume = parseFloat(savedVol);
      if (volumeSlider) volumeSlider.value = savedVol;
    }
    if (savedMuted === 'true') {
      video.muted = true;
    }
  } catch {}
  updateVolumeUI();
}

function updateVolumeUI() {
  if (video.muted || video.volume === 0) {
    if (btnMute) btnMute.textContent = '🔇';
  } else if (video.volume < 0.5) {
    if (btnMute) btnMute.textContent = '🔉';
  } else {
    if (btnMute) btnMute.textContent = '🔊';
  }
}

// Attach Video Events
video.addEventListener('play', () => { updatePlayButton(); wakeControls(); });
video.addEventListener('pause', () => { updatePlayButton(); wakeControls(); });
video.addEventListener('timeupdate', () => { updateTimeline(); });
video.addEventListener('loadedmetadata', () => { updateTimeline(); play(); });
video.addEventListener('error', () => {
  status.textContent = 'Không tải được video. Admin cần kiểm tra URL mapping /media và định dạng tệp.';
});

// Guard against non-staff seeking on native events
video.addEventListener('seeking', () => {
  if (!isStaff && current && !isSeekingLocally) {
    const target = getSyncedPosition();
    if (Math.abs(video.currentTime - target) > 1.5) {
      video.currentTime = target;
      showToast('⚠️ Chỉ đội ngũ Staff mới có quyền tua video.');
    }
  }
});

// User Interactions
if (join) join.onclick = play;
if (btnPlay) {
  btnPlay.onclick = () => {
    if (video.paused) play();
    else video.pause();
  };
}

if (btnSeekBack) {
  btnSeekBack.onclick = () => handleStaffSeek(video.currentTime - 10);
}
if (btnSeekFwd) {
  btnSeekFwd.onclick = () => handleStaffSeek(video.currentTime + 10);
}

if (volumeSlider) {
  volumeSlider.oninput = () => {
    video.volume = parseFloat(volumeSlider.value);
    video.muted = video.volume === 0;
    updateVolumeUI();
    try {
      localStorage.setItem('vnl_cinema_volume', video.volume);
      localStorage.setItem('vnl_cinema_muted', video.muted);
    } catch {}
  };
}

if (btnMute) {
  btnMute.onclick = () => {
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) {
      video.volume = 0.5;
      if (volumeSlider) volumeSlider.value = 0.5;
    }
    updateVolumeUI();
    try {
      localStorage.setItem('vnl_cinema_muted', video.muted);
    } catch {}
  };
}

if (btnZoom) btnZoom.onclick = () => toggleTheater();
if (theaterExit) theaterExit.onclick = () => toggleTheater(false);

// Timeline Scrubbing for Staff
if (timelineContainer) {
  timelineContainer.onclick = e => {
    if (!isStaff) {
      showToast('⚠️ Chỉ đội ngũ Staff mới có quyền tua video.');
      return;
    }
    const rect = timelineContainer.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (Number.isFinite(video.duration) && video.duration > 0) {
      handleStaffSeek(pos * video.duration);
    }
  };
}

// Mouse movement inside video container
if (videoContainer) {
  videoContainer.addEventListener('mousemove', wakeControls);
  videoContainer.addEventListener('mouseenter', wakeControls);
  videoContainer.addEventListener('touchstart', wakeControls, { passive: true });
  videoContainer.addEventListener('dblclick', e => {
    if (e.target !== controls && !controls.contains(e.target)) {
      toggleTheater();
    }
  });
}

// Keyboard shortcuts
window.addEventListener('keydown', e => {
  if (e.target && ['input', 'textarea'].includes(e.target.tagName?.toLowerCase())) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (video.paused) play();
    else video.pause();
  } else if (e.code === 'KeyF') {
    e.preventDefault();
    toggleTheater();
  } else if (e.code === 'Escape') {
    if (screen.classList.contains('theater-mode')) {
      e.preventDefault();
      toggleTheater(false);
    }
  } else if (e.code === 'ArrowLeft' && isStaff) {
    e.preventDefault();
    handleStaffSeek(video.currentTime - 10);
  } else if (e.code === 'ArrowRight' && isStaff) {
    e.preventDefault();
    handleStaffSeek(video.currentTime + 10);
  } else if (e.code === 'KeyM') {
    e.preventDefault();
    if (btnMute) btnMute.click();
  }
});

// Periodic Polling
async function poll() {
  try {
    const sent = performance.now();
    const data = await request(`/guilds/${guildId}/state`);
    
    // Update Role & Permissions
    isStaff = Boolean(data.canSeek);
    if (btnSeekBack) btnSeekBack.hidden = !isStaff;
    if (btnSeekFwd) btnSeekFwd.hidden = !isStaff;
    if (timelineContainer) {
      if (isStaff) timelineContainer.classList.remove('disabled');
      else timelineContainer.classList.add('disabled');
    }
    if (roleBadge) {
      if (isStaff) {
        roleBadge.className = 'badge-sync staff';
        roleBadge.textContent = '👑 STAFF CONTROL';
        roleBadge.title = 'Bạn có quyền tua phim cho toàn bộ phòng chiếu';
      } else {
        roleBadge.className = 'badge-sync';
        roleBadge.textContent = '🔴 ĐỒNG BỘ TRỰC TIẾP';
        roleBadge.title = 'Phim được phát đồng bộ. Chỉ Staff mới có quyền tua.';
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
        sync();
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
  initAudio();
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
