const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const pad = n => String(n).padStart(2, '0');
const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = localDate(new Date());
let staff = [], editId = null, payRows = [];

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
const loadDash = async () => {
  try {
    const d = await api('/dashboard');
    $('#dash').innerHTML = `<div class="head"><div class="title-block"><h2>Dashboard</h2><p class="page-caption">Your team at a glance.</p></div><span class="date-chip">${new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
    <div class="stats">
      <div class="stat"><span>Active Staff</span><b>${d.total}</b></div>
      <div class="stat"><span>Present Today</span><b>${d.total - d.off.length}</b></div>
      <div class="stat"><span>Off Today</span><b>${d.off.length}</b></div>
      <div class="stat"><span>Monthly Payroll</span><b>৳ ${money(d.payroll)}</b><span class="sub">Base salary ৳ ${money(d.monthlyBase)}</span></div>
    </div>
    <div class="two">
      <div class="panel"><h3>Staff Off Today</h3><ul>${d.off.map(s => `<li>${esc(s.name)} <span class="sub">${esc(s.role || '')}</span></li>`).join('') || '<li class="empty">আজ সবাই উপস্থিত।</li>'}</ul></div>
      <div class="panel"><h3>Leave Balance</h3><ul>${d.topBalance.filter(r => r.carry).map(r => `<li>${esc(r.name)} <span class="pill">${r.carry} ${r.carry === 1 ? 'day' : 'days'}</span></li>`).join('') || '<li class="empty">এখনো কোনো ছুটি জমা নেই।</li>'}</ul></div>
    </div>
    <div class="mobile-out"><button class="btn ghost" onclick="window.$('#pwDlg').showModal()">Change Password</button> <button class="btn ghost" onclick="window.logout()">Sign Out</button></div>`;
  } catch (e) {
    $('#dash').innerHTML = `<div class="panel"><h3>Dashboard unavailable</h3><p class="bad">${esc(e.message)}</p><button class="btn" onclick="window.loadDash()">Try again</button></div>`;
  }
};

// ---- staff ----
const loadStaff = safe(async () => { staff = await api('/staff?status=' + $('#stFilter').value); renderStaff(); });
function renderStaff() {
  const q = $('#q').value.toLowerCase(), arch = $('#stFilter').value === 'archived';
  const list = staff.filter(s => `${s.name} ${s.staffId} ${s.role || ''}`.toLowerCase().includes(q));
  $('#staffTable').innerHTML = `<thead><tr><th>Staff</th><th>Contact</th><th>Duty</th><th>Salary (৳)</th><th>Join Date</th><th></th></tr></thead><tbody>` +
    (list.map(s => `<tr>
      <td><div class="who"><span class="av">${esc((s.name || "?").trim()[0])}</span><div><b>${esc(s.name)}${s.age ? ', ' + esc(s.age) : ''}</b><div class="sub">${esc(s.staffId)} &middot; ${esc(s.role || 'No role')}</div></div></div></td>
      <td><div>Personal: ${s.phonePersonal ? `<a href="tel:${esc(s.phonePersonal)}">${esc(s.phonePersonal)}</a>` : '-'}</div><div class="sub">Family: ${s.phoneFamily ? `<a href="tel:${esc(s.phoneFamily)}">${esc(s.phoneFamily)}</a>` : '-'}</div></td>
      <td>${esc(s.dutyHour || '-')} hrs/day</td><td>৳ ${money(s.salary)}</td><td>${new Date(s.joinDate).toLocaleDateString('en-GB')}</td>
      <td><button class="small" onclick="window.openForm('${s._id}')">Edit</button><button class="small" onclick="window.setStatus('${s._id}','${arch ? 'active' : 'archived'}')">${arch ? 'Restore' : 'Remove'}</button>${arch ? `<button class="small del" onclick="window.hardDelete('${s._id}')">Delete Permanently</button>` : ''}</td></tr>`).join('')
      || `<tr><td colspan="6" class="empty" style="padding:2rem;text-align:center">${arch ? 'No archived staff.' : 'No staff yet. Add the first staff member.'}</td></tr>`) + '</tbody>';
}
$('#q').oninput = renderStaff; $('#stFilter').onchange = loadStaff; $('#addBtn').onclick = () => openForm();
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
window.hardDelete = safe(async id => {
  if (!confirm('Permanently delete this staff member and all attendance records? This cannot be undone.')) return;
  await api('/staff/' + id + '?hard=1', 'DELETE'); toast('Staff deleted'); loadStaff();
});

// ---- attendance + pay: one card per staff ----
$('#attMonth').value = today.slice(0, 7); $('#attMonth').onchange = () => loadAtt();
const FREE = 2, W = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
let offSet = new Set();
function card(r, i) {
  const m = $('#attMonth').value, [Y, M] = m.split('-').map(Number), first = new Date(Y, M - 1, 1).getDay(), carried = Math.max(0, r.avail - FREE);
  const days = Array.from({ length: r.days }, (_, k) => {
    const date = `${m}-${pad(k + 1)}`, o = offSet.has(r.id + date);
    return `<button class="day ${(first + k) % 7 === 5 ? 'wk' : ''} ${o ? 'off' : ''} ${date === today ? 'today' : ''}" data-s="${r.id}" data-d="${date}" aria-label="${esc(r.name)} — ${date}, ${o ? 'off' : 'present'}">${k + 1}</button>`;
  }).join('');
  return `<article class="att-card" data-i="${i}">
  <header><span class="av">${esc((r.name || '?').trim()[0])}</span><div class="nm"><b>${esc(r.name)}</b><div class="sub">${esc(r.staffId)} · ${esc(r.role || 'No role')}</div></div><div class="np"><span>Net pay</span><b>৳ ${money(r.net)}</b></div></header>
  <div class="cal">${W.map((w, k) => `<i class="dow ${k === 5 ? 'wk' : ''}">${w}</i>`).join('')}${'<span></span>'.repeat(first)}${days}</div>
  <div class="leave">
    <div><b>${r.avail}</b><span>Leave available<small>${FREE} new${carried ? ` + ${carried} saved` : ''}</small></span></div>
    <div><b>${r.used}</b><span>Used</span></div>
    <div class="${r.unpaid ? 'bad' : 'ok'}"><b>${r.unpaid || r.carry}</b><span>${r.unpaid ? 'Unpaid days' : 'Saved for next month'}</span></div>
  </div>
  <dl class="pay">
    <div><dt>Monthly salary</dt><dd>৳ ${money(r.salary)}</dd></div>
    <div><dt>Per day</dt><dd>৳ ${r.daily.toFixed(0)}</dd></div>
    <div><dt>Deduction</dt><dd class="${r.deduction ? 'bad' : ''}">${r.deduction ? '−৳ ' + money(r.deduction) : '—'}</dd></div>
    <div><dt>Bonus</dt><dd><input class="n" type="number" min="0" value="${r.bonus}" aria-label="Bonus for ${esc(r.name)}"></dd></div>
    <div><dt>Advance</dt><dd><input class="n" type="number" min="0" value="${r.advance}" aria-label="Advance for ${esc(r.name)}"></dd></div>
  </dl>
  <footer><button class="small" onclick="window.slip(${i})">Payslip</button></footer></article>`;
}
const paySum = () => {
  const t = k => payRows.reduce((a, r) => a + (+r[k] || 0), 0);
  $('#paySummary').innerHTML = [['Net Payable', '৳ ' + money(t('net')), 'Base ৳ ' + money(t('base'))], ['Deductions', '৳ ' + money(t('deduction')), t('unpaid') + ' unpaid day(s)'], ['Bonus', '৳ ' + money(t('bonus')), ''], ['Advance', '৳ ' + money(t('advance')), 'Recovered this month']]
    .map(([a, b, c]) => `<div class="stat"><span>${a}</span><b>${b}</b><span class="sub">${c}</span></div>`).join('');
};
const loadAtt = safe(async () => {
  const m = $('#attMonth').value; if (!m) return;
  const [rows, recs] = await Promise.all([api('/payroll?month=' + m), api('/attendance?month=' + m)]);
  payRows = rows; offSet = new Set(recs.map(r => r.staff + r.date));
  $('#attGrid').innerHTML = rows.map(card).join('') || '<div class="panel empty" style="padding:2rem">আগে স্টাফ যোগ করুন।</div>';
  paySum();
});
const refreshCard = async el => {
  const i = +el.dataset.i; payRows = await api('/payroll?month=' + $('#attMonth').value);
  el.outerHTML = card(payRows[i], i); paySum();
};
$('#attGrid').onclick = safe(async e => {
  const c = e.target.closest('.day'); if (!c) return;
  const r = await api('/attendance', 'PUT', { staff: c.dataset.s, date: c.dataset.d }), k = c.dataset.s + c.dataset.d;
  r.off ? offSet.add(k) : offSet.delete(k);
  await refreshCard(c.closest('.att-card'));
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
  ...payRows.map(r => [r.staffId, r.name, r.role || '', r.salary, r.days, r.daily.toFixed(2), r.used, r.unpaid, r.carry, r.bonus, r.advance, r.net])];
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
<p><b>${esc(r.name)}</b> &middot; ${esc(r.staffId)} &middot; ${esc(r.role || '')}<br>Month: ${esc(m)} (${r.days} days)</p>
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