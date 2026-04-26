import { sanitizeSurveyObject, sanitizeText } from '../utils/sanitize.js';

const REQUIRED_FIELDS = ['name', 'location', 'issue'];

export function parseSurveyMessage(message) {
  const raw = String(message ?? '')
    .replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\r\n/g, '\n');

  const lines = raw
    .split(/\n|\r/)
    .map((line) => sanitizeText(line, 500))
    .filter(Boolean);

  const result = {};
  for (const line of lines) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key || !value) continue;
    result[key] = value;
  }

  const surveyData = sanitizeSurveyObject(result);
  const missing = REQUIRED_FIELDS.filter((field) => !surveyData[field]);

  return {
    isValid: missing.length === 0,
    surveyData,
    missingFields: missing,
  };
}
