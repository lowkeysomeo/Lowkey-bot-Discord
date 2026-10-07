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
const labels = { overview: 'Tổng quan', level: 'Mốc level & Role', xp: 'XP & Kênh bỏ qua', notifications: 'Thông báo lên cấp', monthly: 'Top tháng', confession: 'Confession', leaderboard: 'Bảng xếp hạng' };
const icons = { overview: '◫', level: '↗', xp: '✦', notifications: '♧', monthly: '♛', confession: '♡', leaderboard: '≋' };
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
  if (form) {
    const changed = () => { state.dirty = true; document.querySelector('#save-status').textContent = 'Bạn có thay đổi chưa lưu.'; updateNoticePreview(); };
    form.oninput = changed; form.onchange = changed; form.onsubmit = save;
    form.onclick = event => {
      const add = event.target.closest('[data-add-reward]');
      const remove = event.target.closest('[data-remove-reward]');
      if (add) {
        const type = add.dataset.addReward;
        const container = form.querySelector(`[data-reward-list="${type}"]`);
        if (container.children.length >= 50) return notify('Tối đa 50 mốc cho mỗi loại.');
        container.insertAdjacentHTML('beforeend', rewardRow(type, { level: '', roleId: '' })); changed();
      }
      if (remove) { remove.closest('[data-reward-row]').remove(); changed(); }
    };
    updateNoticePreview();
  }
}
function heading(eyebrow, title, subtitle, right = '') { return `<div class="heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${subtitle}</p></div>${right}</div>`; }
function content() {
  if (!state.guild) return heading('KHÔNG GIAN QUẢN LÝ', 'Chọn server của bạn', 'Các server mà bạn sở hữu hoặc có quyền Administrator.') + (state.guilds.length ? `<div class="server-grid">${state.guilds.map(guild => `<article class="server-card">${guild.icon ? `<img class="server-avatar" src="${h(guild.icon)}" alt="">` : `<div class="server-avatar">${h(guild.name.slice(0, 1))}</div>`}<h2>${h(guild.name)}</h2><p>${guild.installed ? 'VietNam Legacy đã sẵn sàng.' : 'Thêm VietNam Legacy để bắt đầu.'}</p>${guild.installed ? `<button class="primary" data-guild="${h(guild.id)}">Quản lý server →</button>` : `<a class="secondary" href="${h(guild.invite)}" target="_blank" rel="noopener noreferrer">Mời bot vào server ↗</a>`}</article>`).join('')}</div>` : '<div class="card empty"><h2>Chưa có server để quản lý</h2><p>Bạn cần là chủ server hoặc có quyền Administrator.</p><a class="secondary" href="/">Tải lại trang để kiểm tra</a></div>');
  if (!state.data) return '<div class="card empty"><h2>Chưa tải được dữ liệu</h2><p>Chọn lại server để thử lại.</p></div>';
  if (state.page === 'level') return levelPage();
  if (['xp', 'notifications', 'monthly'].includes(state.page)) return customPage(state.page);
  if (state.page === 'confession') return confessionPage();
  if (state.page === 'leaderboard') return leaderboardPage();
  const stats = state.data.stats;
  return heading(h(state.guild.name), 'Cộng đồng trong tầm tay.', 'Thiết lập hôm nay, để những cuộc trò chuyện tự nhiên diễn ra.', '<span class="badge">● ĐÃ KẾT NỐI</span>') + `<div class="stats">${[[stats.members, 'Thành viên', 'Trong server của bạn', '◉'], [stats.tracked, 'Hồ sơ hoạt động', 'Thành viên có dữ liệu XP', '↗'], [stats.confessions, 'Số confession hiện tại', 'Bộ đếm được lưu sau restart', '♡']].map(([count, title, text, icon]) => `<div class="stat"><div class="stat-top"><span>${title}</span><span>${icon}</span></div><strong>${number(count)}</strong><small>${text}</small></div>`).join('')}</div><div class="columns"><section class="card"><div class="card-head"><div><h2>Các tính năng của server</h2><p>Mọi cấu hình được lưu riêng cho ${h(state.guild.name)}.</p></div></div><div class="card-body"><div class="module"><div class="module-icon">↗</div><div><h3>Level & Role</h3><p>Ghi nhận hoạt động, trao role theo level.</p></div><button class="secondary" data-page="level">Thiết lập →</button></div><div class="module"><div class="module-icon pink">♡</div><div><h3>Confession</h3><p>Góc tâm sự ẩn danh cho cộng đồng.</p></div><button class="secondary" data-page="confession">Thiết lập →</button></div><div class="module"><div class="module-icon">≋</div><div><h3>Bảng xếp hạng</h3><p>Những thành viên hoạt động nổi bật.</p></div><button class="secondary" data-page="leaderboard">Xem bảng →</button></div></div></section><section class="card"><div class="card-head"><h2>Bắt đầu thật đơn giản</h2><span class="badge purple">HƯỚNG DẪN</span></div><div class="card-body"><ol class="guide"><li>Chọn <strong>kênh thông báo level</strong> cho server.</li><li>Gắn <strong>role thưởng</strong> cho từng mốc level.</li><li>Chọn kênh nhận <strong>confession ẩn danh</strong>.</li></ol><div class="note">Bot tự ghi nhận XP Chat và Voice. Cấu hình bạn lưu ở đây có hiệu lực ngay, không cần khởi động lại bot.</div></div></section></div>`;
}
function field(key, title, type, current, isConfession = false) {
  const items = type === 'channel' ? state.data.channels.filter(item => !isConfession || item.type === undefined || item.type === 0) : state.data.roles;
  const missing = current && !items.some(item => item.id === current);
  return `<div class="field"><label for="${key}">${h(title)}</label><select id="${key}" name="${key}"><option value="">${isConfession ? 'Chọn kênh confession…' : 'Không sử dụng'}</option>${missing ? `<option value="${h(current)}" selected>Kênh/role hiện không khả dụng (${h(current)})</option>` : ''}${items.map(item => `<option value="${h(item.id)}" ${current === item.id ? 'selected' : ''} ${type === 'role' && key !== 'VNL_BOOSTER_ROLE_ID' && !item.editable && current !== item.id ? 'disabled' : ''}>${type === 'channel' ? '# ' : '@ '}${h(item.name)}</option>`).join('')}</select></div>`;
}
const savebar = `<div class="savebar"><span id="save-status">Cấu hình áp dụng riêng cho server này.</span><button type="submit" class="primary">Lưu thay đổi</button></div>`;
let rewardSequence = 0;
function panel(title, subtitle, body) {
  return '<section class="card"><div class="card-head"><div><h2>' + h(title) + '</h2><p>' + h(subtitle) + '</p></div></div><div class="card-body">' + body + '</div></section>';
}
function rewardRow(type, entry) {
  const id = 'reward-' + type + '-' + (++rewardSequence);
  return '<div class="reward-row" data-reward-row="' + type + '"><div class="field"><label for="' + id + '-level">Level</label><input id="' + id + '-level" data-reward-level type="number" min="1" max="100000" step="1" required value="' + h(entry.level) + '"></div>' +
    field(id, 'Role được nhận', 'role', entry.roleId) +
    '<button class="text-button danger" type="button" data-remove-reward aria-label="Xóa mốc level">Xóa</button></div>';
}
const choiceLabels = { highest: 'Chỉ giữ role mốc cao nhất', all: 'Giữ tất cả role đã đạt', card: 'Tin nhắn + ảnh level', embed: 'Khung thông báo có màu', text: 'Tin nhắn văn bản' };
function optionControls(group) {
  return '<div class="form-grid">' + state.data.optionDefinitions.filter(d => d[1] === group).map(([key, , label, type, , a, b]) => {
    const value = state.data.options[key], id = 'option_' + key;
    if (type === 'boolean') return '<label class="toggle-field" for="' + id + '"><span>' + h(label) + '</span><input type="checkbox" id="' + id + '" name="' + id + '" ' + (value ? 'checked' : '') + '></label>';
    if (type === 'channel') return field(id, label, 'channel', value).replace('Không sử dụng', 'Dùng kênh thông báo chung');
    let input;
    if (type === 'select') input = '<select id="' + id + '" name="' + id + '">' + a.map(v => '<option value="' + h(v) + '" ' + (v === value ? 'selected' : '') + '>' + h(choiceLabels[v] || v) + '</option>').join('') + '</select>';
    else if (type === 'text') input = '<textarea id="' + id + '" name="' + id + '" maxlength="' + a + '" rows="3" required>' + h(value) + '</textarea>';
    else input = '<input id="' + id + '" name="' + id + '" type="' + (type === 'color' ? 'color' : 'number') + '" value="' + h(value) + '" ' + (type === 'number' ? 'min="' + a + '" max="' + b + '" step="1"' : '') + ' required>';
    return '<div class="field"><label for="' + id + '">' + h(label) + '</label>' + input + '</div>';
  }).join('') + '</div>';
}
function legacyFields(keys) {
  return '<div class="form-grid">' + state.data.fields.filter(([key]) => keys.includes(key)).map(([key, label, type]) => field(key, label, type, state.data.settings[key])).join('') + '</div>';
}
function levelPage() {
  return heading('MỐC RIÊNG CHO CỘNG ĐỒNG', 'Mốc level & Role', 'Tự chọn level bất kỳ và role thưởng tương ứng. Tối đa 50 mốc cho mỗi loại.') +
    '<form id="settings-form">' + panel('Cách nhận role', 'Role của bot phải cao hơn role thưởng và có quyền Manage Roles.', optionControls('rewards')) +
    ['chat', 'voice'].map(type => panel(type === 'chat' ? 'Mốc level Chat' : 'Mốc level Voice', 'Ví dụ: level 5, 15, 30… Các mốc được xét theo XP và level hiện có.',
      '<div data-reward-list="' + type + '">' + state.data.rewards[type].map(entry => rewardRow(type, entry)).join('') + '</div><button type="button" class="secondary" data-add-reward="' + type + '">+ Thêm mốc level</button>')).join('') +
    '<div class="note">Bot áp dụng danh sách mới khi thành viên tiếp tục nhận XP. Xóa hoặc thay role trong danh sách sẽ ngừng quản lý role cũ; các role cũ đã cấp không tự bị thu hồi.</div>' + savebar + '</form>';
}
function customPage(page) {
  let body;
  if (page === 'xp') {
    body = panel('Tốc độ tích lũy XP', 'Điều chỉnh riêng Chat, Voice và phần trăm Booster.', optionControls('xp') + legacyFields(['VNL_BOOSTER_ROLE_ID'])) +
      panel('Kênh và danh mục bỏ qua XP', 'Chọn danh mục sẽ bỏ qua cả các kênh bên trong. Áp dụng cho Chat và Voice.',
        '<div class="exclusion-list">' + state.data.exclusionChannels.map(channel => '<label class="check-row"><input type="checkbox" name="exclusion" value="' + h(channel.id) + '" ' + (state.data.exclusions.includes(channel.id) ? 'checked' : '') + '><span>' + (channel.type === 'category' ? '▤ ' : '# ') + h(channel.name) + '</span></label>').join('') + '</div>');
  } else if (page === 'notifications') {
    body = panel('Thông báo lên cấp', 'Chọn kênh chung hoặc kênh riêng cho Chat và Voice.', legacyFields(['LEVEL_CHANNEL_ID']) + optionControls('notifications')) +
      panel('Xem trước nội dung', 'Các biến dùng được: {user}, {username}, {level}, {xp}, {server}, {type}. Xem trước không gửi tin lên Discord.',
        '<div class="notice-preview" id="notice-preview"><h3 id="notice-preview-title"></h3><p id="notice-preview-chat"></p><hr><p id="notice-preview-voice"></p></div>');
  } else {
    body = panel('Tổng kết và role tháng', 'Chốt tháng theo giờ Việt Nam. Role chuyển theo XP tháng trước; XP tổng và level vẫn được giữ.',
      optionControls('monthly') + legacyFields(state.data.fields.filter(([key]) => key.startsWith('MONTHLY_')).map(([key]) => key))) +
      '<div class="note">Nội dung hỗ trợ {server} và {month}. Nếu kênh tổng kết gặp lỗi, bot vẫn xử lý trao role. Tắt chuyển role không tự thu hồi role hiện có.</div>';
  }
  return heading('CẤU HÌNH RIÊNG CHO SERVER', labels[page], 'Lưu để bot áp dụng thay đổi ngay.') + '<form id="settings-form">' + body + savebar + '</form>';
}
function confessionPage() {
  return heading('MỘT GÓC ĐỂ SẺ CHIA', 'Confession', 'Tùy chỉnh bài đăng, tương tác và thời gian chờ gửi bài.') +
    '<form id="settings-form">' + panel('Bài đăng confession', 'Tiêu đề hỗ trợ {number} và {server}. Số thứ tự hiện tại luôn được giữ.',
      field('confessionChannel', 'Đăng confession tại', 'channel', state.data.confessionChannel, true) + optionControls('confession')) +
    '<div class="note">Thay đổi giao diện và bật/tắt luồng áp dụng cho bài mới. Bình luận trong luồng hiển thị tài khoản người viết. Bot cần Create Public Threads khi bật bình luận.</div>' + savebar + '</form>';
}
function updateNoticePreview() {
  if (!document.querySelector('#notice-preview')) return;
  const values = { user: '@Thành viên', username: 'Thành viên', level: 25, xp: 15000, server: state.guild.name, type: 'CHAT' };
  const renderText = (key, type) => {
    const value = document.querySelector('[name="option_' + key + '"]')?.value || '';
    return value.replace(/\{([a-zA-Z]+)\}/g, (match, name) => name === 'type' ? type : Object.hasOwn(values, name) ? values[name] : match);
  };
  document.querySelector('#notice-preview-title').textContent = renderText('noticeTitle', 'CHAT');
  document.querySelector('#notice-preview-chat').textContent = renderText('chatNoticeText', 'CHAT');
  document.querySelector('#notice-preview-voice').textContent = renderText('voiceNoticeText', 'VOICE');
  document.querySelector('#notice-preview').style.borderColor = document.querySelector('[name="option_noticeColor"]').value;
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
  const payload = { settings: {}, options: {} };
  for (const [key, value] of Object.entries(values)) {
    if (Object.hasOwn(state.data.settings, key) && (state.data.settings[key] || '') !== value) payload.settings[key] = value || null;
  }
  for (const [key, , , type] of state.data.optionDefinitions) {
    const control = form.elements.namedItem('option_' + key);
    if (!control) continue;
    const value = type === 'boolean' ? control.checked : type === 'number' ? Number(control.value) : control.value;
    if (value !== state.data.options[key]) payload.options[key] = value;
  }
  if (state.page === 'level') {
    payload.rewards = Object.fromEntries(['chat', 'voice'].map(type => [type,
      [...form.querySelectorAll('[data-reward-row="' + type + '"]')].map(row => ({
        level: Number(row.querySelector('[data-reward-level]').value), roleId: row.querySelector('select').value,
      })),
    ]));
  }
  if (state.page === 'xp') payload.exclusions = new FormData(form).getAll('exclusion');
  if (state.page === 'confession' && values.confessionChannel !== (state.data.confessionChannel || '')) {
    payload.confessionChannel = values.confessionChannel;
  }
  state.saving = true;
  form.querySelectorAll('select,button').forEach(control => { control.disabled = true; });
  button.textContent = 'Đang lưu…';
  try {
    await api(`/api/guilds/${id}/settings`, payload);
    if (state.guild?.id === id) {
      Object.assign(state.data.settings, payload.settings);
      Object.assign(state.data.options, payload.options);
      if (payload.rewards) state.data.rewards = payload.rewards;
      if (payload.exclusions) state.data.exclusions = payload.exclusions;
      if (Object.hasOwn(payload, 'confessionChannel')) state.data.confessionChannel = payload.confessionChannel;
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
