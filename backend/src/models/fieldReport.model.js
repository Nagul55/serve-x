import mongoose from 'mongoose';
import { withBaseOptions } from '../utils/mongoose.js';

const fieldReportSchema = withBaseOptions(new mongoose.Schema({
  reporter_name: { type: String, default: '' },
  raw_text: { type: String, required: true },
  location: { type: String, default: '' },
  processed: { type: Boolean, default: false },
  extracted_needs: { type: Number, min: 0, default: 0 },
  ai_analysis: { type: String, default: '' },
}));

export const FieldReport = mongoose.model('FieldReport', fieldReportSchema);
