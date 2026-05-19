import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema(
  {
    lat: Number,
    lng: Number,
  },
  { _id: false }
);

const attendanceLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    reportsTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    date: { type: Date, index: true }, // normalized to start-of-day
    checkInTime: { type: Date },
    checkInLocation: { type: locationSchema },
    checkOutTime: { type: Date },
    checkOutLocation: { type: locationSchema },
    checkOutType: {
      type: String,
      enum: ['MANUAL', 'AUTOMATIC', 'SYSTEM_FORCED'],
      default: 'MANUAL',
    },
    isOutlier: { type: Boolean, default: false },
    outlierDistance: { type: Number, default: null },
    status: {
      type: String,
      enum: ['PRESENT', 'ABSENT', 'HALF_DAY', 'UNKNOWN'],
      default: 'PRESENT',
    },
    isLocked: { type: Boolean, default: false },
    deviceId: { type: String },
  },
  { timestamps: true }
);

attendanceLogSchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.model('AttendanceLog', attendanceLogSchema);

