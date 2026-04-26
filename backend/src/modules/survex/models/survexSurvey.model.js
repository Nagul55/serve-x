import mongoose from 'mongoose';
import { withBaseOptions } from '../../../utils/mongoose.js';

const survexSurveySchema = withBaseOptions(new mongoose.Schema({
  fieldOfficerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SurvexUser',
    required: true,
  },
  coordinatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SurvexUser',
    required: true,
  },
  surveyData: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true,
  },
  rawMessage: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'resolved'], default: 'pending' },
  source: { type: String, enum: ['whatsapp', 'manual'], default: 'whatsapp' },
  meta: {
    from: { type: String, default: '' },
    to: { type: String, default: '' },
    messageSid: { type: String, default: '' },
    photo_url: { type: String, default: '' },
    location_coords: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
  },
}));

survexSurveySchema.index({ coordinatorId: 1, timestamp: -1 });
survexSurveySchema.index({ fieldOfficerId: 1, timestamp: -1 });
survexSurveySchema.index({ status: 1, timestamp: -1 });

export const SurvexSurvey = mongoose.model('SurvexSurvey', survexSurveySchema);
