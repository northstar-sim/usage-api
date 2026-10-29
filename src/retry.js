// Delay before retry number `retryIndex` (1-based): baseMs * 2^(retryIndex-1), capped at maxMs.
export function backoffDelay(retryIndex, {baseMs = 200, maxMs = 2000} = {}){
  return Math.min(maxMs, baseMs * 2 ** (retryIndex - 1));
}

// Calls fn until it resolves or `attempts` total calls have failed, sleeping with exponential backoff between tries.
export async function retry(fn, {attempts = 3, baseMs = 200, maxMs = 2000} = {}){
  for (let attempt = 1; ; attempt++) {
    try { return await fn(); }
    catch (err) {
      if (attempt >= attempts) throw err;
      await new Promise(r => setTimeout(r, backoffDelay(attempt, {baseMs, maxMs})));
    }
  }
}
