const CATEGORY_KEYWORDS = {
  food: ['food', 'hunger', 'meal', 'ration', 'nutrition', 'rice', 'groceries'],
  medical: ['medical', 'medicine', 'doctor', 'hospital', 'injury', 'health'],
  shelter: ['shelter', 'housing', 'roof', 'home', 'rent'],
  education: ['school', 'education', 'books', 'teacher', 'tuition'],
  mental_health: ['mental', 'counseling', 'stress', 'trauma', 'anxiety'],
  elderly_care: ['elderly', 'senior', 'aged'],
  childcare: ['child', 'children', 'baby', 'infant'],
  transportation: ['transport', 'vehicle', 'bus', 'travel', 'ambulance'],
};

const URGENCY_RULES = [
  { level: 'critical', score: 92, words: ['critical', 'urgent', 'immediately', 'life threatening'] },
  { level: 'high', score: 78, words: ['high', 'asap', 'soon', 'serious'] },
  { level: 'medium', score: 58, words: ['moderate', 'needed', 'important'] },
];

function detectCategory(text = '') {
  const lower = text.toLowerCase();
  for (const [category, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => lower.includes(w))) {
      return category;
    }
  }
  return 'other';
}

function detectUrgency(text = '') {
  const lower = text.toLowerCase();
  for (const rule of URGENCY_RULES) {
    if (rule.words.some((w) => lower.includes(w))) {
      return { urgency_level: rule.level, urgency_score: rule.score };
    }
  }
  return { urgency_level: 'medium', urgency_score: 55 };
}

function estimateBeneficiaries(text = '') {
  const match = text.match(/\b(\d{1,4})\b/);
  if (!match) return 10;
  return Number(match[1]);
}

function shortTitle(text = '') {
  const sentence = text.trim().split(/[.!?\n]/).find(Boolean) || 'Community support required';
  return sentence.slice(0, 70);
}

function extractVolunteerIds(prompt = '') {
  const lines = prompt.split('\n').map((line) => line.trim());
  const ids = [];
  for (const line of lines) {
    const m = line.match(/ID:\s*([^,\s]+)/i);
    if (m?.[1]) {
      ids.push(m[1]);
    }
  }
  return ids.slice(0, 3);
}

function extractReportText(prompt = '') {
  const reportMatch = prompt.match(/Field Report:\s*"([\s\S]*?)"/i);
  if (reportMatch?.[1]) return reportMatch[1];
  const generic = prompt.match(/Report:\s*"([\s\S]*?)"/i);
  return generic?.[1] || prompt;
}

export function buildFallbackLlmResponse({ prompt = '', responseSchema = {} }) {
  const promptStr = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
  const props = responseSchema?.properties || {};

  if (props.recommended_ids) {
    return { recommended_ids: extractVolunteerIds(promptStr) };
  }

  const report = extractReportText(promptStr);
  const category = detectCategory(report);
  const urgency = detectUrgency(report);
  const beneficiaries = estimateBeneficiaries(report);
  const title = shortTitle(report);

  if (props.needs) {
    return {
      analysis: 'Automated fallback analysis generated from report text.',
      needs: [
        {
          title,
          category,
          ...urgency,
          beneficiaries_count: beneficiaries,
          description: report,
        },
      ],
    };
  }

  // If no schema properties matched, return as a text-mode fallback
  return {
    content: `I've noted this report about: ${title}. Category: ${category}. ${urgency.urgency_level} urgency. Could you provide more details?`,
    title,
    category,
    ...urgency,
    beneficiaries_count: beneficiaries,
    ai_summary: 'Automated fallback analysis generated from the submitted report text.',
  };
}
