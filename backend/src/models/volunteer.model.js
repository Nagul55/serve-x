import mongoose from 'mongoose';
import { withBaseOptions } from '../utils/mongoose.js';

const volunteerSchema = withBaseOptions(new mongoose.Schema({
  full_name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, default: '' },
  assigned_coordinator_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  skills: { type: [String], default: [] },
  availability: {
    type: String,
    enum: ['weekdays', 'weekends', 'both', 'on_call'],
    default: 'weekends',
  },
  status: {
    type: String,
    enum: ['active', 'deployed', 'unavailable'],
    default: 'active',
  },
  location: { type: String, default: '' },
  languages: { type: [String], default: [] },
  total_missions: { type: Number, min: 0, default: 0 },
  bio: { type: String, default: '' },
  last_assignment_note: { type: String, default: '' },
  last_assignment_priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'critical'],
    default: 'normal',
  },
  last_assignment_at: { type: Date, default: null },
  last_assignment_message_sid: { type: String, default: '' },
  bot_state: { type: String, default: 'IDLE' },
}));

volunteerSchema.index({ assigned_coordinator_id: 1, status: 1 });

export const Volunteer = mongoose.model('Volunteer', volunteerSchema);
