// Request checks for /api/ask, the only route that spends a private credential (the server-side
// OpenAI key). They run before anything is parsed or any paid call is made, and are pure so they
// can be tested without a server.
//
// What they stop: other websites making a visitor's browser call the endpoint (cross-site POSTs,
// including "simple" text/plain requests that skip the CORS preflight), oversized bodies, and
// non-JSON payloads. What they cannot stop on their own: a determined script that forges the
// headers. That is what the per-IP and per-instance limits in askRateLimit.ts, the per-answer token
// cap, and the provider-side spending limit (set in the OpenAI dashboard) are for.

export const MAX_ASK_BODY_BYTES = 2048;

type HeaderSource = { get(name: string): string | null };

export type GuardResult = { status: number; error: string } | null;

/** The origin this request was addressed to, as the browser saw it (scheme + host). */
function requestOrigin(headers: HeaderSource, url: string): string | null {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return null;
  const proto = headers.get("x-forwarded-proto") ?? new URL(url).protocol.replace(":", "");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}

/**
 * Returns an error to send back, or null when the request may proceed.
 * Same-origin JSON only: browsers always send Origin on a POST from fetch(), and modern ones send
 * Sec-Fetch-Site too, so the site's own Ask panel passes and a cross-site page does not.
 */
export function checkAskRequest(headers: HeaderSource, url: string): GuardResult {
  const type = (headers.get("content-type") ?? "").toLowerCase();
  if (!type.startsWith("application/json")) return { status: 415, error: "Expected a JSON request." };

  const length = Number(headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_ASK_BODY_BYTES) return { status: 413, error: "Request too large." };

  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return { status: 403, error: "Cross-site requests are not allowed." };

  const origin = headers.get("origin");
  const own = requestOrigin(headers, url);
  if (!origin || !own || origin !== own) return { status: 403, error: "Cross-site requests are not allowed." };

  return null;
}

/**
 * The client address used for rate limiting. On Vercel, x-real-ip and x-forwarded-for are set by
 * the platform (client-supplied values are not passed through), so they can be trusted there.
 */
export function clientKey(headers: HeaderSource): string {
  return headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Parses the body text as `{ question: string }`; anything else is null. */
export function parseQuestion(text: string): string | null {
  if (text.length > MAX_ASK_BODY_BYTES) return null;
  try {
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const q = (body as { question?: unknown }).question;
    return typeof q === "string" ? q.trim() : null;
  } catch {
    return null;
  }
}
