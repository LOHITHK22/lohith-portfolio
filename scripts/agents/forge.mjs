// FORGE: turns evidence into small, reviewable changes. It does not write
// application code. It (1) prepares the resource-library change for a pull
// request (new SCOUT proposals, removal of links that are confirmed dead) and
// (2) escalates checks that keep failing across runs into one tracking issue.
import { result, BudgetExceeded } from "./lib.mjs";

export async function checkCuratedLinks({ curated, fetcher }) {
  const dead = [];
  let budgetHit = false;
  for (const r of curated) {
    try {
      const res = await fetcher(r.url, { method: "HEAD" });
      if (res.status === 404 || res.status === 410) dead.push({ ...r, reason: `HTTP ${res.status}` });
    } catch (e) {
      if (e instanceof BudgetExceeded) { budgetHit = true; break; }
      // network errors and non-allowlisted redirects are not proof a link is dead
    }
  }
  return { dead, budgetHit };
}

export function recurringFailures(history, threshold) {
  const recent = history.slice(0, threshold);
  if (recent.length < threshold) return [];
  const keysPerRun = recent.map((run) => new Set(run.agents.find((a) => a.agent === "SENTINEL")?.findings?.map((f) => f.title) ?? []));
  return [...keysPerRun[0]].filter((k) => keysPerRun.every((s) => s.has(k)));
}

export async function runForge({ config, curated, proposals, deadLinks, history, gh, now, dryRun }) {
  const findings = [];
  const errors = [];
  const issues = [];

  const removeIds = new Set(deadLinks.map((d) => d.id));
  const next = curated.filter((r) => !removeIds.has(r.id));
  const additions = proposals.map((p) => ({
    id: p.id,
    title: p.title,
    url: p.url,
    source: p.source,
    category: p.category,
    kind: p.kind,
    published: p.published,
    summary: p.summary,
    addedAt: now,
    addedBy: "SCOUT (proposed) · approved by merging the pull request",
  }));
  const change = additions.length || deadLinks.length ? { resources: [...additions, ...next], additions, removals: deadLinks } : null;
  for (const d of deadLinks) findings.push({ title: `Dead resource link: ${d.title}`, url: d.url, detail: `${d.reason}; proposed for removal` });

  const recurring = recurringFailures(history, config.forge.recurringThreshold);
  if (recurring.length && gh && !dryRun) {
    try {
      const body = [`These SENTINEL findings failed in each of the last ${config.forge.recurringThreshold} runs:`, "", ...recurring.map((r) => `- ${r}`), "", `Latest run: ${process.env.RUN_URL ?? "local"}`, "", "FORGE does not change application code automatically. Fix on a branch and open a PR."].join("\n");
      issues.push(await gh.upsertIssue(config.repo, { title: "[forge] Recurring failures need a fix", body, labels: [config.forge.issueLabel] }));
    } catch (e) {
      errors.push(`recurring-failure issue: ${e.message}`);
    }
  }
  for (const r of recurring) findings.push({ title: `Recurring: ${r}`, url: issues[0]?.url, detail: `failed ${config.forge.recurringThreshold} runs in a row` });

  const status = change || recurring.length ? "success" : "no-change";
  const summary = change
    ? `Prepared a resource-library change: +${additions.length} proposed, −${deadLinks.length} dead link(s).` + (recurring.length ? ` ${recurring.length} recurring failure(s) escalated.` : "")
    : recurring.length
      ? `${recurring.length} recurring failure(s) escalated to a tracking issue.`
      : "Nothing to propose this run.";
  return result("FORGE", status, summary, { change, issues, errors, findings });
}
