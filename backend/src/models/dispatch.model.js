import mongoose from 'mongoose';
import { withBaseOptions } from '../utils/mongoose.js';

const dispatchSchema = withBaseOptions(new mongoose.Schema({
  need_id: { type: String, required: true },
  need_title: { type: String, required: true },
  volunteer_ids: { type: [String], default: [] },
  volunteer_names: { type: [String], default: [] },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'resolved', 'cancelled'],
    default: 'pending',
  },
  scheduled_date: { type: Date, default: null },
  notes: { type: String, default: '' },
  outcome: { type: String, default: '' },
}));

export const Dispatch = mongoose.model('Dispatch', dispatchSchema);
