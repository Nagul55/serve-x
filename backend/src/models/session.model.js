import mongoose from 'mongoose';
import { withBaseOptions } from '../utils/mongoose.js';

const sessionSchema = withBaseOptions(new mongoose.Schema({
  user_id: { type: String, required: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  role: { type: String, default: 'coordinator' },
  jti: { type: String, required: true, unique: true },
  access_jti: { type: String, required: true },
  access_expires_at: { type: Date, required: true },
  refresh_jti: { type: String, required: true },
  refresh_token_hash: { type: String, required: true },
  refresh_expires_at: { type: Date, required: true },
  rotation_counter: { type: Number, min: 0, default: 0 },
  last_rotated_at: { type: Date, default: null },
  field_officer_verified: { type: Boolean, default: false },
  field_officer_verified_at: { type: Date, default: null },
  revoked_at: { type: Date, default: null },
  ip: { type: String, default: '' },
  user_agent: { type: String, default: '' },
}));
sessionSchema.index({ user_id: 1, revoked_at: 1 });
sessionSchema.index({ access_jti: 1 });
sessionSchema.index({ refresh_jti: 1 });

export const Session = mongoose.model('Session', sessionSchema);
