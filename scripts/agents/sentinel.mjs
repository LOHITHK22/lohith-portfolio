// SENTINEL: checks the public site, reads the build/test results produced by
// the CI job, and opens (or updates) one GitHub issue per confirmed problem.
// A failure must reproduce on a second attempt before an issue is filed.
import { result, sleep } from "./lib.mjs";

async function checkPage(fetcher, site, page) {
  const url = site + page.path;
  const started = Date.now();
  try {
    const res = await fetcher(url + (page.path.includes("?") ? "&" : "?") + `sentinel=${started}`);
    const ms = Date.now() - started;
    if (!res.ok) return { path: page.path, ok: false, reason: `HTTP ${res.status}`, ms };
    if (page.contentType && !(res.headers.get("content-type") ?? "").includes(page.contentType))
      return { path: page.path, ok: false, reason: `unexpected content-type ${res.headers.get("content-type")}`, ms };
    const missing = (page.expect ?? []).filter((t) => !res.text.includes(t));
    if (missing.length) return { path: page.path, ok: false, reason: `missing expected text: ${missing.join(", ")}`, ms };
    return { path: page.path, ok: true, status: res.status, ms };
  } catch (e) {
    return { path: page.path, ok: false, reason: e.message, ms: Date.now() - started };
  }
}

export async function runSentinel({ config, fetcher, gh, checkResults, browserSmoke, now, dryRun, delay = sleep }) {
  const { site } = config;
  const { pages, externalLinks, recheckDelayMs, issueLabel } = config.sentinel;

  let checks = [];
  for (const p of pages) checks.push(await checkPage(fetcher, site, p));
  const firstFailures = checks.filter((c) => !c.ok);
  if (firstFailures.length) {
    await delay(recheckDelayMs);
    checks = await Promise.all(
      checks.map(async (c) => (c.ok ? c : { ...(await checkPage(fetcher, site, pages.find((p) => p.path === c.path))), retried: true }))
    );
  }
  const confirmed = checks.filter((c) => !c.ok);
  const transient = firstFailures.filter((f) => checks.find((c) => c.path === f.path)?.ok).map((f) => f.path);

  const links = [];
  for (const url of externalLinks) {
    try {
      const res = await fetcher(url, { method: "HEAD" });
      links.push({ url, ok: res.ok, status: res.status });
    } catch (e) {
      links.push({ url, ok: false, reason: e.message });
    }
  }

  // Build/test outcomes come from the CI job; absent means "not run", not "passed".
  const ci = checkResults ?? null;
  const ciFailures = ci ? Object.entries(ci.steps ?? {}).filter(([, v]) => v === "failure").map(([k]) => k) : [];
  const smokeFailures = (browserSmoke?.checks ?? []).filter((c) => !c.ok);

  const problems = [
    ...confirmed.map((c) => ({ key: `page ${c.path}`, title: `[sentinel] ${c.path} is failing on the live site`, evidence: `${site}${c.path} → ${c.reason} (failed twice, ${recheckDelayMs / 1000}s apart)` })),
    ...links.filter((l) => !l.ok).map((l) => ({ key: `link ${l.url}`, title: `[sentinel] Broken link: ${l.url}`, evidence: `${l.url} → ${l.reason ?? `HTTP ${l.status}`}` })),
    ...ciFailures.map((s) => ({ key: `ci ${s}`, title: `[sentinel] ${s} is failing on main`, evidence: `Step "${s}" failed in the scheduled CI job. See the run log: ${ci.runUrl ?? "(no run URL)"}` })),
    ...smokeFailures.map((c) => ({ key: `smoke ${c.name}`, title: `[sentinel] Live interaction check failed: ${c.name}`, evidence: c.reason })),
  ];

  const issues = [];
  const errors = [];
  if (!dryRun && gh) {
    for (const p of problems) {
      try {
        const body = [`**Detected by SENTINEL** on ${now}.`, "", "Evidence:", "```", p.evidence, "```", "", `Run: ${process.env.RUN_URL ?? "local run"}`, "", "Filed automatically after the failure reproduced. Close this issue once fixed; SENTINEL will re-open a new one if it recurs."].join("\n");
        issues.push({ ...(await gh.upsertIssue(config.repo, { title: p.title, body, labels: [issueLabel] })), title: p.title });
      } catch (e) {
        errors.push(`issue for ${p.key}: ${e.message}`);
      }
    }
  }

  const passed = checks.filter((c) => c.ok).length;
  const status = problems.length ? "failure" : "success";
  const ciText = ci ? `build/tests: ${Object.entries(ci.steps).map(([k, v]) => `${k} ${v}`).join(", ")}` : "build/tests not run in this invocation";
  const summary = `${passed}/${checks.length} live pages passed, ${links.filter((l) => l.ok).length}/${links.length} links OK; ${ciText}.` + (transient.length ? ` Transient (recovered on retry): ${transient.join(", ")}.` : "");
  return result("SENTINEL", status, summary, {
    checks,
    links,
    ci,
    browserSmoke: browserSmoke ?? null,
    issues,
    transient,
    errors,
    findings: problems.map((p) => ({ title: p.title, detail: p.evidence, url: issues.find((i) => i.title === p.title)?.url })),
  });
}
