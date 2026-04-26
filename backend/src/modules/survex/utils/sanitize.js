export function sanitizeText(input, maxLength = 500) {
  const raw = String(input ?? '');
  const normalized = raw
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ') // Preserve \n (0x0A)
    .trim();

  const withoutTags = normalized.replace(/[<>]/g, '');
  return withoutTags.slice(0, maxLength);
}

export function normalizeWhatsAppPhone(input) {
  let phone = String(input ?? '').trim();
  phone = phone.replace(/^whatsapp:/i, '');
  phone = phone.replace(/[^+\d]/g, '');

  if (!phone) return '';
  if (!phone.startsWith('+')) {
    phone = `+${phone}`;
  }

  return phone;
}

export function sanitizeSurveyObject(data) {
  const out = {};
  for (const [key, value] of Object.entries(data || {})) {
    out[sanitizeText(key, 40).toLowerCase()] = sanitizeText(value, 400);
  }
  return out;
}
