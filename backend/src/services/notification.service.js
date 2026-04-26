import { Notification } from '../models/notification.model.js';

function toCleanText(value, maxLength = 300) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export async function createNotification(payload = {}) {
  const title = toCleanText(payload.title, 120);
  const message = toCleanText(payload.message, 500);

  if (!title || !message) {
    return null;
  }

  return Notification.create({
    target_role: payload.target_role || 'coordinator',
    target_user_id: toCleanText(payload.target_user_id, 80),
    type: toCleanText(payload.type || 'system_event', 80),
    title,
    message,
    source: toCleanText(payload.source || 'system', 80),
    source_ref_type: toCleanText(payload.source_ref_type, 80),
    source_ref_id: toCleanText(payload.source_ref_id, 120),
    metadata: payload.metadata || {},
  });
}
