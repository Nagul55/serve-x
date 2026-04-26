import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { withBaseOptions } from '../../../utils/mongoose.js';

const survexUserSchema = withBaseOptions(new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, unique: true, trim: true },
  role: { type: String, enum: ['field_officer', 'coordinator'], required: true },
  assignedCoordinatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SurvexUser',
    default: null,
  },
  password_hash: { type: String, required: true },
  is_active: { type: Boolean, default: true },
  last_login_at: { type: Date, default: null },
}));

survexUserSchema.index({ role: 1, assignedCoordinatorId: 1 });

survexUserSchema.pre('validate', function validateCoordinatorAssignment() {
  if (this.role === 'field_officer' && !this.assignedCoordinatorId) {
    throw new Error('Field officers must be assigned to a coordinator.');
  }
});

survexUserSchema.methods.verifyPassword = async function verifyPassword(password) {
  return bcrypt.compare(password, this.password_hash);
};

export async function hashSurvexPassword(password) {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

export const SurvexUser = mongoose.model('SurvexUser', survexUserSchema);
