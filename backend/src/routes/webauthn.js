import express from 'express';
import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import User from '../models/User.js';
import { authRequired } from '../middleware/auth.js';

const router = express.Router();

// Removed top-level env lookups to avoid ESM hoisting issues


router.post('/register/options', authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const options = await generateRegistrationOptions({
      rpName: process.env.WEBAUTHN_RP_NAME || 'Geolocation Attendance',
      rpID: process.env.WEBAUTHN_RP_ID || 'localhost',
      userID: Buffer.from(user._id.toString()),
      userName: user.email,
      timeout: 60000,
      attestationType: 'none',
      authenticatorSelection: {
        userVerification: 'preferred',
        residentKey: 'preferred',
      },
    });

    user.webauthn.currentRegistrationChallenge = options.challenge;
    await user.save();

    res.json(options);
  } catch (err) {
    console.error('webauthn register options error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/register/verify', authRequired, async (req, res) => {
  try {
    const body = req.body;
    const user = await User.findById(req.user.id);
    if (!user || !user.webauthn.currentRegistrationChallenge) {
      return res.status(400).json({ message: 'No registration in progress' });
    }

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: user.webauthn.currentRegistrationChallenge,
      expectedOrigin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:5174',
      expectedRPID: process.env.WEBAUTHN_RP_ID || 'localhost',
    });

    const { verified, registrationInfo } = verification;
    if (!verified || !registrationInfo) {
      return res.status(400).json({ message: 'WebAuthn registration failed' });
    }

    const { credentialPublicKey, credentialID, counter } = registrationInfo;

    // Use a helper to avoid double-encoding if it's already a string-in-a-buffer
    const rawId = Buffer.from(credentialID);
    const idAsString = rawId.toString('utf8');
    const finalId = /^[a-zA-Z0-9_-]+$/.test(idAsString) ? idAsString : rawId.toString('base64url');

    user.webauthn.credential = {
      credentialId: finalId,
      publicKey: Buffer.from(credentialPublicKey).toString('base64url'),
      counter,
      transports: body.response.transports || [],
    };
    user.webauthn.deviceBound = true;
    user.webauthn.boundAt = new Date();
    user.webauthn.currentRegistrationChallenge = null;
    await user.save();

    res.json({ verified: true, deviceBound: true });
  } catch (err) {
    console.error('webauthn register verify error', err);
    res.status(400).json({ message: 'WebAuthn registration failed' });
  }
});

router.post('/auth/options', authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.webauthn.deviceBound || !user.webauthn.credential) {
      return res.status(400).json({ message: 'No device bound' });
    }

    console.log('--- ENTERED /auth/options ---');
    const options = await generateAuthenticationOptions({
      timeout: 60000,
      allowCredentials: [
        {
          id: user.webauthn.credential.credentialId,
          type: 'public-key',
          transports: user.webauthn.credential.transports || ['usb', 'internal', 'ble', 'nfc'],
        },
      ],
      userVerification: 'preferred',
      rpID: process.env.WEBAUTHN_RP_ID || 'localhost',
    });

    user.webauthn.currentAuthenticationChallenge = options.challenge;
    await user.save();

    res.json(options);
  } catch (err) {
    console.error('CRITICAL ERROR in /auth/options:', err);
    res.status(500).json({
      message: 'Server error: ' + err.message,
      stack: err.stack
    });
  }
});

router.post('/auth/verify', authRequired, async (req, res) => {
  try {
    const body = req.body;
    const user = await User.findById(req.user.id);
    if (!user || !user.webauthn.currentAuthenticationChallenge || !user.webauthn.credential) {
      return res.status(400).json({ message: 'No authentication in progress' });
    }

    console.log('--- ENTERED /auth/verify ---');
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: user.webauthn.currentAuthenticationChallenge,
      expectedOrigin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:5174',
      expectedRPID: process.env.WEBAUTHN_RP_ID || 'localhost',
      authenticator: {
        credentialPublicKey: Buffer.from(user.webauthn.credential.publicKey, 'base64url'),
        credentialID: Buffer.from(user.webauthn.credential.credentialId, 'base64url'),
        counter: user.webauthn.credential.counter,
      },
    });

    const { verified, authenticationInfo } = verification;
    if (!verified || !authenticationInfo) {
      return res.status(400).json({ message: 'WebAuthn authentication failed' });
    }

    user.webauthn.credential.counter = authenticationInfo.newCounter;
    user.webauthn.currentAuthenticationChallenge = null;
    await user.save();

    res.json({ verified: true });
  } catch (err) {
    console.error('webauthn auth verify error', err);
    res.status(400).json({ message: 'WebAuthn authentication failed' });
  }
});

export default router;

