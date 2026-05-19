import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const authRequired = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('authRequired: header:', authHeader);
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('authRequired: missing/invalid header format');
      return res.status(401).json({ message: 'Missing authorization token' });
    }
    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_ACCESS_SECRET || 'dev_access_secret';
    const payload = jwt.verify(token, secret);
    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ message: 'User not active' });
    }
    req.user = {
      id: user._id,
      role: user.role,
      email: user.email,
      name: user.name,
      adminId: user.adminId,
      reportsTo: user.reportsTo,
    };
    next();
  } catch (err) {
    console.error('authRequired error', err);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const ROLE_HIERARCHY = {
  'ADMIN': 4,
  'MANAGER': 3,
  'SUB_MANAGER': 2,
  'MEMBER': 1
};

export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(403).json({ message: 'Forbidden' });
    
    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    
    // If multiple roles are passed, check for exact match in the set
    // If only one role is passed, allow anyone with that level or higher
    let isAllowed = false;
    if (allowedRoles.length > 1) {
      isAllowed = allowedRoles.includes(req.user.role);
    } else {
      const requiredLevel = ROLE_HIERARCHY[allowedRoles[0]] || 0;
      isAllowed = userLevel >= requiredLevel;
    }

    if (!isAllowed) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
};

