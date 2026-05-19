import express from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Geofence from '../models/Geofence.js';
import AttendanceLog from '../models/AttendanceLog.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { sendVerificationOnlyEmail, generateVerificationToken, sendPasswordResetEmail } from '../utils/mailer.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Helper to reliably resolve the top-level tenant owner
const getAdminId = (user) => user.role === 'ADMIN' ? user.id : user.adminId;

// ─── GEOFENCES ───
router.post('/geofences', [authRequired, requireRole('ADMIN', 'MANAGER', 'SUB_MANAGER')], async (req, res) => {
  try {
    const { name, center, radiusMeters, assignedTo } = req.body;
    if (!name || !center?.lat || !center?.lng || !radiusMeters) {
      return res.status(400).json({ message: 'Missing geofence fields' });
    }
    const adminId = getAdminId(req.user);
    const gf = await Geofence.create({
      name,
      center,
      radiusMeters,
      isAttendanceEnabled: req.body.isAttendanceEnabled !== undefined ? req.body.isAttendanceEnabled : true,
      holidays: req.body.holidays || [],
      isAutoCheckoutEnabled: req.body.isAutoCheckoutEnabled !== undefined ? req.body.isAutoCheckoutEnabled : true,
      safeWindows: req.body.safeWindows || [],
      adminId,
      createdBy: req.user.id,
      assignedTo: assignedTo || [],
    });
    res.json(gf);
  } catch (err) {
    console.error('create geofence error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/geofences', [authRequired, requireRole('ADMIN', 'MANAGER', 'SUB_MANAGER')], async (req, res) => {
  const gfs = await Geofence.find({ createdBy: req.user.id }).sort({ createdAt: -1 });
  res.json(gfs);
});

router.put('/geofences/:id', [authRequired, requireRole('ADMIN', 'MANAGER', 'SUB_MANAGER')], async (req, res) => {
  try {
    const gf = await Geofence.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.id },
      req.body,
      { new: true }
    );
    res.json(gf);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/geofences/:id', [authRequired, requireRole('ADMIN', 'MANAGER', 'SUB_MANAGER')], async (req, res) => {
  try {
    await Geofence.findOneAndDelete({ _id: req.params.id, createdBy: req.user.id });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── UNIFIED USER CREATION ───
const createSingleUser = async (email, name, jobTitle, role, creatorUser) => {
  const lowerEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: lowerEmail });
  if (existing) throw new Error(`Email ${lowerEmail} already exists`);

  const verificationToken = generateVerificationToken();
  const verificationExpiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days

  const dbRole = ['ADMIN', 'MANAGER', 'SUB_MANAGER', 'MEMBER'].includes(role) ? role : 'MEMBER';
  const defaultTitle = (dbRole === 'MANAGER' || dbRole === 'SUB_MANAGER') ? 'Manager' : 'Member';

  const user = await User.create({
    email: lowerEmail, name,
    jobTitle: jobTitle || defaultTitle,
    role: dbRole,
    passwordHash: 'pending_verification', // Placeholder, will be set on verification
    adminId: getAdminId(creatorUser),
    reportsTo: creatorUser.id,
    emailVerified: false,
    verificationToken,
    verificationExpiresAt,
  });

  console.log(`[VERIFICATION] Sent link to: ${email}. Verification expires in 15 days.`);
  // Send ONLY the verification link (fire-and-forget)
  sendVerificationOnlyEmail(email, name, dbRole, verificationToken, creatorUser.email)
    .catch(e => console.error('Verification email send failed:', e));

  return { id: user._id, email: user.email, name: user.name, role: dbRole };
};

router.post('/create-user', [authRequired, requireRole('ADMIN', 'MANAGER', 'SUB_MANAGER')], async (req, res) => {
  try {
    const { email, name, jobTitle, role } = req.body;
    if (!email || !name || !role) return res.status(400).json({ message: 'Name, email, and role are required' });
    if (!['MANAGER', 'SUB_MANAGER', 'MEMBER'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be MANAGER, SUB_MANAGER, or MEMBER.' });
    }
    const result = await createSingleUser(email, name, jobTitle, role, req.user);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: err.message || 'Server error' });
  }
});

// ─── CLEANUP EXPIRED UNVERIFIED USERS ───
router.post('/cleanup-expired', [authRequired, requireRole('ADMIN')], async (req, res) => {
  try {
    const result = await User.deleteMany({
      emailVerified: false,
      verificationExpiresAt: { $lt: new Date() }
    });
    res.json({ message: `Cleanup successful. Removed ${result.deletedCount} expired accounts.`, deletedCount: result.deletedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Cleanup failed' });
  }
});

// ─── BULK UPLOAD (Excel) ───
router.post('/bulk-upload', [authRequired, requireRole('ADMIN', 'MANAGER', 'SUB_MANAGER'), upload.single('file')], async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    if (rows.length === 0) return res.status(400).json({ message: 'Excel file is empty' });

    const results = { success: [], failed: [] };
    for (const row of rows) {
      const email = (row.Email || row.email || '').trim();
      const name = (row.Name || row.name || '').trim();
      const jobTitle = (row['Job Title'] || row.jobTitle || '').trim();
      const role = (row.Role || row.role || 'MEMBER').trim().toUpperCase();

      if (!email || !name) {
        results.failed.push({ email: email || '(empty)', reason: 'Missing name or email' });
        continue;
      }
      if (!['MANAGER', 'SUB_MANAGER', 'MEMBER'].includes(role)) {
        results.failed.push({ email, reason: `Invalid role: ${role}` });
        continue;
      }
      try {
        const created = await createSingleUser(email, name, jobTitle, role, req.user);
        results.success.push({ email: created.email, name: created.name, role: created.role });
      } catch (err) {
        results.failed.push({ email, reason: err.message });
      }
    }
    res.json(results);
  } catch (err) {
    console.error('Bulk upload error', err);
    res.status(500).json({ message: 'Server error processing file' });
  }
});

// Backward compatibility aliases
router.post('/employees', [authRequired, requireRole('ADMIN', 'MANAGER', 'SUB_MANAGER')], async (req, res) => {
  req.body.role = 'MEMBER';
  try {
    const result = await createSingleUser(req.body.email, req.body.name, req.body.jobTitle, 'MEMBER', req.user);
    res.json(result);
  } catch (err) { res.status(400).json({ message: err.message }); }
});
router.post('/representatives', [authRequired, requireRole('ADMIN', 'MANAGER', 'SUB_MANAGER')], async (req, res) => {
  req.body.role = 'MANAGER';
  try {
    const result = await createSingleUser(req.body.email, req.body.name, req.body.jobTitle, 'MANAGER', req.user);
    res.json(result);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ─── DIRECT SUBORDINATES QUERY ───
router.get('/users', [authRequired, requireRole('ADMIN', 'MANAGER', 'SUB_MANAGER')], async (req, res) => {
  try {
    const parentId = req.query.parentId || req.user.id;

    // Safety check: ensure requested parent belongs to the same tenant organization
    if (parentId !== req.user.id) {
        const parentNode = await User.findById(parentId);
        if (!parentNode || parentNode.adminId?.toString() !== getAdminId(req.user)?.toString()) {
            return res.status(403).json({ message: 'Forbidden access to this tree branch' });
        }
    }

    const users = await User.find({ reportsTo: parentId }, '-passwordHash').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/users/:id/reset-device', [authRequired, requireRole('ADMIN', 'MANAGER', 'SUB_MANAGER')], async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // Quick security check: can only reset if they belong to this org
    if (user.adminId?.toString() !== getAdminId(req.user)?.toString()) {
       return res.status(403).json({ message: 'Forbidden' });
    }

    user.webauthn = {
      deviceBound: false,
      credential: null,
      currentRegistrationChallenge: null,
      currentAuthenticationChallenge: null,
      boundAt: null,
    };
    await user.save();
    res.json({ message: 'Device reset' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── DELETE USER ───
router.delete('/users/:id', [authRequired, requireRole('ADMIN', 'MANAGER', 'SUB_MANAGER')], async (req, res) => {
  try {
    const userToDelete = await User.findById(req.params.id);
    if (!userToDelete) return res.status(404).json({ message: 'User not found' });

    // Security: can only delete if they belong to this org
    if (userToDelete.adminId?.toString() !== getAdminId(req.user)?.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // 1. Find all users who report to this user
    // 2. Set their reportsTo to the current target's superior (orphaning protection)
    if (userToDelete.role === 'MANAGER' || userToDelete.role === 'SUB_MANAGER') {
        const fallbackSuperior = userToDelete.reportsTo || userToDelete.adminId;
        await User.updateMany({ reportsTo: userToDelete._id }, { reportsTo: fallbackSuperior });
    }

    await AttendanceLog.deleteMany({ userId: userToDelete._id });
    await User.deleteOne({ _id: userToDelete._id });

    res.json({ message: 'User and their attendance records deleted.' });
  } catch (err) {
    console.error('delete user error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── ADMIN-TRIGGERED PASSWORD RESET ───
router.post('/users/:id/request-reset', [authRequired, requireRole('ADMIN', 'MANAGER', 'SUB_MANAGER')], async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.adminId?.toString() !== getAdminId(req.user)?.toString()) {
       return res.status(403).json({ message: 'Forbidden' });
    }

    const resetToken = generateVerificationToken();
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours for admin trigger
    await user.save();

    await sendPasswordResetEmail(user.email, user.name, resetToken);
    res.json({ message: `Password reset link sent to ${user.email}` });
  } catch (err) {
    console.error('request-reset error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── ANALYTICS ───
router.get('/attendance/summary', [authRequired, requireRole('ADMIN', 'MANAGER', 'SUB_MANAGER')], async (req, res) => {
  try {
    const { from, to, managerId } = req.query;
    const adminOid = new mongoose.Types.ObjectId(getAdminId(req.user));
    const selfOid = new mongoose.Types.ObjectId(req.user.id);
    const match = { adminId: adminOid };
    
    // Default: show only direct subordinates (not self)
    if (req.user.role === 'ADMIN') {
       match.reportsTo = selfOid; // only users who report directly to admin
    } else if (req.user.role === 'MANAGER' || req.user.role === 'SUB_MANAGER') {
       match.reportsTo = selfOid; // only subordinates, NOT own attendance
    }
    
    // Drill-down into a specific manager's team (e.g. from Inbox → View Report)
    if (managerId) {
      match.reportsTo = new mongoose.Types.ObjectId(managerId);
    }

    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to) match.date.$lte = new Date(to);
    }

    const summary = await AttendanceLog.aggregate([
      { $match: match },
      { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      {
        $project: {
          date: 1, checkInTime: 1, checkOutTime: 1,
          'user.name': 1, 'user.email': 1, 'user.jobTitle': 1, 'user.role': 1,
        },
      },
    ]);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── ANALYTICS: Overview (Pie + Bar) ───
router.get('/attendance/analytics/overview', [authRequired, requireRole('ADMIN', 'MANAGER', 'SUB_MANAGER')], async (req, res) => {
  try {
    const selfOid = new mongoose.Types.ObjectId(req.user.id);
    const adminOid = new mongoose.Types.ObjectId(getAdminId(req.user));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Count direct subordinates
    const totalSubordinates = await User.countDocuments({ reportsTo: selfOid });
    
    // Holiday check for Today
    const todayStr = today.toISOString().split('T')[0];
    const gf = await Geofence.findOne({ adminId: adminOid }); // Get first gf for the admin to check general holiday status
    const isHolidayToday = gf?.holidays?.includes(todayStr) || gf?.isAttendanceEnabled === false;

    const presentToday = isHolidayToday ? 0 : await AttendanceLog.countDocuments({ reportsTo: selfOid, adminId: adminOid, date: today });
    const absentToday = isHolidayToday ? 0 : Math.max(0, totalSubordinates - presentToday);

    // Hourly distribution
    const logsToday = await AttendanceLog.find({ reportsTo: selfOid, adminId: adminOid, date: today });
    const hourCounts = Array(24).fill(0);
    logsToday.forEach(log => {
      if (log.checkInTime) hourCounts[new Date(log.checkInTime).getHours()]++;
    });
    const hourlyData = hourCounts
      .map((count, hour) => ({ hour: `${hour}:00`, count }))
      .filter(d => d.count > 0 || (Number(d.hour.split(':')[0]) >= 7 && Number(d.hour.split(':')[0]) <= 20));

    res.json({
      presence: { present: presentToday, absent: absentToday, total: totalSubordinates, isHoliday: !!isHolidayToday },
      hourlyTrend: hourlyData,
    });
  } catch (err) {
    console.error('analytics overview error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── ANALYTICS: Per-User History (Line Chart) ───
router.get('/attendance/analytics/user/:id', [authRequired, requireRole('ADMIN', 'MANAGER', 'SUB_MANAGER')], async (req, res) => {
  try {
    const adminOid = new mongoose.Types.ObjectId(getAdminId(req.user));
    const userOid = new mongoose.Types.ObjectId(req.params.id);

    const logs = await AttendanceLog.find({ userId: userOid, adminId: adminOid })
      .sort({ date: -1 }).limit(30);

    const history = logs.map(log => ({
      date: new Date(log.date).toLocaleDateString(),
      hours: log.checkInTime && log.checkOutTime
        ? parseFloat(((new Date(log.checkOutTime) - new Date(log.checkInTime)) / (1000 * 60 * 60)).toFixed(2))
        : 0,
    })).reverse();

    res.json(history);
  } catch (err) {
    console.error('user analytics error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
