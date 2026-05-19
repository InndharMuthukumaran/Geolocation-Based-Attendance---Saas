import express from 'express';
import AttendanceSubmission from '../models/AttendanceSubmission.js';
import AttendanceLog from '../models/AttendanceLog.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Forward daily attendance to the Manager's boss
router.post('/', [authRequired, requireRole('MANAGER', 'SUB_MANAGER')], async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).json({ message: 'Date required' });
    
    // A Manager can only submit if they have someone they report to
    if (!req.user.reportsTo) {
      return res.status(400).json({ message: 'No superior assigned to report to.' });
    }

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const submission = await AttendanceSubmission.findOneAndUpdate(
      { submittedBy: req.user.id, date: targetDate },
      {
        status: 'SUBMITTED',
        submittedTo: req.user.reportsTo,
        adminId: req.user.adminId,
        submittedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // LOCK THE LOGS for this manager's team
    await AttendanceLog.updateMany(
      { reportsTo: req.user.id, date: targetDate },
      { $set: { isLocked: true } }
    );

    res.json(submission);
  } catch (err) {
    console.error('Submission error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get submissions that subordinates have sent to YOU
router.get('/incoming', [authRequired, requireRole('ADMIN', 'MANAGER', 'SUB_MANAGER')], async (req, res) => {
  try {
    const submissions = await AttendanceSubmission.find({ submittedTo: req.user.id })
      .populate('submittedBy', 'name email jobTitle')
      .sort({ date: -1 });
    res.json(submissions);
  } catch (err) {
    console.error('Fetch incoming submissions error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Check status of my own submissions
router.get('/me', [authRequired, requireRole('MANAGER', 'SUB_MANAGER')], async (req, res) => {
  try {
    const submissions = await AttendanceSubmission.find({ submittedBy: req.user.id })
      .populate('submittedTo', 'name email jobTitle')
      .sort({ date: -1 });
    res.json(submissions);
  } catch (err) {
    console.error('Fetch my submissions error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
