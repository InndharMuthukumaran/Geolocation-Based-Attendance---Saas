import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import { sendFinalCredentialsEmail, sendPasswordResetEmail, generateVerificationToken } from '../utils/mailer.js';


const router = express.Router();

// Secrets accessed dynamically to ensure dotenv is loaded
const getAccessSecret = () => process.env.JWT_ACCESS_SECRET || 'dev_access_secret';
const getRefreshSecret = () => process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret';

const createAccessToken = (user) => {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    getAccessSecret(),
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' }
  );
};

const createRefreshToken = (user) => {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, type: 'refresh' },
    getRefreshSecret(),
    { expiresIn: process.env.JWT_REFRESH_EXPIRES || '30d' }
  );
};

const setRefreshCookie = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: false, // change to true when using HTTPS in production
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  });
};

router.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Email, password, and name required' });
    }
    const lowerEmail = email.toLowerCase();
    const existing = await User.findOne({ email: lowerEmail });
    if (existing) {
      return res.status(400).json({ message: 'Email already in use' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: lowerEmail,
      name,
      passwordHash,
      role: 'ADMIN',
      jobTitle: 'Admin',
    });
    
    // Self-reference adminId for the workspace root to simplify descendant queries
    user.adminId = user._id;
    user.emailVerified = true; // Admin who signs up is auto-verified
    await user.save();

    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);
    setRefreshCookie(res, refreshToken);

    return res.json({
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        jobTitle: user.jobTitle,
        role: user.role,
        deviceBound: false,
      },
    });
  } catch (err) {
    console.error('signup error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    if (!user.emailVerified) {
      return res.status(403).json({ message: 'Please verify your email address first. Check your inbox for the verification link.' });
    }
    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);
    setRefreshCookie(res, refreshToken);

    return res.json({
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        deviceBound: user.webauthn?.deviceBound || false,
      },
    });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies.refreshToken;
    if (!token) {
      return res.status(401).json({ message: 'Missing refresh token' });
    }
    const payload = jwt.verify(token, getRefreshSecret());
    if (payload.type !== 'refresh') {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }
    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ message: 'User not active' });
    }
    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);
    setRefreshCookie(res, refreshToken);

    return res.json({
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        deviceBound: user.webauthn?.deviceBound || false,
      },
    });
  } catch (err) {
    console.error('refresh error', err);
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('refreshToken');
  res.json({ message: 'Logged out' });
});

// ─── EMAIL VERIFICATION ───
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { email } = req.query; // Expecting email as a query param for more robust re-verification

    let query = { verificationToken: token };
    if (email) query = { email: email.toLowerCase(), verificationToken: token };

    const user = await User.findOne(query);
    
    if (!user) {
      // If we have an email, check if they are already verified
      if (email) {
        const alreadyActive = await User.findOne({ email: email.toLowerCase(), emailVerified: true });
        if (alreadyActive) return res.json({ message: 'Email already verified. You can log in.', alreadyVerified: true, email: alreadyActive.email });
      }
      return res.status(400).json({ message: 'Invalid or expired verification link.' });
    }

    if (user.emailVerified) return res.json({ message: 'Email already verified. You can log in.', alreadyVerified: true, email: user.email });

    // CHECK EXPIRATION
    if (user.verificationExpiresAt && user.verificationExpiresAt < new Date()) {
      await User.deleteOne({ _id: user._id }); // Auto-cleanup on attempt if expired
      return res.status(400).json({ message: 'Verification link has expired and the account has been removed. Please ask your administrator to create your account again.' });
    }

    // ACTIVATE & GENERATE CREDENTIALS
    const plainPassword = Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    user.emailVerified = true;
    user.verificationToken = null;
    user.verificationExpiresAt = null;
    user.passwordHash = passwordHash; 
    await user.save();

    // Send the second email with actual credentials
    await sendFinalCredentialsEmail(user.email, user.name, plainPassword);

    return res.json({ message: 'Email verified successfully! Your login credentials have been sent to your inbox.', email: user.email, name: user.name });
  } catch (err) {
    console.error('verify error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─── FORGOT PASSWORD ───
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // Security: Don't reveal account existence, but return same message
      return res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
    }

    const resetToken = generateVerificationToken();
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
    await user.save();

    await sendPasswordResetEmail(user.email, user.name, resetToken);
    res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
  } catch (err) {
    console.error('forgot-password error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── RESET PASSWORD ───
router.post('/reset-password', async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword) return res.status(400).json({ message: 'Missing fields' });

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      resetPasswordToken: token,
      resetPasswordExpiresAt: { $gt: new Date() }
    });

    if (!user) return res.status(400).json({ message: 'Invalid or expired reset token' });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpiresAt = null;
    await user.save();

    res.json({ message: 'Password reset successful! You can now log in with your new password.' });
  } catch (err) {
    console.error('reset-password error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;

