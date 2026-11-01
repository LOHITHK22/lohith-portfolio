// SCRIBE: assembles the run record that the /agents page displays and the
// markdown summary shown on the GitHub Actions run page. It reports only what
// the other agents returned; it adds no claims of its own.
const ORDER = ["failure", "partial", "success", "no-change", "skipped"];

export function overallStatus(agents) {
  const s = agents.map((a) => a.status);
  if (s.includes("failure")) return "failure";
  if (s.includes("partial")) return "partial";
  if (s.includes("success")) return "success";
  return "no-change";
}

const MAX_FINDINGS = 12;

/** Drop bulky/internal fields so the public record stays small and sanitized. */
function publicAgent(a) {
  const { agent, status, summary, findings = [], errors = [], startedAt, finishedAt } = a;
  const out = { agent, status, summary, startedAt, finishedAt, findings: findings.slice(0, MAX_FINDINGS), errors: errors.slice(0, 6) };
  if (a.agent === "SENTINEL") {
    out.checks = (a.checks ?? []).map(({ path, ok, reason, ms }) => ({ path, ok, reason, ms }));
    out.ci = a.ci ? { steps: a.ci.steps, runUrl: a.ci.runUrl } : null;
    out.smoke = a.browserSmoke?.checks ?? null;
    out.issues = a.issues ?? [];
  }
  if (a.agent === "PULSE") out.measurements = (a.measurements ?? []).map(({ a11y, ...m }) => ({ ...m, a11yCount: a11y?.length ?? 0 }));
  if (a.agent === "SCOUT") out.sources = (a.sources ?? []).map(({ id, status, items, kept, error }) => ({ id, status, items, kept, error }));
  if (a.agent === "SYNC") out.repos = (a.repos ?? []).map(({ repo, status, commits, release, ci, error }) => ({ repo, status, commits: commits?.length ?? 0, release, ci, error }));
  if (a.agent === "FORGE") out.issues = a.issues ?? [];
  if (a.agent === "PRISM") {
    out.recommendations = (a.recommendations ?? []).map(({ id, title, tier, category, priority, source, ownerAction, prompt, issue }) => ({ id, title, tier, category, priority, source, ownerAction, prompt, issue }));
    out.llm = a.llm ?? null;
  }
  return out;
}

export function buildRunRecord({ id, startedAt, finishedAt, trigger, runUrl, commit, mode, dryRun, agents, pr, budget }) {
  const pub = agents.map(publicAgent).sort((a, b) => AGENT_ORDER.indexOf(a.agent) - AGENT_ORDER.indexOf(b.agent));
  return {
    id,
    startedAt,
    finishedAt,
    trigger,
    runUrl,
    commit,
    mode,
    dryRun,
    status: overallStatus(agents),
    pr: pr ?? null,
    budget,
    agents: pub,
  };
}

export const AGENT_ORDER = ["ASTRA", "SCOUT", "SYNC", "SENTINEL", "PULSE", "FORGE", "PRISM", "SCRIBE"];

export function toMarkdown(run) {
  const icon = { success: "✅", "no-change": "➖", partial: "⚠️", failure: "❌", skipped: "⏭️" };
  const lines = [
    `## Portfolio agents · ${run.startedAt.slice(0, 16).replace("T", " ")} UTC`,
    "",
    `Overall: ${icon[run.status] ?? ""} **${run.status}** · trigger: ${run.trigger} · mode: ${run.mode}${run.dryRun ? " · dry run" : ""} · requests: ${run.budget?.used}/${run.budget?.max}`,
    "",
    "| Agent | Status | Summary |",
    "|---|---|---|",
    ...run.agents.map((a) => `| ${a.agent} | ${icon[a.status] ?? ""} ${a.status} | ${a.summary.replace(/\|/g, "\\|")} |`),
    "",
  ];
  if (run.pr) lines.push(`Proposal: ${run.pr.action === "blocked" ? `branch pushed, PR creation blocked by repo settings. Open it here: ${run.pr.url}` : run.pr.url}`, "");
  for (const a of run.agents) {
    if (!a.findings.length && !a.errors.length) continue;
    lines.push(`### ${a.agent}`);
    for (const f of a.findings) lines.push(`- ${f.url ? `[${f.title}](${f.url})` : f.title}${f.detail ? ` · ${f.detail}` : ""}`);
    for (const e of a.errors) lines.push(`- error: ${e}`);
    lines.push("");
  }
  return lines.join("\n");
}

export { ORDER };
