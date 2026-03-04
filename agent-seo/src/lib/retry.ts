// src/lib/retry.ts
// Exponential-backoff retry for LLM API calls.
// Retries on rate limits (429), overload (529), and transient network errors.
// Does NOT retry on prompt-too-long (400) or auth errors (401/403).

const RETRYABLE = ["429", "529", "503", "overloaded", "rate_limit", "timeout", "ECONNRESET", "ENOTFOUND"];

function isRetryable(err: unknown): boolean {
  const msg = String(err);
  return RETRYABLE.some(s => msg.includes(s));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  { maxAttempts = 3, baseDelayMs = 2000 }: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isRetryable(err)) throw err;
      const delay = baseDelayMs * 2 ** (attempt - 1); // 2s, 4s, 8s
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
