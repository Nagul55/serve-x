import { invokeLlm } from '../../../services/llmService.js';
import { sanitizeText } from '../utils/sanitize.js';

const DOMAIN_ORDER = ['health', 'relief', 'infrastructure'];

const CORE_QUESTIONS = [
  {
    key: 'incident_domain',
    prompt: 'Which survey domain fits this case: health, relief, or infrastructure?',
  },
  {
    key: 'name',
    prompt: 'What is the full name of the respondent or primary contact?',
  },
  {
    key: 'location',
    prompt: 'What is the exact location (village/ward/city and landmark)?',
  },
  {
    key: 'issue',
    prompt: 'What is the primary issue observed on the ground?',
  },
  {
    key: 'severity',
    prompt: 'How severe is this case: low, medium, high, or critical?',
  },
  {
    key: 'people_affected',
    prompt: 'Approximately how many people are affected?',
  },
  {
    key: 'urgency',
    prompt: 'When is intervention needed: today, this week, or this month?',
  },
  {
    key: 'household_type',
    prompt: 'Which groups are most impacted (children, elderly, women, mixed households)?',
  },
  {
    key: 'access_constraints',
    prompt: 'Are there access or safety constraints for the response team?',
  },
];

const DOMAIN_CONFIG = {
  health: {
    label: 'Health',
    toneGuidance: 'Use clinical, safety-first language focused on patient risk and urgent care pathways.',
    questions: [
      { key: 'health_symptoms', prompt: 'What key symptoms or health conditions are reported?' },
      { key: 'health_critical_cases', prompt: 'Are there critical cases requiring immediate referral? (yes/no + details)' },
      { key: 'health_needed_support', prompt: 'What immediate health support is needed (doctor, medicine, ambulance, camp)?' },
    ],
  },
  relief: {
    label: 'Relief',
    toneGuidance: 'Use humanitarian language that is empathetic, practical, and dignity-centered.',
    questions: [
      { key: 'relief_type_needed', prompt: 'What relief is needed most (food, water, shelter, hygiene, cash)?' },
      { key: 'relief_days_without_supply', prompt: 'How many days have affected households gone without essentials?' },
      { key: 'relief_distribution_barriers', prompt: 'What barriers are blocking distribution (roads, weather, crowding, security)?' },
    ],
  },
  infrastructure: {
    label: 'Infrastructure',
    toneGuidance: 'Use operational engineering language focused on assets, service disruption, and repair urgency.',
    questions: [
      { key: 'infra_asset_type', prompt: 'Which infrastructure is impacted (road, bridge, power, water, drainage, school)?' },
      { key: 'infra_service_disruption', prompt: 'What services are disrupted and for how long?' },
      { key: 'infra_damage_level', prompt: 'What is the estimated damage level (minor, moderate, major, collapsed)?' },
    ],
  },
};

const ENDING_QUESTIONS = [
  {
    key: 'additional_notes',
    prompt: 'Any additional notes, escalation risks, or follow-up instructions?',
  },
];

function detectDomainFromText(value) {
  const text = String(value || '').toLowerCase();
  if (!text) return null;

  if (/\b(health|medical|clinic|hospital|fever|infection|ambulance|medicine)\b/.test(text)) {
    return 'health';
  }

  if (/\b(relief|ration|food|water|shelter|hygiene|cash|livelihood)\b/.test(text)) {
    return 'relief';
  }

  if (/\b(infrastructure|road|bridge|drain|drainage|power|electricity|waterline|pipeline|school building)\b/.test(text)) {
    return 'infrastructure';
  }

  return null;
}

export function normalizeSurveyDomain(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return null;

  if (text === '1' || text === 'health') return 'health';
  if (text === '2' || text === 'relief') return 'relief';
  if (text === '3' || text === 'infrastructure') return 'infrastructure';

  if (text === 'health' || text.includes('health')) return 'health';
  if (text === 'relief' || text.includes('relief')) return 'relief';
  if (text === 'infrastructure' || text.includes('infrastructure')) return 'infrastructure';

  return detectDomainFromText(text);
}

export function getSurveyDomainFromResponses(responses = {}) {
  const direct = normalizeSurveyDomain(responses.incident_domain);
  if (direct) return direct;

  const inferred = detectDomainFromText(responses.issue || '');
  return inferred || 'relief';
}

export function getSurveyQuestionsForResponses(responses = {}) {
  const explicitDomain = normalizeSurveyDomain(responses.incident_domain);
  const inferredDomain = detectDomainFromText(responses.issue || '');
  const domain = explicitDomain || inferredDomain || null;

  if (!domain) {
    return {
      domain: 'general',
      domainLabel: 'General',
      toneGuidance: 'Use concise neutral field language until domain is selected.',
      questions: [...CORE_QUESTIONS, ...ENDING_QUESTIONS],
    };
  }

  const domainQuestions = DOMAIN_CONFIG[domain]?.questions || [];

  return {
    domain,
    domainLabel: DOMAIN_CONFIG[domain]?.label || 'Relief',
    toneGuidance: DOMAIN_CONFIG[domain]?.toneGuidance || DOMAIN_CONFIG.relief.toneGuidance,
    questions: [...CORE_QUESTIONS, ...domainQuestions, ...ENDING_QUESTIONS],
  };
}

export function getSupportedSurveyDomains() {
  return DOMAIN_ORDER.slice();
}

function fallbackQuestionMessage({ questionText, questionNumber, totalQuestions, domainLabel }) {
  return `ServeX ${domainLabel} Survey ${questionNumber}/${totalQuestions}: ${questionText}`;
}

async function callLlm(prompt) {
  const result = await invokeLlm([
    { role: 'user', content: prompt },
  ]);

  const text = result?.content || '';
  if (!text) {
    throw new Error('LLM returned an empty response');
  }

  return sanitizeText(text, 300);
}

export async function buildSurveyQuestionMessage({
  officerName,
  domain,
  domainLabel,
  toneGuidance,
  questionText,
  questionNumber,
  totalQuestions,
  collectedResponses,
}) {
  const fallback = fallbackQuestionMessage({
    questionText,
    questionNumber,
    totalQuestions,
    domainLabel,
  });

  const responseCount = Object.keys(collectedResponses || {}).length;
  const prompt = [
    'You are ServeX Survey Assistant for WhatsApp.',
    'Ask exactly one survey question in domain-specific field language.',
    `Domain: ${domain} (${domainLabel}).`,
    `Tone profile: ${toneGuidance}`,
    `Question number must be shown as ${questionNumber}/${totalQuestions}.`,
    'Keep response below 32 words.',
    'Do not use markdown or bullet points.',
    'Include only one question and no extra commentary.',
    '',
    `Field officer: ${officerName || 'Field Officer'}`,
    `Collected responses so far: ${responseCount}`,
    `Next required survey question: ${questionText}`,
  ].join('\n');

  try {
    return await callLlm(prompt);
  } catch (error) {
    console.warn('DeepSeek survey generation unavailable, using fallback:', error.message);
    return fallback;
  }
}
