import mongoose from 'mongoose';
import { withBaseOptions } from '../utils/mongoose.js';

const communityNeedSchema = withBaseOptions(new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  location: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ['food', 'medical', 'shelter', 'education', 'mental_health', 'elderly_care', 'childcare', 'transportation', 'other'],
    required: true,
  },
  urgency_level: {
    type: String,
    enum: ['critical', 'high', 'medium', 'low'],
    default: 'medium',
  },
  urgency_score: { type: Number, min: 0, max: 100, default: 50 },
  status: {
    type: String,
    enum: ['unaddressed', 'assigned', 'in_progress', 'resolved'],
    default: 'unaddressed',
  },
  source: {
    type: String,
    enum: ['field_report', 'whatsapp', 'survey', 'verbal', 'other'],
    default: 'other',
  },
  raw_input: { type: String, default: '' },
  beneficiaries_count: { type: Number, min: 0, default: 0 },
  assigned_volunteers: { type: [String], default: [] },
  ai_summary: { type: String, default: '' },
  notes: { type: String, default: '' },
  source_ref_type: { type: String, default: '' },
  source_ref_id: { type: String, default: '' },
  reported_by_name: { type: String, default: '' },
  reported_by_phone: { type: String, default: '' },
  photo_url: { type: String, default: '' },
  location_coords: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
}));

communityNeedSchema.index({ source_ref_type: 1, source_ref_id: 1 });

export const CommunityNeed = mongoose.model('CommunityNeed', communityNeedSchema);
