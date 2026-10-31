# Portfolio maintenance agents

Seven scheduled agents keep the portfolio checked and up to date. They run on
**GitHub Actions**, not on a personal computer, so they keep working while the
laptop is off. The site itself stays on Vercel and is never affected by an
agent run: agents cannot deploy, and a failed run changes nothing on the site.

| Agent | Job | Hard limits |
|---|---|---|
| ASTRA | Orchestrates the run, isolates failures, enforces the request budget, skips duplicate scheduled runs | Can only push to `agent-data` and `agent/*` (`assertPushable` in `astra.mjs`) |
| SCOUT | Reads allowlisted feeds; keeps fresh, relevant, verified, non-duplicate items | Descriptions are the source's own summary; nothing is rewritten |
| SYNC | Reports new commits, releases and latest CI result for approved repos | Reports evidence only; never marks work as finished |
| SENTINEL | Checks live pages, links and interactions (real browser); reads lint/typecheck/build/e2e results; files issues | Failure must reproduce before an issue is filed; never edits code |
| PULSE | Measures TTFB/FCP/LCP/CLS/transfer (median of 3) + DOM accessibility checks; compares with last run | Measured runner timings only; no invented scores |
| FORGE | Packages resource proposals and dead-link removals into a PR; escalates failures recurring 3 runs in a row | Never touches application code or `main` |
| SCRIBE | Writes the sanitized run record and the Actions run summary | Records only what agents returned |

These are deterministic Node.js scripts (`scripts/agents/`). They do not call a
language model, so there is no API spend and no prompt-injection surface: text
from the internet is stripped to plain text and only ever displayed.

## How a run works

```
schedule (09:23 UTC) or manual dispatch
  └─ job "ci" (SENTINEL): npm ci → lint → tsc → agent unit tests → build → Playwright e2e
       → check-results.json (artifact)
  └─ job "agents" (ASTRA): SCOUT → SYNC → SENTINEL → PULSE → FORGE → SCRIBE
       ├─ issues for confirmed failures (label: sentinel / forge, de-duplicated by title)
       ├─ resource proposal → branch agent/resources-YYYY-MM-DD → pull request
       └─ run record → branch agent-data (activity.json, proposed.json, resources-live.json, latest-run.md)

lohithkovuri.store/agents    reads agent-data/activity.json (cached 10 min)
lohithkovuri.store/resources reads data/agents/resources.json on main (+ resources-live.json if auto-publish is on)
```

A run with nothing new is a valid `no-change` result. Status meanings:
`success` (ran, found something), `no-change`, `partial` (stopped early at a
rate limit or the request budget), `failure` (an agent failed or a check failed).

## Publishing policy

- **Review mode (default).** Proposed resources arrive as a pull request.
  Merging it is the approval; Vercel then deploys normally.
- **Auto-publish (off).** In `agents/config.json` set
  `"publishing": { "mode": "auto-resources", "autoPublish": { "enabled": true } }`.
  Then up to `maxEntriesPerRun` validated entries per run (allowed categories,
  score ≥ `minScore`) are written to `agent-data/resources-live.json` and shown on
  `/resources` under "auto-published, not yet reviewed". They still never touch
  `main`. Employment history, project claims, settings, integrations and code
  are never auto-published; no code path exists for that.

## Setup (one time)

1. **Push the code** (owner approval). The workflow file must be on `main`
   before it can be dispatched.
2. **Workflow permissions.** Settings → Actions → General → Workflow permissions:
   keep "Read repository contents" as the default (each job requests what it
   needs). To let FORGE open PRs, tick **"Allow GitHub Actions to create and
   approve pull requests"**. Without it, FORGE still pushes the
   `agent/resources-*` branch and records a "compare" link to open the PR by hand.
3. **Protect `main`** (recommended). Settings → Branches → add a rule for `main`
   requiring a pull request. `GITHUB_TOKEN` with `contents: write` could
   technically push any branch; the agents' code refuses to, and the rule makes
   that a platform guarantee too.
4. **Secrets.** None required. The only credential is the automatic
   `GITHUB_TOKEN`, scoped per job in the workflow. If a paid API is ever added,
   store its key under Settings → Secrets and variables → Actions, pass it as
   `env:` to the one step that needs it, and never echo it.
5. **Test by manual dispatch.** Actions → Portfolio agents → Run workflow:
   - first with **dry run** ticked (all checks run; no issues, branches or data published),
   - then without dry run (creates the `agent-data` branch; `/agents` shows the run within 10 minutes).
6. **Enable the daily schedule.** Settings → Secrets and variables → Actions →
   Variables → new repository variable `AGENTS_SCHEDULE_ENABLED` = `true`.

## Disabling

- Pause the schedule: set `AGENTS_SCHEDULE_ENABLED` to `false` (manual runs still work).
- Stop everything: Actions → Portfolio agents → "…" → Disable workflow.
- Remove published activity: delete the `agent-data` branch. `/agents` falls
  back to its empty state; the rest of the site is unaffected.

## Safety controls

| Risk | Control |
|---|---|
| Untrusted web content | HTTPS + host allowlist (re-checked on every redirect), 12 s timeout, 2 MB cap, tags/scripts/control characters stripped, 280-char summaries, never executed or sent to a model |
| Runaway requests / cost | 120 requests per run, 40 per host; budget exhaustion ends the agent as `partial` |
| GitHub rate limit | Reads `x-ratelimit-remaining`; stops cleanly before it is exhausted |
| Duplicate runs | `concurrency: portfolio-agents` + one scheduled run per UTC day unless forced |
| Duplicate issues/PRs | Issues matched by exact title (comment instead of new issue); one PR branch per day |
| Flaky failures | Live-page failures must reproduce after 20 s before an issue is filed |
| Writes to production | Push targets limited in code to `agent-data` and `agent/*`; branch protection recommended |
| Dependencies | No packages installed at run time; only `npm ci` from the committed lockfile |
| Secrets in logs/frontend | No secrets used; run records are built from an allowlist of fields (unit-tested) |

## Operating cost

- **GitHub Actions:** the repository is public, so standard runner minutes are
  free. A full run takes about 6–9 minutes (≈5 for build + e2e, ≈1–3 for the
  agents). If the repo became private: ~9 min × 30 days ≈ 270 of the 2,000 free
  monthly minutes.
- **Paid APIs:** none. **Vercel:** unchanged; `/agents` and `/resources` are
  revalidated at most every 10 minutes.
- **Estimated total: $0/month.**

## Local commands

```bash
node --test scripts/agents/tests/*.test.mjs           # unit tests (no network)
node scripts/agents/astra.mjs --dry-run --no-git       # real checks, nothing published
node scripts/agents/astra.mjs --dry-run --no-git --only=scout,sync --no-browser
```

Local runs are labelled `local` and never shown on the public dashboard.
