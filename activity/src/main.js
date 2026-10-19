import { DiscordSDK } from '@discord/embedded-app-sdk';
const video = document.querySelector('#video');
const status = document.querySelector('#status');
const join = document.querySelector('#join');
let session, guildId, current = null, stopped = false;
async function request(route, options = {}) {
  const response = await fetch('/.proxy/cinema-api' + route, { ...options, credentials: 'omit', signal: AbortSignal.timeout(15000),
    headers: { ...(session ? { Authorization: `Bearer ${session}` } : {}), ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Không tải được Cinema.');
  return data;
}
function clearVideo() { current = null; video.pause(); video.removeAttribute('src'); video.load(); join.hidden = true; }
function sync() {
  if (!current || !video.readyState) return;
  const position = current.position + (performance.now() - current.receivedAt) / 1000;
  if (Number.isFinite(video.duration) && position >= video.duration) { video.pause(); status.textContent = 'Phim đã kết thúc. Đang chờ suất tiếp theo.'; return; }
  if (Math.abs(video.currentTime - position) > 2) video.currentTime = position;
}
async function play() { sync(); try { await video.play(); join.hidden = true; } catch { join.hidden = false; } }
join.onclick = play;
video.addEventListener('loadedmetadata', play);
video.addEventListener('error', () => { status.textContent = 'Không tải được video. Admin cần kiểm tra URL mapping /media, quyền truy cập tệp và định dạng video.'; });
async function poll() {
  try {
    const sent = performance.now();
    const data = await request(`/guilds/${guildId}/state`);
    document.querySelector('#title').textContent = data.title;
    document.querySelector('#description').textContent = data.description;
    const upcoming = document.querySelector('#upcoming');
    upcoming.replaceChildren();
    for (const show of data.upcoming) { const row = document.createElement('li'); row.textContent = `${show.title} · ${new Date(show.startsAt).toLocaleString('vi-VN')}`; upcoming.append(row); }
    if (!data.upcoming.length) { const row = document.createElement('li'); row.textContent = 'Chưa có suất chiếu tiếp theo.'; upcoming.append(row); }
    if (!data.show) { clearVideo(); status.textContent = 'Chưa tới giờ chiếu. Lịch sẽ tự cập nhật.'; }
    else {
      const changed = !current || current.mediaPath !== data.show.mediaPath || current.startsAt !== data.show.startsAt;
      current = { ...data.show, position: data.show.position + (performance.now() - sent) / 2000, receivedAt: performance.now() };
      status.textContent = `Đang chiếu · ${current.title}`;
      if (changed) { video.src = current.mediaPath; video.load(); } else { sync(); if (video.paused && !video.ended) join.hidden = false; }
    }
  } catch (error) {
    // Fail closed on permission loss, expiry or network failure: do not leave an old stream playing.
    clearVideo(); status.textContent = error.message + ' Nếu phiên hết hạn, hãy đóng và mở lại Activity.';
  } finally { if (!stopped) setTimeout(poll, 5000); }
}
async function start() {
  try {
    const { clientId } = await request('/config');
    if (!clientId) throw new Error('Chủ bot chưa cấu hình Client ID.');
    const sdk = new DiscordSDK(clientId);
    await sdk.ready();
    if (!sdk.guildId) throw new Error('Hãy mở Cinema trong một server Discord.');
    guildId = sdk.guildId;
    const { code } = await sdk.commands.authorize({ client_id: clientId, response_type: 'code', state: crypto.randomUUID(), prompt: 'none', scope: ['identify'] });
    const auth = await request('/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    await sdk.commands.authenticate({ access_token: auth.access_token });
    session = auth.session;
    await poll();
  } catch (error) { clearVideo(); status.textContent = error.message; }
}
window.addEventListener('pagehide', () => { stopped = true; clearVideo(); });
start();
