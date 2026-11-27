const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const pad = n => String(n).padStart(2, '0');
const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = localDate(new Date());
let staff = [], editId = null, payRows = [];

// ---- role categories (shared by Staff + Attendance) ----
let roleSel = 'all';
const rKey = r => (r || '').trim().toLowerCase() || '-', rLabel = r => (r || '').trim() || 'No role';
const roleOk = r => roleSel === 'all' || rKey(r.role) === roleSel;
const PRESET = ['Chef', 'Cook', 'Cleaner', 'Waiter', 'Cashier', 'Manager', 'Helper', 'Dishwasher'];
const fillRoles = items => { const s = new Set(PRESET); items.forEach(x => x.role && s.add(x.role.trim())); $('#roleList').innerHTML = [...s].map(v => `<option value="${esc(v)}">`).join(''); };
function chipsHTML(items) {
  const m = new Map(); items.forEach(x => { const k = rKey(x.role), e = m.get(k) || { label: rLabel(x.role), n: 0 }; e.n++; m.set(k, e); });
  if (roleSel !== 'all' && !m.has(roleSel)) roleSel = 'all';
  if (m.size < 2) return '';
  const c = (k, l, n) => `<button type="button" class="chip ${roleSel === k ? 'on' : ''}" data-role="${esc(k)}">${esc(l)}<small>${n}</small></button>`;
  return c('all', 'All', items.length) + [...m].sort((a, b) => a[1].label.localeCompare(b[1].label)).map(([k, e]) => c(k, e.label, e.n)).join('');
}

const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2400); };
async function api(url, method = 'GET', body) {
  const r = await fetch('/api' + url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.token || '') }, body: body && JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.startsWith('/auth/login')) { logout(); throw new Error('আবার সাইন ইন করুন'); }
  if (!r.ok) throw new Error(d.error || 'কিছু একটা সমস্যা হয়েছে');
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
$('#pwForm').onsubmit = safe(async e => { e.preventDefault(); await api('/auth/password', 'POST', Object.fromEntries(new FormData(e.target))); $('#pwDlg').close(); e.target.reset(); toast('Password updated'); });
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
    const d = await api('/dashboard'), hr = new Date().getHours(), hi = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    const present = d.total - d.off.length, pct = d.total ? Math.round(present / d.total * 100) : 0, bal = d.topBalance.filter(r => r.carry), u = d.due;
    const left = Math.round((new Date(u.dueDate + 'T00:00') - new Date(today + 'T00:00')) / 864e5), all = u.count > 0 && u.paidCount === u.count;
    const st = all ? ['ok', 'All paid'] : left < 0 ? ['late', `Overdue by ${-left} day${left === -1 ? '' : 's'}`] : left === 0 ? ['soon', 'Due today'] : ['soon', `Due in ${left} day${left === 1 ? '' : 's'}`];
    const np = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 10);
    $('#dash').innerHTML = `<div class="head"><div class="title-block"><h2>${hi}</h2><p class="page-caption">Here is how your team looks today.</p></div><span class="date-chip">${new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
    ${u.count ? `<div class="due ${st[0]}">
      <div><span class="lbl">Salary due · ${monthName(u.month)}</span><b class="amt">৳ ${money(u.total)}</b><span class="state">${st[1]}</span><span class="sub"> · pay date ${fmtD(u.dueDate)}</span></div>
      <div><div class="bar" role="progressbar" aria-label="Staff paid" aria-valuemin="0" aria-valuemax="${u.count}" aria-valuenow="${u.paidCount}"><i style="width:${Math.round(u.paidCount / u.count * 100)}%"></i></div><span class="sub">${u.paidCount} of ${u.count} staff paid · ৳ ${money(u.paidAmount)} paid</span></div>
      <button class="btn" onclick="gotoPay('${u.month}')">${all ? 'View' : 'Review & pay'}</button></div>` : ''}
    <section class="dashboard-actions" aria-label="Quick actions">
      <div class="action-heading"><h3>Quick actions</h3><p class="sub">Common tasks</p></div>
      <div class="qa">
        <button class="btn" onclick="gotoAttendance()"><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18M8 14h2M14 14h2M8 17h2"></path></svg><span>Mark attendance</span></button>
        <button class="btn ghost" onclick="show('staff');openForm()"><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20v-1.2A5.3 5.3 0 0 1 7.8 13h2.4a5.3 5.3 0 0 1 5.3 5.3V20"></path><path d="M19 8v6M16 11h6"></path></svg><span>Add staff</span></button>
      </div>
    </section>
    <div class="stats">
      <div class="stat s-blue"><span>Active staff</span><b>${d.total}</b><span class="sub">current team</span></div>
      <div class="stat s-green"><span>Present today</span><b>${present}</b><div class="bar"><i style="width:${pct}%"></i></div><span class="sub">${pct}% of the team</span></div>
      <div class="stat s-red"><span>Absent today</span><b>${d.off.length}</b><span class="sub">${d.off.length ? 'marked absent' : 'full attendance'}</span></div>
      <div class="stat s-amber"><span>Month to date</span><b>৳ ${money(d.payroll)}</b><span class="sub">Pay date ${fmtD(np)} · base ৳ ${money(d.monthlyBase)}</span></div>
    </div>
    <div class="two">
      <div class="panel"><h3 class="panel-title">Absent today <span class="pill">${d.off.length}</span></h3><ul>${d.off.map(s => `<li><span class="dotname"><i class="dot bad"></i>${esc(s.name)}</span><span class="sub">${esc(s.role || '')}</span></li>`).join('') || '<li class="empty">Everyone is present today.</li>'}</ul></div>
      <div class="panel"><h3 class="panel-title">Saved leave <span class="pill">${bal.length} staff</span></h3><ul>${bal.map(r => `<li><span class="dotname"><i class="dot ok"></i>${esc(r.name)}</span><span class="pill">${r.carry} ${r.carry === 1 ? 'day' : 'days'}</span></li>`).join('') || '<li class="empty">No saved leave yet.</li>'}</ul></div>
    </div>
    <div class="mobile-out"><button class="btn ghost" onclick="window.$('#pwDlg').showModal()">Change Password</button> <button class="btn ghost" onclick="window.logout()">Sign Out</button></div>`;
  } catch (e) {
    $('#dash').innerHTML = `<div class="panel"><h3>Dashboard unavailable</h3><p class="bad">${esc(e.message)}</p><button class="btn" onclick="window.loadDash()">Try again</button></div>`;
  }
};

// ---- staff ----
const loadStaff = safe(async () => { staff = await api('/staff?status=active'); fillRoles(staff); renderStaff(); });
const fmtD = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
function renderStaff() {
  $('#roleChipsStaff').innerHTML = chipsHTML(staff);
  const q = $('#q').value.toLowerCase(), list = staff.filter(s => roleOk(s) && `${s.name} ${s.role || ''}`.toLowerCase().includes(q));
  const stCard = s => `<article class="st-card" data-id="${s._id}" tabindex="0" role="button" aria-label="Open ${esc(s.name)}">
    <header><div class="nm"><h3>${esc(s.name)}</h3><div class="sub">${s.age ? esc(s.age) + ' yrs · ' : ''}${esc(s.role || 'No role')}</div></div><span class="chev">›</span></header>
    <div class="meta"><div><span>Salary</span><b>৳ ${money(s.salary)}</b></div><div><span>Duty</span><b>${s.dutyHour ? esc(s.dutyHour) + ' hrs' : '-'}</b></div><div><span>Joined</span><b>${fmtD(s.joinDate)}</b></div></div></article>`;
  const g = new Map(); list.forEach(s => { const k = rKey(s.role); if (!g.has(k)) g.set(k, { label: rLabel(s.role), items: [] }); g.get(k).items.push(s); });
  $('#staffGrid').innerHTML = !list.length ? `<div class="panel empty" style="padding:2rem;text-align:center">${staff.length ? 'No match found.' : 'No staff yet. Add the first staff member.'}</div>`
    : roleSel === 'all' && g.size > 1 ? [...g.values()].sort((a, b) => a.label.localeCompare(b.label)).map(x => `<section class="grp"><h4 class="grp-h">${esc(x.label)}<span>${x.items.length}</span></h4><div class="staff-cards">${x.items.map(stCard).join('')}</div></section>`).join('')
      : `<div class="staff-cards">${list.map(stCard).join('')}</div>`;
}
const openView = id => {
  const s = staff.find(x => x._id === id); if (!s) return;
  const call = (l, p) => p ? `<a class="callbtn" href="tel:${esc(p)}"><span>${l}</span><b>${esc(p)}</b></a>` : `<div class="callbtn off"><span>${l}</span><b>-</b></div>`;
  $('#viewBody').innerHTML = `<div class="vh"><div class="nm"><h3>${esc(s.name)}</h3><div class="sub">${s.age ? esc(s.age) + ' yrs · ' : ''}${esc(s.role || 'No role')}</div></div><button type="button" class="x" data-vclose aria-label="Close">×</button></div>
  <div class="vbody">
    <section class="vsec"><h4>Job</h4><dl class="kv"><div><dt>Monthly salary</dt><dd>৳ ${money(s.salary)}</dd></div><div><dt>Daily duty</dt><dd>${s.dutyHour ? esc(s.dutyHour) + ' hours' : '-'}</dd></div><div><dt>Joined</dt><dd>${fmtD(s.joinDate)}</dd></div><div><dt>Role</dt><dd>${esc(s.role || '-')}</dd></div></dl></section>
    <section class="vsec"><h4>Contact</h4><div class="calls">${call('Personal', s.phonePersonal)}${call('Family', s.phoneFamily)}</div></section>
    <section class="vsec"><h4>Address</h4><dl class="kv one"><div><dt>Present</dt><dd>${esc(s.presentAddress || '-')}</dd></div><div><dt>Permanent</dt><dd>${esc(s.permanentAddress || '-')}</dd></div></dl></section>
  </div>
  <div class="actions"><button type="button" class="btn ghost rm" data-rm="${s._id}">Remove</button><button type="button" class="btn" data-edit="${s._id}">Edit</button></div>`;
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
  $('#dlgTitle').textContent = id ? 'Edit Staff' : 'Add Staff';
  const s = staff.find(x => x._id === id) || {};
  [...f.elements].forEach(el => { if (el.name) el.value = el.name === 'joinDate' ? String(s.joinDate || today).slice(0, 10) : (s[el.name] ?? ''); });
  $('#dlg').showModal();
};
$('#form').onsubmit = safe(async e => {
  e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
  ['age', 'dutyHour'].forEach(k => d[k] = d[k] === '' ? null : +d[k]);
  d.salary = d.salary === '' ? 0 : +d.salary;
  await api(editId ? '/staff/' + editId : '/staff', editId ? 'PUT' : 'POST', d); $('#dlg').close(); toast('Staff saved'); loadStaff();
});
window.setStatus = safe(async (id, status) => {
  const s = staff.find(x => x._id === id);
  if (status === 'archived' && !confirm(`Remove ${s.name} from active staff? You can restore them later.`)) return;
  await api('/staff/' + id, 'PUT', { status }); toast(status === 'active' ? 'Staff restored' : 'Staff archived'); loadStaff();
});

// ---- attendance + pay: one card per staff ----
$('#attMonth').value = today.slice(0, 7); $('#attMonth').onchange = () => loadAtt();
const shiftMonth = n => { const [Y, M] = $('#attMonth').value.split('-').map(Number), d = new Date(Y, M - 1 + n, 1); $('#attMonth').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; loadAtt(); };
$('#mPrev').onclick = () => shiftMonth(-1); $('#mNext').onclick = () => shiftMonth(1);
const FREE = 2, W = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
let offSet = new Set();
function card(r, i) {
  const m = $('#attMonth').value, [Y, M] = m.split('-').map(Number), first = new Date(Y, M - 1, 1).getDay(), carried = Math.max(0, r.avail - FREE);
  const join = String(r.joinDate || '').slice(0, 10);
  const days = Array.from({ length: r.days }, (_, k) => {
    const date = `${m}-${pad(k + 1)}`, o = offSet.has(r.id + date);
    const st = date < join ? 'pre' : date > today ? 'fut' : o ? 'off' : 'ok', lock = st === 'pre' || st === 'fut';
    const tip = { pre: 'Before joining', fut: 'Upcoming', off: 'Absent', ok: 'Present' }[st];
    return `<button class="day ${st} ${date === today ? 'today' : ''}" data-s="${r.id}" data-d="${date}" ${lock ? 'disabled' : ''} title="${tip}" aria-label="${esc(r.name)} — ${date}, ${tip}">${k + 1}</button>`;
  }).join('');
  const pd = r.paid
    ? `<span class="paid-chip">Paid · ${fmtD(r.paid.paidAt)} · ৳ ${money(r.paid.amount)}${r.paid.amount !== r.net ? ' <em>(pay changed since)</em>' : ''}</span><button class="small" data-unpay="1">Undo</button>`
    : `<button class="btn sm" data-pay="1">Mark paid</button>`;
  return `<article class="att-card" data-i="${i}">
  <header><div class="nm"><b>${esc(r.name)}</b><div class="sub">${esc(r.role || 'No role')}</div></div><div class="np"><span>Net pay</span><b>৳ ${money(r.net)}</b></div></header>
  <div class="cal">${W.map((w, k) => `<i class="dow ${k === 5 ? 'wk' : ''}">${w}</i>`).join('')}${'<span></span>'.repeat(first)}${days}</div>
  <div class="leave">
    <div><b>${r.avail}</b><span>Leave available<small>${FREE} new${carried ? ` + ${carried} saved` : ''}</small></span></div>
    <div><b>${r.used}</b><span>Used</span></div>
    <div class="${r.unpaid ? 'bad' : 'ok'}"><b>${r.unpaid || r.carry}</b><span>${r.unpaid ? 'Unpaid days' : 'Saved for next month'}</span></div>
  </div>
  <dl class="pay">
    <div><dt>Monthly salary</dt><dd>৳ ${money(r.salary)}</dd></div>
    <div><dt>Per day</dt><dd>৳ ${r.daily.toFixed(0)}</dd></div>
    <div><dt>Deduction${r.pre ? `<small>${r.pre} day(s) before joining</small>` : ''}</dt><dd class="${r.deduction ? 'bad' : ''}">${r.deduction ? '−৳ ' + money(r.deduction) : '—'}</dd></div>
    <div><dt>Bonus</dt><dd><input class="n" type="number" min="0" value="${r.bonus}" aria-label="Bonus for ${esc(r.name)}"></dd></div>
    <div><dt>Advance</dt><dd><input class="n" type="number" min="0" value="${r.advance}" aria-label="Advance for ${esc(r.name)}"></dd></div>
  </dl>
  <footer><div class="pst">${pd}</div><button class="small" onclick="window.slip(${i})">Payslip</button></footer></article>`;
}
const monthName = m => new Date(m + '-01T00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const payDate = m => { const [Y, M] = m.split('-').map(Number); return fmtD(new Date(Y, M, 10)); };
const paySum = () => {
  const vis = payRows.filter(roleOk), t = k => vis.reduce((a, r) => a + (+r[k] || 0), 0), paid = vis.filter(r => r.paid), m = $('#attMonth').value;
  const paidAmt = paid.reduce((a, r) => a + r.paid.amount, 0), rem = vis.filter(r => !r.paid).reduce((a, r) => a + r.net, 0);
  $('#paySummary').innerHTML = [['s-blue', 'Net payable', '৳ ' + money(t('net')), 'Pay date ' + payDate(m)], ['s-green', 'Paid', '৳ ' + money(paidAmt), `${paid.length} of ${vis.length} staff`], ['s-amber', 'Remaining', '৳ ' + money(rem), rem ? 'Still to pay' : 'All settled'], ['s-red', 'Deductions', '৳ ' + money(t('deduction')), `Bonus ৳ ${money(t('bonus'))} · Advance ৳ ${money(t('advance'))}`]]
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
  $('#attGrid').innerHTML = payRows.map((r, i) => roleOk(r) ? card(r, i) : '').join('') || '<div class="panel empty" style="padding:2rem">আগে স্টাফ যোগ করুন।</div>';
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
      if (!await askConfirm('Mark as paid?', `Pay ৳ ${money(r.net)} to ${r.name} for ${monthName(m)}?`, 'Mark paid')) return;
      await api('/payment', 'POST', { staff: r.id, month: m }); toast('Marked as paid');
    } else {
      if (!await askConfirm('Undo payment?', `Remove the paid mark for ${r.name} (${monthName(m)})?`, 'Undo payment')) return;
      await api(`/payment?staff=${r.id}&month=${m}`, 'DELETE');
    }
    return refreshCard(el);
  }
  const c = e.target.closest('.day'); if (!c || c.disabled) return;
  const { s, d } = c.dataset, el = c.closest('.att-card'), r = payRows[+el.dataset.i];
  if (d < today) { // আগের তারিখ বদলাতে নিশ্চিতকরণ
    const label = new Date(d + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), absent = c.classList.contains('off');
    if (!await askConfirm('Edit a past date?', absent ? `${r.name} is marked ABSENT on ${label}. Change to present?${r.paid ? ' Salary is already marked paid!' : ''}` : `Mark ${r.name} ABSENT on ${label}? This will change this month's pay.${r.paid ? ' Salary is already marked paid!' : ''}`, absent ? 'Mark present' : 'Mark absent')) return;
  }
  const res = await api('/attendance', 'PUT', { staff: s, date: d }), k = s + d;
  res.off ? offSet.add(k) : offSet.delete(k);
  await refreshCard(el);
});
$('#payAll').onclick = safe(async () => {
  const m = $('#attMonth').value, todo = payRows.filter(r => roleOk(r) && !r.paid);
  if (!todo.length) return toast('Everyone is already paid');
  if (!await askConfirm('Mark all as paid?', `${todo.length} staff${roleSel === 'all' ? '' : ' (' + rLabel(todo[0].role) + ')'} · ৳ ${money(todo.reduce((a, r) => a + r.net, 0))} for ${monthName(m)}.`, 'Mark all paid')) return;
  await api('/payment/all', 'POST', { month: m, staff: todo.map(r => r.id) }); toast('All marked as paid'); loadAtt();
});
$('#attGrid').onchange = safe(async e => {
  if (!e.target.matches('input.n')) return;
  const el = e.target.closest('.att-card'), [b, a] = el.querySelectorAll('input.n');
  await api('/adjust', 'PUT', { staff: payRows[+el.dataset.i].id, month: $('#attMonth').value, bonus: b.value, advance: a.value });
  await refreshCard(el); toast('Saved');
});
$('#csvBtn').onclick = () => {
  if (!payRows.length) return toast('No payroll data to export');
  const rows = [['Staff ID', 'Name', 'Role', 'Monthly Salary', 'Days in Month', 'Daily Rate', 'Days Off', 'Unpaid Days', 'Carryover', 'Bonus', 'Advance', 'Net Pay'],
  ...payRows.filter(roleOk).map(r => [r.staffId, r.name, r.role || '', r.salary, r.days, r.daily.toFixed(2), r.used, r.unpaid, r.carry, r.bonus, r.advance, r.net])];
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `payroll-${$('#attMonth').value}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
window.slip = i => {
  const r = payRows[i], m = $('#attMonth').value, w = window.open('', '_blank');
  if (!w) return toast('Allow pop-ups to print payslips');
  const line = (k, v, c = '') => `<tr><td>${k}</td><td style="text-align:right" class="${c}">${v}</td></tr>`;
  w.document.write(`<!doctype html><html lang="bn"><head><meta charset="utf-8">
<title>Payslip - ${esc(r.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  body{font:15px 'Noto Sans Bengali', sans-serif;max-width:520px;margin:2rem auto;padding:0 1rem;color:#111827;}
  h1{margin:0 0 1rem 0;font-size:1.5rem;}
  table{width:100%;border-collapse:collapse;margin-top:1rem}
  td{padding:.6rem 0;border-bottom:1px solid #e5e7eb}
  .t td{font-weight:700;font-size:1.1rem;border-top:2px solid #111827;border-bottom:0;padding-top:1rem;}
</style></head><body>
<h1>Payslip</h1>
<p><b>${esc(r.name)}</b> &middot; ${esc(r.role || '')}<br>Month: ${esc(m)} (${r.days} days)</p>
<table>
${line('Monthly salary', money(r.salary))}
${line('Daily rate', r.daily.toFixed(2))}
${line('Days off', r.used)}
${line('Free days left', r.avail)}
${line('Unpaid days', r.unpaid)}
${line('Deduction', '-' + money(r.deduction))}
${line('Bonus', '+' + money(r.bonus))}
${line('Advance', '-' + money(r.advance))}
</table>
<table class="t">${line('Net pay', '৳ ' + money(r.net))}</table>
<p style="margin-top:2rem;font-size:0.9rem;color:#6b7280">Leave carried to next month: ${r.carry} days</p>
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