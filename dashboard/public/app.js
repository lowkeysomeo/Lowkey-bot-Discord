const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
const state = { session: null, guilds: [], guild: null, data: null, page: 'overview', loading: false, dirty: false, saving: false, requestId: 0 };
const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const number = value => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
let toastTimer;
function notify(message) { toast.textContent = message; toast.style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 5500); }
async function api(route, data) {
  const response = await fetch(route, { method: data ? 'POST' : 'GET', headers: data ? { 'Content-Type': 'application/json', 'X-CSRF-Token': state.session.csrf } : {}, ...(data ? { body: JSON.stringify(data) } : {}) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) { state.session = { ...state.session, user: null }; render(); }
    throw new Error(result.error || 'Không tải được dữ liệu.');
  }
  return result;
}
const brand = `<div class="brand"><span class="brand-icon">V</span><span>VietNam Legacy<small>SERVER DASHBOARD</small></span></div>`;
const labels = { overview: 'Tổng quan', level: 'Level & Role', confession: 'Confession', leaderboard: 'Bảng xếp hạng' };
const icons = { overview: '◫', level: '↗', confession: '♡', leaderboard: '≋' };
function render() {
  if (!state.session?.user) {
    app.innerHTML = `<div class="login"><section class="login-art">${brand}<div class="login-copy"><span class="eyebrow">MỘT NƠI. CẢ CỘNG ĐỒNG.</span><h1>Server của bạn.<br><span>Theo cách của bạn.</span></h1><p>Chăm chút cộng đồng cùng VietNam Legacy. Quản lý level, role thưởng và những câu chuyện ẩn danh trong một nơi.</p><div class="login-pills"><span>↗ Level & Role</span><span>♡ Confession</span><span>≋ Bảng xếp hạng</span></div></div><p class="login-foot">VIETNAM LEGACY · DÀNH CHO CỘNG ĐỒNG CỦA BẠN</p></section><section class="login-panel"><div class="login-box"><span class="badge purple">BẢNG ĐIỀU KHIỂN</span><h2>Chào mừng trở lại.</h2><p>Đăng nhập bằng Discord để chọn server và bắt đầu quản lý.</p>${state.session?.configured ? '<a class="primary" href="/auth/discord">Đăng nhập bằng Discord <span>↗</span></a>' : '<button class="primary" disabled>Đăng nhập Discord</button><div class="error">Dashboard đang chờ hoàn tất kết nối đăng nhập Discord. Chủ bot cần cấu hình OAuth2 để mở đăng nhập.</div>'}<p class="subtle">Chỉ chủ server và thành viên có quyền Administrator được quản lý cấu hình.</p></div></section></div>`;
    return;
  }
  app.innerHTML = `${state.session.preview ? '<div class="preview-banner">BẢN XEM TRƯỚC · Dữ liệu minh họa, không thay đổi server Discord thật.</div>' : ''}<div class="layout"><aside class="sidebar">${brand}<div><p class="nav-label">SERVER CỦA BẠN</p><select class="server-picker" id="server-select" aria-label="Chọn server"><option value="">Chọn server…</option>${state.guilds.filter(guild => guild.installed).map(guild => `<option value="${h(guild.id)}" ${state.guild?.id === guild.id ? 'selected' : ''}>${h(guild.name)}</option>`).join('')}</select></div><div><p class="nav-label">QUẢN LÝ</p><nav class="nav">${Object.entries(labels).map(([key, value]) => `<button data-page="${key}" class="${state.page === key && state.guild ? 'active' : ''}" ${!state.guild ? 'disabled' : ''}><span class="icon">${icons[key]}</span>${value}</button>`).join('')}</nav></div><div class="side-bottom"><div class="bot-status"><span class="dot"></span>${state.session.ready ? 'Bot đã kết nối' : 'Bot đang kết nối'}</div><p class="subtle">VietNam Legacy Dashboard</p></div></aside><div class="workspace"><header class="topbar"><div class="crumb">Dashboard <b>/ ${state.guild ? h(labels[state.page]) : 'Chọn server'}</b></div><div class="account"><span class="avatar">${h(state.session.user.name.slice(0, 1))}</span><span>${h(state.session.user.name)}</span><button class="text-button" id="logout">Đăng xuất</button></div></header><main class="content" id="content">${state.loading ? '<div class="loading" role="status">Đang tải dữ liệu server…</div>' : content()}</main></div></div>`;
  document.querySelector('#server-select').onchange = event => selectGuild(event.target.value);
  document.querySelectorAll('[data-page]').forEach(button => { button.onclick = () => changePage(button.dataset.page); });
  document.querySelectorAll('[data-guild]').forEach(button => { button.onclick = () => selectGuild(button.dataset.guild); });
  document.querySelector('#logout').onclick = async () => { if (!canLeave()) return; try { await api('/api/logout', {}); location.href = '/'; } catch (error) { notify(error.message); } };
  const form = document.querySelector('#settings-form');
  if (form) { form.onchange = () => { state.dirty = true; document.querySelector('#save-status').textContent = 'Bạn có thay đổi chưa lưu.'; }; form.onsubmit = save; }
}
function heading(eyebrow, title, subtitle, right = '') { return `<div class="heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${subtitle}</p></div>${right}</div>`; }
function content() {
  if (!state.guild) return heading('KHÔNG GIAN QUẢN LÝ', 'Chọn server của bạn', 'Các server mà bạn sở hữu hoặc có quyền Administrator.') + (state.guilds.length ? `<div class="server-grid">${state.guilds.map(guild => `<article class="server-card">${guild.icon ? `<img class="server-avatar" src="${h(guild.icon)}" alt="">` : `<div class="server-avatar">${h(guild.name.slice(0, 1))}</div>`}<h2>${h(guild.name)}</h2><p>${guild.installed ? 'VietNam Legacy đã sẵn sàng.' : 'Thêm VietNam Legacy để bắt đầu.'}</p>${guild.installed ? `<button class="primary" data-guild="${h(guild.id)}">Quản lý server →</button>` : `<a class="secondary" href="${h(guild.invite)}" target="_blank" rel="noopener noreferrer">Mời bot vào server ↗</a>`}</article>`).join('')}</div>` : '<div class="card empty"><h2>Chưa có server để quản lý</h2><p>Bạn cần là chủ server hoặc có quyền Administrator.</p><a class="secondary" href="/">Tải lại trang để kiểm tra</a></div>');
  if (!state.data) return '<div class="card empty"><h2>Chưa tải được dữ liệu</h2><p>Chọn lại server để thử lại.</p></div>';
  if (state.page === 'level') return levelPage();
  if (state.page === 'confession') return confessionPage();
  if (state.page === 'leaderboard') return leaderboardPage();
  const stats = state.data.stats;
  return heading(h(state.guild.name), 'Cộng đồng trong tầm tay.', 'Thiết lập hôm nay, để những cuộc trò chuyện tự nhiên diễn ra.', '<span class="badge">● ĐÃ KẾT NỐI</span>') + `<div class="stats">${[[stats.members, 'Thành viên', 'Trong server của bạn', '◉'], [stats.tracked, 'Hồ sơ hoạt động', 'Thành viên có dữ liệu XP', '↗'], [stats.confessions, 'Số confession hiện tại', 'Bộ đếm được lưu sau restart', '♡']].map(([count, title, text, icon]) => `<div class="stat"><div class="stat-top"><span>${title}</span><span>${icon}</span></div><strong>${number(count)}</strong><small>${text}</small></div>`).join('')}</div><div class="columns"><section class="card"><div class="card-head"><div><h2>Các tính năng của server</h2><p>Mọi cấu hình được lưu riêng cho ${h(state.guild.name)}.</p></div></div><div class="card-body"><div class="module"><div class="module-icon">↗</div><div><h3>Level & Role</h3><p>Ghi nhận hoạt động, trao role theo level.</p></div><button class="secondary" data-page="level">Thiết lập →</button></div><div class="module"><div class="module-icon pink">♡</div><div><h3>Confession</h3><p>Góc tâm sự ẩn danh cho cộng đồng.</p></div><button class="secondary" data-page="confession">Thiết lập →</button></div><div class="module"><div class="module-icon">≋</div><div><h3>Bảng xếp hạng</h3><p>Những thành viên hoạt động nổi bật.</p></div><button class="secondary" data-page="leaderboard">Xem bảng →</button></div></div></section><section class="card"><div class="card-head"><h2>Bắt đầu thật đơn giản</h2><span class="badge purple">HƯỚNG DẪN</span></div><div class="card-body"><ol class="guide"><li>Chọn <strong>kênh thông báo level</strong> cho server.</li><li>Gắn <strong>role thưởng</strong> cho từng mốc level.</li><li>Chọn kênh nhận <strong>confession ẩn danh</strong>.</li></ol><div class="note">Bot tự ghi nhận XP Chat và Voice. Cấu hình bạn lưu ở đây có hiệu lực ngay, không cần khởi động lại bot.</div></div></section></div>`;
}
function field(key, title, type, current, isConfession = false) {
  const items = type === 'channel' ? state.data.channels : state.data.roles;
  const missing = current && !items.some(item => item.id === current);
  return `<div class="field"><label for="${key}">${h(title)}</label><select id="${key}" name="${key}"><option value="">${isConfession ? 'Chọn kênh confession…' : 'Không sử dụng'}</option>${missing ? `<option value="${h(current)}" selected>Kênh/role hiện không khả dụng (${h(current)})</option>` : ''}${items.map(item => `<option value="${h(item.id)}" ${current === item.id ? 'selected' : ''} ${type === 'role' && key !== 'VNL_BOOSTER_ROLE_ID' && !item.editable && current !== item.id ? 'disabled' : ''}>${type === 'channel' ? '# ' : '@ '}${h(item.name)}</option>`).join('')}</select></div>`;
}
const savebar = `<div class="savebar"><span id="save-status">Cấu hình áp dụng riêng cho server này.</span><button type="submit" class="primary">Lưu thay đổi</button></div>`;
function levelPage() {
  return heading('HOẠT ĐỘNG & PHẦN THƯỞNG', 'Level & Role', 'Biến những đóng góp mỗi ngày thành dấu mốc đáng nhớ.') + `<form id="settings-form"><section class="card"><div class="card-head"><div><h2>Kênh thông báo & Booster</h2><p>Chọn nơi thông báo lên level và tổng kết hoạt động tháng.</p></div></div><div class="card-body"><div class="form-grid">${state.data.fields.slice(0, 3).map(([key, label, type]) => field(key, label, type, state.data.settings[key])).join('')}</div></div></section><section class="card role-card"><div class="card-head"><div><h2>Role thưởng</h2><p>Role của bot phải cao hơn các role thưởng và có quyền Manage Roles.</p></div></div><div class="card-body">${[['LEVEL_ROLE_', 'Level Chat'], ['VOICE_ROLE_', 'Level Voice'], ['MONTHLY_', 'Top hoạt động tháng']].map(([prefix, title]) => `<h3 class="form-section">${title}</h3><div class="form-grid">${state.data.fields.filter(([key]) => key.startsWith(prefix) && key !== 'MONTHLY_RANK_CHANNEL_ID').map(([key, label, type]) => field(key, label, type, state.data.settings[key])).join('')}</div>`).join('')}<div class="note">Đổi role thưởng không tự gỡ các role cũ đã cấp trước đó.</div></div></section>${savebar}</form>`;
}
function confessionPage() {
  return heading('MỘT GÓC ĐỂ SẺ CHIA', 'Confession', 'Cho những câu chuyện một nơi để được lắng nghe.', '<span class="badge purple">ẨN DANH</span>') + `<div class="columns"><form id="settings-form"><section class="card"><div class="card-head"><div><h2>Kênh confession</h2><p>Bot đăng bài mới vào kênh bạn chọn.</p></div></div><div class="card-body">${field('confessionChannel', 'Đăng confession tại', 'channel', state.data.confessionChannel, true)}<div class="note">Bot cần quyền View Channel, Send Messages, Embed Links và Create Public Threads.</div><h3 class="form-section">Cách hoạt động</h3><ol class="guide"><li>Member gửi bài bằng <strong>/confess</strong>.</li><li>Bot đăng ẩn danh và đánh số tự động.</li><li>Member thả tim hoặc bình luận trong luồng.</li></ol><div class="note">Bài confession được đăng ẩn danh. Bình luận trong luồng sẽ hiển thị tài khoản người viết.</div></div></section>${savebar}</form><section class="card"><div class="card-head"><h2>Hình dung bài đăng</h2><span class="badge purple">MINH HỌA</span></div><div class="card-body"><div class="discord-preview"><div class="message-heading"><span class="brand-icon">V</span>VietNamLegacy <span class="app-tag">APP</span></div><div class="embed"><strong>💌 CONFESSION #${String((state.data.stats.confessions || 0) + 1).padStart(3, '0')}</strong><p>Cảm ơn mọi người vì đã khiến nơi này trở thành một góc nhỏ thật dễ chịu. ♡</p><small>— Ẩn danh · Bình luận trong luồng sẽ hiện tên tài khoản của bạn.</small></div><span class="preview-action">❤️ Thích · 0</span><div class="thread">↳ 💬 Bình luận confession</div></div><p class="subtle">Nội dung minh họa, không được đăng lên server.</p></div></section></div>`;
}
function leaderboardPage() {
  const rows = state.data.leaderboard;
  return heading('NHỮNG ĐÓNG GÓP ĐƯỢC GHI NHẬN', 'Bảng xếp hạng', 'Top 20 theo tổng XP Chat + Voice tích lũy của server.') + (!rows ? '<div class="loading">Đang tải bảng xếp hạng…</div>' : !rows.length ? '<div class="card empty"><h2>Những vị trí đầu tiên đang chờ.</h2><p>Bảng xếp hạng sẽ xuất hiện khi thành viên bắt đầu tích lũy XP.</p></div>' : `<div class="card table-wrap"><table><thead><tr><th>Hạng</th><th>Thành viên</th><th>XP Chat</th><th>XP Voice</th><th>Tổng XP</th></tr></thead><tbody>${rows.map((row, index) => `<tr><td class="rank">${String(index + 1).padStart(2, '0')}</td><td>${h(row.name)}</td><td>${number(row.chatXp)}</td><td>${number(row.voiceXp)}</td><td>${number(row.totalXp)}</td></tr>`).join('')}</tbody></table></div>`);
}
function canLeave() {
  if (state.saving) { notify('Đang lưu cấu hình. Vui lòng chờ một chút.'); return false; }
  return !state.dirty || window.confirm('Bạn có thay đổi chưa lưu. Rời khỏi trang này?');
}
async function selectGuild(id) {
  if (!canLeave()) { document.querySelector('#server-select').value = state.guild?.id || ''; return; }
  const requestId = ++state.requestId;
  state.dirty = false; state.guild = state.guilds.find(guild => guild.id === id) || null;
  state.data = null; state.page = 'overview';
  if (!state.guild) { state.loading = false; return render(); }
  state.loading = true; render();
  try { const data = await api(`/api/guilds/${id}/settings`); if (state.requestId === requestId) state.data = data; }
  catch (error) { if (state.requestId === requestId) notify(error.message); }
  finally { if (state.requestId === requestId) { state.loading = false; render(); } }
}
async function changePage(page) {
  if (!canLeave()) return;
  state.dirty = false; state.page = page; render();
  if (page === 'leaderboard' && state.data && !state.data.leaderboard) {
    const id = state.guild.id;
    const requestId = state.requestId;
    try { const rows = await api(`/api/guilds/${id}/leaderboard`); if (state.requestId === requestId && state.data) { state.data.leaderboard = rows; if (state.page === page) render(); } }
    catch (error) { notify(error.message); if (state.guild?.id === id && state.page === page) { document.querySelector('#content').innerHTML = '<div class="card empty"><h2>Chưa tải được bảng xếp hạng</h2><p>Hãy chuyển trang rồi thử lại.</p></div>'; } }
  }
}
async function save(event) {
  event.preventDefault();
  if (state.saving) return;
  const form = event.currentTarget;
  const button = form.querySelector('button[type=submit]');
  const values = Object.fromEntries(new FormData(form));
  const id = state.guild.id;
  const payload = state.page === 'confession' ? { confessionChannel: values.confessionChannel } : {
    settings: Object.fromEntries(Object.entries(values).filter(([key, value]) => (state.data.settings[key] || '') !== value).map(([key, value]) => [key, value || null])),
  };
  state.saving = true;
  form.querySelectorAll('select,button').forEach(control => { control.disabled = true; });
  button.textContent = 'Đang lưu…';
  try {
    await api(`/api/guilds/${id}/settings`, payload);
    if (state.guild?.id === id) {
      if (payload.settings) Object.assign(state.data.settings, payload.settings);
      else state.data.confessionChannel = payload.confessionChannel;
      state.dirty = false; state.saving = false; render();
    }
    notify('Đã lưu cấu hình. Bot áp dụng thay đổi ngay.');
  } catch (error) { notify(error.message); form.querySelectorAll('select,button').forEach(control => { control.disabled = false; }); button.textContent = 'Lưu thay đổi'; }
  finally { state.saving = false; }
}
window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
async function boot() {
  try {
    state.session = await api('/api/session');
    if (state.session.user) state.guilds = await api('/api/guilds');
    render();
  } catch (error) {
    app.innerHTML = `<main class="initial"><div class="error">${h(error.message)}<br><a class="secondary" href="/">Thử lại</a></div></main>`;
  }
}
boot();
