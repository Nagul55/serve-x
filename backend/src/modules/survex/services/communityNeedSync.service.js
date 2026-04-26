import { CommunityNeed } from '../../../models/communityNeed.model.js';
import { sanitizeText } from '../utils/sanitize.js';

const NEED_TYPE_TO_CATEGORY = {
  water: 'other',
  food: 'food',
  health: 'medical',
  shelter: 'shelter',
  education: 'education',
  infrastructure: 'transportation',
  other: 'other',
};

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  return ['true', '1', 'yes', 'y'].includes(normalized);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function computeUrgencyScore({ needType, households, days, vulnerableGroups, hasOtherCoverage }) {
  let score = 30;

  score += clamp(days * 4, 0, 25);
  score += clamp(Math.round(households / 5), 0, 25);

  if (needType === 'health') {
    score += 12;
  }

  if (/child|children|under\s*5|pregnan|elder|old|disabled|disab/i.test(vulnerableGroups || '')) {
    score += 10;
  }

  if (!hasOtherCoverage) {
    score += 8;
  }

  return clamp(Math.round(score), 0, 100);
}

function mapUrgencyLevel(score) {
  if (score >= 85) return 'critical';
  if (score >= 65) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function formatNeedTypeLabel(needType) {
  const normalized = String(needType || '').trim().toLowerCase();
  if (!normalized) return 'Community';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function isGpsLabel(value) {
  return /^gps\s+-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/i.test(String(value || '').trim());
}

function getDisplayLocation(value) {
  const location = sanitizeText(value || '', 120);
  if (!location) return 'Unknown';
  return isGpsLabel(location) ? 'Pinned field location' : location;
}

function inferKnownLocalPlace(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';

  if (Math.abs(latitude - 11.4268) < 0.02 && Math.abs(longitude - 78.1313) < 0.02) {
    return 'Gurusamipalayam';
  }

  return '';
}

function buildAiSummary({ villageName, needType, households, days, vulnerableGroups, hasOtherCoverage, coverageDetail }) {
  const coverageText = hasOtherCoverage
    ? `Existing support noted: ${coverageDetail || 'yes'}.`
    : 'No active NGO/government support reported.';

  return [
    `${formatNeedTypeLabel(needType)} need reported from ${villageName || 'unknown location'}.`,
    `${households || 0} households affected for ${days || 0} day(s).`,
    vulnerableGroups ? `Vulnerable groups: ${vulnerableGroups}.` : 'No vulnerable group details provided.',
    coverageText,
  ].join(' ');
}

function buildDescription({ description, vulnerableGroups, coverageDetail }) {
  const parts = [sanitizeText(description, 1800)];

  if (vulnerableGroups) {
    parts.push(`Vulnerable groups: ${sanitizeText(vulnerableGroups, 300)}.`);
  }

  if (coverageDetail) {
    parts.push(`Coverage detail: ${sanitizeText(coverageDetail, 300)}.`);
  }

  return sanitizeText(parts.filter(Boolean).join(' '), 2200);
}

function resolveCategory({ needType, description }) {
  const text = `${needType || ''} ${description || ''}`.toLowerCase();
  if (/\b(road|transport|traffic|vehicle|bridge|pothole|pits?|drainage)\b/.test(text)) {
    return 'transportation';
  }

  return NEED_TYPE_TO_CATEGORY[needType] || 'other';
}

export async function upsertCommunityNeedFromSurvexSurvey({ survey, surveyData, fieldOfficer }) {
  const needType = sanitizeText(surveyData?.need_type || 'other', 40).toLowerCase();
  const rawVillageName = sanitizeText(surveyData?.village_name || surveyData?.location || 'Unknown', 120);
  const villageName = isGpsLabel(rawVillageName)
    ? (inferKnownLocalPlace(surveyData?.location_lat, surveyData?.location_lng) || getDisplayLocation(rawVillageName))
    : getDisplayLocation(rawVillageName);
  const households = toNumber(surveyData?.household_count, 0);
  const days = toNumber(surveyData?.days_of_issue, 0);
  const vulnerableGroups = sanitizeText(surveyData?.vulnerable_groups || '', 500);
  const hasOtherCoverage = toBoolean(surveyData?.other_ngo_coverage);
  const coverageDetail = sanitizeText(surveyData?.coverage_detail || '', 300);

  const urgencyScore = computeUrgencyScore({
    needType,
    households,
    days,
    vulnerableGroups,
    hasOtherCoverage,
  });

  const payload = {
    title: `${formatNeedTypeLabel(needType)} need at ${villageName}`,
    description: buildDescription({
      description: surveyData?.description || surveyData?.issue || '',
      vulnerableGroups,
      coverageDetail,
    }),
    location: villageName,
    category: resolveCategory({
      needType,
      description: `${surveyData?.description || ''} ${surveyData?.issue || ''}`,
    }),
    urgency_level: mapUrgencyLevel(urgencyScore),
    urgency_score: urgencyScore,
    source: 'survey',
    raw_input: sanitizeText(JSON.stringify(surveyData || {}), 3500),
    beneficiaries_count: Math.max(0, households),
    ai_summary: buildAiSummary({
      villageName,
      needType,
      households,
      days,
      vulnerableGroups,
      hasOtherCoverage,
      coverageDetail,
    }),
    notes: sanitizeText(
      `Synced from Survex survey ${survey.id}. Reporter: ${fieldOfficer?.name || 'Field Officer'} (${fieldOfficer?.phone || 'unknown'}).`,
      1000
    ),
    source_ref_type: 'survex_survey',
    source_ref_id: String(survey.id || ''),
    reported_by_name: sanitizeText(fieldOfficer?.name || '', 100),
    reported_by_phone: sanitizeText(fieldOfficer?.phone || '', 40),
    photo_url: sanitizeText(surveyData?.photo_url || '', 500),
    location_coords: {
      lat: toNumber(surveyData?.location_lat, null),
      lng: toNumber(surveyData?.location_lng, null),
    },
  };

  let need = await CommunityNeed.findOne({
    source_ref_type: 'survex_survey',
    source_ref_id: payload.source_ref_id,
  });

  if (!need) {
    need = await CommunityNeed.create(payload);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Survex] Created CommunityNeed ${need.id} from survey ${survey.id}`);
    }
    return need;
  }

  const existingStatus = need.status;
  Object.assign(need, payload);
  need.status = existingStatus;
  await need.save();

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Survex] Updated CommunityNeed ${need.id} from survey ${survey.id}`);
  }

  return need;
}
