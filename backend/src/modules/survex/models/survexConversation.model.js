import mongoose from 'mongoose';
import { withBaseOptions } from '../../../utils/mongoose.js';

const survexConversationSchema = withBaseOptions(new mongoose.Schema({
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
  channel: {
    type: String,
    enum: ['whatsapp'],
    default: 'whatsapp',
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active',
  },
  questionIndex: {
    type: Number,
    min: -1,
    default: -1,
  },
  responses: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  startedAt: {
    type: Date,
    default: Date.now,
    required: true,
  },
  completedAt: {
    type: Date,
    default: null,
  },
  lastMessageAt: {
    type: Date,
    default: Date.now,
  },
  lastInboundMessage: {
    type: String,
    default: '',
  },
  lastInboundMessageSid: {
    type: String,
    default: '',
  },
  lastOutboundMessage: {
    type: String,
    default: '',
  },
  chatHistory: {
    type: [{
      role: { type: String, enum: ['user', 'assistant'], required: true },
      content: { type: String, required: true },
    }],
    default: [],
  },
}));

survexConversationSchema.index({ fieldOfficerId: 1, status: 1, updated_date: -1 });
survexConversationSchema.index({ coordinatorId: 1, status: 1, updated_date: -1 });

export const SurvexConversation = mongoose.model('SurvexConversation', survexConversationSchema);
