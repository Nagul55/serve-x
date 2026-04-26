import mongoose from 'mongoose';
import { withBaseOptions } from '../utils/mongoose.js';

const notificationSchema = withBaseOptions(new mongoose.Schema({
  target_role: {
    type: String,
    enum: ['coordinator', 'field_officer', 'all'],
    default: 'coordinator',
  },
  target_user_id: { type: String, default: '' },
  type: { type: String, default: 'system_event' },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  source: { type: String, default: 'system' },
  source_ref_type: { type: String, default: '' },
  source_ref_id: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  is_read: { type: Boolean, default: false },
  read_at: { type: Date, default: null },
}));

notificationSchema.index({ target_role: 1, target_user_id: 1, created_date: -1 });
notificationSchema.index({ is_read: 1, created_date: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
