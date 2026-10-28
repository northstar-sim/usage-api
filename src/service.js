export const MAX_RANGE_DAYS = 31;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function status(){ return {service: 'usage-api', status: 'ok', version: '1.0.0'}; }

// Parses a strict YYYY-MM-DD calendar date as UTC midnight; returns null if invalid.
export function parseDate(value){
  if (typeof value !== 'string') return null;
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  // Reject rollovers such as 2025-02-30 -> 2025-03-02.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

export function validateRange(from, to){
  if (from == null || from === '') return {error: 'missing_from', message: 'Query parameter "from" is required (YYYY-MM-DD).'};
  if (to == null || to === '') return {error: 'missing_to', message: 'Query parameter "to" is required (YYYY-MM-DD).'};
  const start = parseDate(from);
  if (!start) return {error: 'invalid_from', message: '"from" must be a valid calendar date in YYYY-MM-DD format.'};
  const end = parseDate(to);
  if (!end) return {error: 'invalid_to', message: '"to" must be a valid calendar date in YYYY-MM-DD format.'};
  if (start > end) return {error: 'invalid_range', message: '"from" must be on or before "to".'};
  const days = (end - start) / DAY_MS + 1;
  if (days > MAX_RANGE_DAYS) return {error: 'range_too_large', message: `Date range must not exceed ${MAX_RANGE_DAYS} days (inclusive).`};
  return {start, end, days};
}

// Deterministic synthetic request count derived from the date string (FNV-1a); no real data.
function syntheticRequests(isoDate){
  let h = 0x811c9dc5;
  for (const ch of isoDate) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return 1000 + (h % 9000);
}

export function dailyUsage(start, days){
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    out.push({date, requests: syntheticRequests(date)});
  }
  return out;
}

// Routes a request URL to {statusCode, body}; kept free of I/O for testing.
export function route(method, rawUrl){
  const url = new URL(rawUrl, 'http://localhost');
  if (method !== 'GET') return {statusCode: 405, body: {error: 'method_not_allowed', message: 'Only GET is supported.'}};
  if (url.pathname === '/health') return {statusCode: 200, body: status()};
  if (url.pathname === '/usage') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const result = validateRange(from, to);
    if (result.error) return {statusCode: 400, body: {error: result.error, message: result.message}};
    return {statusCode: 200, body: {from, to, days: result.days, synthetic: true, usage: dailyUsage(result.start, result.days)}};
  }
  return {statusCode: 404, body: {error: 'not_found', message: 'Unknown route.'}};
}
