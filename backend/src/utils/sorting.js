const ALLOWED_SORT_FIELDS = new Set(['created_date', 'updated_date', 'urgency_score', 'status', 'scheduled_date']);

export function parseSort(rawSort = '-created_date') {
  const value = String(rawSort || '-created_date');
  const fields = value
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);

  const sort = {};
  for (const field of fields) {
    const direction = field.startsWith('-') ? -1 : 1;
    const key = field.replace(/^-/, '');
    if (ALLOWED_SORT_FIELDS.has(key)) {
      sort[key] = direction;
    }
  }

  if (Object.keys(sort).length === 0) {
    sort.created_date = -1;
  }

  return sort;
}

export function parseLimit(rawLimit = '100') {
  const n = Number(rawLimit);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(Math.floor(n), 500);
}
