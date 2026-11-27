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
    const d = await api('/dashboard'), hr = new Date().getHours(), hi = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    const present = d.total - d.off.length, pct = d.total ? Math.round(present / d.total * 100) : 0, bal = d.topBalance.filter(r => r.carry);
    $('#dash').innerHTML = `<div class="head"><div class="title-block"><h2>${hi}</h2><p class="page-caption">Here is how your team looks today.</p></div><span class="date-chip">${new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
    <div class="stats">
      <div class="stat s-blue"><span>Active staff</span><b>${d.total}</b><span class="sub">on your team</span></div>
      <div class="stat s-green"><span>Present today</span><b>${present}</b><div class="bar"><i style="width:${pct}%"></i></div><span class="sub">${pct}% of the team</span></div>
      <div class="stat s-red"><span>Absent today</span><b>${d.off.length}</b><span class="sub">${d.off.length ? 'marked absent' : 'full attendance'}</span></div>
      <div class="stat s-amber"><span>Payroll this month</span><b>৳ ${money(d.payroll)}</b><span class="sub">Base salary ৳ ${money(d.monthlyBase)}</span></div>
    </div>
    <div class="qa"><button class="btn" onclick="show('att')">Mark attendance</button><button class="btn ghost" onclick="show('staff');openForm()">Add staff</button></div>
    <div class="two">
      <div class="panel"><h3>Absent today</h3><ul>${d.off.map(s => `<li><span class="dotname"><i class="dot bad"></i>${esc(s.name)}</span><span class="sub">${esc(s.role || '')}</span></li>`).join('') || '<li class="empty">Everyone is present today.</li>'}</ul></div>
      <div class="panel"><h3>Saved leave</h3><ul>${bal.map(r => `<li><span class="dotname"><i class="dot ok"></i>${esc(r.name)}</span><span class="pill">${r.carry} ${r.carry === 1 ? 'day' : 'days'}</span></li>`).join('') || '<li class="empty">No saved leave yet.</li>'}</ul></div>
    </div>
    <div class="mobile-out"><button class="btn ghost" onclick="window.$('#pwDlg').showModal()">Change Password</button> <button class="btn ghost" onclick="window.logout()">Sign Out</button></div>`;
  } catch (e) {
    $('#dash').innerHTML = `<div class="panel"><h3>Dashboard unavailable</h3><p class="bad">${esc(e.message)}</p><button class="btn" onclick="window.loadDash()">Try again</button></div>`;
  }
};

// ---- staff ----
const loadStaff = safe(async () => { staff = await api('/staff?status=active'); renderStaff(); });
const fmtD = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
function renderStaff() {
  const q = $('#q').value.toLowerCase(), list = staff.filter(s => `${s.name} ${s.staffId} ${s.role || ''}`.toLowerCase().includes(q));
  $('#staffGrid').innerHTML = list.map(s => `<article class="st-card" data-id="${s._id}" tabindex="0" role="button" aria-label="Open ${esc(s.name)}">
    <header><div class="nm"><h3>${esc(s.name)}</h3><div class="sub">${s.age ? esc(s.age) + ' yrs · ' : ''}${esc(s.role || 'No role')}</div></div><span class="chev">›</span></header>
    <div class="meta"><div><span>Salary</span><b>৳ ${money(s.salary)}</b></div><div><span>Duty</span><b>${s.dutyHour ? esc(s.dutyHour) + ' hrs' : '-'}</b></div><div><span>Joined</span><b>${fmtD(s.joinDate)}</b></div></div></article>`).join('')
    || `<div class="panel empty" style="padding:2rem;text-align:center">${staff.length ? 'No match found.' : 'No staff yet. Add the first staff member.'}</div>`;
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
const askConfirm = (title, text, yes) => new Promise(res => {
  const d = $('#cfDlg'); $('#cfTitle').textContent = title; $('#cfText').textContent = text; $('#cfYes').textContent = yes;
  const done = v => { d.onclose = null; d.close(); res(v); };
  $('#cfYes').onclick = () => done(true); $('#cfNo').onclick = () => done(false); d.onclose = () => res(false);
  d.showModal();
});
$('#attGrid').onclick = safe(async e => {
  const c = e.target.closest('.day'); if (!c || c.disabled) return;
  const { s, d } = c.dataset, el = c.closest('.att-card'), r = payRows[+el.dataset.i];
  if (d < today) { // আগের তারিখ বদলাতে নিশ্চিতকরণ
    const label = new Date(d + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), absent = c.classList.contains('off');
    if (!await askConfirm('Edit a past date?', absent ? `${r.name} is marked ABSENT on ${label}. Change to present?` : `Mark ${r.name} ABSENT on ${label}? This will change this month's pay.`, absent ? 'Mark present' : 'Mark absent')) return;
  }
  const res = await api('/attendance', 'PUT', { staff: s, date: d }), k = s + d;
  res.off ? offSet.add(k) : offSet.delete(k);
  await refreshCard(el);
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