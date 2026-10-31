#!/usr/bin/env node
// ASTRA: orchestrates one maintenance run.
//   node scripts/agents/astra.mjs [--dry-run] [--force] [--only=scout,sync] [--no-browser] [--no-git]
//
// Order: SCOUT → SYNC → SENTINEL → PULSE → FORGE → PRISM (weekly) → SCRIBE. Each agent is
// isolated: one failing never stops the others, and nothing here can touch the
// running website. State lives on the data-only `agent-data` branch; code and
// resource changes only ever leave as `agent/*` branches + pull requests.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, loadConfig, readJson, writeJson, Budget, makeFetcher, result } from "./lib.mjs";
import { makeGitHub } from "./github.mjs";
import { runScout } from "./scout.mjs";
import { runSync } from "./sync.mjs";
import { runSentinel } from "./sentinel.mjs";
import { runPulse } from "./pulse.mjs";
import { runForge, checkCuratedLinks } from "./forge.mjs";
import { runPrism, refreshPrismStatus } from "./prism.mjs";
import { buildRunRecord, toMarkdown, overallStatus } from "./scribe.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);
const config = loadConfig();
const env = process.env;
const dryRun = Boolean(args["dry-run"]) || env.AGENTS_DRY_RUN === "true";
const useGit = !args["no-git"] && env.GITHUB_ACTIONS === "true";
const only = args.only ? String(args.only).toLowerCase().split(",") : null;
const enabled = (name) => !only || only.includes(name);
const now = new Date().toISOString();
const runId = env.GITHUB_RUN_ID ? `gh-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT ?? 1}` : `local-${now.replace(/[:.]/g, "")}`;
const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : null;
if (runUrl) env.RUN_URL = runUrl;
const trigger = env.GITHUB_EVENT_NAME ?? "local";
const dataDir = path.resolve(ROOT, String(args["data-dir"] ?? ".agent-data"));
const curatedFile = path.join(ROOT, "data/agents/resources.json");

function git(argv, cwd = ROOT) {
  return execFileSync("git", argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
/** The only refs an agent may push to. main/master are unreachable by construction. */
function assertPushable(branch) {
  if (branch !== config.dataBranch && !branch.startsWith(config.proposalBranchPrefix)) throw new Error(`refusing to push to ${branch}`);
}

function prepareDataDir() {
  fs.rmSync(dataDir, { recursive: true, force: true });
  if (!useGit) {
    fs.mkdirSync(dataDir, { recursive: true });
    const seed = path.join(ROOT, String(args["seed-dir"] ?? ""));
    if (args["seed-dir"] && fs.existsSync(seed)) fs.cpSync(seed, dataDir, { recursive: true });
    return;
  }
  git(["worktree", "prune"]);
  let exists = true;
  try {
    git(["fetch", "--depth=1", "origin", `${config.dataBranch}:refs/remotes/origin/${config.dataBranch}`]);
  } catch {
    exists = false;
  }
  if (exists) {
    git(["worktree", "add", "--detach", dataDir, `origin/${config.dataBranch}`]);
  } else {
    git(["worktree", "add", "--detach", dataDir]);
    git(["checkout", "--orphan", config.dataBranch], dataDir);
    git(["rm", "-rf", "--quiet", "."], dataDir);
  }
}

function publishDataDir(message) {
  if (!useGit || dryRun) return false;
  assertPushable(config.dataBranch);
  git(["add", "-A"], dataDir);
  try {
    git(["diff", "--cached", "--quiet"], dataDir);
    return false;
  } catch {
    /* there are changes */
  }
  git(["-c", "user.name=portfolio-agents[bot]", "-c", "user.email=portfolio-agents@users.noreply.github.com", "commit", "-q", "-m", message], dataDir);
  git(["push", "origin", `HEAD:refs/heads/${config.dataBranch}`], dataDir);
  return true;
}

async function proposeResourcesPr(gh, change) {
  const branch = `${config.proposalBranchPrefix}resources-${now.slice(0, 10)}`;
  assertPushable(branch);
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), "agent-pr-"));
  try {
    git(["fetch", "--depth=1", "origin", "main"]);
    git(["worktree", "add", "-B", branch, wt, "origin/main"]);
    writeJson(path.join(wt, "data/agents/resources.json"), { updatedAt: now, items: change.resources });
    git(["add", "data/agents/resources.json"], wt);
    git(["-c", "user.name=portfolio-agents[bot]", "-c", "user.email=portfolio-agents@users.noreply.github.com", "commit", "-q", "-m", `Resource library: +${change.additions.length} / -${change.removals.length} (agent proposal)`], wt);
    git(["push", "--force", "origin", `HEAD:refs/heads/${branch}`], wt);
  } finally {
    try {
      git(["worktree", "remove", "--force", wt]);
    } catch {
      /* best effort */
    }
  }
  const body = [
    "Proposed by the portfolio maintenance agents. **Merging this PR is the approval step**; nothing is published until then.",
    "",
    change.additions.length ? "### Added (SCOUT)" : "",
    ...change.additions.map((a) => `- [${a.title}](${a.url}) · ${a.source} · ${a.published.slice(0, 10)} · \`${a.category}\`\n  > ${a.summary || "(no summary in feed)"}`),
    change.removals.length ? "\n### Removed (FORGE: link confirmed dead)" : "",
    ...change.removals.map((r) => `- ${r.title}: ${r.url} (${r.reason})`),
    "",
    "Checks done: source on allowlist, published within the freshness window, link resolves, not a duplicate. Descriptions are the source's own summary, trimmed.",
    "",
    `Run: ${runUrl ?? "local"}`,
  ].join("\n");
  return gh.openPr(config.repo, { head: branch, base: "main", title: `Resource library update ${now.slice(0, 10)} (agent proposal)`, body });
}

async function timed(name, fn) {
  const startedAt = new Date().toISOString();
  try {
    const r = await fn();
    return { ...r, startedAt, finishedAt: new Date().toISOString() };
  } catch (e) {
    return { ...result(name, "failure", `Agent crashed: ${String(e.message ?? e).split("\n")[0]}`, { errors: [String(e.stack ?? e).slice(0, 500)] }), startedAt, finishedAt: new Date().toISOString() };
  }
}

async function main() {
  prepareDataDir();
  const activity = readJson(path.join(dataDir, "activity.json"), { runs: [] });
  const proposedState = readJson(path.join(dataDir, "proposed.json"), { items: [] });
  const live = readJson(path.join(dataDir, "resources-live.json"), { items: [] });
  const curated = readJson(curatedFile, { items: [] }).items;
  const history = activity.runs;
  const last = history.find((r) => r.trigger !== "local");

  // Duplicate-run guard: one scheduled run per UTC day unless forced.
  if (trigger === "schedule" && !args.force && last && last.startedAt.slice(0, 10) === now.slice(0, 10) && last.status !== "failure") {
    console.log(`ASTRA: a ${last.status} run already happened today (${last.id}); skipping.`);
    return;
  }

  const budget = new Budget(config.limits);
  const fetcher = makeFetcher({ allowedHosts: config.allowedHosts, limits: config.limits, budget });
  const gh = makeGitHub({ fetcher, token: env.GITHUB_TOKEN });
  const checkResults = env.CHECK_RESULTS ? readJson(env.CHECK_RESULTS, null) : null;
  const since = history.find((r) => r.agents?.some((a) => a.agent === "SYNC" && a.status !== "failure"))?.startedAt ?? null;
  const browser = args["no-browser"] ? null : await import("./browser.mjs").catch(() => null);
  const agents = [];

  const skipped = (name) => ({ ...result(name, "skipped", "Not selected for this run."), startedAt: now, finishedAt: now });

  const scout = enabled("scout")
    ? await timed("SCOUT", () => runScout({ config, fetcher, now, curated, proposed: proposedState.items, rejected: [] }))
    : skipped("SCOUT");
  agents.push(scout);

  agents.push(enabled("sync") ? await timed("SYNC", () => runSync({ config, gh, since, now })) : skipped("SYNC"));

  agents.push(
    enabled("sentinel")
      ? await timed("SENTINEL", async () => {
          const smoke = browser ? await browser.smokeTest({ site: config.site }).catch((e) => ({ checks: [{ name: "browser launch", ok: false, reason: e.message.split("\n")[0] }] })) : null;
          return runSentinel({ config, fetcher, gh: env.GITHUB_TOKEN ? gh : null, checkResults, browserSmoke: smoke, now, dryRun });
        })
      : skipped("SENTINEL")
  );

  const previousPulse = history.map((r) => r.agents?.find((a) => a.agent === "PULSE" && a.measurements?.length)).find(Boolean);
  agents.push(
    enabled("pulse") && browser
      ? await timed("PULSE", () =>
          runPulse({
            config,
            previous: previousPulse?.measurements?.map((m) => ({ ...m, a11y: m.a11y ?? [] })),
            measure: () => browser.measurePages({ site: config.site, pages: config.pulse.pages, samples: config.pulse.samples }),
          })
        )
      : skipped("PULSE")
  );

  let pr = null;
  agents.push(
    enabled("forge")
      ? await timed("FORGE", async () => {
          const { dead } = await checkCuratedLinks({ curated, fetcher });
          const forge = await runForge({ config, curated, proposals: scout.proposals ?? [], deadLinks: dead, history, gh: env.GITHUB_TOKEN ? gh : null, now, dryRun });
          if (forge.change && !dryRun && useGit && env.GITHUB_TOKEN) {
            try {
              pr = await proposeResourcesPr(gh, forge.change);
              forge.summary += pr.action === "blocked" ? " Branch pushed; PR creation is disabled in repo settings (link recorded)." : ` PR ${pr.action}: #${pr.number}.`;
              forge.findings.unshift({ title: pr.action === "blocked" ? "Proposal branch ready (open PR manually)" : `Pull request #${pr.number}`, url: pr.url, detail: "review and merge to publish" });
            } catch (e) {
              forge.status = "failure";
              forge.errors.push(`proposal PR: ${e.message}`);
            }
          } else if (forge.change) {
            forge.summary += dryRun ? " (dry run: no branch pushed)" : " (no git/token: change not pushed)";
          }
          delete forge.change;
          return forge;
        })
      : skipped("FORGE")
  );

  // PRISM: prompts once a week (or when selected explicitly); issue/PR status every run.
  const prismCfg = config.prism;
  const prismIndexFile = path.join(dataDir, "prism", "index.json");
  const prismIndex = readJson(prismIndexFile, { updatedAt: null, items: [] });
  const prismDue = only ? only.includes("prism") : new Date(now).getUTCDay() === prismCfg.weekday || Boolean(args.force);
  let prismIssues = null;
  // Cheap (two API calls), so every run refreshes approval / PR state.
  if (env.GITHUB_TOKEN) {
    prismIssues = await refreshPrismStatus({ gh, repo: config.repo, label: prismCfg.issueLabel, approvalLabel: prismCfg.approvalLabel }).catch((e) => {
      console.log(`PRISM: status refresh failed: ${e.message}`);
      return null;
    });
  }
  if (prismDue) {
    let anthropic = null;
    if (env.ANTHROPIC_API_KEY && prismCfg.llm.enabled) {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 180_000, maxRetries: 2 });
    }
    const prism = await timed("PRISM", () =>
      runPrism({
        config,
        now,
        history,
        outDir: dataDir,
        agentsThisRun: agents,
        gh: env.GITHUB_TOKEN ? gh : null,
        dryRun,
        anthropic,
        runUrl,
        evidenceBaseUrl: `https://github.com/${config.repo}/tree/${config.dataBranch}`,
        openIssues: (prismIssues ?? []).filter((i) => ["awaiting-approval", "approved", "pr-open"].includes(i.state)),
        capture: () =>
          browser
            ? browser.captureScreens({ site: config.site, screens: prismCfg.screens, thresholds: prismCfg.thresholds })
            : Promise.reject(new Error("browser checks disabled")),
      })
    );
    agents.push(prism);
    const known = new Map(prismIndex.items.map((i) => [i.id, i]));
    for (const r of prism.recommendations ?? [])
      known.set(r.id, { ...known.get(r.id), ...r, proposedAt: now.slice(0, 10), runUrl, ...(r.issue ? { state: "awaiting-approval" } : {}) });
    prismIndex.items = [...known.values()];
    prismIndex.lastRun = { at: now, status: prism.status, summary: prism.summary, llm: prism.llm ?? null, dryRun, drift: prism.drift ?? [] };
  } else {
    agents.push(skipped("PRISM"));
  }
  if (prismIssues) {
    // Attach live issue / PR state to saved prompts; keep issues PRISM did not save locally too.
    const byId = new Map(prismIndex.items.map((i) => [i.id, i]));
    for (const iss of prismIssues) {
      const id = iss.prismId ?? `issue-${iss.number}`;
      byId.set(id, { title: iss.title, ...byId.get(id), id, issue: { number: iss.number, url: iss.url }, state: iss.state, pr: iss.pr });
    }
    prismIndex.items = [...byId.values()];
  }
  prismIndex.items = prismIndex.items
    .filter((i) => !i.proposedAt || (Date.parse(now) - Date.parse(i.proposedAt)) / 86_400_000 <= prismCfg.keepWeeks * 7 || ["approved", "pr-open"].includes(i.state))
    .sort((a, b) => String(b.proposedAt ?? "").localeCompare(String(a.proposedAt ?? "")) || (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, 40);
  if (prismDue || prismIssues) {
    prismIndex.updatedAt = now;
    writeJson(prismIndexFile, prismIndex);
  }

  // Auto-publication of resource entries: off unless the owner enables it in config.
  const ap = config.publishing.autoPublish;
  let autoPublished = [];
  if (!dryRun && config.publishing.mode === "auto-resources" && ap.enabled) {
    autoPublished = (scout.proposals ?? [])
      .filter((p) => ap.allowedCategories.includes(p.category) && p.score >= ap.minScore)
      .slice(0, ap.maxEntriesPerRun)
      .map((p) => ({ ...p, autoPublishedAt: now }));
    live.items = [...autoPublished, ...live.items].slice(0, 60);
  }

  const keepDays = 45;
  proposedState.items = [...(scout.proposals ?? []).map((p) => ({ id: p.id, title: p.title, url: p.url, proposedAt: now })), ...proposedState.items].filter(
    (p) => (Date.parse(now) - Date.parse(p.proposedAt)) / 86_400_000 < keepDays
  );

  const ran = agents.filter((a) => a.status !== "skipped").length;
  agents.unshift({
    ...result("ASTRA", overallStatus(agents.filter((a) => a.status !== "skipped")), `Coordinated ${ran} agent(s); trigger ${trigger}${dryRun ? ", dry run" : ""}; ${budget.used}/${budget.max} outbound requests used.`),
    startedAt: now,
    finishedAt: new Date().toISOString(),
  });
  agents.push({
    ...result("SCRIBE", "success", `Recorded run ${runId}${autoPublished.length ? `; auto-published ${autoPublished.length} resource(s)` : ""}.`),
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  });

  const run = buildRunRecord({
    id: runId,
    startedAt: now,
    finishedAt: new Date().toISOString(),
    trigger,
    runUrl,
    commit: env.GITHUB_SHA?.slice(0, 7) ?? (() => { try { return git(["rev-parse", "--short", "HEAD"]); } catch { return null; } })(),
    mode: config.publishing.mode,
    dryRun,
    agents,
    pr,
    budget: { used: budget.used, max: budget.max },
  });
  // Full measurements (with a11y lists) are kept for the next comparison.
  const pulse = agents.find((a) => a.agent === "PULSE");
  const pubPulse = run.agents.find((a) => a.agent === "PULSE");
  if (pulse?.measurements && pubPulse) pubPulse.measurements = pulse.measurements;

  activity.runs = [run, ...history].slice(0, config.limits.historyLength);
  activity.updatedAt = run.finishedAt;
  writeJson(path.join(dataDir, "activity.json"), activity);
  writeJson(path.join(dataDir, "proposed.json"), proposedState);
  writeJson(path.join(dataDir, "resources-live.json"), live);
  const md = toMarkdown(run);
  fs.writeFileSync(path.join(dataDir, "latest-run.md"), md + "\n");
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, md + "\n");
  console.log(md);

  const pushed = publishDataDir(`Agent run ${runId}: ${run.status}`);
  console.log(pushed ? `ASTRA: results published to ${config.dataBranch}.` : "ASTRA: results not published (dry run, local, or no change).");
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `status=${run.status}\n`);
}

main().catch((e) => {
  console.error("ASTRA: run aborted:", e);
  process.exitCode = 1;
});
