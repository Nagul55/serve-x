import { sanitizeSurveyObject, sanitizeText } from '../utils/sanitize.js';
import { SurvexConversation } from '../models/survexConversation.model.js';
import { SurvexSurvey } from '../models/survexSurvey.model.js';
import { upsertCommunityNeedFromSurvexSurvey } from './communityNeedSync.service.js';
import { downloadMetaWhatsAppMedia } from './metaWhatsApp.service.js';
import { createNotification } from '../../../services/notification.service.js';
import { invokeLlm, SURVEY_LLM_FALLBACK_MESSAGE } from '../../../services/llmService.js';

/* ───────────────────────────────────────────────────────────────────────────
   CONSTANTS
   ─────────────────────────────────────────────────────────────────────────── */

const VALID_NEED_TYPES = ['water', 'food', 'health', 'shelter', 'education', 'infrastructure', 'other'];

const NEED_TYPE_ALIASES = {
  medical: 'health',
  hospital: 'health',
  hunger: 'food',
  ration: 'food',
  housing: 'shelter',
  house: 'shelter',
  school: 'education',
  transport: 'infrastructure',
  transportation: 'infrastructure',
  road: 'infrastructure',
  pothole: 'infrastructure',
  potholes: 'infrastructure',
  pit: 'infrastructure',
  pits: 'infrastructure',
  bridge: 'infrastructure',
  drainage: 'infrastructure',
};

const START_COMMANDS = new Set([
  'new survey', 'survey', 'start survey', 'new need',
  'report need', 'start', 'hey servex', 'servex',
]);

const HELP_COMMANDS = new Set(['help', 'menu']);
const CANCEL_COMMANDS = new Set(['cancel', 'stop', 'reset', 'exit']);
const SKIP_PHOTO_COMMANDS = new Set(['skip', 'no photo', 'no pic', 'later']);

/* ───────────────────────────────────────────────────────────────────────────
   HELPERS
   ─────────────────────────────────────────────────────────────────────────── */

function normalizeCommand(message) {
  return String(message || '').trim().toLowerCase();
}

function isYesCommand(message) {
  const norm = normalizeCommand(message);
  return ['yes', 'y', 'submit', 'confirm', 'ok', 'okay', 'start now ✅', 'start_yes'].includes(norm);
}

function isNoCommand(message) {
  return ['no', 'n', 'start_no', 'not now ❌'].includes(normalizeCommand(message));
}

function toIncidentDomain(needType) {
  if (needType === 'health') return 'health';
  if (needType === 'shelter' || needType === 'infrastructure') return 'infrastructure';
  return 'relief';
}

function formatNeedType(value) {
  const normalized = normalizeCommand(value);
  if (NEED_TYPE_ALIASES[normalized]) return NEED_TYPE_ALIASES[normalized];
  if (VALID_NEED_TYPES.includes(normalized)) return normalized;

  for (const value of VALID_NEED_TYPES) {
    if (normalized.includes(value)) {
      return value;
    }
  }

  for (const [alias, mapped] of Object.entries(NEED_TYPE_ALIASES)) {
    if (normalized.includes(alias)) {
      return mapped;
    }
  }

  return null;
}

function firstPositiveNumber(value, { max = 99999 } = {}) {
  const match = String(value || '').match(/\b(\d{1,5})\b/);
  if (!match) return null;

  const parsed = parseInt(match[1], 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) {
    return null;
  }

  return parsed;
}

function getCurrentMissingField(responses) {
  return getMissingFields(responses)[0] || null;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

async function reverseGeocode(lat, lng) {
  try {
    console.log(`[Survex] Reverse geocoding ${lat}, ${lng}...`);
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'User-Agent': 'ServeX-Bot (nagul@example.com)' } },
      5000
    );

    if (!res.ok) {
      console.warn(`[Survex] Nominatim returned status ${res.status}`);
      return null;
    }

    const data = await res.json();
    console.log(`[Survex] Reverse geocode result: ${data.display_name?.slice(0, 50)}...`);
    return data.display_name || null;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`[Survex] Reverse geocode timed out for ${lat},${lng}`);
    } else {
      console.error(`[Survex] Reverse geocode failed for ${lat},${lng}:`, error.message);
    }
    return null;
  }
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

/* ───────────────────────────────────────────────────────────────────────────
   SURVEY FIELD DEFINITIONS — What we need to collect
   ─────────────────────────────────────────────────────────────────────────── */

const REQUIRED_FIELDS = [
  'village_name',
  'need_type',
  'household_count',
  'days_of_issue',
  'description',
  'vulnerable_groups',
  'other_ngo_coverage',
];

function getMissingFields(responses) {
  return REQUIRED_FIELDS.filter((field) => {
    const val = responses[field];
    return val === undefined || val === null || val === '';
  });
}

function isReadyForConfirmation(responses) {
  return getMissingFields(responses).length === 0;
}

function isAwaitingSummaryConfirmation(conversation) {
  const outbound = normalizeCommand(conversation?.lastOutboundMessage || '');
  return outbound.includes('survey summary') || outbound.includes('does this look correct');
}

function isLlmFallbackMessage(message) {
  const normalized = normalizeCommand(message);
  if (!normalized) return true;

  const knownFallbacks = [
    normalizeCommand(SURVEY_LLM_FALLBACK_MESSAGE),
    'i understand. could you please share more details so i can capture this accurately?',
  ];

  return knownFallbacks.some((fallback) => normalized.includes(fallback));
}

function buildSurveySummaryMessage(responses) {
  const r = responses || {};
  const detail = r.coverage_detail ? ` (${r.coverage_detail})` : '';

  return [
    '🧾 *Survey Summary*',
    `• Location: ${r.village_name || '-'}`,
    `• Need type: ${r.need_type || '-'}`,
    `• Households affected: ${r.household_count || '-'}`,
    `• Days of issue: ${r.days_of_issue || '-'}`,
    `• Description: ${r.description || '-'}`,
    `• Vulnerable groups: ${r.vulnerable_groups || '-'}`,
    `• Other NGO/Govt support: ${(r.other_ngo_coverage || '-')}${detail}`,
    '',
    'Does this look correct? Reply *YES* to submit or *NO* to update details.',
  ].join('\n');
}

function buildDeterministicAssistantMessage(fieldOfficerName, responses) {
  const missing = getMissingFields(responses);
  const name = sanitizeText(fieldOfficerName, 80) || 'Field Officer';

  if (missing.length === 0) {
    return buildSurveySummaryMessage(responses);
  }

  const next = missing[0];
  if (next === 'village_name') {
    return `Location noted, ${name}. Please type the village, ward, or nearest landmark for the report.`;
  }
  if (next === 'need_type') {
    return 'Location captured. What is the main issue category: water, food, health, shelter, education, road/infrastructure, or other?';
  }
  if (next === 'household_count') {
    return 'Understood. How many households or regular users are affected? Reply with a number.';
  }
  if (next === 'days_of_issue') {
    return 'For how many days has this issue been going on? Reply with a number.';
  }
  if (next === 'description') {
    const place = responses.village_name ? ` in ${responses.village_name}` : '';
    return `Please describe the issue${place} in one or two sentences. Include what is damaged, blocked, unsafe, or missing.`;
  }
  if (next === 'vulnerable_groups') {
    return 'Who is most affected? Examples: children, elderly, patients, daily commuters, vehicle users, farmers, or all residents.';
  }
  return 'Is any NGO, panchayat, municipality, or government team already helping? Reply yes or no.';
}

function extractFieldsHeuristically(responses, userMessage) {
  const extracted = {};
  const message = sanitizeText(userMessage, 1200);
  const normalized = normalizeCommand(message);
  if (!normalized) {
    return extracted;
  }
  const currentField = getCurrentMissingField(responses);
  const isInternalMarker = message.startsWith('[') && message.endsWith(']');

  const skipAsCommand = HELP_COMMANDS.has(normalized)
    || CANCEL_COMMANDS.has(normalized)
    || START_COMMANDS.has(normalized)
    || SKIP_PHOTO_COMMANDS.has(normalized)
    || isYesCommand(normalized)
    || isNoCommand(normalized)
    || isInternalMarker;

  if (currentField === 'village_name' && !skipAsCommand && message.length >= 2) {
    extracted.village_name = sanitizeText(message, 120);
    return extracted;
  }

  if (currentField === 'need_type') {
    const needType = formatNeedType(normalized);
    if (needType) {
      extracted.need_type = needType;
      return extracted;
    }
  }

  if (currentField === 'household_count') {
    const householdCount = firstPositiveNumber(normalized);
    if (householdCount !== null) {
      extracted.household_count = householdCount;
      return extracted;
    }
  }

  if (currentField === 'days_of_issue') {
    const days = firstPositiveNumber(normalized, { max: 3650 });
    if (days !== null) {
      extracted.days_of_issue = days;
      return extracted;
    }
  }

  if (currentField === 'description' && !skipAsCommand && message.length >= 3) {
    extracted.description = sanitizeText(message, 500);
    return extracted;
  }

  if (currentField === 'vulnerable_groups' && !skipAsCommand && message.length >= 2) {
    extracted.vulnerable_groups = sanitizeText(message, 300);
    return extracted;
  }

  if (currentField === 'other_ngo_coverage') {
    if (isNoCommand(normalized) || /\b(no|none|not yet|nil)\b/.test(normalized)) {
      extracted.other_ngo_coverage = 'no';
      return extracted;
    }
    if (isYesCommand(normalized) || /\b(yes|already|currently)\b/.test(normalized)) {
      extracted.other_ngo_coverage = 'yes';
      if (message.length > 10) {
        extracted.coverage_detail = sanitizeText(message, 160);
      }
      return extracted;
    }
  }

  if (!responses.need_type) {
    const needType = formatNeedType(normalized);
    if (needType) extracted.need_type = needType;
  }

  if (!responses.household_count) {
    const householdMatch = normalized.match(/(\d{1,5})\s*(households?|famil(?:y|ies)|homes?|people)/);
    if (householdMatch) {
      const householdCount = parseInt(householdMatch[1], 10);
      if (Number.isFinite(householdCount) && householdCount > 0 && householdCount <= 99999) {
        extracted.household_count = householdCount;
      }
    }
  }

  if (!responses.days_of_issue) {
    const daysMatch = normalized.match(/(\d{1,4})\s*(day|days|week|weeks|month|months)/);
    if (daysMatch) {
      let days = parseInt(daysMatch[1], 10);
      const unit = daysMatch[2];
      if (unit.startsWith('week')) days *= 7;
      if (unit.startsWith('month')) days *= 30;
      if (Number.isFinite(days) && days > 0 && days <= 3650) {
        extracted.days_of_issue = days;
      }
    }
  }

  if (!responses.other_ngo_coverage) {
    if (/\b(no|none|not yet|nil)\b/.test(normalized)) {
      extracted.other_ngo_coverage = 'no';
    } else if (/\b(yes|already|currently)\b/.test(normalized)) {
      extracted.other_ngo_coverage = 'yes';
      if (!responses.coverage_detail && message.length > 10) {
        extracted.coverage_detail = sanitizeText(message, 160);
      }
    }
  }

  if (!responses.vulnerable_groups) {
    const vulnerable = [];
    if (normalized.includes('child')) vulnerable.push('children');
    if (normalized.includes('elderly') || normalized.includes('senior')) vulnerable.push('elderly');
    if (normalized.includes('pregnant')) vulnerable.push('pregnant women');
    if (normalized.includes('disabled') || normalized.includes('disability')) vulnerable.push('persons with disabilities');
    if (vulnerable.length > 0) {
      extracted.vulnerable_groups = vulnerable.join(', ');
    }
  }

  if (!responses.village_name) {
    const inMatch = message.match(/\b(?:in|at|from)\s+([A-Za-z][A-Za-z\s,.-]{2,80})/i);
    if (inMatch?.[1]) {
      extracted.village_name = sanitizeText(inMatch[1], 100);
    } else if (!skipAsCommand && message.length >= 3 && message.length <= 80 && !/\d/.test(message)) {
      extracted.village_name = sanitizeText(message, 100);
    }
  }

  if (!responses.description && !skipAsCommand && message.length >= 20) {
    extracted.description = sanitizeText(message, 500);
  }

  return extracted;
}

/* ───────────────────────────────────────────────────────────────────────────
   CONVERSATION HISTORY BUILDER — Gives the AI memory
   ─────────────────────────────────────────────────────────────────────────── */

function buildConversationHistory(conversation) {
  const history = [];
  // Reconstruct from lastOutboundMessage and lastInboundMessage pairs stored in the conversation
  // For multi-turn, we rely on the conversation's chatHistory array
  const chatHistory = conversation.chatHistory || [];
  for (const entry of chatHistory) {
    if (entry.role === 'assistant' || entry.role === 'model') {
      history.push({ role: 'assistant', content: entry.content });
    } else {
      history.push({ role: 'user', content: entry.content });
    }
  }
  return history;
}

/* ───────────────────────────────────────────────────────────────────────────
   SYSTEM PROMPT — The AI's brain
   ─────────────────────────────────────────────────────────────────────────── */

function buildSystemPrompt(fieldOfficerName, responses) {
  const missing = getMissingFields(responses);
  const collected = REQUIRED_FIELDS.filter((f) => !missing.includes(f));
  const photoStatus = responses.photo_uploaded ? '✅ Photo received' : '❌ Not yet';
  const locationStatus = responses.location_lat ? '✅ GPS received' : '❌ Not yet';

  return `You are the ServeX Survey Assistant — a warm, efficient WhatsApp chatbot that helps Field Officers report community needs.

FIELD OFFICER: ${fieldOfficerName}

YOUR GOAL: Collect these 7 pieces of information through natural conversation, one at a time:
1. village_name — Village, ward, or area name (text)
2. need_type — One of: water, food, health, shelter, education, infrastructure, other
3. household_count — Number of households affected (integer)
4. days_of_issue — How many days has this issue been going on (integer)
5. description — Detailed description of the problem (text)
6. vulnerable_groups — Which vulnerable groups are affected: children, elderly, pregnant women, disabled, etc. (text)
7. other_ngo_coverage — Is any other NGO or government agency already helping? (yes/no, with detail if yes)

CURRENT DATA COLLECTED:
${JSON.stringify(responses, null, 2)}

FIELDS ALREADY COLLECTED: ${collected.length > 0 ? collected.join(', ') : 'None yet'}
FIELDS STILL NEEDED: ${missing.length > 0 ? missing.join(', ') : 'ALL COLLECTED ✅'}
Photo status: ${photoStatus}
Location status: ${locationStatus}

RULES:
- Ask for ONE missing field at a time. Start with the first missing field from the list above.
- Be warm, empathetic, and brief (2-3 sentences max).
- If the user provides information for a field, acknowledge it naturally and move to the next missing field.
- If the user provides multiple pieces of information in one message, acknowledge all of them.
- If the user says something unclear, ask for clarification for that specific field.
- Use simple language. Support Tamil/regional context (village names, local issues).
- When asking about need_type, list the options: water, food, health, shelter, education, infrastructure, or other.
- For household_count and days_of_issue, ask for a number.
- For other_ngo_coverage, ask "Is any other NGO or government helping with this? (yes/no)"

WHEN ALL 7 FIELDS ARE COLLECTED:
- Show a complete summary card with ALL collected data
- Ask: "Does this look correct? Reply YES to submit or NO to make changes."
- Include the marker [[SHOW_SUMMARY]] at the end of your message.

WHEN THE USER CONFIRMS (says yes/submit/confirm after seeing summary):
- Output ONLY: [[SUBMIT_SURVEY]]

WHEN THE USER SAYS NO TO SUMMARY:
- Ask which field they want to change.

IMPORTANT: Do NOT output [[SUBMIT_SURVEY]] unless the user has explicitly confirmed the summary.
IMPORTANT: Do NOT make up data. Only use what the field officer tells you.
IMPORTANT: Always use the emoji markers as described.`;
}

/* ───────────────────────────────────────────────────────────────────────────
   DATA EXTRACTION — Parse AI response to update survey data
   ─────────────────────────────────────────────────────────────────────────── */

async function extractFieldsFromConversation(responses, userMessage, aiResponse) {
  try {
    const extractionPrompt = `You are a data extraction engine. Based on the user's message and the AI assistant's response, extract any survey field values that were provided.

CURRENT DATA:
${JSON.stringify(responses, null, 2)}

USER MESSAGE: "${userMessage}"
AI RESPONSE: "${aiResponse}"

FIELDS TO EXTRACT (only include fields that have NEW data from the user message):
- village_name (string): village, ward, area name
- need_type (string): must be one of: water, food, health, shelter, education, infrastructure, other
- household_count (number): number of households affected
- days_of_issue (number): number of days the issue has been going on
- description (string): description of the problem
- vulnerable_groups (string): affected vulnerable groups
- other_ngo_coverage (string): "yes" or "no" — is another NGO/govt helping
- coverage_detail (string): details about existing coverage (only if other_ngo_coverage is "yes")

Return ONLY a JSON object with the fields that have new values. Do NOT include fields where no new data was provided. If no new fields can be extracted, return {}.`;

    const result = await invokeLlm(
      [
        { role: 'system', content: 'You are a precise JSON data extractor. Return ONLY valid JSON. No explanations.' },
        { role: 'user', content: extractionPrompt },
      ],
      { type: 'object' }
    );

    if (result && typeof result === 'object' && !result.content) {
      // Normalize extracted values
      const extracted = {};

      if (result.village_name && typeof result.village_name === 'string') {
        extracted.village_name = result.village_name.trim();
      }
      if (result.need_type) {
        const nt = formatNeedType(result.need_type);
        if (nt) extracted.need_type = nt;
      }
      if (result.household_count !== undefined) {
        const hc = parseInt(String(result.household_count), 10);
        if (Number.isFinite(hc) && hc > 0 && hc <= 99999) {
          extracted.household_count = hc;
        }
      }
      if (result.days_of_issue !== undefined) {
        const di = parseInt(String(result.days_of_issue), 10);
        if (Number.isFinite(di) && di > 0 && di <= 3650) {
          extracted.days_of_issue = di;
        }
      }
      if (result.description && typeof result.description === 'string') {
        extracted.description = result.description.trim();
      }
      if (result.vulnerable_groups && typeof result.vulnerable_groups === 'string') {
        extracted.vulnerable_groups = result.vulnerable_groups.trim();
      }
      if (result.other_ngo_coverage !== undefined) {
        const val = String(result.other_ngo_coverage).toLowerCase().trim();
        extracted.other_ngo_coverage = val === 'yes' || val === 'true' ? 'yes' : 'no';
      }
      if (result.coverage_detail && typeof result.coverage_detail === 'string') {
        extracted.coverage_detail = result.coverage_detail.trim();
      }

      return extracted;
    }

    return {};
  } catch (error) {
    console.error('[Survex AI] Extraction failed:', error.message);
    return {};
  }
}

/* ───────────────────────────────────────────────────────────────────────────
   SURVEY DATA BUILDER — Converts responses into structured survey record
   ─────────────────────────────────────────────────────────────────────────── */

function buildSurveyDataFromResponses(fieldOfficerName, responses) {
  const r = responses || {};

  return {
    incident_domain: toIncidentDomain(r.need_type),
    name: sanitizeText(fieldOfficerName, 100),
    location: r.village_name || '',
    issue: r.description || r.need_type || '',
    severity: r.days_of_issue ? String(r.days_of_issue) : '',
    people_affected: r.household_count ? String(r.household_count) : '',
    urgency: r.days_of_issue ? String(r.days_of_issue) : '',
    household_type: r.vulnerable_groups || '',
    access_constraints: r.coverage_detail || '',
    need_type: r.need_type || '',
    village_name: r.village_name || '',
    household_count: r.household_count || 0,
    days_of_issue: r.days_of_issue || 0,
    description: r.description || '',
    vulnerable_groups: r.vulnerable_groups || '',
    other_ngo_coverage: r.other_ngo_coverage || '',
    coverage_detail: r.coverage_detail || '',
    photo_uploaded: r.photo_uploaded || false,
    photo_url: r.photo_url || '',
    location_lat: r.location_lat || null,
    location_lng: r.location_lng || null,
  };
}

/* ───────────────────────────────────────────────────────────────────────────
   HELP & IDLE MENUS
   ─────────────────────────────────────────────────────────────────────────── */

function buildHelpMenu(fieldOfficerName) {
  const name = sanitizeText(fieldOfficerName, 80) || 'Field Officer';
  return [
    `🌿 *ServeX Help — ${name}*`,
    '',
    '📝 *new survey* — Start a new community needs report',
    '❌ *cancel* — Cancel the current survey',
    '🔄 *reset* — Clear session and start fresh',
    '❓ *help* — Show this menu',
    '',
    '_During a survey, just reply to each question naturally._',
    '_Send a photo when prompted or type "skip"._',
    '_Reply YES to submit or NO to restart._',
  ].join('\n');
}

function buildIdlePrompt(fieldOfficerName) {
  const name = sanitizeText(fieldOfficerName, 80) || 'Field Officer';
  return [
    `👋 *Hello ${name}!*`,
    '',
    'Type *new survey* to start reporting community needs.',
    'Type *help* to see all commands.',
  ].join('\n');
}

async function saveConversationTurn({
  conversation,
  chatHistory,
  currentUserMessage,
  messageSid,
  outboundMessage,
}) {
  chatHistory.push({ role: 'user', content: currentUserMessage });
  chatHistory.push({ role: 'assistant', content: outboundMessage });

  while (chatHistory.length > 40) {
    chatHistory.shift();
  }

  conversation.chatHistory = chatHistory;
  conversation.lastInboundMessage = sanitizeText(currentUserMessage, 1000);
  conversation.lastInboundMessageSid = sanitizeText(messageSid, 200);
  conversation.lastOutboundMessage = sanitizeText(outboundMessage, 3500);
  conversation.lastMessageAt = new Date();
  conversation.markModified('chatHistory');
  conversation.markModified('responses');
  await conversation.save();
}

/* ───────────────────────────────────────────────────────────────────────────
   BEGIN SURVEY — Creates a new active conversation
   ─────────────────────────────────────────────────────────────────────────── */

export async function beginSurveyConversation({ fieldOfficer, coordinatorId, inboundText, messageSid }) {
  // Cancel any existing active conversations
  await SurvexConversation.updateMany(
    { fieldOfficerId: fieldOfficer.id, status: 'active' },
    { status: 'cancelled', completedAt: new Date() }
  );

  const welcomeMessage = [
    `👋 *Hey ${fieldOfficer.name}!* Let's start a new community survey.`,
    '',
    '📍 First, could you share the *location*?',
    'You can either:',
    '• Share your WhatsApp location pin 📌',
    '• Or type the village/area name',
  ].join('\n');

  const conversation = await SurvexConversation.create({
    fieldOfficerId: fieldOfficer.id,
    coordinatorId,
    status: 'active',
    questionIndex: 0,
    responses: {},
    chatHistory: [
      { role: 'assistant', content: welcomeMessage },
    ],
    lastInboundMessage: sanitizeText(inboundText, 500),
    lastInboundMessageSid: sanitizeText(messageSid, 200),
    lastOutboundMessage: welcomeMessage,
    lastMessageAt: new Date(),
  });

  return {
    type: 'question',
    message: welcomeMessage,
    conversation,
  };
}

/* ───────────────────────────────────────────────────────────────────────────
   COMPLETE SURVEY — Saves survey, syncs to CommunityNeed
   ─────────────────────────────────────────────────────────────────────────── */

async function completeSurvey({ conversation, fieldOfficer, coordinatorId, from, to, messageSid, messageType }) {
  const surveyData = buildSurveyDataFromResponses(fieldOfficer.name, conversation.responses || {});

  const survey = await SurvexSurvey.create({
    fieldOfficerId: fieldOfficer.id,
    coordinatorId,
    surveyData,
    timestamp: new Date(),
    rawMessage: JSON.stringify(conversation.responses || {}),
    status: 'pending',
    source: 'whatsapp',
    meta: {
      from,
      to,
      messageSid: sanitizeText(`${messageSid || ''}|${messageType || 'text'}`, 200),
      photo_url: conversation.responses?.photo_url || '',
      location_coords: {
        lat: conversation.responses?.location_lat || null,
        lng: conversation.responses?.location_lng || null,
      },
    },
  });

  let communityNeed = null;
  try {
    communityNeed = await upsertCommunityNeedFromSurvexSurvey({
      survey,
      surveyData,
      fieldOfficer,
    });
  } catch (error) {
    console.error(`[Survex] Failed to sync CommunityNeed for survey ${survey.id}: ${error.message}`);
  }

  const submittedMessage = [
    '🎉 *Survey Submitted Successfully!*',
    '',
    `📋 Reference ID: \`${survey.id}\``,
    communityNeed?.id ? `🎫 Coordinator Ticket: \`${communityNeed.id}\`` : '',
    '',
    'Your coordinator will review this and assign a volunteer.',
    'Type *new survey* to submit another report.',
  ].filter(Boolean).join('\n');

  conversation.status = 'completed';
  conversation.completedAt = new Date();
  conversation.lastMessageAt = new Date();
  conversation.lastOutboundMessage = submittedMessage;
  await conversation.save();

  try {
    const reporterName = sanitizeText(fieldOfficer?.name || 'Field Officer', 100);
    const location = sanitizeText(surveyData?.village_name || surveyData?.location || 'Unknown location', 120);
    const needType = sanitizeText(surveyData?.need_type || 'general', 60);

    await createNotification({
      target_role: 'coordinator',
      target_user_id: '',
      type: 'survex_survey_submitted',
      title: 'New Survey Registered',
      message: `New ${needType} survey registered from ${location} by Field Officer ${reporterName}.`,
      source: 'survex',
      source_ref_type: 'survex_survey',
      source_ref_id: String(survey.id || ''),
      metadata: {
        surveyId: survey.id,
        coordinatorId,
        fieldOfficerId: fieldOfficer?.id || '',
        fieldOfficerName: reporterName,
        location,
        needType,
      },
    });
  } catch (error) {
    console.warn(`[Survex] Failed to create survey notification for ${survey.id}: ${error.message}`);
  }

  return {
    type: 'completed',
    message: submittedMessage,
    survey,
    communityNeed,
    conversation,
  };
}

/* ───────────────────────────────────────────────────────────────────────────
   CONTINUE SURVEY — Main conversation handler
   ─────────────────────────────────────────────────────────────────────────── */

export async function continueSurveyConversation({
  fieldOfficer,
  coordinatorId,
  inboundText,
  from,
  to,
  messageSid,
  messageType,
  mediaId,
  location,
}) {
  const sanitizedInbound = sanitizeText(inboundText, 1200);
  const normalizedCmd = normalizeCommand(sanitizedInbound);

  // ── Handle global commands ───────────────────────────────────────────
  if (HELP_COMMANDS.has(normalizedCmd)) {
    return { type: 'help', message: buildHelpMenu(fieldOfficer.name) };
  }

  if (CANCEL_COMMANDS.has(normalizedCmd)) {
    await SurvexConversation.updateMany(
      { fieldOfficerId: fieldOfficer.id, status: 'active' },
      { status: 'cancelled', completedAt: new Date(), lastInboundMessage: sanitizedInbound, lastMessageAt: new Date() }
    );
    return { type: 'cancelled', message: '❌ Survey cancelled. Type *new survey* anytime to start again.' };
  }

  // ── Find active conversation ─────────────────────────────────────────
  let conversation = await SurvexConversation.findOne({
    fieldOfficerId: fieldOfficer.id,
    status: 'active',
  });

  if (!conversation) {
    if (START_COMMANDS.has(normalizedCmd) || isYesCommand(normalizedCmd) || normalizedCmd.includes('survey')) {
      return beginSurveyConversation({
        fieldOfficer,
        coordinatorId,
        inboundText: sanitizedInbound,
        messageSid,
      });
    }
    return { type: 'awaiting_start', message: buildIdlePrompt(fieldOfficer.name) };
  }

  // ── Handle restart commands ──────────────────────────────────────────
  if (START_COMMANDS.has(normalizedCmd) && normalizedCmd !== 'start' && !isYesCommand(normalizedCmd)) {
    return beginSurveyConversation({
      fieldOfficer,
      coordinatorId,
      inboundText: sanitizedInbound,
      messageSid,
    });
  }

  const normalizedMessageSid = sanitizeText(messageSid, 200);
  if (normalizedMessageSid && normalizedMessageSid === conversation.lastInboundMessageSid) {
    return {
      type: 'duplicate',
      skipReply: true,
      message: '',
      conversation,
    };
  }

  const responses = conversation.responses || {};
  const chatHistory = conversation.chatHistory || [];
  let capturedStructuredData = false;
  const awaitingSummaryConfirmation = isAwaitingSummaryConfirmation(conversation);

  // ── Capture GPS Location ─────────────────────────────────────────────
  if (location && (location.latitude !== undefined && location.longitude !== undefined)) {
    try {
      console.log(`[Survex] Capturing location: ${location.latitude}, ${location.longitude}`);
      responses.location_lat = location.latitude;
      responses.location_lng = location.longitude;

      // Only attempt geocoding if we don't have a village name yet
      if (!responses.village_name) {
        const addr = await reverseGeocode(location.latitude, location.longitude);
        if (addr) {
          responses.village_name = sanitizeText(addr, 100);
        } else if (location.name || location.address) {
          responses.village_name = sanitizeText(location.name || location.address, 100);
        } else {
          responses.village_name = sanitizeText(
            inferKnownLocalPlace(location.latitude, location.longitude) || 'Pinned field location',
            100
          );
        }
      }

      conversation.responses = responses;
      conversation.markModified('responses');
      await conversation.save();
      capturedStructuredData = true;
    } catch (e) {
      console.error('[Survex] Location capture failed:', e.message);
    }
  }

  // ── Capture Photo ────────────────────────────────────────────────────
  if (messageType === 'image' && mediaId) {
    try {
      const photoUrl = await downloadMetaWhatsAppMedia(mediaId);
      if (photoUrl) {
        responses.photo_uploaded = true;
        responses.photo_url = photoUrl;
        conversation.responses = responses;
        conversation.markModified('responses');
        await conversation.save();
      }
    } catch (e) {
      console.error('[Survex] Photo capture failed:', e.message);
    }
  }

  // ── Handle photo skip command ────────────────────────────────────────
  if (SKIP_PHOTO_COMMANDS.has(normalizedCmd) && !responses.photo_uploaded) {
    responses.photo_uploaded = false;
  }

  // ── Build conversation for AI ────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(fieldOfficer.name, responses);

  // Build full message history for the AI
  const aiMessages = [
    { role: 'system', content: systemPrompt },
  ];

  // Add chat history (provides the AI with memory of past turns)
  for (const entry of chatHistory) {
    aiMessages.push({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: entry.content,
    });
  }

  // Add the current user message
  let currentUserMessage = sanitizedInbound;
  if (messageType === 'location' && location?.latitude) {
    currentUserMessage = `[Shared GPS location: ${location.latitude}, ${location.longitude}${responses.village_name ? ` — ${responses.village_name}` : ''}]`;
  } else if (messageType === 'image') {
    currentUserMessage = sanitizedInbound || '[Sent a photo]';
  }

  aiMessages.push({ role: 'user', content: currentUserMessage });

  const heuristicExtracted = extractFieldsHeuristically(responses, currentUserMessage);
  if (Object.keys(heuristicExtracted).length > 0) {
    Object.assign(responses, heuristicExtracted);
    conversation.responses = responses;
    conversation.markModified('responses');
    capturedStructuredData = true;
  }

  if (awaitingSummaryConfirmation && isReadyForConfirmation(responses) && isYesCommand(normalizedCmd)) {
    return completeSurvey({ conversation, fieldOfficer, coordinatorId, from, to, messageSid, messageType });
  }

  if (awaitingSummaryConfirmation && isReadyForConfirmation(responses) && isNoCommand(normalizedCmd)) {
    const updatePrompt = 'No problem. Tell me which field you want to update, and share the corrected value.';

    chatHistory.push({ role: 'user', content: currentUserMessage });
    chatHistory.push({ role: 'assistant', content: updatePrompt });
    while (chatHistory.length > 40) {
      chatHistory.shift();
    }

    conversation.chatHistory = chatHistory;
    conversation.lastInboundMessage = sanitizeText(currentUserMessage, 1000);
    conversation.lastInboundMessageSid = normalizedMessageSid;
    conversation.lastOutboundMessage = sanitizeText(updatePrompt, 3500);
    conversation.lastMessageAt = new Date();
    conversation.markModified('chatHistory');
    await conversation.save();

    return {
      type: 'question',
      message: updatePrompt,
      conversation,
    };
  }

  // ── Call the AI ──────────────────────────────────────────────────────
  if (capturedStructuredData) {
    const deterministicMessage = buildDeterministicAssistantMessage(fieldOfficer.name, responses);
    await saveConversationTurn({
      conversation,
      chatHistory,
      currentUserMessage,
      messageSid: normalizedMessageSid,
      outboundMessage: deterministicMessage,
    });

    return {
      type: 'question',
      message: deterministicMessage,
      conversation,
    };
  }

  console.log(`[Survex AI] Processing from ${fieldOfficer.name}: "${currentUserMessage.slice(0, 80)}"`);

  let aiMessage = SURVEY_LLM_FALLBACK_MESSAGE;
  try {
    const aiResult = await invokeLlm(aiMessages);
    aiMessage = aiResult?.content || aiMessage;
  } catch (e) {
    console.error('[Survex AI] LLM call failed:', e.message);
  }

  // ── Check for survey completion markers ──────────────────────────────
  if (aiMessage.includes('[[SUBMIT_SURVEY]]')) {
    return completeSurvey({ conversation, fieldOfficer, coordinatorId, from, to, messageSid, messageType });
  }

  // Clean markers from message before sending to user
  let cleanedMessage = aiMessage
    .replace(/\[\[SHOW_SUMMARY\]\]/g, '')
    .replace(/\[\[SUBMIT_SURVEY\]\]/g, '')
    .replace(/\[\[RESTART_SURVEY\]\]/g, '')
    .trim();

  // ── Extract structured data from the conversation ────────────────────
  try {
    const extracted = await extractFieldsFromConversation(responses, currentUserMessage, cleanedMessage);
    if (extracted && Object.keys(extracted).length > 0) {
      Object.assign(responses, extracted);
      conversation.responses = responses;
      conversation.markModified('responses');
    }
  } catch (e) {
    console.error('[Survex AI] Field extraction failed:', e.message);
  }

  if (!cleanedMessage || isLlmFallbackMessage(cleanedMessage)) {
    cleanedMessage = buildDeterministicAssistantMessage(fieldOfficer.name, responses);
  }

  // ── Update conversation state ────────────────────────────────────────
  await saveConversationTurn({
    conversation,
    chatHistory,
    currentUserMessage,
    messageSid: normalizedMessageSid,
    outboundMessage: cleanedMessage,
  });

  return {
    type: 'question',
    message: cleanedMessage,
    conversation,
  };
}
