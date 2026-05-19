import express from 'express';
import Geofence from '../models/Geofence.js';
import AttendanceLog from '../models/AttendanceLog.js';
import User from '../models/User.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import base64url from 'base64url';

const router = express.Router();

const haversineDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// HELPER: Get approximate location from IP (Free API)
const getIpInfo = async (ip) => {
  try {
    // Standardize localhost for testing
    if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('::ffff:127.')) return { status: 'success', city: 'Localhost', country: 'Localhost' };
    
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,city,proxy,mobile`);
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.error('IP-API error', err.message);
    return null;
  }
};

const normalizeDate = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

// HELPER: Find the appropriate geofence for the user based on assignment
const getActiveGeofencesForUser = async (user) => {
  // Try to find explicitly assigned geofences
  let gfs = await Geofence.find({
    active: true,
    adminId: user.adminId, 
    assignedTo: user.id
  });

  // Fallback: If no specific assignment, default to all geofences created by superior/admin
  if (gfs.length === 0) {
    gfs = await Geofence.find({
      active: true,
      adminId: user.adminId, 
      createdBy: { $in: [user.reportsTo, user.adminId] }
    });
  }
  return gfs;
};

router.get('/status', authRequired, requireRole('MEMBER', 'MANAGER', 'SUB_MANAGER'), async (req, res) => {
  try {
    const today = normalizeDate(new Date());
    const log = await AttendanceLog.findOne({
      userId: req.user.id,
      date: today,
    });
    let status = 'NOT_CHECKED_IN';
    if (log?.checkInTime && !log.checkOutTime) status = 'CHECKED_IN';
    if (log?.checkInTime && log.checkOutTime) status = 'CHECKED_OUT';
    res.json({
      status,
      checkInTime: log?.checkInTime || null,
      checkOutTime: log?.checkOutTime || null,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/geofence', authRequired, requireRole('MEMBER', 'MANAGER', 'SUB_MANAGER'), async (req, res) => {
  try {
    const gfs = await getActiveGeofencesForUser(req.user);
    if (!gfs || gfs.length === 0) {
      return res.status(404).json({ message: 'No active geofence assigned to you by your manager.' });
    }
    res.json(gfs);
  } catch (err) {
    console.error('get geofence error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

const verifyWithinGeofence = async ({ lat, lng, user }) => {
  const gfs = await getActiveGeofencesForUser(user);
  if (!gfs || gfs.length === 0) return { ok: false, reason: 'No active geofence assigned.' };

  const todayStr = normalizeDate(new Date()).toISOString().split('T')[0];
  const validGfs = gfs.filter(gf => gf.isAttendanceEnabled !== false && !gf.holidays?.includes(todayStr));

  if (validGfs.length === 0) return { ok: false, reason: 'All assigned geofences are currently disabled or on holiday.' };

  let closestGf = null;
  let minDistance = Infinity;

  // We find the closest geofence
  for (const gf of validGfs) {
    const dist = haversineDistanceMeters(lat, lng, gf.center.lat, gf.center.lng);
    if (dist < minDistance) {
      minDistance = dist;
      closestGf = gf;
    }
  }

  // Allow validation if within radius + 15m of the ANY valid geofence (the closest one)
  if (minDistance > closestGf.radiusMeters + 15) {
    return { ok: false, reason: 'Outside assigned geofence', distance: minDistance, closestGf };
  }
  return { ok: true, geofence: closestGf, distance: minDistance };
};

const verifyUserWebauthnAssertion = async (user, assertion) => {
  if (!user.webauthn?.deviceBound || !user.webauthn.credential || !user.webauthn.currentAuthenticationChallenge) {
    throw new Error('No authentication in progress or device not bound');
  }

  const verification = await verifyAuthenticationResponse({
    response: assertion,
    expectedChallenge: user.webauthn.currentAuthenticationChallenge,
    expectedOrigin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:5174',
    expectedRPID: process.env.WEBAUTHN_RP_ID || 'localhost',
    authenticator: {
      credentialPublicKey: Buffer.from(user.webauthn.credential.publicKey, 'base64url'),
      credentialID: Buffer.from(user.webauthn.credential.credentialId, 'base64url'),
      counter: user.webauthn.credential.counter,
    },
  });

  if (!verification.verified || !verification.authenticationInfo) {
    throw new Error('WebAuthn verification failed');
  }

  user.webauthn.credential.counter = verification.authenticationInfo.newCounter;
  user.webauthn.currentAuthenticationChallenge = null;
  await user.save();
};

router.post('/check-in', authRequired, requireRole('MEMBER', 'MANAGER', 'SUB_MANAGER'), async (req, res) => {
  try {
    const { lat, lng, assertion } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ message: 'Location required' });

    const geo = await verifyWithinGeofence({ lat, lng, user: req.user });
    if (!geo.ok) return res.status(403).json({ message: geo.reason });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // NEW: FREE ANTI-SPOOFING (IP-BASED)
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ipInfo = await getIpInfo(ip);
    if (ipInfo && ipInfo.status === 'success' && ipInfo.city !== 'Localhost') {
      if (ipInfo.proxy) console.warn(`[SECURITY] Proxy/VPN detected for user ${user.email} from IP ${ip}`);
    }

    // ENFORCE BIOMETRIC IF BOUND
    if (user.webauthn?.deviceBound) {
      if (!assertion) return res.status(400).json({ message: 'Biometric/Device verification is required for your account.' });
      try {
        await verifyUserWebauthnAssertion(user, assertion);
      } catch (err) {
        return res.status(400).json({ message: 'Biometric verification failed' });
      }
    } else if (assertion) {
      // If not bound but assertion provided, verify it (maybe they are trying to bind or just using it)
      try {
        await verifyUserWebauthnAssertion(user, assertion);
      } catch (err) {
        return res.status(400).json({ message: 'Biometric verification failed' });
      }
    }

    const today = normalizeDate(new Date());
    let log = await AttendanceLog.findOne({ userId: req.user.id, date: today });
    
    if (log && log.isLocked) {
      return res.status(403).json({ message: 'Attendance for today is finalized and locked by your manager.' });
    }

    if (!log) {
      log = new AttendanceLog({
        userId: req.user.id,
        adminId: req.user.adminId,
        reportsTo: req.user.reportsTo,
        date: today,
        status: 'PRESENT',
      });
    }
    if (log.checkInTime) return res.status(400).json({ message: 'Already checked in today' });

    log.checkInTime = new Date();
    log.checkInLocation = { lat, lng };
    await log.save();

    res.json({ status: 'CHECKED_IN', checkInTime: log.checkInTime });
  } catch (err) {
    console.error('check-in error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/check-out', authRequired, requireRole('MEMBER', 'MANAGER', 'SUB_MANAGER'), async (req, res) => {
  try {
    const { lat, lng, assertion } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ message: 'Location required' });

    const geo = await verifyWithinGeofence({ lat, lng, user: req.user });
    // Allow checkouts outside the geofence, but flag them as outliers
    let isOutlier = false;
    let outlierDistance = null;
    if (!geo.ok) {
      if (geo.reason === 'No active geofence assigned.') return res.status(403).json({ message: geo.reason });
      isOutlier = true;
      if (geo.closestGf) outlierDistance = geo.distance;
    } else {
      outlierDistance = geo.distance;
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // NEW: FREE ANTI-SPOOFING (IP-BASED)
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ipInfo = await getIpInfo(ip);
    if (ipInfo && ipInfo.status === 'success' && ipInfo.city !== 'Localhost') {
      if (ipInfo.proxy) console.warn(`[SECURITY] Proxy/VPN detected for user ${user.email} from IP ${ip}`);
    }

    // ENFORCE BIOMETRIC IF BOUND
    if (user.webauthn?.deviceBound) {
      if (!assertion) return res.status(400).json({ message: 'Biometric/Device verification is required for your account.' });
      try {
        await verifyUserWebauthnAssertion(user, assertion);
      } catch (err) {
        return res.status(400).json({ message: 'Biometric verification failed' });
      }
    } else if (assertion) {
      try {
        await verifyUserWebauthnAssertion(user, assertion);
      } catch (err) {
        return res.status(400).json({ message: 'Biometric verification failed' });
      }
    }

    const today = normalizeDate(new Date());
    const log = await AttendanceLog.findOne({ userId: req.user.id, date: today });
    if (!log || !log.checkInTime) return res.status(400).json({ message: 'Not checked in today' });
    if (log.checkOutTime) return res.status(400).json({ message: 'Already checked out' });
    if (log.isLocked) return res.status(403).json({ message: 'Attendance for today is finalized and locked by your manager.' });

    log.checkOutTime = new Date();
    log.checkOutLocation = { lat, lng };
    log.isOutlier = isOutlier;
    log.outlierDistance = outlierDistance;
    await log.save();

    res.json({ status: 'CHECKED_OUT', checkOutTime: log.checkOutTime });
  } catch (err) {
    console.error('check-out error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/auto-check-out', authRequired, requireRole('MEMBER', 'MANAGER', 'SUB_MANAGER'), async (req, res) => {
  try {
    const { lat, lng, exitTime } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ message: 'Location required' });

    const gfs = await getActiveGeofencesForUser(req.user);
    if (!gfs || gfs.length === 0) return res.status(404).json({ message: 'No active geofence assigned' });

    let inSafeZone = false;
    for (const gf of gfs) {
      const distance = haversineDistanceMeters(lat, lng, gf.center.lat, gf.center.lng);
      if (distance <= gf.radiusMeters + 50) {
        inSafeZone = true;
        break;
      }
    }

    if (inSafeZone) return res.status(400).json({ message: 'Still within safe zone of at least one geofence' });

    const today = normalizeDate(new Date());
    const log = await AttendanceLog.findOne({ userId: req.user.id, date: today });

    if (!log || !log.checkInTime) return res.status(400).json({ message: 'Not checked in' });
    if (log.checkOutTime) return res.status(400).json({ message: 'Already checked out' });
    if (log.isLocked) return res.status(403).json({ message: 'Attendance for today is finalized and locked.' });

    log.checkOutTime = exitTime ? new Date(exitTime) : new Date();
    log.checkOutLocation = { lat, lng };
    log.checkOutType = 'AUTOMATIC';
    await log.save();

    res.json({ status: 'CHECKED_OUT', checkOutTime: log.checkOutTime, message: 'Automatically checked out' });
  } catch (err) {
    console.error('auto check-out error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
