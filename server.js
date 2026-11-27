const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const { Admin, Staff, Attendance, Adjust, Payment } = require('./schema');

const app = express();
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.static('public'));

app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।' }
}));

// Error wrapper
const wrap = f => (q, s) => f(q, s).catch(e => s.status(400).json({ error: e.code === 11000 ? 'এটি আগে থেকেই আছে' : e.message }));

// ---------- PAYROLL LOGIC ----------
const FREE_OFF = 2; // প্রতি মাসে ২টি ফ্রি ছুটি

async function calculatePayroll(ym) {
  const [Y, M] = ym.split('-').map(Number), days = new Date(Y, M, 0).getDate();
  const staff = await Staff.find({ status: 'active' }).sort('name');
  const offs = await Attendance.find({ date: { $lte: ym + '-31' } });
  const adj = await Adjust.find({ month: ym });
  const count = {};
  offs.forEach(o => { const c = count[o.staff] ||= {}, k = o.date.slice(0, 7); c[k] = (c[k] || 0) + 1; });

  return staff.map(s => {
    const j = new Date(s.joinDate), mine = count[s._id] || {};
    let y = j.getUTCFullYear(), m = j.getUTCMonth() + 1, carry = 0, r = null;
    while (y < Y || (y === Y && m <= M)) {
      const avail = carry + FREE_OFF, used = mine[`${y}-${String(m).padStart(2, '0')}`] || 0;
      r = { avail, used, unpaid: Math.max(0, used - avail), carry: Math.max(0, avail - used) };
      carry = r.carry; if (++m > 12) { m = 1; y++; }
    }
    const a = adj.find(x => String(x.staff) === String(s._id)) || {}, daily = s.salary / days;
    const inMonth = r !== null; // এই মাসে স্টাফ যোগ দিয়েছিল কি না
    r = r || { avail: 0, used: 0, unpaid: 0, carry: 0 };
    const pre = (j.getUTCFullYear() === Y && j.getUTCMonth() + 1 === M) ? j.getUTCDate() - 1 : 0; // যোগদানের আগের দিন
    const base = r.avail ? Math.round(daily * Math.max(0, days - pre - r.unpaid)) : 0;
    return {
      id: s._id, staffId: s.staffId, name: s.name, role: s.role, salary: s.salary, joinDate: s.joinDate, inMonth, pre, days, daily, ...r,
      deduction: r.avail ? Math.round(daily * (r.unpaid + pre)) : 0, base, bonus: a.bonus || 0, advance: a.advance || 0,
      net: base + (a.bonus || 0) - (a.advance || 0)
    };
  });
}

// ---------- ROUTES ----------
app.post('/api/auth/login', wrap(async (q, s) => {
  const a = await Admin.findOne({ username: q.body.username });
  if (!a || !await bcrypt.compare(q.body.password || '', a.password)) return s.status(401).json({ error: 'ইউজারনেম বা পাসওয়ার্ড ভুল' });
  s.json({ token: jwt.sign({ id: a._id }, SECRET, { expiresIn: '12h' }), username: a.username });
}));

// Auth Middleware for all routes below
app.use('/api', (q, s, n) => {
  try { q.admin = jwt.verify((q.headers.authorization || '').replace('Bearer ', ''), SECRET); n(); }
  catch { s.status(401).json({ error: 'আবার সাইন ইন করুন' }); }
});

app.post('/api/auth/password', wrap(async (q, s) => {
  const a = await Admin.findById(q.admin.id), { current, next } = q.body;
  if (!await bcrypt.compare(current || '', a.password)) return s.status(400).json({ error: 'বর্তমান পাসওয়ার্ড ভুল' });
  if (!next || next.length < 6) return s.status(400).json({ error: 'নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে' });
  a.password = await bcrypt.hash(next, 10); await a.save(); s.json({ ok: true });
}));

app.get('/api/staff', wrap(async (q, s) => s.json(await Staff.find(q.query.status ? { status: q.query.status } : {}).sort('name'))));

app.post('/api/staff', wrap(async (q, s) => {
  for (let i = 0; i < 5; i++) {
    try { return s.json(await Staff.create(q.body)); }
    catch (e) {
      if (e.code === 11000 && /staffId/.test(e.message)) { delete q.body.staffId; continue; }
      throw e;
    }
  }
  throw new Error('স্টাফ আইডি তৈরি করা যায়নি');
}));

app.put('/api/staff/:id', wrap(async (q, s) => {
  delete q.body.staffId;
  s.json(await Staff.findByIdAndUpdate(q.params.id, q.body, { new: true, runValidators: true }));
}));

app.delete('/api/staff/:id', wrap(async (q, s) => {
  if (q.query.hard) {
    await Staff.findByIdAndDelete(q.params.id);
    await Attendance.deleteMany({ staff: q.params.id });
    await Adjust.deleteMany({ staff: q.params.id });
  } else {
    await Staff.findByIdAndUpdate(q.params.id, { status: 'archived' });
  }
  s.json({ ok: true });
}));

app.get('/api/attendance', wrap(async (q, s) => {
  const m = (q.query.month || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Regex escape
  s.json(await Attendance.find({ date: new RegExp('^' + m) }));
}));

app.put('/api/attendance', wrap(async (q, s) => {
  const { staff, date } = q.body, st = await Staff.findById(staff);
  if (!st) throw new Error('স্টাফ পাওয়া যায়নি');
  const todayStr = new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10); // Bangladesh time (UTC+6)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('তারিখ সঠিক নয়');
  if (date > todayStr) throw new Error('ভবিষ্যতের তারিখে ছুটি দেওয়া যাবে না');
  if (date < st.joinDate.toISOString().slice(0, 10)) throw new Error('যোগদানের আগের তারিখে ছুটি দেওয়া যাবে না');
  const ex = await Attendance.findOneAndDelete({ staff, date });
  if (!ex) await Attendance.create({ staff, date });
  s.json({ off: !ex });
}));

const bdNow = () => new Date(Date.now() + 6 * 3600e3); // Bangladesh time (UTC+6)
const validYm = m => /^\d{4}-\d{2}$/.test(m || '');
const withPaid = async ym => {
  const [rows, pays] = await Promise.all([calculatePayroll(ym), Payment.find({ month: ym })]);
  const by = Object.fromEntries(pays.map(p => [String(p.staff), p]));
  return rows.map(r => { const p = by[String(r.id)]; return { ...r, paid: p ? { amount: p.amount, paidAt: p.paidAt } : null }; });
};
app.get('/api/payroll', wrap(async (q, s) => {
  if (!validYm(q.query.month)) throw new Error('মাস সঠিক নয়');
  s.json(await withPaid(q.query.month));
}));

// ---- salary payments (monthly record) ----
const checkPayMonth = m => {
  if (!validYm(m)) throw new Error('মাস সঠিক নয়');
  if (m > bdNow().toISOString().slice(0, 7)) throw new Error('ভবিষ্যতের মাসের বেতন দেওয়া যাবে না');
};
app.post('/api/payment', wrap(async (q, s) => {
  const { staff, month } = q.body; checkPayMonth(month);
  const row = (await calculatePayroll(month)).find(r => String(r.id) === String(staff));
  if (!row || !row.inMonth) throw new Error('এই মাসে বেতন প্রযোজ্য নয়');
  const p = await Payment.findOneAndUpdate({ staff, month }, { amount: row.net, paidAt: new Date() }, { upsert: true, new: true });
  s.json({ amount: p.amount, paidAt: p.paidAt });
}));
app.post('/api/payment/all', wrap(async (q, s) => {
  const { month } = q.body; checkPayMonth(month);
  const ids = Array.isArray(q.body.staff) ? q.body.staff.map(String) : null;
  const rows = (await withPaid(month)).filter(r => r.inMonth && !r.paid && (!ids || ids.includes(String(r.id))));
  if (rows.length) await Payment.insertMany(rows.map(r => ({ staff: r.id, month, amount: r.net })));
  s.json({ count: rows.length });
}));
app.delete('/api/payment', wrap(async (q, s) => {
  await Payment.deleteOne({ staff: q.query.staff, month: q.query.month });
  s.json({ ok: true });
}));

app.put('/api/adjust', wrap(async (q, s) => {
  const { staff, month, bonus, advance } = q.body;
  s.json(await Adjust.findOneAndUpdate({ staff, month }, { bonus: +bonus || 0, advance: +advance || 0 }, { upsert: true, new: true }));
}));

app.get('/api/dashboard', wrap(async (q, s) => {
  const now = bdNow(), today = now.toISOString().slice(0, 10), ym = today.slice(0, 7);
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const staff = await Staff.find({ status: 'active' });
  const offToday = await Attendance.find({ date: today }).populate('staff', 'name role status');
  const pay = await calculatePayroll(ym);
  const prevRows = (await withPaid(prev)).filter(r => r.inMonth);

  s.json({
    total: staff.length,
    off: offToday.filter(o => o.staff?.status === 'active').map(o => o.staff),
    payroll: pay.reduce((a, r) => a + r.net, 0),
    monthlyBase: staff.reduce((a, r) => a + r.salary, 0),
    topBalance: pay.sort((a, b) => b.carry - a.carry).slice(0, 5),
    // আগের মাসের বেতন (চলতি মাসের ১০ তারিখে দেওয়া হয়)
    due: {
      month: prev, dueDate: ym + '-10', count: prevRows.length,
      total: prevRows.reduce((a, r) => a + r.net, 0),
      paidCount: prevRows.filter(r => r.paid).length,
      paidAmount: prevRows.reduce((a, r) => a + (r.paid ? r.paid.amount : 0), 0)
    }
  });
}));

// ---------- DB CONNECTION & START ----------
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/staffpro')
  .then(async () => {
    if (!await Admin.countDocuments()) {
      await Admin.create({
        username: process.env.ADMIN_USER || 'admin',
        password: await bcrypt.hash(process.env.ADMIN_PASS || 'admin123', 10)
      });
    }
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`Server : ${port}`));
  })
  .catch(e => {
    console.error('MongoDB কানেকশন সমস্যা:', e.message);
    process.exit(1);
  });