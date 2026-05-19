import nodemailer from 'nodemailer';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5174';

export const generateVerificationToken = () => crypto.randomBytes(32).toString('hex');

// EMAIL 1: Just the verification link
export const sendVerificationOnlyEmail = async (to, name, role, verificationToken, creatorEmail) => {
  const verifyUrl = `${CLIENT_ORIGIN}/verify?email=${encodeURIComponent(to.toLowerCase())}&token=${verificationToken}`;

  const mailOptions = {
    from: `"Attendance System" <${process.env.EMAIL_FROM}>`,
    to,
    replyTo: creatorEmail,
    subject: 'Action Required: Verify Your Email to Activate Your Account',
    html: `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #4f46e5;">Hello, ${name}!</h2>
        <p>An account as a <strong>${role}</strong> has been prepared for you by <strong>${creatorEmail}</strong>.</p>
        <p>Before you can receive your login credentials, you MUST verify your email address. This link is valid for **15 days**.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verifyUrl}" style="background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
            ✅ Verify My Email Address
          </a>
        </div>
        <p style="font-size: 0.85em; color: #555;">Or copy-paste this link:</p>
        <p style="word-break: break-all; font-size: 0.8em; color: #6366f1;">${verifyUrl}</p>
        <p style="color: #dc2626; font-size: 0.85em; font-weight: bold; margin-top: 20px;">
          ⚠️ Important: After you click verify, you will receive a SECOND email containing your secure password.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="font-size: 0.8em; color: #777;">If you did not expect this email, please ignore it. Your data will be automatically deleted if not verified within 15 days.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Verification-only email sent to:', to);
    return true;
  } catch (error) {
    console.error('Error sending verification email:', error);
    return false;
  }
};

// EMAIL 2: Final credentials sent AFTER verification
export const sendFinalCredentialsEmail = async (to, name, password) => {
  const loginUrl = `${CLIENT_ORIGIN}/login`;

  const mailOptions = {
    from: `"Attendance System" <${process.env.EMAIL_FROM}>`,
    to,
    subject: 'Account Activated — Here are your Credentials',
    html: `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Success! Account Activated</h2>
        <p>Hi ${name}, your email has been verified and your account is now fully active.</p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; margin: 25px 0;">
          <p style="margin: 0 0 10px 0; font-weight: bold; color: #475569;">Your Login Credentials:</p>
          <div style="margin-bottom: 8px;">Email: <code style="background: #eef2ff; color: #4f46e5; padding: 2px 6px; border-radius: 4px;">${to}</code></div>
          <div>Password: <code style="background: #eef2ff; color: #4f46e5; padding: 2px 6px; border-radius: 4px;">${password}</code></div>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${loginUrl}" style="background: #0f172a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
            🚀 Login to Dashboard
          </a>
        </div>
        <p style="font-size: 0.8em; color: #ef4444; font-weight: bold;">⚠️ Security Tip: Please change your password after your first login.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Final credentials email sent to:', to);
    return true;
  } catch (error) {
    console.error('Error sending credentials email:', error);
    return false;
  }
};
// EMAIL 3: Password reset link
export const sendPasswordResetEmail = async (to, name, resetToken) => {
  const resetUrl = `${CLIENT_ORIGIN}/reset-password?token=${resetToken}&email=${encodeURIComponent(to.toLowerCase())}`;

  const mailOptions = {
    from: `"Attendance System" <${process.env.EMAIL_FROM}>`,
    to,
    subject: 'Password Reset Request',
    html: `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #6366f1;">Password Reset</h2>
        <p>Hi ${name},</p>
        <p>You (or your administrator) requested to reset your password. Click the button below to choose a new password. This link is valid for **2 hours**.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
            🔒 Reset My Password
          </a>
        </div>
        <p style="font-size: 0.8em; color: #777;">Or copy-paste this link:</p>
        <p style="word-break: break-all; font-size: 0.8em; color: #6366f1;">${resetUrl}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="font-size: 0.8em; color: #777;">If you did not request this, please ignore this email. Your password will remain unchanged.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Password reset email sent to:', to);
    return true;
  } catch (error) {
    console.error('Error sending reset email:', error);
    return false;
  }
};
