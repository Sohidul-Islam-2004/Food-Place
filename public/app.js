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
$('#pwForm').onsubmit = safe(async e => { e.preventDefault(); await api('/auth/password', 'POST', Object.fromEntries(new FormData(e.target))); $('#pwDlg').close(); e.target.reset(); toast('পাসওয়ার্ড আপডেট হয়েছে'); });
$$('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());

// ---- tabs ----
function show(tab) {
  $$('aside nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  ['dash', 'staff', 'att', 'pay'].forEach(id => $('#' + id).hidden = id !== tab);
  ({ dash: loadDash, staff: loadStaff, att: loadAtt, pay: loadPay })[tab]();
}
$$('aside nav button').forEach(b => b.onclick = () => show(b.dataset.tab));

// ---- dashboard ----
const loadDash = async () => {
  try {
    const d = await api('/dashboard');
    $('#dash').innerHTML = `<div class="head"><h2>ড্যাশবোর্ড</h2><span class="sub">${new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
    <div class="stats">
      <div class="stat"><span>সক্রিয় স্টাফ</span><b>${d.total}</b></div>
      <div class="stat"><span>আজ উপস্থিত</span><b>${d.total - d.off.length}</b></div>
      <div class="stat"><span>আজ ছুটিতে</span><b>${d.off.length}</b></div>
      <div class="stat"><span>এ মাসের বেতন</span><b>৳ ${money(d.payroll)}</b><span class="sub">মূল বেতন ৳ ${money(d.monthlyBase)}</span></div>
    </div>
    <div class="two">
      <div class="panel"><h3>আজ ছুটিতে</h3><ul>${d.off.map(s => `<li>${esc(s.name)} <span class="sub">${esc(s.role || '')}</span></li>`).join('') || '<li class="empty">আজ সবাই উপস্থিত।</li>'}</ul></div>
      <div class="panel"><h3>সবচেয়ে বেশি সঞ্চিত ছুটি</h3><ul>${d.topBalance.filter(r => r.carry).map(r => `<li>${esc(r.name)} <span class="pill">${r.carry} দিন সঞ্চিত</span></li>`).join('') || '<li class="empty">এখনো কোনো ছুটি সঞ্চিত নেই।</li>'}</ul></div>
    </div>
    <div class="mobile-out"><button class="btn ghost" onclick="window.$('#pwDlg').showModal()">পাসওয়ার্ড পরিবর্তন</button> <button class="btn ghost" onclick="window.logout()">সাইন আউট</button></div>`;
  } catch (e) {
    $('#dash').innerHTML = `<div class="panel"><h3>ড্যাশবোর্ড লোড করা যায়নি</h3><p class="bad">${esc(e.message)}</p><button class="btn" onclick="window.loadDash()">আবার চেষ্টা করুন</button></div>`;
  }
};

// ---- staff ----
const loadStaff = safe(async () => { staff = await api('/staff?status=' + $('#stFilter').value); renderStaff(); });
function renderStaff() {
  const q = $('#q').value.toLowerCase(), arch = $('#stFilter').value === 'archived';
  const list = staff.filter(s => `${s.name} ${s.staffId} ${s.role || ''}`.toLowerCase().includes(q));
  $('#staffTable').innerHTML = `<thead><tr><th>Staff</th><th>Contact</th><th>Duty</th><th>Salary (৳)</th><th>Join Date</th><th></th></tr></thead><tbody>` +
    (list.map(s => `<tr>
      <td><div class="who"><span class="av">${esc(s.name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase())}</span><div><b>${esc(s.name)}${s.age ? ', ' + esc(s.age) : ''}</b><div class="sub">${esc(s.staffId)} &middot; ${esc(s.role || 'No role')}</div></div></div></td>
      <td>${s.phonePersonal ? `<a href="tel:${esc(s.phonePersonal)}">${esc(s.phonePersonal)}</a>` : '-'}<div class="sub">Family: ${s.phoneFamily ? `<a href="tel:${esc(s.phoneFamily)}">${esc(s.phoneFamily)}</a>` : '-'}</div></td>
      <td>${esc(s.dutyHour || '-')} hrs/day</td><td>${money(s.salary)}</td><td>${new Date(s.joinDate).toLocaleDateString('en-GB')}</td>
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
  await api(editId ? '/staff/' + editId : '/staff', editId ? 'PUT' : 'POST', d); $('#dlg').close(); toast('স্টাফ সেভ হয়েছে'); loadStaff();
});
window.setStatus = safe(async (id, status) => {
  const s = staff.find(x => x._id === id);
  if (status === 'archived' && !confirm(`${s.name}-কে সক্রিয় স্টাফ থেকে সরাতে চান? আপনি পরে পুনরুদ্ধার করতে পারবেন।`)) return;
  await api('/staff/' + id, 'PUT', { status }); toast(status === 'active' ? 'পুনরুদ্ধার করা হয়েছে' : 'সরানো হয়েছে'); loadStaff();
});
window.hardDelete = safe(async id => {
  if (!confirm('এই ব্যক্তি এবং তাদের সব হাজিরা স্থায়ীভাবে মুছে ফেলতে চান? এটি ফিরিয়ে আনা সম্ভব নয়।')) return;
  await api('/staff/' + id + '?hard=1', 'DELETE'); toast('মুছে ফেলা হয়েছে'); loadStaff();
});

// ---- attendance grid ----
$('#attMonth').value = today.slice(0, 7); $('#attMonth').onchange = () => loadAtt();
const loadAtt = safe(async () => {
  const m = $('#attMonth').value; if (!m) return;
  const [Y, M] = m.split('-').map(Number), days = new Date(Y, M, 0).getDate();
  $('#attTable').style.setProperty('--att-days', days);
  const [list, recs] = await Promise.all([api('/staff?status=active'), api('/attendance?month=' + m)]);
  const off = new Set(recs.map(r => r.staff + r.date));
  $('#attTable').innerHTML = `<thead><tr><th>স্টাফ</th>${Array.from({ length: days }, (_, i) => `<th>${i + 1}</th>`).join('')}<th>ছুটি</th></tr></thead><tbody>` +
    (list.map(s => `<tr><td><b>${esc(s.name)}</b></td>${Array.from({ length: days }, (_, i) => {
      const date = `${m}-${String(i + 1).padStart(2, '0')}`, o = off.has(s._id + date);
      return `<td><button class="cell ${o ? 'off' : ''} ${date === today ? 'today' : ''}" data-s="${s._id}" data-d="${date}">${o ? 'O' : ''}</button></td>`;
    }).join('')}<td class="cnt">${recs.filter(r => r.staff === s._id).length}</td></tr>`).join('') || '<tr><td class="empty" style="padding:2rem">আগে স্টাফ যোগ করুন।</td></tr>') + '</tbody>';
});
$('#attTable').onclick = safe(async e => {
  const c = e.target.closest('.cell'); if (!c) return;
  const r = await api('/attendance', 'PUT', { staff: c.dataset.s, date: c.dataset.d });
  c.classList.toggle('off', r.off); c.textContent = r.off ? 'O' : '';
  const row = c.closest('tr'); row.querySelector('.cnt').textContent = row.querySelectorAll('.cell.off').length;
});

// ---- payroll ----
$('#payMonth').value = today.slice(0, 7); $('#payMonth').onchange = () => loadPay();
const loadPay = safe(async () => {
  const m = $('#payMonth').value; if (!m) return;
  payRows = await api('/payroll?month=' + m);
  $('#payTable').innerHTML = `<thead><tr><th>স্টাফ</th><th>পদবি</th><th>বেতন (৳)</th><th>দৈনিক</th><th>ছুটি</th><th>ফ্রি</th><th>অবৈতনিক</th><th>সঞ্চিত</th><th>বোনাস</th><th>অগ্রিম</th><th>নীট বেতন</th><th></th></tr></thead><tbody>` +
    payRows.map((r, i) => `<tr><td><b>${esc(r.name)}</b><div class="sub">${esc(r.staffId)}</div></td><td>${esc(r.role || '-')}</td><td>${money(r.salary)}</td><td>${r.daily.toFixed(2)}</td><td>${r.used}</td><td>${r.avail}</td>
      <td class="${r.unpaid ? 'bad' : ''}">${r.unpaid}</td><td>${r.carry}</td>
      <td><input class="n" type="number" min="0" value="${r.bonus}" data-i="${i}" data-k="bonus"></td><td><input class="n" type="number" min="0" value="${r.advance}" data-i="${i}" data-k="advance"></td>
      <td class="net" id="net${i}">${money(r.net)}</td><td><button class="small" onclick="window.slip(${i})">স্লিপ</button></td></tr>`).join('') +
    `</tbody><tfoot><tr><td colspan="10"><b>মোট প্রদেয়</b></td><td class="net" id="total" colspan="2">৳ ${money(payRows.reduce((a, r) => a + r.net, 0))}</td></tr></tfoot>`;
});
$('#payTable').onchange = safe(async e => {
  const i = e.target.dataset.i; if (i === undefined) return;
  const r = payRows[i], row = e.target.closest('tr'), [b, a] = row.querySelectorAll('input.n');
  const res = await api('/adjust', 'PUT', { staff: r.id, month: $('#payMonth').value, bonus: b.value, advance: a.value });
  r.bonus = +b.value || 0;
  r.advance = +a.value || 0;
  r.net = typeof res.net === 'number' ? res.net : r.salary - (r.deduction || 0) + r.bonus - r.advance;
  $('#net' + i).textContent = money(r.net);
  $('#total').textContent = '৳ ' + money(payRows.reduce((s, x) => s + x.net, 0));
  toast('সেভ হয়েছে');
});
$('#csvBtn').onclick = () => {
  if (!payRows.length) return toast('এক্সপোর্ট করার মতো কিছু নেই');
  const rows = [['আইডি', 'নাম', 'পদবি', 'বেতন', 'দিন', 'দৈনিক', 'নেওয়া ছুটি', 'অবৈতনিক', 'সঞ্চিত', 'বোনাস', 'অগ্রিম', 'নীট বেতন'],
  ...payRows.map(r => [r.staffId, r.name, r.role || '', r.salary, r.days, r.daily.toFixed(2), r.used, r.unpaid, r.carry, r.bonus, r.advance, r.net])];
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `payroll-${$('#payMonth').value}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
window.slip = i => {
  const r = payRows[i], m = $('#payMonth').value, w = window.open('', '_blank');
  if (!w) return toast('স্লিপ প্রিন্ট করতে পপ-আপ চালু করুন');
  const line = (k, v, c = '') => `<tr><td>${k}</td><td style="text-align:right" class="${c}">${v}</td></tr>`;
  w.document.write(`<!doctype html><html lang="bn"><head><meta charset="utf-8">
<title>বেতন স্লিপ - ${esc(r.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  body{font:15px 'Noto Sans Bengali', sans-serif;max-width:520px;margin:2rem auto;padding:0 1rem;color:#111827;}
  h1{margin:0 0 1rem 0;font-size:1.5rem;}
  table{width:100%;border-collapse:collapse;margin-top:1rem}
  td{padding:.6rem 0;border-bottom:1px solid #e5e7eb}
  .t td{font-weight:700;font-size:1.1rem;border-top:2px solid #111827;border-bottom:0;padding-top:1rem;}
</style></head><body>
<h1>বেতন স্লিপ</h1>
<p><b>${esc(r.name)}</b> &middot; ${esc(r.staffId)} &middot; ${esc(r.role || '')}<br>মাস: ${esc(m)} (${r.days} দিন)</p>
<table>
${line('মাসিক বেতন', money(r.salary))}
${line('দৈনিক বেতন', r.daily.toFixed(2))}
${line('নেওয়া ছুটি', r.used)}
${line('ফ্রি ছুটি বাকি', r.avail)}
${line('অবৈতনিক ছুটি', r.unpaid)}
${line('কাটতি', '-' + money(r.deduction))}
${line('বোনাস', '+' + money(r.bonus))}
${line('নেওয়া অগ্রিম', '-' + money(r.advance))}
</table>
<table class="t">${line('নীট বেতন', '৳ ' + money(r.net))}</table>
<p style="margin-top:2rem;font-size:0.9rem;color:#6b7280">পরবর্তী মাসে বহন করা সঞ্চিত ছুটি: ${r.carry} দিন</p>
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