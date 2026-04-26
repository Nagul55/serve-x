import mongoose from 'mongoose';
import { withBaseOptions } from '../utils/mongoose.js';

const otpCodeSchema = withBaseOptions(new mongoose.Schema({
  email: { type: String, required: true, trim: true, lowercase: true },
  user_id: { type: String, default: '' },
  role: { type: String, enum: ['coordinator', 'field_officer'], default: 'coordinator' },
  session_id: { type: String, default: '' },
  otp_hash: { type: String, required: true },
  expires_at: { type: Date, required: true },
  used_at: { type: Date, default: null },
  attempts: { type: Number, default: 0, min: 0 },
  ip: { type: String, default: '' },
  user_agent: { type: String, default: '' },
}));

otpCodeSchema.index({ email: 1, created_date: -1 });
otpCodeSchema.index({ email: 1, role: 1, user_id: 1, created_date: -1 });
otpCodeSchema.index({ email: 1, session_id: 1, created_date: -1 });
otpCodeSchema.index({ expires_at: 1 }, { expireAfterSeconds: 86400 });

export const OtpCode = mongoose.model('OtpCode', otpCodeSchema);
