import { test, expect, type Page } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { isPrivateEnvName, scanText } from "../../scripts/security/secret-patterns.mjs";

// Security regression checks against the production build.
// /api/ask is the one route that spends a private credential (OpenAI). Every request below is
// rejected or answered BEFORE the paid call is reached, so these tests never cost anything:
// guard rejections, malformed bodies, and an over-length question (answered locally).

const ASK = "/api/ask";

/** Private values from local .env files and the environment, held in memory only, never printed. */
function privateValues(): Map<string, string> {
  const { combinedEnv } = loadEnvConfig(process.cwd(), false, { info: () => {}, error: () => {} });
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries({ ...combinedEnv, ...process.env })) {
    if (typeof v === "string" && v.trim().length >= 12 && isPrivateEnvName(k)) out.set(v.trim(), k);
  }
  return out;
}

test.describe("security", () => {
  test("security headers are sent and the framework version is not advertised", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-frame-options"]).toBe("SAMEORIGIN");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'self'");
    expect(h["permissions-policy"]).toContain("microphone=()");
    expect(h["x-powered-by"]).toBeUndefined();
    // nosniff also covers the API and the app's own scripts.
    expect((await request.get("/api/ask")).headers()["x-content-type-options"]).toBe("nosniff");
    const html = await res.text();
    const chunk = html.match(/\/_next\/static\/chunks\/[^"]+\.js/)![0];
    expect((await request.get(chunk)).headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("private files and build internals are not served", async ({ request }) => {
    for (const path of ["/.env", "/.env.local", "/.env.production", "/.git/config", "/.git/HEAD", "/package.json", "/next.config.js", "/.next/BUILD_ID", "/scripts/generate-team-audio.ts"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBeGreaterThanOrEqual(400);
      expect(await res.text(), path).not.toMatch(/OPENAI_API_KEY\s*=|ELEVENLABS_API_KEY\s*=|\[core\]/);
    }
  });

  test("/api/ask refuses cross-site, non-JSON, oversized and malformed requests before doing any work", async ({ request, baseURL }) => {
    const own = new URL(baseURL!).origin;
    const json = { "content-type": "application/json" };
    const body = JSON.stringify({ question: "What does Lohith work on?" });
    // Another website, via a visitor's browser.
    let r = await request.post(ASK, { headers: { ...json, origin: "https://attacker.example", "sec-fetch-site": "cross-site" }, data: body });
    expect(r.status()).toBe(403);
    // No Origin at all.
    r = await request.post(ASK, { headers: json, data: body });
    expect(r.status()).toBe(403);
    // Same-looking Origin but the browser says cross-site.
    r = await request.post(ASK, { headers: { ...json, origin: own, "sec-fetch-site": "cross-site" }, data: body });
    expect(r.status()).toBe(403);
    // A "simple" text/plain POST (skips the CORS preflight).
    r = await request.post(ASK, { headers: { "content-type": "text/plain", origin: own }, data: body });
    expect(r.status()).toBe(415);
    // Too large.
    r = await request.post(ASK, { headers: { ...json, origin: own }, data: JSON.stringify({ question: "x".repeat(5000) }) });
    expect(r.status()).toBe(413);
    // Malformed: null, array, wrong type, not JSON.
    for (const bad of ["null", "[]", '{"question":42}', "{not json"]) {
      r = await request.post(ASK, { headers: { ...json, origin: own }, data: bad });
      expect(r.status(), bad).toBe(400);
      expect(JSON.stringify(await r.json())).not.toMatch(/stack|at \w+ \(|node_modules/);
    }
    // Only POST exists.
    expect((await request.get(ASK)).status()).toBe(405);
    expect(r.headers()["cache-control"]).toContain("no-store");
  });

  test("the site's own Ask panel request still passes the guard (answered locally, no paid call)", async ({ page }) => {
    await page.goto("/");
    // A real browser fetch from the page: Origin and Sec-Fetch-Site are set by the browser.
    // The question is over the 300-character limit, so the route answers without calling OpenAI.
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: "x".repeat(301) }) });
      return { status: r.status, body: await r.json() };
    });
    expect(res.status).toBe(200);
    expect(res.body.answer).toMatch(/a bit long/);
  });

  test("no private value or credential pattern reaches the browser on any main page", async ({ page }) => {
    const secrets = privateValues();
    const bodies: { url: string; text: string }[] = [];
    page.on("response", async (res) => {
      const type = res.headers()["content-type"] ?? "";
      if (!/javascript|html|json|text\/x-component|css/.test(type)) return;
      try {
        bodies.push({ url: res.url(), text: await res.text() });
      } catch {
        /* redirects and aborted requests have no body */
      }
    });
    const visit = async (p: Page, path: string) => {
      await p.goto(path);
      await p.waitForLoadState("networkidle");
    };
    for (const path of ["/", "/agent-hq", "/agents", "/resources", "/recruiter", "/event", "/playground/sql-detective", "/playground/incident-commander"]) await visit(page, path);
    expect(bodies.length).toBeGreaterThan(10);
    const problems: string[] = [];
    for (const { url, text } of bodies) {
      for (const f of scanText(text, new URL(url).pathname) as { rule: string; where: string; preview: string }[]) problems.push(`${f.rule} ${f.where} ${f.preview}`);
      for (const [value, name] of secrets) if (text.includes(value)) problems.push(`${name} value in ${new URL(url).pathname}`);
      if (/\.js$/.test(new URL(url).pathname) && /\/\/# sourceMappingURL=/.test(text)) problems.push(`source map reference in ${new URL(url).pathname}`);
    }
    // Browser storage holds nothing secret either.
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    for (const [value, name] of secrets) if (storage.includes(value)) problems.push(`${name} value in web storage`);
    expect(problems).toEqual([]);
  });
});
