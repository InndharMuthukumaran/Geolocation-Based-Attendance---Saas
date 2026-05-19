import mongoose from 'mongoose';

const geofenceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    center: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    radiusMeters: { type: Number, required: true },
    active: { type: Boolean, default: true },
    isAttendanceEnabled: { type: Boolean, default: true },
    holidays: [{ type: String }], // Array of YYYY-MM-DD
    isAutoCheckoutEnabled: { type: Boolean, default: true },
    safeWindows: [{
      start: { type: String }, // HH:mm
      end: { type: String }    // HH:mm
    }],
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

export default mongoose.model('Geofence', geofenceSchema);

