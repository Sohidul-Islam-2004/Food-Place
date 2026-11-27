const mongoose = require('mongoose');
const { Schema } = mongoose;

const Admin = mongoose.model('Admin', new Schema({
  username: { type: String, unique: true },
  password: String
}));

const staffSchema = new Schema({
  staffId: { type: String, unique: true },
  name: { type: String, required: true, trim: true },
  age: Number,
  role: String,
  dutyHour: Number,
  phonePersonal: String,
  phoneFamily: String,
  presentAddress: String,
  permanentAddress: String,
  salary: { type: Number, required: true, min: 0 },
  joinDate: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'archived'], default: 'active' }
}, { timestamps: true });

staffSchema.pre('validate', async function () {
  if (!this.staffId) {
    const last = await this.constructor
      .findOne({ staffId: /^EMP-\d+$/ })
      .collation({ locale: 'en', numericOrdering: true })
      .sort('-staffId')
      .select('staffId');
    const nextNum = last && last.staffId ? parseInt(last.staffId.slice(4), 10) + 1 : 1;
    this.staffId = 'EMP-' + String(nextNum).padStart(3, '0');
  }
});

const Staff = mongoose.model('Staff', staffSchema);

const attSchema = new Schema({
  staff: { type: Schema.Types.ObjectId, ref: 'Staff', required: true },
  date: { type: String, required: true },
  status: { type: String, enum: ['off'], default: 'off' }
});
attSchema.index({ staff: 1, date: 1 }, { unique: true });
const Attendance = mongoose.model('Attendance', attSchema);

const adjSchema = new Schema({
  staff: { type: Schema.Types.ObjectId, ref: 'Staff' },
  month: String,
  bonus: { type: Number, default: 0 },
  advance: { type: Number, default: 0 }
});
adjSchema.index({ staff: 1, month: 1 }, { unique: true });
const Adjust = mongoose.model('Adjust', adjSchema);

// মাসিক বেতন পরিশোধের রেকর্ড (পরিশোধের সময়ের পরিমাণ সংরক্ষিত থাকে)
const paySchema = new Schema({
  staff: { type: Schema.Types.ObjectId, ref: 'Staff', required: true },
  month: { type: String, required: true },
  amount: { type: Number, required: true },
  paidAt: { type: Date, default: Date.now }
});
paySchema.index({ staff: 1, month: 1 }, { unique: true });
const Payment = mongoose.model('Payment', paySchema);

module.exports = { Admin, Staff, Attendance, Adjust, Payment };