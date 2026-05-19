import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import authRoutes from './routes/auth.js';
import webauthnRoutes from './routes/webauthn.js';
import adminRoutes from './routes/admin.js';
import employeeRoutes from './routes/employee.js';
import submissionRoutes from './routes/submission.js';
import feedbackRoutes from './routes/feedback.js';
import bcrypt from 'bcryptjs';
import User from './models/User.js';
import { initCronJobs } from './utils/cron.js';

const app = express();

// Middleware
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/webauthn', webauthnRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/feedback', feedbackRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// MongoDB connection and server start
const PORT = process.env.PORT || 4002;
console.log('Environment Debug:');
console.log('CLIENT_ORIGIN:', process.env.CLIENT_ORIGIN);
console.log('JWT_ACCESS_SECRET:', process.env.JWT_ACCESS_SECRET ? 'Set' : 'Not Set');
console.log('JWT_REFRESH_SECRET:', process.env.JWT_REFRESH_SECRET ? 'Set' : 'Not Set');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('FATAL ERROR: MONGODB_URI is not defined in environment variables.');
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    // Ensure default admin user exists
    const ensureAdmin = async () => {
      const existing = await User.findOne({ email: 'admin@example.com' });
      if (!existing) {
        const passwordHash = await bcrypt.hash('admin', 10);
        await User.create({
          email: 'admin@example.com',
          name: 'Default Admin',
          role: 'ADMIN',
          passwordHash,
          emailVerified: true,
        });
        console.log('Created default admin user: email=admin@example.com, password=admin');
      }
    };
    ensureAdmin().catch((err) => {
      console.error('Error ensuring default admin user', err);
    });
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      initCronJobs();
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error', err);
    process.exit(1);
  });

