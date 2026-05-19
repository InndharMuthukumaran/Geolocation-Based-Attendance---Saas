import express from 'express';
import Feedback from '../models/Feedback.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Submit feedback (Available to ALL authenticated users)
router.post('/', authRequired, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ message: 'Feedback message is required' });
    }

    const feedback = await Feedback.create({
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      userRole: req.user.role,
      message,
    });

    res.status(201).json({ message: 'Feedback submitted successfully. Thank you!', feedback });
  } catch (err) {
    console.error('Feedback submission error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin-only route to view feedback (Optional, for creator to use if they assume Admin role)
// However, per instructions, this is primarily for the creator/developer.
router.get('/', [authRequired, requireRole('ADMIN')], async (req, res) => {
  try {
    const feedboxes = await Feedback.find().sort({ createdAt: -1 });
    res.json(feedboxes);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
