// Best-effort in-memory rate limit for /api/ask, keyed by IP. This is NOT a
// strict guarantee — serverless instances are ephemeral and can scale to
// multiple concurrent processes, so a determined abuser could still get
// through. It exists as a cheap first layer alongside the per-question
// max_tokens cap and the client-side session question cap (see
// hooks/useAskLohith.ts) — together they bound the realistic cost exposure
// of a feature that calls a paid API from a public, unauthenticated page.
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_WINDOW = 20;

const hits = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - entry.count };
}

// A ceiling on paid calls per server instance per hour, whoever asks. It caps what rotating IP
// addresses can spend through one warm instance. Still per instance, so the OpenAI project's own
// monthly spending limit remains the hard stop.
const GLOBAL_MAX_PER_WINDOW = 120;
let globalWindow = { count: 0, resetAt: 0 };

export function checkGlobalBudget(now = Date.now()): boolean {
  if (now > globalWindow.resetAt) globalWindow = { count: 0, resetAt: now + WINDOW_MS };
  if (globalWindow.count >= GLOBAL_MAX_PER_WINDOW) return false;
  globalWindow.count += 1;
  return true;
}
