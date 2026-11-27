const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bnNum = (n, options = {}) => Number(n || 0).toLocaleString('bn-BD', options);
const money = n => bnNum(n, { maximumFractionDigits: 0 });
const pad = n => String(n).padStart(2, '0');
const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = localDate(new Date());
let staff = [], editId = null, payRows = [];

// ---- role categories (shared by Staff + Attendance) ----
let roleSel = 'all';
const ROLE_LABELS = { chef: 'রাঁধুনি', cook: 'রাঁধুনি', cleaner: 'পরিচ্ছন্নতাকর্মী', waiter: 'পরিবেশনকর্মী', cashier: 'ক্যাশিয়ার', manager: 'ব্যবস্থাপক', helper: 'সহকারী', dishwasher: 'বাসন পরিষ্কারক' };
const rKey = r => { const value = (r || '').trim().toLowerCase(); return ROLE_LABELS[value] || value || '-'; };
const rLabel = r => { const value = (r || '').trim(); return value ? ROLE_LABELS[value.toLowerCase()] || value : 'পদ উল্লেখ নেই'; };
const roleOk = r => roleSel === 'all' || rKey(r.role) === roleSel;
const PRESET = ['রাঁধুনি', 'পরিচ্ছন্নতাকর্মী', 'পরিবেশনকর্মী', 'ক্যাশিয়ার', 'ব্যবস্থাপক', 'সহকারী', 'বাসন পরিষ্কারক'];
const fillRoles = items => { const s = new Set(PRESET); items.forEach(x => x.role && !ROLE_LABELS[x.role.trim().toLowerCase()] && s.add(x.role.trim())); $('#roleList').innerHTML = [...s].map(v => `<option value="${esc(v)}">`).join(''); };
function chipsHTML(items) {
  const m = new Map(); items.forEach(x => { const k = rKey(x.role), e = m.get(k) || { label: rLabel(x.role), n: 0 }; e.n++; m.set(k, e); });
  if (roleSel !== 'all' && !m.has(roleSel)) roleSel = 'all';
  if (m.size < 2) return '';
  const c = (k, l, n) => `<button type="button" class="chip ${roleSel === k ? 'on' : ''}" data-role="${esc(k)}">${esc(l)}<small>${bnNum(n)}</small></button>`;
  return c('all', 'সব', items.length) + [...m].sort((a, b) => a[1].label.localeCompare(b[1].label, 'bn')).map(([k, e]) => c(k, e.label, e.n)).join('');
}

const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2400); };
async function api(url, method = 'GET', body) {
  const r = await fetch('/api' + url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.token || '') }, body: body && JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.startsWith('/auth/login')) { logout(); throw new Error('আপনার সেশনের মেয়াদ শেষ হয়েছে। আবার প্রবেশ করুন।'); }
  if (!r.ok) throw new Error(d.error || 'অনুরোধটি সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।');
  return d;
}
const safe = f => async (...a) => { try { await f(...a); } catch (e) { toast(e.message); } };

// ---- auth ----
function logout() { localStorage.removeItem('token'); $('#app').hidden = true; $('#login').hidden = false; }
function boot() { $('#login').hidden = true; $('#app').hidden = false; show('dash'); }
$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  try { localStorage.token = (await api('/auth/login', 'POST', { username: $('#user').value, password: $('#pass').value })).token; $('#pass').value = ''; $('#loginErr').textContent = ''; boot(); }
  catch (err) { $('#loginErr').textContent = err.message; }
};
$('#logout').onclick = logout;
$('#pwBtn').onclick = () => $('#pwDlg').showModal();
$('#pwForm').onsubmit = safe(async e => { e.preventDefault(); await api('/auth/password', 'POST', Object.fromEntries(new FormData(e.target))); $('#pwDlg').close(); e.target.reset(); toast('পাসওয়ার্ড বদলানো হয়েছে'); });
$$('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());

// ---- tabs ----
function show(tab) {
  $$('aside nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  ['dash', 'staff', 'att'].forEach(id => $('#' + id).hidden = id !== tab);
  ({ dash: loadDash, staff: loadStaff, att: loadAtt })[tab]();
}
$$('aside nav button').forEach(b => b.onclick = () => show(b.dataset.tab));

// ---- dashboard ----
function gotoPay(m) { $('#attMonth').value = m; show('att'); }
function gotoAttendance() { $('#attMonth').value = today.slice(0, 7); show('att'); }
const loadDash = async () => {
  try {
    const d = await api('/dashboard'), hr = new Date().getHours(), hi = hr < 12 ? 'শুভ সকাল' : hr < 17 ? 'শুভ বিকেল' : 'শুভ সন্ধ্যা';
    const present = d.total - d.off.length, pct = d.total ? Math.round(present / d.total * 100) : 0, bal = d.topBalance.filter(r => r.carry), u = d.due;
    const left = Math.round((new Date(u.dueDate + 'T00:00') - new Date(today + 'T00:00')) / 864e5), all = u.count > 0 && u.paidCount === u.count;
    const st = all ? ['ok', 'সব বেতন পরিশোধ হয়েছে'] : left < 0 ? ['late', `${bnNum(-left)} দিন দেরি`] : left === 0 ? ['soon', 'আজ বেতন দেওয়ার শেষ দিন'] : ['soon', `আর ${bnNum(left)} দিন বাকি`];
    const np = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 10);
    $('#dash').innerHTML = `<div class="head"><div class="title-block"><h2>${hi}</h2><p class="page-caption">আজকের কর্মীদের সারসংক্ষেপ</p></div><span class="date-chip">${new Date().toLocaleDateString('bn-BD', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
    ${u.count ? `<div class="due ${st[0]}">
      <div><span class="lbl">বকেয়া বেতন · ${monthName(u.month)}</span><b class="amt">৳ ${money(u.total)}</b><span class="state">${st[1]}</span><span class="sub"> · বেতন দেওয়ার তারিখ ${fmtD(u.dueDate)}</span></div>
      <div><div class="bar" role="progressbar" aria-label="কর্মীদের বেতন পরিশোধের অগ্রগতি" aria-valuemin="0" aria-valuemax="${u.count}" aria-valuenow="${u.paidCount}"><i style="width:${Math.round(u.paidCount / u.count * 100)}%"></i></div><span class="sub">${bnNum(u.count)} জনের মধ্যে ${bnNum(u.paidCount)} জনের বেতন পরিশোধ · ৳ ${money(u.paidAmount)} পরিশোধিত</span></div>
      <button class="btn" onclick="gotoPay('${u.month}')">${all ? 'বেতন দেখুন' : 'বেতন পরিশোধ'}</button></div>` : ''}
    <section class="dashboard-actions" aria-label="দ্রুত কাজ">
      <div class="action-heading"><h3>দ্রুত কাজ</h3><p class="sub">সাধারণ কাজ</p></div>
      <div class="qa">
        <button class="btn" onclick="gotoAttendance()"><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18M8 14h2M14 14h2M8 17h2"></path></svg><span>হাজিরা নিন</span></button>
        <button class="btn ghost" onclick="show('staff');openForm()"><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20v-1.2A5.3 5.3 0 0 1 7.8 13h2.4a5.3 5.3 0 0 1 5.3 5.3V20"></path><path d="M19 8v6M16 11h6"></path></svg><span>কর্মী যোগ করুন</span></button>
      </div>
    </section>
    <div class="stats">
      <div class="stat s-blue"><span>সক্রিয় কর্মী</span><b>${bnNum(d.total)}</b><span class="sub">বর্তমানে কর্মরত</span></div>
      <div class="stat s-green"><span>আজ উপস্থিত</span><b>${bnNum(present)}</b><div class="bar"><i style="width:${pct}%"></i></div><span class="sub">মোট কর্মীর ${bnNum(pct)}%</span></div>
      <div class="stat s-red"><span>আজ অনুপস্থিত</span><b>${bnNum(d.off.length)}</b><span class="sub">${d.off.length ? 'অনুপস্থিত হিসেবে চিহ্নিত' : 'সবাই উপস্থিত'}</span></div>
      <div class="stat s-amber"><span>এ মাসের মোট বেতন</span><b>৳ ${money(d.payroll)}</b><span class="sub">দেওয়ার তারিখ ${fmtD(np)} · মূল বেতন ৳ ${money(d.monthlyBase)}</span></div>
    </div>
    <div class="two">
      <div class="panel"><h3 class="panel-title">আজ অনুপস্থিত <span class="pill">${bnNum(d.off.length)}</span></h3><ul>${d.off.map(s => `<li><span class="dotname"><i class="dot bad"></i>${esc(s.name)}</span><span class="sub">${esc(rLabel(s.role))}</span></li>`).join('') || '<li class="empty">আজ সবাই উপস্থিত।</li>'}</ul></div>
      <div class="panel"><h3 class="panel-title">জমা ছুটি <span class="pill">${bnNum(bal.length)} জন</span></h3><ul>${bal.map(r => `<li><span class="dotname"><i class="dot ok"></i>${esc(r.name)}</span><span class="pill">${bnNum(r.carry)} দিন</span></li>`).join('') || '<li class="empty">এখনো কোনো ছুটি জমা নেই।</li>'}</ul></div>
    </div>
    <div class="mobile-out"><button class="btn ghost" onclick="window.$('#pwDlg').showModal()">পাসওয়ার্ড বদলান</button> <button class="btn ghost" onclick="window.logout()">বের হন</button></div>`;
  } catch (e) {
    $('#dash').innerHTML = `<div class="panel"><h3>সারসংক্ষেপ দেখানো যাচ্ছে না</h3><p class="bad">${esc(e.message)}</p><button class="btn" onclick="window.loadDash()">আবার চেষ্টা করুন</button></div>`;
  }
};

// ---- staff ----
const loadStaff = safe(async () => { staff = await api('/staff?status=active'); fillRoles(staff); renderStaff(); });
const fmtD = d => new Date(d).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' });
function renderStaff() {
  $('#roleChipsStaff').innerHTML = chipsHTML(staff);
  const q = $('#q').value.toLowerCase(), list = staff.filter(s => roleOk(s) && `${s.name} ${rLabel(s.role)}`.toLowerCase().includes(q));
  const stCard = s => `<article class="st-card" data-id="${s._id}" tabindex="0" role="button" aria-label="বিস্তারিত দেখুন: ${esc(s.name)}">
    <header><div class="nm"><h3>${esc(s.name)}</h3><div class="sub">${s.age ? bnNum(s.age) + ' বছর · ' : ''}${esc(rLabel(s.role))}</div></div><span class="chev">›</span></header>
    <div class="meta"><div><span>বেতন</span><b>৳ ${money(s.salary)}</b></div><div><span>দৈনিক কাজ</span><b>${s.dutyHour ? bnNum(s.dutyHour) + ' ঘণ্টা' : '-'}</b></div><div><span>যোগদান</span><b>${fmtD(s.joinDate)}</b></div></div></article>`;
  const g = new Map(); list.forEach(s => { const k = rKey(s.role); if (!g.has(k)) g.set(k, { label: rLabel(s.role), items: [] }); g.get(k).items.push(s); });
  $('#staffGrid').innerHTML = !list.length ? `<div class="panel empty" style="padding:2rem;text-align:center">${staff.length ? 'কোনো কর্মী মেলেনি।' : 'এখনো কোনো কর্মী যোগ করা হয়নি। প্রথম কর্মী যোগ করুন।'}</div>`
    : roleSel === 'all' && g.size > 1 ? [...g.values()].sort((a, b) => a.label.localeCompare(b.label, 'bn')).map(x => `<section class="grp"><h4 class="grp-h">${esc(x.label)}<span>${bnNum(x.items.length)}</span></h4><div class="staff-cards">${x.items.map(stCard).join('')}</div></section>`).join('')
      : `<div class="staff-cards">${list.map(stCard).join('')}</div>`;
}
const openView = id => {
  const s = staff.find(x => x._id === id); if (!s) return;
  const call = (l, p) => p ? `<a class="callbtn" href="tel:${esc(p)}"><span>${l}</span><b>${esc(p)}</b></a>` : `<div class="callbtn off"><span>${l}</span><b>-</b></div>`;
  $('#viewBody').innerHTML = `<div class="vh"><div class="nm"><h3>${esc(s.name)}</h3><div class="sub">${s.age ? bnNum(s.age) + ' বছর · ' : ''}${esc(rLabel(s.role))}</div></div><button type="button" class="x" data-vclose aria-label="বন্ধ করুন">×</button></div>
  <div class="vbody">
    <section class="vsec"><h4>কাজের তথ্য</h4><dl class="kv"><div><dt>মাসিক বেতন</dt><dd>৳ ${money(s.salary)}</dd></div><div><dt>দৈনিক কাজের সময়</dt><dd>${s.dutyHour ? bnNum(s.dutyHour) + ' ঘণ্টা' : '-'}</dd></div><div><dt>যোগদানের তারিখ</dt><dd>${fmtD(s.joinDate)}</dd></div><div><dt>পদ</dt><dd>${esc(rLabel(s.role))}</dd></div></dl></section>
    <section class="vsec"><h4>যোগাযোগ</h4><div class="calls">${call('নিজের ফোন', s.phonePersonal)}${call('পরিবারের ফোন', s.phoneFamily)}</div></section>
    <section class="vsec"><h4>ঠিকানা</h4><dl class="kv one"><div><dt>বর্তমান</dt><dd>${esc(s.presentAddress || '-')}</dd></div><div><dt>স্থায়ী</dt><dd>${esc(s.permanentAddress || '-')}</dd></div></dl></section>
  </div>
  <div class="actions"><button type="button" class="btn ghost rm" data-rm="${s._id}">কর্মী সরান</button><button type="button" class="btn" data-edit="${s._id}">তথ্য বদলান</button></div>`;
  $('#viewDlg').showModal();
};
$('#staffGrid').onclick = e => { const c = e.target.closest('.st-card'); if (c) openView(c.dataset.id); };
$('#staffGrid').onkeydown = e => { if (e.key === 'Enter' && e.target.matches('.st-card')) openView(e.target.dataset.id); };
$('#viewDlg').onclick = e => {
  const t = e.target, d = $('#viewDlg');
  if (t === d || t.closest('[data-vclose]')) return d.close();
  const ed = t.closest('[data-edit]'), rm = t.closest('[data-rm]');
  if (ed) { d.close(); window.openForm(ed.dataset.edit); }
  if (rm) { d.close(); window.setStatus(rm.dataset.rm, 'archived'); }
};
$('#roleChipsStaff').onclick = e => { const b = e.target.closest('.chip'); if (b) { roleSel = b.dataset.role; renderStaff(); } };
$('#roleChipsAtt').onclick = e => { const b = e.target.closest('.chip'); if (b) { roleSel = b.dataset.role; renderAtt(); } };
$('#q').oninput = renderStaff; $('#addBtn').onclick = () => openForm();
window.openForm = id => {
  editId = id || null; const f = $('#form'); f.reset();
  $('#dlgTitle').textContent = id ? 'কর্মীর তথ্য বদলান' : 'কর্মী যোগ করুন';
  const s = staff.find(x => x._id === id) || {};
  [...f.elements].forEach(el => { if (el.name) el.value = el.name === 'joinDate' ? String(s.joinDate || today).slice(0, 10) : (s[el.name] ?? ''); });
  $('#dlg').showModal();
};
$('#form').onsubmit = safe(async e => {
  e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
  ['age', 'dutyHour'].forEach(k => d[k] = d[k] === '' ? null : +d[k]);
  d.salary = d.salary === '' ? 0 : +d.salary;
  await api(editId ? '/staff/' + editId : '/staff', editId ? 'PUT' : 'POST', d); $('#dlg').close(); toast('কর্মীর তথ্য সংরক্ষণ করা হয়েছে'); loadStaff();
});
window.setStatus = safe(async (id, status) => {
  const s = staff.find(x => x._id === id);
  if (status === 'archived' && !confirm(`সক্রিয় কর্মী তালিকা থেকে ${s.name}-কে সরাবেন? পরে আবার ফিরিয়ে আনতে পারবেন।`)) return;
  await api('/staff/' + id, 'PUT', { status }); toast(status === 'active' ? 'কর্মীকে আবার তালিকায় ফিরিয়ে আনা হয়েছে' : 'কর্মীকে সক্রিয় তালিকা থেকে সরানো হয়েছে'); loadStaff();
});

// ---- attendance + pay: one card per staff ----
$('#attMonth').value = today.slice(0, 7); $('#attMonth').onchange = () => loadAtt();
const shiftMonth = n => { const [Y, M] = $('#attMonth').value.split('-').map(Number), d = new Date(Y, M - 1 + n, 1); $('#attMonth').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; loadAtt(); };
$('#mPrev').onclick = () => shiftMonth(-1); $('#mNext').onclick = () => shiftMonth(1);
const FREE = 2, W = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];
let offSet = new Set();
function card(r, i) {
  const m = $('#attMonth').value, [Y, M] = m.split('-').map(Number), first = new Date(Y, M - 1, 1).getDay(), carried = Math.max(0, r.avail - FREE);
  const join = String(r.joinDate || '').slice(0, 10);
  const days = Array.from({ length: r.days }, (_, k) => {
    const date = `${m}-${pad(k + 1)}`, o = offSet.has(r.id + date);
    const st = date < join ? 'pre' : date > today ? 'fut' : o ? 'off' : 'ok', lock = st === 'pre' || st === 'fut';
    const tip = { pre: 'যোগদানের আগে', fut: 'সামনের দিন', off: 'অনুপস্থিত', ok: 'উপস্থিত' }[st];
    return `<button class="day ${st} ${date === today ? 'today' : ''}" data-s="${r.id}" data-d="${date}" ${lock ? 'disabled' : ''} title="${tip}" aria-label="${esc(r.name)} — ${date}, ${tip}">${bnNum(k + 1)}</button>`;
  }).join('');
  const pd = r.paid
    ? `<span class="paid-chip">পরিশোধিত · ${fmtD(r.paid.paidAt)} · ৳ ${money(r.paid.amount)}${r.paid.amount !== r.net ? ' <em>(বেতনের অঙ্ক বদলেছে)</em>' : ''}</span><button class="small" data-unpay="1">পরিশোধ বাতিল</button>`
    : `<button class="btn sm" data-pay="1">বেতন পরিশোধ</button>`;
  return `<article class="att-card" data-i="${i}">
  <header><div class="nm"><b>${esc(r.name)}</b><div class="sub">${esc(rLabel(r.role))}</div></div><div class="np"><span>নিট বেতন</span><b>৳ ${money(r.net)}</b></div></header>
  <div class="cal">${W.map((w, k) => `<i class="dow ${k === 5 ? 'wk' : ''}">${w}</i>`).join('')}${'<span></span>'.repeat(first)}${days}</div>
  <div class="leave">
    <div class="${r.carry ? 'ok' : ''}"><b>${bnNum(r.carry)}</b><span>বাকি ছুটি<small>${r.carry ? 'ব্যবহারযোগ্য' : 'আর ছুটি নেই'}</small></span></div>
    <div><b>${bnNum(r.used)}</b><span>অনুপস্থিতি</span></div>
    <div class="${r.unpaid ? 'bad' : ''}"><b>${bnNum(r.unpaid)}</b><span>${r.unpaid ? 'বিনা বেতনের দিন' : 'বিনা বেতনের ছুটি নেই'}<small>${r.unpaid ? `কাটা হয়েছে ৳ ${money(Math.round(r.daily * r.unpaid))}` : 'অতিরিক্ত ছুটি নেই'}</small></span></div>
  </div>
  <dl class="pay">
    <div><dt>মাসিক বেতন</dt><dd>৳ ${money(r.salary)}</dd></div>
    <div><dt>দৈনিক বেতন</dt><dd>৳ ${bnNum(r.daily, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd></div>
    <div><dt>কর্তন${r.pre ? `<small>যোগদানের আগে ${bnNum(r.pre)} দিন</small>` : ''}</dt><dd class="${r.deduction ? 'bad' : ''}">${r.deduction ? '−৳ ' + money(r.deduction) : '—'}</dd></div>
    <div><dt>বোনাস</dt><dd><input class="n" type="number" min="0" value="${r.bonus}" aria-label="${esc(r.name)}-এর বোনাস"></dd></div>
    <div><dt>অগ্রিম</dt><dd><input class="n" type="number" min="0" value="${r.advance}" aria-label="${esc(r.name)}-এর অগ্রিম"></dd></div>
  </dl>
  <footer><div class="pst${r.paid ? ' is-paid' : ''}">${pd}</div><button class="small" onclick="window.slip(${i})">বেতনপত্র</button></footer></article>`;
}
const monthName = m => new Date(m + '-01T00:00').toLocaleDateString('bn-BD', { month: 'long', year: 'numeric' });
const payDate = m => { const [Y, M] = m.split('-').map(Number); return fmtD(new Date(Y, M, 10)); };
const paySum = () => {
  const vis = payRows.filter(roleOk), t = k => vis.reduce((a, r) => a + (+r[k] || 0), 0), paid = vis.filter(r => r.paid), m = $('#attMonth').value;
  const paidAmt = paid.reduce((a, r) => a + r.paid.amount, 0), rem = vis.filter(r => !r.paid).reduce((a, r) => a + r.net, 0);
  $('#paySummary').innerHTML = [['s-blue', 'মোট বেতন', '৳ ' + money(t('net')), 'দেওয়ার তারিখ ' + payDate(m)], ['s-green', 'পরিশোধিত', '৳ ' + money(paidAmt), `পরিশোধিত কর্মী: ${bnNum(paid.length)} / ${bnNum(vis.length)} জন`], ['s-amber', 'বাকি', '৳ ' + money(rem), rem ? 'এখনো পরিশোধ করতে হবে' : 'সব বেতন পরিশোধ হয়েছে'], ['s-red', 'মোট কর্তন', '৳ ' + money(t('deduction')), `বোনাস ৳ ${money(t('bonus'))}<br>অগ্রিম ৳ ${money(t('advance'))}`]]
    .map(([c, a, b, s]) => `<div class="stat ${c}"><span>${a}</span><b>${b}</b><span class="sub">${s}</span></div>`).join('');
};
const loadAtt = safe(async () => {
  const m = $('#attMonth').value; if (!m) return;
  $('#mNext').disabled = m >= today.slice(0, 7);
  const [rows, recs] = await Promise.all([api('/payroll?month=' + m), api('/attendance?month=' + m)]);
  payRows = rows.filter(r => r.inMonth); offSet = new Set(recs.map(r => r.staff + r.date));
  fillRoles(payRows); renderAtt();
});
const renderAtt = () => {
  $('#roleChipsAtt').innerHTML = chipsHTML(payRows);
  $('#attGrid').innerHTML = payRows.map((r, i) => roleOk(r) ? card(r, i) : '').join('') || '<div class="panel empty" style="padding:2rem">আগে কর্মী যোগ করুন।</div>';
  paySum();
};
const refreshCard = async el => {
  const i = +el.dataset.i; payRows = (await api('/payroll?month=' + $('#attMonth').value)).filter(r => r.inMonth);
  el.outerHTML = card(payRows[i], i); paySum();
};
const askConfirm = (title, text, yes) => new Promise(res => {
  const d = $('#cfDlg'); $('#cfTitle').textContent = title; $('#cfText').textContent = text; $('#cfYes').textContent = yes;
  const done = v => { d.onclose = null; d.close(); res(v); };
  $('#cfYes').onclick = () => done(true); $('#cfNo').onclick = () => done(false); d.onclose = () => res(false);
  d.showModal();
});
$('#attGrid').onclick = safe(async e => {
  const pb = e.target.closest('[data-pay]'), ub = e.target.closest('[data-unpay]');
  if (pb || ub) {
    const el = e.target.closest('.att-card'), r = payRows[+el.dataset.i], m = $('#attMonth').value;
    if (pb) {
      if (!await askConfirm('বেতন পরিশোধ করবেন?', `${monthName(m)} মাসের ৳ ${money(r.net)} বেতন ${r.name}-কে দেবেন?`, 'বেতন পরিশোধ')) return;
      await api('/payment', 'POST', { staff: r.id, month: m }); toast('বেতন পরিশোধ করা হয়েছে');
    } else {
      if (!await askConfirm('বেতন পরিশোধ বাতিল করবেন?', `${monthName(m)} মাসে ${r.name}-এর বেতনের পরিশোধের চিহ্নটি মুছে দেবেন?`, 'পরিশোধ বাতিল করুন')) return;
      await api(`/payment?staff=${r.id}&month=${m}`, 'DELETE');
    }
    return refreshCard(el);
  }
  const c = e.target.closest('.day'); if (!c || c.disabled) return;
  const { s, d } = c.dataset, el = c.closest('.att-card'), r = payRows[+el.dataset.i];
  if (d < today) { // আগের তারিখ বদলাতে নিশ্চিতকরণ
    const label = new Date(d + 'T00:00').toLocaleDateString('bn-BD', { weekday: 'short', day: 'numeric', month: 'short' }), absent = c.classList.contains('off');
    if (!await askConfirm('আগের দিনের হাজিরা বদলাবেন?', absent ? `${label} তারিখে ${r.name}-কে অনুপস্থিত দেখানো আছে। উপস্থিত করবেন?${r.paid ? ' বেতন ইতিমধ্যে পরিশোধ হয়েছে!' : ''}` : `${label} তারিখে ${r.name}-কে অনুপস্থিত করবেন? এতে এই মাসের বেতনের হিসাব বদলাবে।${r.paid ? ' বেতন ইতিমধ্যে পরিশোধ হয়েছে!' : ''}`, absent ? 'উপস্থিত করুন' : 'অনুপস্থিত করুন')) return;
  }
  const res = await api('/attendance', 'PUT', { staff: s, date: d }), k = s + d;
  res.off ? offSet.add(k) : offSet.delete(k);
  await refreshCard(el);
});
$('#payAll').onclick = safe(async () => {
  const m = $('#attMonth').value, todo = payRows.filter(r => roleOk(r) && !r.paid);
  if (!todo.length) return toast('সবার বেতন আগেই পরিশোধ করা হয়েছে');
  if (!await askConfirm('সব বেতন পরিশোধ করবেন?', `${bnNum(todo.length)} জন কর্মী${roleSel === 'all' ? '' : ' (' + rLabel(todo[0].role) + ')'} · ${monthName(m)} মাসের মোট ৳ ${money(todo.reduce((a, r) => a + r.net, 0))}।`, 'সব বেতন পরিশোধ করুন')) return;
  await api('/payment/all', 'POST', { month: m, staff: todo.map(r => r.id) }); toast('সব বেতন পরিশোধ করা হয়েছে'); loadAtt();
});
$('#attGrid').onchange = safe(async e => {
  if (!e.target.matches('input.n')) return;
  const el = e.target.closest('.att-card'), [b, a] = el.querySelectorAll('input.n');
  await api('/adjust', 'PUT', { staff: payRows[+el.dataset.i].id, month: $('#attMonth').value, bonus: b.value, advance: a.value });
  await refreshCard(el); toast('পরিবর্তন সংরক্ষণ করা হয়েছে');
});
$('#csvBtn').onclick = () => {
  if (!payRows.length) return toast('ডাউনলোড করার মতো বেতনের তথ্য নেই');
  const rows = [['কর্মী নম্বর', 'নাম', 'পদ', 'মাসিক বেতন', 'মাসের দিন', 'দৈনিক বেতন', 'ব্যবহৃত ছুটি', 'বিনা বেতনের দিন', 'জমা ছুটি', 'বোনাস', 'অগ্রিম', 'নিট বেতন'],
  ...payRows.filter(roleOk).map(r => [r.staffId, r.name, rLabel(r.role), r.salary, r.days, r.daily.toFixed(2), r.used, r.unpaid, r.carry, r.bonus, r.advance, r.net])];
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `বেতনের-হিসাব-${$('#attMonth').value}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
window.slip = i => {
  const r = payRows[i], m = $('#attMonth').value, w = window.open('', '_blank');
  if (!w) return toast('বেতনপত্র খুলতে পপ-আপ চালু করুন');
  const line = (k, v, c = '') => `<tr><td>${k}</td><td style="text-align:right" class="${c}">${v}</td></tr>`;
  w.document.write(`<!doctype html><html lang="bn"><head><meta charset="utf-8">
<title>বেতনপত্র - ${esc(r.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  body{font:15px 'Noto Sans Bengali', sans-serif;max-width:520px;margin:2rem auto;padding:0 1rem;color:#111827;}
  h1{margin:0 0 1rem 0;font-size:1.5rem;}
  table{width:100%;border-collapse:collapse;margin-top:1rem}
  td{padding:.6rem 0;border-bottom:1px solid #e5e7eb}
  .t td{font-weight:700;font-size:1.1rem;border-top:2px solid #111827;border-bottom:0;padding-top:1rem;}
</style></head><body>
<h1>বেতনপত্র</h1>
<p><b>${esc(r.name)}</b> &middot; ${esc(rLabel(r.role))}<br>মাস: ${monthName(m)} (${bnNum(r.days)} দিন)</p>
<table>
${line('মাসিক বেতন', money(r.salary))}
${line('দৈনিক বেতন', bnNum(r.daily, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
${line('ব্যবহৃত ছুটি', bnNum(r.used))}
${line('বাকি ছুটি', bnNum(r.avail))}
${line('বিনা বেতনের দিন', bnNum(r.unpaid))}
${line('কর্তন', '-' + money(r.deduction))}
${line('বোনাস', '+' + money(r.bonus))}
${line('অগ্রিম', '-' + money(r.advance))}
</table>
<table class="t">${line('নিট বেতন', '৳ ' + money(r.net))}</table>
<p style="margin-top:2rem;font-size:0.9rem;color:#6b7280">পরের মাসে জমা ছুটি: ${bnNum(r.carry)} দিন</p>
<script>onload = () => print()<\/script>
</body></html>`);
  w.document.close();
};

// Expose functions for inline onclick
window.$ = $;
window.loadDash = loadDash;
window.logout = logout;

// ---- start app ----
localStorage.token ? boot() : ($('#login').hidden = false);