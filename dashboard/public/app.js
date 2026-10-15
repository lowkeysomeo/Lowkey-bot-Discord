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
const brand = `<div class="brand"><span class="brand-icon">V</span><span>VietNam Legacy<small>DISCORD COMMUNITY</small></span></div>`;

const icons = {
  overview: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>`,
  leaderboard: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>`,
  receptionist: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><circle cx="12" cy="2" r="1"/></svg>`,
  invites: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`,
  ticket: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="7" cy="12" r="1.5"/><line x1="12" y1="8" x2="12" y2="16" stroke-dasharray="2 2"/><circle cx="17" cy="12" r="1.5"/></svg>`,
  level: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  xp: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  notifications: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
  monthly: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>`,
  confession: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  giveaway: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
  reactionroles: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  security: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  test: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><polygon points="10 11 10 17 15 14 10 11"/></svg>`,
};

const labels = {
  overview: 'Tổng quan',
  leaderboard: 'Bảng xếp hạng',
  receptionist: 'Lễ tân chào mừng',
  invites: 'Lời mời & Role',
  ticket: 'Hệ thống Ticket',
  level: 'Mốc level & Role',
  xp: 'XP & Kênh bỏ qua',
  notifications: 'Thông báo lên cấp & role',
  monthly: 'Top tháng',
  confession: 'Trạm Confession',
  giveaway: 'Sự kiện Giveaway',
  reactionroles: 'Reaction Role (Menu)',
  security: 'Bảo vệ server',
  test: 'Gửi tin thử',
};

const navGroups = [
  {
    title: 'HỆ THỐNG',
    items: ['overview', 'leaderboard'],
  },
  {
    title: 'TIẾP ĐÓN & THÀNH VIÊN',
    items: ['receptionist', 'invites', 'ticket'],
  },
  {
    title: 'LEVEL & DANH HIỆU',
    items: ['level', 'xp', 'notifications', 'monthly'],
  },
  {
    title: 'TƯƠNG TÁC & GIẢI TRÍ',
    items: ['confession', 'giveaway', 'reactionroles'],
  },
  {
    title: 'BẢO MẬT & CÔNG CỤ',
    items: ['security', 'test'],
  },
];

function render() {
  if (!state.session?.user) {
    app.innerHTML = `<div class="login"><section class="login-art">${brand}<div class="login-copy"><span class="eyebrow">MỘT NƠI. CẢ CỘNG ĐỒNG.</span><h1>Server của bạn.<br><span>Theo cách của bạn.</span></h1><p>Chăm chút cộng đồng cùng VietNam Legacy. Quản lý level, role thưởng và những câu chuyện ẩn danh trong một nơi.</p><div class="login-pills"><span>↗ Level & Role</span><span>♡ Confession</span><span>≋ Bảng xếp hạng</span></div></div><p class="login-foot">VIETNAM LEGACY · DÀNH CHO CỘNG ĐỒNG CỦA BẠN</p></section><section class="login-panel"><div class="login-box"><span class="badge purple">BẢNG ĐIỀU KHIỂN</span><h2>Chào mừng trở lại.</h2><p>Đăng nhập bằng Discord để chọn server và bắt đầu quản lý.</p>${state.session?.configured ? '<a class="primary" href="/auth/discord">Đăng nhập bằng Discord <span>↗</span></a>' : '<button class="primary" disabled>Đăng nhập Discord</button><div class="error">Dashboard đang chờ hoàn tất kết nối đăng nhập Discord. Chủ bot cần cấu hình OAuth2 để mở đăng nhập.</div>'}<p class="subtle">Chỉ chủ server và thành viên có quyền Administrator được quản lý cấu hình.</p></div></section></div>`;
    return;
  }
  app.innerHTML = `${state.session.preview ? '<div class="preview-banner">BẢN XEM TRƯỚC · Dữ liệu minh họa, không thay đổi server Discord thật.</div>' : ''}<div class="layout"><aside class="sidebar"><div class="side-top">${brand}<div class="picker-wrap"><p class="nav-label">MÁY CHỦ QUẢN LÝ</p><select class="server-picker" id="server-select" aria-label="Chọn server"><option value="">Chọn server…</option>${state.guilds.filter(guild => guild.installed).map(guild => `<option value="${h(guild.id)}" ${state.guild?.id === guild.id ? 'selected' : ''}>${h(guild.name)}</option>`).join('')}</select></div></div><div class="side-nav-scroll">${navGroups.map(group => `<div class="nav-section"><p class="nav-label">${group.title}</p><nav class="nav">${group.items.map(key => `<button data-page="${key}" class="${state.page === key && state.guild ? 'active' : ''}" ${!state.guild ? 'disabled' : ''}><span class="icon">${icons[key] || ''}</span><span class="label-text">${labels[key]}</span></button>`).join('')}</nav></div>`).join('')}</div><div class="side-bottom"><div class="bot-status"><span class="dot"></span><span>${state.session.ready ? 'Bot đã kết nối' : 'Bot đang kết nối'}</span></div><p class="subtle">VietNam Legacy Dashboard • v1.0</p></div></aside><div class="workspace"><header class="topbar"><div class="crumb"><span class="crumb-root">Dashboard</span><span class="crumb-sep">/</span><b class="crumb-current">${state.guild ? h(labels[state.page] || state.page) : 'Chọn server'}</b></div><div class="account"><span class="avatar">${h(state.session.user.name.slice(0, 1))}</span><span class="account-name">${h(state.session.user.name)}</span><button class="text-button" id="logout">Đăng xuất</button></div></header><main class="content" id="content">${state.loading ? '<div class="loading" role="status">Đang tải dữ liệu server…</div>' : content()}</main></div></div>`;
  document.querySelector('#server-select').onchange = event => selectGuild(event.target.value);
  document.querySelectorAll('[data-page]').forEach(button => { button.onclick = () => changePage(button.dataset.page); });
  document.querySelectorAll('[data-guild]').forEach(button => { button.onclick = () => selectGuild(button.dataset.guild); });
  document.querySelector('#logout').onclick = async () => { if (!canLeave()) return; try { await api('/api/logout', {}); location.href = '/'; } catch (error) { notify(error.message); } };
  const rrForm=document.querySelector('#rr-form');
  if(rrForm){rrForm.onsubmit=rrSubmit;rrForm.oninput=()=>{state.dirty=true;};rrForm.onchange=()=>{state.dirty=true;};}
  const rrAdd=document.querySelector('#rr-add');
  if(rrAdd)rrAdd.onclick=()=>{const list=document.querySelector('#rr-choices');if(list.children.length>=10)return notify('Tối đa 10 role mỗi bảng.');list.insertAdjacentHTML('beforeend',rrChoice());state.dirty=true;};
  if(rrForm)rrForm.addEventListener('click',event=>{const remove=event.target.closest('[data-rr-remove]');if(remove){remove.closest('[data-rr-choice]').remove();state.dirty=true;}});
  document.querySelectorAll('[data-rr-disable]').forEach(b=>{b.onclick=()=>rrDisable(b.dataset.rrDisable);});
  const giveawayForm = document.querySelector('#giveaway-form');
  if (giveawayForm) {
    giveawayForm.onsubmit = event => { event.preventDefault(); giveawaySubmit('create'); };
    giveawayForm.oninput = () => { state.dirty = true; };
    document.querySelector('#giveaway-test').onclick = () => giveawaySubmit('test');
  }
  document.querySelectorAll('[data-giveaway-action]').forEach(button => { button.onclick = () => giveawayAction(button.dataset.giveawayId,button.dataset.giveawayAction); });
  const refreshGiveaway = document.querySelector('#giveaway-refresh');
  if (refreshGiveaway) refreshGiveaway.onclick = () => changePage('giveaway');
  const form = document.querySelector('#settings-form');
  const panelButton = document.querySelector('#confession-panel-send');
  if (panelButton) panelButton.onclick = sendConfessionPanel;
  const ticketForm = document.querySelector('#ticket-form');
  if (ticketForm) {
    ticketForm.onsubmit = ticketSubmit;
    ticketForm.oninput = () => { state.dirty = true; };
    ticketForm.onchange = () => { state.dirty = true; };
    ticketForm.onclick = (e) => {
      const addBtn = e.target.closest('#ticket-add-option');
      if (addBtn) {
        const container = ticketForm.querySelector('#ticket-options-container');
        const count = container.querySelectorAll('[data-ticket-option]').length;
        if (count >= 25) return notify('Discord chỉ cho phép tối đa 25 danh mục trong một Dropdown Menu.');
        container.insertAdjacentHTML('beforeend', ticketOptionRow({ label: '', value: '', description: '', emoji: '' }, count));
        state.dirty = true;
        updateTicketOptionIndexes(container);
        const newEl = container.lastElementChild;
        newEl?.querySelector('[data-ticket-opt-label]')?.focus();
        return;
      }

      const resetBtn = e.target.closest('#ticket-reset-options');
      if (resetBtn) {
        if (!confirm('Khôi phục danh sách danh mục mẫu của VietNam Legacy?')) return;
        const container = ticketForm.querySelector('#ticket-options-container');
        container.innerHTML = DEFAULT_TICKET_OPTIONS.map((opt, i) => ticketOptionRow(opt, i)).join('');
        state.dirty = true;
        notify('Đã khôi phục các danh mục mẫu!');
        return;
      }

      const removeBtn = e.target.closest('[data-ticket-remove-option]');
      if (removeBtn) {
        const container = ticketForm.querySelector('#ticket-options-container');
        const items = container.querySelectorAll('[data-ticket-option]');
        if (items.length <= 1) return notify('Phải giữ lại ít nhất 1 danh mục cho bảng Ticket!');
        const item = removeBtn.closest('[data-ticket-option]');
        if (item) {
          item.remove();
          state.dirty = true;
          updateTicketOptionIndexes(container);
        }
        return;
      }

      const moveUpBtn = e.target.closest('[data-ticket-move-up]');
      if (moveUpBtn) {
        const item = moveUpBtn.closest('[data-ticket-option]');
        const prev = item?.previousElementSibling;
        if (item && prev && prev.matches('[data-ticket-option]')) {
          item.parentNode.insertBefore(item, prev);
          state.dirty = true;
          updateTicketOptionIndexes(item.parentNode);
        }
        return;
      }

      const moveDownBtn = e.target.closest('[data-ticket-move-down]');
      if (moveDownBtn) {
        const item = moveDownBtn.closest('[data-ticket-option]');
        const next = item?.nextElementSibling;
        if (item && next && next.matches('[data-ticket-option]')) {
          item.parentNode.insertBefore(next, item);
          state.dirty = true;
          updateTicketOptionIndexes(item.parentNode);
        }
        return;
      }
    };
  }
  const ticketPanelBtn = document.querySelector('#ticket-panel-send');
  if (ticketPanelBtn) ticketPanelBtn.onclick = sendTicketPanelDashboard;
  const testForm = document.querySelector('#test-form');
  if (testForm) {
    testForm.onsubmit = sendTest;
    const typeSelect = testForm.querySelector('#test-type');
    const updateVisibility = () => {
      const type = typeSelect ? typeSelect.value : '';
      const lvlField = testForm.querySelector('#field-test-level');
      const cfsField = testForm.querySelector('#field-test-confession');
      if (lvlField) lvlField.style.display = ['chat', 'voice'].includes(type) ? '' : 'none';
      if (cfsField) cfsField.style.display = type === 'confession' ? '' : 'none';
    };
    if (typeSelect) {
      typeSelect.onchange = updateVisibility;
      updateVisibility();
    }
  }
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
  if (state.page === 'reactionroles') return rrPage();
  if (state.page === 'giveaway') return giveawayPage();
  if (state.page === 'ticket') return ticketPage();
  if (state.page === 'test') return testPage();
  if (state.page === 'level') return levelPage();
  if (['xp', 'notifications', 'monthly', 'invites', 'security', 'receptionist'].includes(state.page)) return customPage(state.page);
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
    if (type === 'role' || (type === 'channel' && ['inviteChannel','securityLogChannel','modLogChannel','confessionNoticeChannel','confessionMilestoneChannel','receptionistChannel'].includes(key))) return field(id,label,type,value);
    if (type === 'roles') return '<div class="field"><label>' + h(label) + '</label><input type="hidden" name="' + id + '"><div class="exclusion-list">' + state.data.roles.filter(role => !role.managed).map(role => '<label class="check-row"><input type="checkbox" data-role-option="' + key + '" value="' + h(role.id) + '" ' + (value.includes(role.id) ? 'checked' : '') + '><span>' + h(role.name) + '</span></label>').join('') + '</div></div>';
    if (type === 'channel' && key === 'roleNoticeChannel') return field(id, label, 'channel', value);
    if (type === 'channel') return field(id, label, 'channel', value).replace('Không sử dụng', 'Dùng kênh thông báo chung');
    let input;
    if (type === 'select') input = '<select id="' + id + '" name="' + id + '">' + a.map(v => '<option value="' + h(v) + '" ' + (v === value ? 'selected' : '') + '>' + h(choiceLabels[v] || v) + '</option>').join('') + '</select>';
    else if (type === 'text') input = a <= 50 ? '<input id="' + id + '" name="' + id + '" type="text" maxlength="' + a + '" value="' + h(value) + '" required>' : '<textarea id="' + id + '" name="' + id + '" maxlength="' + a + '" rows="3" required>' + h(value) + '</textarea>';
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
  if (page === 'security') {
    body = panel('Bảo vệ server', 'Chỉ chủ server được lưu cấu hình này. Lưu xong áp dụng ngay, không cần khởi động lại.', optionControls('security')) +
      panel('Cú pháp lệnh kiểm duyệt trong chat (không cần /)', 'Tùy chỉnh từ khóa gõ trực tiếp trong chat để ban, kick, timeout thành viên và kênh thông báo xử phạt.', optionControls('moderation')) +
      '<div class="note">Bot mới: gỡ các role có thể gỡ và tắt quyền role riêng của bot trong lúc chờ chủ server xét duyệt bằng nút trong kênh cảnh báo. Bot vẫn có thể có quyền cơ bản của @everyone hoặc quyền riêng của kênh. Không cách ly được quyền nhạy cảm thì thử đuổi bot và báo lỗi. Role nhạy cảm cấp cho người có tuổi tài khoản HOẶC thời gian ở server dưới ngưỡng sẽ bị gỡ, có nút Vẫn cấp role để chủ server duyệt. Không tự xét duyệt người cấp role. Các tùy chọn này chỉ áp dụng khi bật bảo vệ; cách ly đang chờ vẫn được duy trì khi tắt tùy chọn cách ly bot mới. Cần thêm Manage Roles. Chủ server và chính bot luôn được tin cậy. Danh sách tin cậy bỏ qua mọi kiểm tra: chỉ thêm ID thực sự cần thiết. Chống nuke cộng chung các thao tác tạo/sửa/xóa kênh, role, quyền kênh, webhook, sửa server, cấp/gỡ role, kick, ban, prune, thêm bot và xóa AutoMod. Mặc định 3 thao tác/10 giây sẽ BAN người thực hiện, kể cả admin và bot khác; đặt ngưỡng 1 nếu muốn xử lý ngay thao tác đầu tiên. Thêm bot quản lý hợp lệ vào danh sách tin cậy trước khi bật. Raid: kick người vào từ lúc đạt ngưỡng cho đến hết thời gian chặn; người vào trước ngưỡng không bị kick tự động. Spam: xóa tin vi phạm và timeout 10 phút; @everyone/@here bị xử lý ngay. Role bảo vệ phải cao hơn người/bot cần xử lý. Bot cần View Audit Log, Ban Members, Kick Members, Moderate Members, Manage Messages; Server Members Intent phải bật. Đây là xử lý sau sự kiện: các thao tác đầu tiên có thể đã gây thiệt hại, kênh/role đã xóa không được phục hồi. Cổng raid còn hiệu lực sau khởi động lại; bộ đếm ngưỡng bắt đầu lại. Không thể xử lý chủ server, tài khoản ngang/cao hơn bot hoặc khi bot offline/bị gỡ.</div>';
  } else if (page === 'invites') {
    body = panel('Mời thêm bạn, cùng xây cộng đồng', 'Chọn kênh thông báo và role ở hai mốc 50/100. Có thể để trống role để thêm sau; lượt mời vẫn được lưu.', optionControls('invites')) +
      '<div class="note">Mỗi thành viên mới chỉ được tính một lần; tài khoản bot, tự mời và rời rồi vào lại không tăng số lượt. Tổng tích lũy không giảm khi thành viên rời server. Đạt 100 lượt: cấp role 100 rồi gỡ role 50. Khi đổi role thưởng, bot cập nhật trong khoảng một phút. Chỉ theo dõi từ lúc bật; không truy ngược lượt mời cũ. Link một lần đã biến mất, vanity, mất kết nối hoặc nhiều người mời cùng lúc có thể không xác định được người mời, khi đó không cộng nhầm. Bot cần Quản lý server để đọc lượt dùng lời mời, Quản lý role để trao thưởng và Server Members Intent. Dùng /invites để xem số lượt đã ghi nhận.</div>';
  } else if (page === 'xp') {
    body = panel('Tốc độ tích lũy XP', 'Điều chỉnh riêng Chat, Voice và phần trăm Booster.', optionControls('xp') + legacyFields(['VNL_BOOSTER_ROLE_ID'])) +
      panel('Kênh và danh mục bỏ qua XP', 'Chọn danh mục sẽ bỏ qua cả các kênh bên trong. Áp dụng cho Chat và Voice.',
        '<div class="exclusion-list">' + state.data.exclusionChannels.map(channel => '<label class="check-row"><input type="checkbox" name="exclusion" value="' + h(channel.id) + '" ' + (state.data.exclusions.includes(channel.id) ? 'checked' : '') + '><span>' + (channel.type === 'category' ? '▤ ' : '# ') + h(channel.name) + '</span></label>').join('') + '</div>');
  } else if (page === 'notifications') {
    body = panel('Chúc mừng nhận role', 'Tự chúc mừng khi nhận role thưởng level hoặc role bạn chọn bên dưới. Role trong danh sách bỏ qua luôn được ưu tiên. Bỏ chọn Member, game, ping để tránh thông báo không cần thiết. Hỗ trợ {user}, {username}, {roles}, {server}, {reason}, {grantedBy}. Bot tự ghi mốc level và người cấp role; cần quyền Xem nhật ký kiểm toán để xác định người cấp từ bên ngoài. Chỉ thông báo role mới nhận sau khi bật.', optionControls('roleNotifications')) + panel('Thông báo lên cấp', 'Chọn kênh chung hoặc kênh riêng cho Chat và Voice.', legacyFields(['LEVEL_CHANNEL_ID']) + optionControls('notifications')) +
      panel('Xem trước nội dung', 'Các biến dùng được: {user}, {username}, {level}, {xp}, {server}, {type}. Xem trước không gửi tin lên Discord.',
        '<div class="notice-preview" id="notice-preview"><h3 id="notice-preview-title"></h3><p id="notice-preview-chat"></p><hr><p id="notice-preview-voice"></p></div>');
  } else if (page === 'receptionist') {
    body = panel('Thông báo lễ tân chào thành viên mới', 'Gửi lời nhắn vào kênh chat chung khi có người mới vào server và tag role lễ tân để họ chủ động chào hỏi.', optionControls('receptionist')) +
      '<div class="note">Nội dung hỗ trợ các biến: <b>{member}</b> (tag thành viên mới), <b>{role}</b> (tag role lễ tân), <b>{server}</b> (tên server), <b>{username}</b> (tên người mới), <b>{memberCount}</b> (tổng số thành viên). Bot sẽ ping role lễ tân và thành viên mới để thông báo, không ping @everyone / @here.</div>';
  } else {
    body = panel('Tổng kết và role tháng', 'Chốt tháng theo giờ Việt Nam. Role chuyển theo XP tháng trước; XP tổng và level vẫn được giữ.',
      optionControls('monthly') + legacyFields(state.data.fields.filter(([key]) => key.startsWith('MONTHLY_')).map(([key]) => key))) +
      '<div class="note">Nội dung hỗ trợ {server} và {month}. Nếu kênh tổng kết gặp lỗi, bot vẫn xử lý trao role. Tắt chuyển role không tự thu hồi role hiện có.</div>';
  }
  return heading('CẤU HÌNH RIÊNG CHO SERVER', labels[page], 'Lưu để bot áp dụng thay đổi ngay.') + '<form id="settings-form">' + body + savebar + '</form>';
}
function confessionPage() {
  return heading('MỘT GÓC ĐỂ SẺ CHIA', 'Confession', 'Tùy chỉnh bài đăng, tương tác và thời gian chờ gửi bài.') +
    '<div class="card card-body"><h2>Bảng chọn cách chia sẻ</h2><p>Hai nút Công khai và Ẩn danh mở ô viết riêng. Công khai hiện tên/avatar; ẩn danh không hiện người gửi. Bảng được đăng vào kênh confession đã lưu.</p><button class="secondary" id="confession-panel-send">Đăng / cập nhật bảng confession</button><div id="confession-panel-result"></div></div><form id="settings-form">' + panel('Bài đăng confession', 'Tiêu đề hỗ trợ {number} và {server}. Số thứ tự hiện tại luôn được giữ.',
      field('confessionChannel', 'Đăng confession tại', 'channel', state.data.confessionChannel, true) + optionControls('confession')) +
      panel('Thưởng role mốc confession', 'Tự động trao role khi thành viên gửi đủ mốc confession và thông báo chúc mừng lên kênh riêng.', optionControls('confessionRewards')) +
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
function testPage() {
  return heading('XEM THÔNG BÁO TRÊN DISCORD', 'Gửi thử', 'Dùng cấu hình đã lưu của server. Hãy lưu các chỉnh sửa trước khi gửi thử.') +
    '<form id="test-form">' + panel('Chọn bản thử và nơi nhận', 'Bản thử có nhãn TEST và không ping thành viên.',
      '<div class="form-grid"><div class="field"><label for="test-type">Loại thông báo</label><select id="test-type" name="type">' +
      '<option value="chat">Lên cấp Chat</option>' +
      '<option value="voice">Lên cấp Voice</option>' +
      '<option value="receptionist">👋 Lễ tân chào thành viên mới</option>' +
      '<option value="confessionMilestone">🏆 Thưởng mốc Confession (Role 100 bài)</option>' +
      '<option value="roleNotice">🎉 Chúc mừng nhận Role</option>' +
      '<option value="invite">💌 Thông báo lời mời (Invite)</option>' +
      '<option value="monthly">Vinh danh tháng + ảnh Top 10</option>' +
      '<option value="confession">Confession</option></select></div>' +
      '<div class="field"><label for="test-channel">Kênh nhận bản thử</label><select id="test-channel" name="channelId" required><option value="">Chọn kênh…</option>' + state.data.channels.map(c => '<option value="' + h(c.id) + '"># ' + h(c.name) + '</option>').join('') + '</select></div>' +
      '<div class="field" id="field-test-level"><label for="test-level">Level mẫu (Chat/Voice)</label><input id="test-level" name="level" type="number" min="1" max="100000" value="25" required></div>' +
      '<div class="field" id="field-test-confession"><label for="test-confession">Nội dung mẫu (Confession)</label><textarea id="test-confession" name="content" maxlength="4000" rows="3">Đây là confession gửi thử từ dashboard. Chúc cộng đồng luôn vui vẻ!</textarea></div></div>') +
    '<div class="note">Thông báo dùng cấu hình thực tế của server (màu sắc, tiêu đề, nội dung, avatar). Bản thử có nhãn TEST và không ping người thật. Tối đa 6 lần/phút.</div>' +
    '<div class="savebar"><span id="test-status" role="status">Bản thử sẽ được đăng vào kênh bạn chọn.</span><button type="submit" class="primary">Gửi bản thử</button></div><div id="test-result"></div></form>';
}
async function sendTest(event) {
  event.preventDefault();
  if (state.saving) return;
  const form = event.currentTarget, values = Object.fromEntries(new FormData(form));
  const button = form.querySelector('button[type="submit"]'), status = form.querySelector('#test-status');
  const payload = { type: values.type, channelId: values.channelId };
  if (['chat', 'voice'].includes(values.type)) payload.level = Number(values.level);
  if (values.type === 'confession') payload.content = values.content;
  state.saving = true;
  form.querySelectorAll('input,textarea,select,button').forEach(control => { control.disabled = true; });
  button.textContent = 'Đang gửi…'; status.textContent = 'Đang tạo và gửi bản thử…';
  form.querySelector('#test-result').innerHTML = '';
  try {
    const result = await api(`/api/guilds/${state.guild.id}/test`, payload);
    status.textContent = 'Đã gửi bản thử thành công.';
    form.querySelector('#test-result').innerHTML = '<a class="secondary" href="' + h(result.messageUrl) + '" target="_blank" rel="noopener noreferrer">Mở tin nhắn trên Discord ↗</a>';
    notify('Đã gửi bản thử vào kênh bạn chọn.');
  } catch (error) { status.textContent = error.message; notify(error.message); }
  finally {
    state.saving = false;
    form.querySelectorAll('input,textarea,select,button').forEach(control => { control.disabled = false; });
    button.textContent = 'Gửi bản thử';
  }
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
  state.dirty = false; state.page = page; state.loading = ['giveaway','reactionroles','ticket'].includes(page); render();
  if (page === 'ticket' && state.data) {
    const id = state.guild.id, requestId = state.requestId;
    try {
      const tData = await api(`/api/guilds/${id}/ticket`);
      if (state.requestId === requestId && state.data) {
        state.data.ticket = tData;
        if (state.page === page) { state.loading = false; render(); }
      }
    } catch (error) {
      if (state.requestId === requestId && state.page === page) { state.loading = false; render(); }
      notify(error.message);
    }
  }
  if (page === 'giveaway' && state.data) {
    const id=state.guild.id, requestId=state.requestId;
    try { const rows=await api(`/api/guilds/${id}/giveaways`); if (state.requestId===requestId && state.data) { state.data.giveaways=rows; if (state.page===page) { state.loading=false; render(); } } }
    catch(error) { if (state.requestId===requestId && state.page===page) { state.loading=false; render(); } notify(error.message); }
  }
  if(page==='reactionroles'&&state.data){
    const id=state.guild.id,requestId=state.requestId;
    try{const rows=await api(`/api/guilds/${id}/reaction-roles`);if(state.requestId===requestId&&state.data){state.data.reactionroles=rows;if(state.page===page){state.loading=false;render();}}}
    catch(e){if(state.requestId===requestId&&state.page===page){state.loading=false;render();}notify(e.message);}
  }
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
    const value = type === 'roles' ? [...form.querySelectorAll('[data-role-option="' + key + '"]:checked')].map(input => input.value) : type === 'boolean' ? control.checked : type === 'number' ? Number(control.value) : control.value;
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

function giveawayPage() {
  const rows=state.data.giveaways;
  const statuses={active:'Đang mở',ended:'Đã kết thúc',cancelled:'Đã hủy',draft:'Chưa đăng hoàn tất'};
  return heading('TRAO QUÀ · KẾT NỐI CỘNG ĐỒNG','Giveaway','Tạo một chương trình chỉn chu, để mỗi thành viên đều có cơ hội nhận niềm vui.', '<button class="secondary" id="giveaway-refresh">Làm mới</button>') +
    '<form id="giveaway-form">'+panel('Một món quà mới','Mỗi người thắng nhận phần thưởng bạn nhập. Quà do ban tổ chức trao; bot chọn ngẫu nhiên và thông báo kết quả.',
    '<div class="form-grid"><div class="field"><label for="giveaway-prize">Phần thưởng cho mỗi người thắng</label><input id="giveaway-prize" name="prize" type="text" maxlength="200" placeholder="Ví dụ: 1 tháng Discord Nitro" required></div>'+field('channelId','Kênh đăng giveaway','channel','').replace('name="channelId"','name="channelId" required').replace('Không sử dụng','Chọn kênh giveaway…')+
    '<div class="field"><label for="giveaway-duration">Thời lượng</label><input id="giveaway-duration" name="duration" type="text" value="24h" placeholder="30m, 2h, 7d" required><small>5 phút đến 30 ngày</small></div><div class="field"><label for="giveaway-winners">Số người thắng</label><input id="giveaway-winners" name="winners" type="number" min="1" max="20" value="1" required></div><div class="field"><label for="giveaway-role">Role điều kiện (tùy chọn)</label><select id="giveaway-role" name="requiredRole"><option value="">Tất cả thành viên</option>'+state.data.roles.map(r=>'<option value="'+h(r.id)+'">@ '+h(r.name)+'</option>').join('')+'</select></div><div class="field"><label for="giveaway-description">Lời nhắn & hướng dẫn nhận quà</label><textarea id="giveaway-description" name="description" maxlength="1500" rows="4" placeholder="Một món quà nhỏ dành cho cộng đồng. Chúc bạn may mắn!"></textarea></div></div>')+
    '<div class="note">Thành viên bấm nút để tham gia hoặc rút lượt. Bot kiểm tra lại thành viên và role khi quay, mỗi tài khoản có một lượt. Giveaway vẫn tiếp tục sau khi bot khởi động lại.</div><div class="savebar"><span id="giveaway-status">Gửi thử dùng nút tắt và không ghi nhận giveaway.</span><button type="button" id="giveaway-test" class="secondary">Gửi bản thử</button><button type="submit" class="primary">Đăng giveaway</button></div><div id="giveaway-result"></div></form>'+
    panel('Các chương trình gần đây','Hiển thị tối đa 100 chương trình. Quay lại loại những người thắng của lượt hiện tại.', rows===undefined ? '<p>Nhấn Làm mới để tải danh sách giveaway.</p>' : !rows.length ? '<p>Chưa có giveaway. Món quà đầu tiên đang chờ bạn!</p>' : '<div class="giveaway-list">'+rows.map(row=>'<article class="giveaway-item"><div><span class="badge">'+h(statuses[row.status])+'</span><h3>'+h(row.prize)+'</h3><p>'+number(row.participants)+' lượt · '+row.winner_count+' người thắng · '+h(new Date(row.ends_at).toLocaleString('vi-VN'))+'</p><small>ID: '+h(row.id)+'</small>'+(row.winners.length ? '<p>Đã chọn '+row.winners.length+' người thắng · xem tại bài đăng Discord</p>' : '')+(row.last_error ? '<div class="note">'+h(row.last_error)+'</div>' : '')+'</div><div class="giveaway-actions">'+(row.messageUrl ? '<a class="secondary" target="_blank" rel="noopener noreferrer" href="'+h(row.messageUrl)+'">Xem bài đăng ↗</a>' : '')+(row.status==='active' ? '<button class="secondary" data-giveaway-id="'+row.id+'" data-giveaway-action="end">Kết thúc & quay</button><button class="text-button danger" data-giveaway-id="'+row.id+'" data-giveaway-action="cancel">Hủy giveaway</button>' : row.status==='ended' ? '<button class="secondary" data-giveaway-id="'+row.id+'" data-giveaway-action="reroll">Quay lại</button>' : '')+'</div></article>').join('')+'</div>');
}
async function giveawaySubmit(action) {
  const form=document.querySelector('#giveaway-form');
  if (state.saving || !form.reportValidity()) return;
  const payload={...Object.fromEntries(new FormData(form)),action};
  payload.winners=Number(payload.winners);
  state.saving=true;
  form.querySelectorAll('input,textarea,select,button').forEach(c=>{c.disabled=true;});
  const status=form.querySelector('#giveaway-status'); status.textContent='Đang chuẩn bị bài đăng…';
  try {
    const result=await api(`/api/guilds/${state.guild.id}/giveaways`,payload);
    status.textContent=action==='test' ? 'Đã gửi bản thử. Không có lượt tham gia thật.' : 'Giveaway đã được đăng. Thành viên có thể tham gia ngay!';
    form.querySelector('#giveaway-result').innerHTML='<a class="secondary" target="_blank" rel="noopener noreferrer" href="'+h(result.messageUrl)+'">Mở bài đăng trên Discord ↗</a>';
    if (action==='create') { state.dirty=false; state.data.giveaways=await api(`/api/guilds/${state.guild.id}/giveaways`); notify('Đã đăng giveaway. Bấm Làm mới để xem danh sách.'); }
  } catch(error) { status.textContent=error.message; notify(error.message); }
  finally { state.saving=false; form.querySelectorAll('input,textarea,select,button').forEach(c=>{c.disabled=false;}); }
}
async function giveawayAction(id,action) {
  if (!canLeave()) return;
  const question={end:'Kết thúc ngay và quay người thắng? Giveaway sẽ ngừng nhận lượt.',cancel:'Hủy giveaway này? Chương trình sẽ đóng và không quay người thắng.',reroll:'Quay lại người thắng? Những người thắng hiện tại sẽ bị loại khỏi lần quay này.'};
  if (!window.confirm(question[action])) return;
  state.saving=true;
  document.querySelectorAll('[data-giveaway-action]').forEach(c=>{c.disabled=true;});
  try { const result=await api(`/api/guilds/${state.guild.id}/giveaways`,{id,action}); notify(result.warning || 'Đã cập nhật giveaway.'); state.data.giveaways=await api(`/api/guilds/${state.guild.id}/giveaways`); }
  catch(error) { notify(error.message); }
  finally { state.saving=false; render(); }
}

async function sendConfessionPanel() {
  if (state.saving) return;
  if (state.dirty) return notify('Hãy lưu thay đổi trước khi đăng bảng confession.');
  const button=document.querySelector('#confession-panel-send');
  state.saving=true; button.disabled=true; button.textContent='Đang cập nhật bảng…';
  try {
    const result=await api(`/api/guilds/${state.guild.id}/confession-panel`,{});
    document.querySelector('#confession-panel-result').innerHTML='<p>Đã cập nhật bảng chọn cách chia sẻ.</p><a class="secondary" target="_blank" rel="noopener noreferrer" href="'+h(result.messageUrl)+'">Mở bảng trên Discord ↗</a>';
    notify('Bảng confession đã sẵn sàng.');
  } catch(error) {notify(error.message);}
  finally {state.saving=false;button.disabled=false;button.textContent='Đăng / cập nhật bảng confession';}
}

let rrSequence=0;
function rrChoice(){
 const id=++rrSequence;
 return '<div class="form-grid" data-rr-choice>'+field('rr-role-'+id,'Role tự nhận','role','')+'<div class="field"><label for="rr-label-'+id+'">Tên nút</label><input id="rr-label-'+id+'" data-rr-label maxlength="80" placeholder="Ví dụ: Miền Bắc; để trống để dùng tên role"></div><div class="field"><label for="rr-emoji-'+id+'">Emoji (tùy chọn)</label><input id="rr-emoji-'+id+'" data-rr-emoji list="rr-emojis" maxlength="100" placeholder="Chọn emoji server hoặc nhập 💜"><small>Nhập :mien_bac: hoặc chọn emoji gợi ý.</small></div><button type="button" class="text-button danger" data-rr-remove>Xóa lựa chọn</button></div>';
}
function rrPage(){
 const rows=state.data.reactionroles;
 return heading('VAI TRÒ · KẾT NỐI','Reaction role','Member bấm nút để nhận hoặc bỏ role. Mỗi bảng có thể chọn nhiều role.')+
 '<form id="rr-form"><datalist id="rr-emojis">'+(state.data.emojis||[]).map(e=>'<option value="'+h('<'+(e.animated?'a':'')+':'+e.name+':'+e.id+'>')+'">'+h(e.name)+'</option>').join('')+'</datalist>'+panel('Tạo bảng nhận role','Dùng role sở thích, game hoặc thông báo. Các role có quyền điều hành sẽ bị chặn.',
 '<div class="form-grid"><div class="field"><label for="rr-title">Tiêu đề</label><input id="rr-title" name="title" maxlength="150" value="✨ Chọn vai trò của bạn" required></div>'+field('rr-channel','Kênh đăng bảng','channel','')+
 '<div class="field"><label for="rr-description">Lời giới thiệu</label><textarea id="rr-description" name="description" maxlength="2000" required>Chọn những điều bạn quan tâm để kết nối cùng mọi người. Bấm nút bên dưới để nhận role, bấm lại nếu muốn bỏ nhé!</textarea></div></div>'+
 '<div id="rr-choices">'+rrChoice()+'</div><button type="button" class="secondary" id="rr-add">+ Thêm role</button>')+
 '<div class="note">Bot cần Manage Roles và role của bot phải nằm trên các role tự nhận. Role này được member tự do nhận/bỏ, nên dùng role riêng với role thưởng level và top tháng.</div><div class="savebar"><span>Tối đa 10 role/bảng · 20 bảng đang hoạt động.</span><button class="primary" type="submit">Đăng bảng nhận role</button></div><div id="rr-result"></div></form>'+
 panel('Các bảng đã đăng','Đóng bảng sẽ ngừng nhận/bỏ role qua bảng đó; giữ nguyên role đã cấp.',rows===undefined?'<p>Đang tải danh sách…</p>':!rows.length?'<p>Chưa có bảng nhận role.</p>':rows.map(r=>'<article class="giveaway-item"><div><h3>'+h(r.title)+'</h3><p>'+h(r.active?'Đang hoạt động':'Đã đóng')+' · '+r.choices.length+' role</p><small>ID: '+h(r.id)+'</small></div><div class="giveaway-actions">'+(r.messageUrl?'<a class="secondary" target="_blank" rel="noopener noreferrer" href="'+h(r.messageUrl)+'">Xem bảng ↗</a>':'')+(r.active?'<button class="secondary" data-rr-disable="'+h(r.id)+'">Đóng bảng</button>':'')+'</div></article>').join(''));
}
async function rrSubmit(event){
 event.preventDefault();if(state.saving)return;
 const form=event.currentTarget,id=state.guild.id,requestId=state.requestId;
 const choices=[...form.querySelectorAll('[data-rr-choice]')].map(row=>({roleId:row.querySelector('select').value,label:row.querySelector('[data-rr-label]').value.trim(),emoji:row.querySelector('[data-rr-emoji]').value.trim()})).filter(c=>c.roleId);
 if(!choices.length)return notify('Chọn ít nhất một role.');
 const input={action:'create',title:form.elements.title.value,description:form.elements.description.value,channelId:form.querySelector('#rr-channel').value,choices};
 state.saving=true;form.querySelector('button[type=submit]').disabled=true;
 try{const result=await api(`/api/guilds/${id}/reaction-roles`,input);if(state.requestId!==requestId)return;state.dirty=false;state.data.reactionroles=[{...input,...result,active:1},...(state.data.reactionroles||[])];render();document.querySelector('#rr-result').innerHTML='<p>✅ Đã đăng bảng nhận role.</p><a class="secondary" target="_blank" rel="noopener noreferrer" href="'+h(result.messageUrl)+'">Mở bảng trên Discord ↗</a>';notify('Bảng nhận role đã sẵn sàng!');}
 catch(e){notify(e.message);}finally{state.saving=false;form.querySelector('button[type=submit]').disabled=false;}
}
async function rrDisable(id){
 if(state.saving||!canLeave()||!confirm('Đóng bảng nhận role này? Các role đã nhận sẽ được giữ nguyên.'))return;
 state.saving=true;const guildId=state.guild.id,requestId=state.requestId;
 try{const result=await api(`/api/guilds/${guildId}/reaction-roles`,{action:'disable',id});notify(result.warning||'Đã đóng bảng.');const rows=await api(`/api/guilds/${guildId}/reaction-roles`);if(state.requestId===requestId){state.data.reactionroles=rows;render();}}
 catch(e){notify(e.message);}finally{state.saving=false;}
}
const DEFAULT_TICKET_OPTIONS = [
  { value: 'support', label: '📩 Hỗ Trợ Chung (Support)', description: 'Giải đáp thắc mắc, hỗ trợ các vấn đề trong server', emoji: '📩' },
  { value: 'staff_app', label: '🛡️ Ứng Tuyển Staff', description: 'Đăng ký ứng tuyển vào đội ngũ Staff của VietNam Legacy', emoji: '🛡️' },
  { value: 'nitro_boost', label: '⚡ N1tr0 B00st', description: 'N1tr0 D1sc0rd Giá Siêu Rẻ', emoji: '⚡' },
  { value: 'nitro_first', label: '🎁 N1tr0 Lần Đầu', description: 'Dành Cho Tài Khoản Chưa Từng Dùng N1tr0', emoji: '🎁' },
  { value: 'server_boost', label: '💎 B00st Server', description: 'Nâng Cấp Server Của Bạn', emoji: '💎' },
  { value: 'decor', label: '🔮 Khung Dec0r & Hiệu Ứng', description: 'Hiệu ứng & khung Discord giá rẻ', emoji: '🔮' },
  { value: 'youtube', label: '📺 Y0uTube Premium', description: 'Xem Y0uTube Không Quảng Cáo', emoji: '📺' },
];

function ticketOptionRow(opt, index) {
  const o = opt || { value: '', label: '', description: '', emoji: '' };
  const roleChoices = selected => '<option value="">Chưa chọn</option>' + (state.data.roles || []).map(r => '<option value="' + h(r.id) + '" ' + (selected === r.id ? 'selected' : '') + '>' + h(r.name) + '</option>').join('');
  return '<div class="ticket-option-item" data-ticket-option style="background:#171920; border:1px solid #30333f; border-radius:10px; padding:16px; margin-bottom:14px;">' +
    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:8px;">' +
      '<strong style="color:#ffd869; font-size:13px;" data-ticket-option-index>Mục #' + (index + 1) + '</strong>' +
      '<div style="display:flex; gap:6px;">' +
        '<button type="button" class="secondary" data-ticket-move-up title="Di chuyển lên" style="min-height:30px; padding:3px 9px; font-size:12px;">⬆</button>' +
        '<button type="button" class="secondary" data-ticket-move-down title="Di chuyển xuống" style="min-height:30px; padding:3px 9px; font-size:12px;">⬇</button>' +
        '<button type="button" class="text-button danger" data-ticket-remove-option title="Xóa mục này" style="min-height:30px; padding:3px 8px;">✕ Xóa</button>' +
      '</div>' +
    '</div>' +
    '<div class="form-grid" style="grid-template-columns: 90px 1fr; gap:14px;">' +
      '<div class="field">' +
        '<label>Emoji</label>' +
        '<input type="text" data-ticket-opt-emoji maxlength="30" placeholder="⚡" value="' + h(o.emoji || '') + '">' +
      '</div>' +
      '<div class="field">' +
        '<label>Tên mục (Label) *</label>' +
        '<input type="text" data-ticket-opt-label maxlength="100" placeholder="Ví dụ: N1tr0 B00st" value="' + h(o.label || '') + '" required>' +
      '</div>' +
    '</div>' +
    '<div class="form-grid" style="grid-template-columns: 1fr 1fr; gap:14px; margin-top:12px;">' +
      '<div class="field">' +
        '<label>Mô tả ngắn (Description)</label>' +
        '<input type="text" data-ticket-opt-desc maxlength="100" placeholder="Ví dụ: N1tr0 D1sc0rd Giá Siêu Rẻ" value="' + h(o.description || '') + '">' +
      '</div>' +
      '<div class="field">' +
        '<label>Mã định danh (Value/ID) *</label>' +
        '<input type="text" data-ticket-opt-value maxlength="100" placeholder="Ví dụ: nitro_boost" value="' + h(o.value || '') + '" required>' +
      '</div>' +
    '</div>' +
    '<div class="form-grid" style="margin-top:12px">' +
      '<div class="field"><label>Role xử lý và nhận thông báo</label><select data-ticket-opt-handler>' + roleChoices(o.handlerRoleId) + '</select><small>Để trống dùng role hỗ trợ chung.</small></div>' +
      '<div class="field"><label>Role cấp cho người mở ticket</label><select data-ticket-opt-grant>' + roleChoices(o.grantRoleId) + '</select><small>Để trống để tắt nút cấp role. Role nhận phải nằm dưới role xử lý.</small></div>' +
      '<div class="field"><label>Tên nút cấp role</label><input data-ticket-opt-grant-label maxlength="80" value="' + h(o.grantButtonLabel || 'Cấp role') + '"></div>' +
    '</div>' +
  '</div>';
}

function updateTicketOptionIndexes(container) {
  if (!container) return;
  const items = container.querySelectorAll('[data-ticket-option]');
  items.forEach((item, idx) => {
    const title = item.querySelector('[data-ticket-option-index]');
    if (title) title.textContent = 'Mục #' + (idx + 1);
  });
}

function ticketPage() {
  const t = state.data.ticket || {};
  const cfg = t.config || {};
  const categories = t.categories || [];
  const channels = state.data.channels || [];
  const roles = state.data.roles || [];
  const currentOptions = (cfg.options && cfg.options.length) ? cfg.options : DEFAULT_TICKET_OPTIONS;

  return heading('HỆ THỐNG TICKET ĐỘC QUYỀN', 'Quản lý Ticket', 'Cấu hình bảng Ticket Dropdown Menu, banner VNL Ticket và phân quyền riêng cho AdminTicket & Hỗ Trợ Ticket.') +
    '<div class="card card-body"><h2>Đăng bảng Ticket vào Discord</h2>' +
    '<p>Đăng bảng chọn dịch vụ/sản phẩm có Dropdown Menu và banner VNL Ticket vào kênh bạn đã cấu hình bên dưới.</p>' +
    '<button class="primary" type="button" id="ticket-panel-send">Đăng / Cập nhật bảng Ticket vào Discord</button><div id="ticket-panel-result" style="margin-top:12px;"></div></div>' +
    '<form id="ticket-form">' +
    panel('Phân quyền truy cập phòng Ticket (Độc Quyền)', 'Chỉ Người tạo ticket, Role AdminTicket và Role Hỗ Trợ Ticket mới được xem phòng chat.',
      '<div class="form-grid">' +
      '<div class="field"><label for="ticket-admin-role">👑 Role AdminTicket (Quản trị viên Ticket)</label><select id="ticket-admin-role" name="adminRoleId"><option value="">Chọn role AdminTicket…</option>' +
      roles.map(r => `<option value="${h(r.id)}" ${cfg.adminRoleId === r.id ? 'selected' : ''}>@ ${h(r.name)}</option>`).join('') +
      '</select></div>' +
      '<div class="field"><label for="ticket-support-role">🛠️ Role Hỗ Trợ Ticket (Nhân viên hỗ trợ)</label><select id="ticket-support-role" name="supportRoleId"><option value="">Chọn role Hỗ Trợ Ticket…</option>' +
      roles.map(r => `<option value="${h(r.id)}" ${cfg.supportRoleId === r.id ? 'selected' : ''}>@ ${h(r.name)}</option>`).join('') +
      '</select></div>' +
      '</div>') +
    panel('Kênh & Danh mục phòng Ticket', 'Chọn nơi đặt bảng và danh mục lưu các phòng chat được tạo ra.',
      '<div class="form-grid">' +
      '<div class="field"><label for="ticket-channel">📌 Kênh đặt bảng Ticket Panel</label><select id="ticket-channel" name="channelId"><option value="">Chọn kênh…</option>' +
      channels.map(c => `<option value="${h(c.id)}" ${cfg.channelId === c.id ? 'selected' : ''}># ${h(c.name)}</option>`).join('') +
      '</select></div>' +
      '<div class="field"><label for="ticket-category">📁 Danh mục (Category) tạo phòng Ticket</label><select id="ticket-category" name="categoryId"><option value="">Mặc định (ngoài danh mục)</option>' +
      categories.map(c => `<option value="${h(c.id)}" ${cfg.categoryId === c.id ? 'selected' : ''}>📁 ${h(c.name)}</option>`).join('') +
      '</select><small>Gom các phòng ticket vào một thư mục trên Discord. Nếu menu chỉ có "Mặc định", hãy tạo Danh mục (Create Category) trên Discord rồi F5 tải lại trang.</small></div>' +
      '<div class="field" style="grid-column: 1 / -1;"><label for="ticket-log-channel">📑 Kênh lưu Log & Transcript (Tự động gửi khi đóng Ticket)</label><select id="ticket-log-channel" name="logChannelId"><option value="">Không gửi kênh log (chỉ gửi DM cho khách)</option>' +
      channels.map(c => `<option value="${h(c.id)}" ${cfg.logChannelId === c.id ? 'selected' : ''}># ${h(c.name)}</option>`).join('') +
      '</select></div>' +
      '</div>') +
    panel('📋 Danh mục Dịch Vụ & Hỗ Trợ (Dropdown Menu)', 'Tùy chỉnh các mục hiển thị trong menu chọn trên Discord (tối đa 25 mục). Thành viên sẽ chọn một trong các mục này để mở ticket tương ứng.',
      '<div id="ticket-options-container">' +
      currentOptions.map((opt, i) => ticketOptionRow(opt, i)).join('') +
      '</div>' +
      '<div style="display:flex; gap:10px; align-items:center; margin-top:14px; flex-wrap:wrap;">' +
        '<button type="button" class="secondary" id="ticket-add-option">➕ Thêm danh mục mới</button>' +
        '<button type="button" class="secondary" id="ticket-reset-options" style="color:#ff9caa;">↺ Khôi phục danh mục mẫu</button>' +
        '<small style="color:var(--muted); margin-left:auto;">Tối đa 25 danh mục theo quy định của Discord.</small>' +
      '</div>') +
    panel('Giao diện Embed & Banner VNL Ticket', 'Tùy chỉnh hình ảnh banner ở dưới Embed và văn bản hiển thị.',
      '<div class="form-grid">' +
      '<div class="field"><label for="ticket-title">Tiêu đề bảng Ticket</label><input id="ticket-title" name="title" type="text" maxlength="256" value="' + h(cfg.title || '🏷️ HỆ THỐNG TICKET') + '" required></div>' +
      '<div class="field"><label for="ticket-color">Màu viền Embed</label><input id="ticket-color" name="color" type="color" value="' + h(cfg.color || '#00a8ff') + '" required></div>' +
      '<div class="field" style="grid-column: 1 / -1;"><label for="ticket-banner">🖼️ Link ảnh Banner VNL Ticket (hiển thị ở dưới Embed)</label><input id="ticket-banner" name="bannerUrl" type="url" placeholder="https://..." value="' + h(cfg.bannerUrl || '') + '"></div>' +
      '<div class="field" style="grid-column: 1 / -1;"><label for="ticket-desc">Nội dung giới thiệu Embed</label><textarea id="ticket-desc" name="description" rows="6" maxlength="4000" required>' + h(cfg.description || '') + '</textarea></div>' +
      '<div class="field" style="grid-column: 1 / -1;"><label for="ticket-placeholder">Dòng chữ gợi ý trong Dropdown Menu (Placeholder)</label><input id="ticket-placeholder" name="placeholder" type="text" maxlength="150" value="' + h(cfg.placeholder || 'Nhấn Vào Đây Để Chọn Dịch Vụ / Hỗ Trợ...') + '" required></div>' +
      '</div>') +
    '<div class="note">Khi thành viên chọn một mục trong menu, bot sẽ tự tạo kênh text ẩn với toàn bộ thành viên khác, chỉ cấp quyền ViewChannel cho Người tạo + Role AdminTicket + Role Hỗ Trợ Ticket. Mỗi thành viên được mở tối đa 3 Ticket cùng lúc. Đóng ticket sẽ tự động lưu transcript và xóa kênh sau 5 giây.</div>' +
    '<div class="savebar"><span id="ticket-save-status">Nhớ lưu cấu hình trước khi đăng bảng vào Discord.</span><button type="submit" class="primary">Lưu cấu hình Ticket</button></div></form>';
}
function getTicketFormValues() {
  const form = document.querySelector('#ticket-form');
  if (!form) return {};
  const fd = new FormData(form);

  const optionEls = form.querySelectorAll('[data-ticket-option]');
  const options = [];
  optionEls.forEach((el, idx) => {
    const label = el.querySelector('[data-ticket-opt-label]')?.value?.trim() || '';
    if (!label) return;
    let value = el.querySelector('[data-ticket-opt-value]')?.value?.trim() || '';
    if (!value) {
      value = label.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30) || ('opt_' + (idx + 1));
    }
    const emoji = el.querySelector('[data-ticket-opt-emoji]')?.value?.trim() || '';
    const description = el.querySelector('[data-ticket-opt-desc]')?.value?.trim() || '';

    options.push({
      handlerRoleId: el.querySelector('[data-ticket-opt-handler]')?.value || '',
      grantRoleId: el.querySelector('[data-ticket-opt-grant]')?.value || '',
      grantButtonLabel: el.querySelector('[data-ticket-opt-grant-label]')?.value?.trim() || 'Cấp role',
      value: value.slice(0, 100),
      label: label.slice(0, 100),
      description: description ? description.slice(0, 100) : undefined,
      emoji: emoji ? emoji.slice(0, 30) : undefined,
    });
  });

  return {
    channelId: fd.get('channelId') || '',
    categoryId: fd.get('categoryId') || '',
    logChannelId: fd.get('logChannelId') || '',
    adminRoleId: fd.get('adminRoleId') || '',
    supportRoleId: fd.get('supportRoleId') || '',
    title: fd.get('title') || '',
    description: fd.get('description') || '',
    bannerUrl: fd.get('bannerUrl') || '',
    color: fd.get('color') || '#00a8ff',
    placeholder: fd.get('placeholder') || '',
    options: options.length > 0 ? options : undefined,
  };
}
async function ticketSubmit(e) {
  e.preventDefault();
  if (state.saving) return;
  const cfg = getTicketFormValues();
  if (!cfg.options || !cfg.options.length) {
    return notify('Vui lòng tạo ít nhất 1 danh mục cho bảng Ticket!');
  }
  state.saving = true;
  const button = document.querySelector('#ticket-form button[type="submit"]');
  if (button) button.textContent = 'Đang lưu…';
  try {
    const res = await api(`/api/guilds/${state.guild.id}/ticket`, { action: 'save', config: cfg });
    if (state.data?.ticket) state.data.ticket.config = res.config;
    state.dirty = false;
    notify(res.refreshed?.failed ? 'Đã lưu cấu hình. Có ' + res.refreshed.failed + ' ticket cũ chưa cập nhật được; kiểm tra quyền bot hoặc tin nhắn mở đầu.' : 'Đã lưu cấu hình và cập nhật ' + (res.refreshed?.updated || 0) + ' ticket đang mở.');
  } catch (err) {
    notify(err.message);
  } finally {
    state.saving = false;
    if (button) button.textContent = 'Lưu cấu hình Ticket';
  }
}
async function sendTicketPanelDashboard() {
  const resultDiv = document.querySelector('#ticket-panel-result');
  const button = document.querySelector('#ticket-panel-send');
  const channelSelect = document.querySelector('#ticket-channel');
  const channelId = channelSelect?.value;
  if (!channelId) return notify('Vui lòng chọn Kênh đặt bảng Ticket Panel trước!');

  button.disabled = true; button.textContent = 'Đang đăng bảng…';
  if (resultDiv) resultDiv.innerHTML = '<span class="subtle">Đang gửi bảng Ticket sang Discord…</span>';
  try {
    const res = await api(`/api/guilds/${state.guild.id}/ticket`, {
      action: 'publish',
      channelId,
      config: getTicketFormValues(),
    });
    if (resultDiv) resultDiv.innerHTML = '<a class="secondary" href="' + h(res.messageUrl) + '" target="_blank" rel="noopener noreferrer">Mở bảng Ticket trên Discord ↗</a>';
    notify('Đã đăng bảng Ticket vào kênh thành công!');
  } catch (err) {
    if (resultDiv) resultDiv.innerHTML = `<span class="danger">${h(err.message)}</span>`;
    notify(err.message);
  } finally {
    button.disabled = false; button.textContent = 'Đăng / Cập nhật bảng Ticket vào Discord';
  }
}
