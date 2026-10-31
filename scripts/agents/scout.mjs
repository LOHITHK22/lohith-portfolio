// SCOUT: reads allowlisted feeds, keeps fresh, relevant, verified, non-duplicate
// items, and stages them as proposals. Descriptions are the source's own
// summary, trimmed to plain text, with attribution. No model rewrites them.
import { parseFeed, scoreItem, isDuplicate, isNotableRelease, daysBetween, normalizeUrl, result, BudgetExceeded } from "./lib.mjs";

function releaseTitle(src, title) {
  if (src.kind !== "release") return title;
  const project = src.name.replace(/ releases?$/i, "").replace(/\s*\(.*\)$/, "");
  return title.toLowerCase().startsWith(project.toLowerCase()) ? title : `${project} ${title}`;
}

export async function runScout({ config, fetcher, now, curated, proposed, rejected }) {
  const { sources, keywords } = config.scout;
  const { freshnessDays, maxProposalsPerRun, maxProposalsPerSource } = config.limits;
  const known = [...curated, ...proposed, ...rejected];
  const sourceReports = [];
  const candidates = [];
  let budgetHit = false;

  for (const src of sources) {
    const report = { id: src.id, name: src.name, status: "ok", items: 0, kept: 0, skipped: {} };
    const skip = (why) => (report.skipped[why] = (report.skipped[why] ?? 0) + 1);
    try {
      const res = await fetcher(src.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = parseFeed(res.text);
      report.items = items.length;
      if (!items.length) report.status = "empty";
      let keptHere = 0;
      for (const it of items) {
        if (!it.title || !it.link) { skip("malformed"); continue; }
        if (!it.published) { skip("no-date"); continue; }
        if (daysBetween(it.published, now) > freshnessDays) { skip("stale"); continue; }
        if (src.kind === "release" && !isNotableRelease(it.title)) { skip("minor-release"); continue; }
        const cand = {
          id: normalizeUrl(it.link),
          title: releaseTitle(src, it.title),
          url: it.link,
          source: src.name,
          sourceId: src.id,
          kind: src.kind,
          published: it.published,
          summary: it.summary,
        };
        if (isDuplicate(cand, [...known, ...candidates])) { skip("duplicate"); continue; }
        const { score, matched } = scoreItem(it, src.categories, keywords);
        const category = src.categories.find((c) => matched.includes(c)) ?? (src.kind === "release" ? src.categories[0] : null);
        // Papers must match several topic terms; releases come from hand-picked repos.
        const minScore = src.kind === "paper" ? 5 : src.kind === "article" ? 2 : 0;
        if (!category || score < minScore) { skip("off-topic"); continue; }
        if (keptHere >= (src.kind === "paper" ? 1 : maxProposalsPerSource)) { skip("source-cap"); continue; }
        candidates.push({ ...cand, category, score: score + (src.kind === "release" ? 2 : 0) });
        keptHere++;
      }
      report.kept = keptHere;
    } catch (e) {
      if (e instanceof BudgetExceeded) { budgetHit = true; report.status = "budget"; report.error = e.message; sourceReports.push(report); break; }
      report.status = "error";
      report.error = e.message;
    }
    sourceReports.push(report);
  }

  // Verify links before proposing: the page must resolve on an allowlisted host.
  candidates.sort((a, b) => b.score - a.score || b.published.localeCompare(a.published));
  const verified = [];
  for (const c of candidates) {
    if (verified.length >= maxProposalsPerRun) break;
    try {
      const res = await fetcher(c.url, { method: "HEAD" });
      const ok = res.ok || res.status === 405; // some hosts reject HEAD but serve GET
      if (ok) verified.push({ ...c, verifiedAt: now, finalUrl: res.url });
    } catch (e) {
      if (e instanceof BudgetExceeded) { budgetHit = true; break; }
    }
  }

  const failed = sourceReports.filter((s) => s.status === "error").length;
  const status = budgetHit ? "partial" : failed === sources.length ? "failure" : verified.length ? "success" : "no-change";
  const summary = budgetHit
    ? `Stopped early: request budget reached. ${verified.length} resource(s) verified.`
    : `${sources.length - failed}/${sources.length} sources read; ${verified.length} new resource(s) verified and staged for review.`;
  return result("SCOUT", status, summary, {
    proposals: verified,
    sources: sourceReports,
    findings: verified.map((v) => ({ title: v.title, url: v.url, detail: `${v.source} · ${v.published.slice(0, 10)} · ${v.category}` })),
    errors: sourceReports.filter((s) => s.error).map((s) => `${s.id}: ${s.error}`),
  });
}
