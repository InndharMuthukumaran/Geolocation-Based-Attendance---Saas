import mongoose from 'mongoose';

const webauthnCredentialSchema = new mongoose.Schema(
  {
    credentialId: { type: String },
    publicKey: { type: String },
    counter: { type: Number, default: 0 },
    deviceName: { type: String },
    deviceId: { type: String }, // optional fingerprint/hash
    transports: { type: [String], default: [] },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true },
    jobTitle: { type: String },
    role: {
      type: String,
      enum: ['ADMIN', 'MANAGER', 'SUB_MANAGER', 'MEMBER'],
      default: 'MEMBER',
    },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    reportsTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'LOCKED'],
      default: 'ACTIVE',
    },
    emailVerified: { type: Boolean, default: false },
    verificationToken: { type: String, default: null },
    verificationExpiresAt: { type: Date, default: null },
    employeeFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    webauthn: {
      deviceBound: { type: Boolean, default: false },
      credential: { type: webauthnCredentialSchema, default: null },
      currentRegistrationChallenge: { type: String, default: null },
      currentAuthenticationChallenge: { type: String, default: null },
      boundAt: { type: Date },
    },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);

