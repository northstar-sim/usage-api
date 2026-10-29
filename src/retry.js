// Delay before retry number `retryIndex` (1-based): baseMs * 2^(retryIndex-1), capped at maxMs.
export function backoffDelay(retryIndex, {baseMs = 200, maxMs = 2000} = {}){
  return Math.min(maxMs, baseMs * 2 ** (retryIndex - 1));
}

// Hard ceiling on total calls, regardless of what the caller asks for.
export const MAX_ATTEMPTS = 3;

const NETWORK_ERROR_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'ENOTFOUND', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT']);

// Only network errors and 5xx responses are transient. Any other HTTP status (including 429) is final, so we never hammer a quota.
export function isRetryable(err){
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  if (status !== undefined) return status >= 500;
  return NETWORK_ERROR_CODES.has(err?.code ?? err?.cause?.code);
}

// Calls fn until it resolves, a non-retryable error is thrown, or the attempt budget (capped at MAX_ATTEMPTS) is spent.
// Sleeps with exponential backoff between tries.
export async function retry(fn, {attempts = 3, baseMs = 200, maxMs = 2000} = {}){
  const budget = Math.min(attempts, MAX_ATTEMPTS);
  for (let attempt = 1; ; attempt++) {
    try { return await fn(); }
    catch (err) {
      if (attempt >= budget || !isRetryable(err)) throw err;
      await new Promise(r => setTimeout(r, backoffDelay(attempt, {baseMs, maxMs})));
    }
  }
}
