import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { withBaseOptions } from '../utils/mongoose.js';

const userSchema = withBaseOptions(new mongoose.Schema({
  name: { type: String, default: '', trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  phone: { type: String, default: '', trim: true },
  role: {
    type: String,
    enum: ['coordinator', 'field_officer'],
    default: 'coordinator',
  },
  assigned_coordinator_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  password_hash: { type: String, default: '' },
  is_active: { type: Boolean, default: true },
  last_login_at: { type: Date, default: null },
}));

userSchema.index({ role: 1, assigned_coordinator_id: 1 });

userSchema.methods.verifyPassword = async function verifyPassword(password) {
  if (!this.password_hash) return false;
  return bcrypt.compare(String(password || ''), this.password_hash);
};

export async function hashUserPassword(password) {
  const rounds = 12;
  return bcrypt.hash(String(password || ''), rounds);
}

export const User = mongoose.model('User', userSchema);
