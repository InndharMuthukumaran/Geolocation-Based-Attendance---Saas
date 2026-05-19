import mongoose from 'mongoose';

const attendanceSubmissionSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, index: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    submittedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['PENDING', 'SUBMITTED'], default: 'PENDING' },
    submittedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model('AttendanceSubmission', attendanceSubmissionSchema);
