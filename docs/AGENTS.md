# Portfolio maintenance agents

Eight scheduled agents keep the portfolio checked and up to date. They run on
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
| PRISM | Weekly: screenshots vs Design A, mobile layout audit, code scan, other agents' results → ranked Claude Code implementation prompts, saved and opened as issues | Never edits code; Claude Code runs only after the owner's approval label, on a `claude/prism-issue-N` branch, and never merges |
| SCRIBE | Writes the sanitized run record and the Actions run summary | Records only what agents returned |

Seven agents are deterministic Node.js scripts (`scripts/agents/`) that never
call a language model: text from the internet is stripped to plain text and only
ever displayed. PRISM is deterministic too unless the optional
`ANTHROPIC_API_KEY` secret exists; then it makes **one** capped Claude request
per week to refine its prompts (see [PRISM](#prism-prompt-engineer)).

## How a run works

```
schedule (09:23 UTC) or manual dispatch
  └─ job "ci" (SENTINEL, reusable sentinel-checks.yml): npm ci → lint → tsc → agent unit tests → build → Playwright e2e
       → check-results.json (artifact)
  └─ job "agents" (ASTRA): SCOUT → SYNC → SENTINEL → PULSE → FORGE → PRISM (Mondays) → SCRIBE
       ├─ issues for confirmed failures (label: sentinel / forge, de-duplicated by title)
       ├─ PRISM prompts → agent-data/prism/YYYY-MM-DD/*.md + evidence + screenshots, issues labelled prism
       ├─ resource proposal → branch agent/resources-YYYY-MM-DD → pull request
       └─ run record → branch agent-data (activity.json, proposed.json, resources-live.json, latest-run.md)

lohithkovuri.store/agents    reads agent-data/activity.json and prism/index.json (cached 10 min)
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
4. **Secrets.** None required for the daily agents: the only credential is the
   automatic `GITHUB_TOKEN`, scoped per job. PRISM's optional Claude credentials
   are described under [PRISM setup](#prism-setup).
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
| Secrets in logs/frontend | Only Actions secrets, passed as `env:`/inputs to the single step that needs them and masked by GitHub; never written to files. Run records are built from an allowlist of fields (unit-tested) |
| LLM cost (PRISM) | Worst-case cost computed before the call; skipped if it exceeds $0.75/run or the $3/month cap (tracked from run history). Claude Code: max 4 runs/month, 40 turns, 30 min each |
| Code written by Claude Code | Only after the owner adds `prism:approved`; sender must be the repo owner; branch `claude/prism-issue-N` only; changes to `.github/`, `agents/`, `package*.json`, `.env*`, `vercel.json`, `next.config.*` are rejected; no web, `gh`, `curl`, `npx` or `npm install` tools; PR checks run with a read-only token; nothing merges automatically |

## Operating cost

- **GitHub Actions:** the repository is public, so standard runner minutes are
  free. A full run takes about 6–9 minutes (≈5 for build + e2e, ≈1–3 for the
  agents). If the repo became private: ~9 min × 30 days ≈ 270 of the 2,000 free
  monthly minutes.
- **Paid APIs (daily agents):** none. **Vercel:** unchanged; `/agents` and
  `/resources` are revalidated at most every 10 minutes.
- **PRISM prompt refinement (optional):** one Claude Opus 5.5 request per week,
  typically ≈ $0.15–0.50 ($4 / $20 per million input / output tokens); hard
  caps $0.75 per run and $3 per month. Without a key: $0.
- **PRISM implementation (optional, per approval):** each approved prompt is
  one Claude Code run, capped at 40 turns and 30 minutes. Estimated $1–5 per
  run with an API key (the action has no per-run dollar cap, so the turn, time
  and 4-runs-per-month caps bound it), or plan usage with a Claude subscription
  token instead.
- **Estimated total: $0/month without Claude credentials; at most about
  $23/month with every cap reached.**

## PRISM (prompt engineer)

PRISM runs inside the normal agent workflow on Mondays (`prism.weekday` in
`agents/config.json`), or whenever `prism` is in the `only` input.

1. **Evidence.** Screenshots of `/` and `/event` (1440×900 and 390×844) from the
   live site; a region-by-region luminance comparison of the desktop homepage
   with the approved Design A reference (`agents/prism/reference/`); a layout
   audit (horizontal overflow, tap targets under 40 px, text under 11 px,
   upscaled images); a code scan (unimported components, very large files,
   TODOs); and this run's SENTINEL failures, PULSE measurements and SYNC commits.
   `/event` is also walked the way a visitor uses it (`event-states.mjs`):
   landing, narrated demo playing, demo paused, MCP architecture expanded,
   contact + QR section, and the header navigation on phone/tablet, each at
   390×844, 820×1180, 1440×900 and 1920×1080. Every state gets a screenshot
   (animations disabled) and an audit of what is on screen: tap targets (below
   1024 px), text under 11 px, overlapping controls, WCAG AA text contrast
   (solid backgrounds only), horizontal overflow and, on landing, layout
   shift. A state that cannot be reached is recorded as an error.
2. **Recommendations.** Rules turn the evidence into candidates ranked by
   visitor impact, not by how many problems a rule counted:
   **P0** critical functionality or security (confirmed SENTINEL failures);
   **P1** broken interactive demos, significant mobile problems (overflow, tap
   targets, overlapping controls) and accessibility defects (contrast);
   **P2** meaningful visual, performance or usability work (Design A drift,
   PULSE regressions, project updates); **P3** minor typography, decorative or
   internal-only changes (small text, unused files, large files). With
   `ANTHROPIC_API_KEY`, one structured-output request to `claude-opus-5-5`
   (adaptive thinking, effort high, server-side fallback enabled) sharpens and
   extends them and assigns the same tiers. Anything already open or proposed
   in the last 28 days is skipped; at most 3 are kept per run.
3. **Prompts.** Each becomes a Claude Code prompt (tier, context, evidence,
   files, expected changes, design constraints, acceptance criteria, tests),
   saved to `agent-data/prism/YYYY-MM-DD/<id>.md` with `evidence.json` and the
   screenshots. Prompts at or above `prism.issueMinTier` (default P2) are
   opened as issues labelled `prism`; P3 prompts are saved for reference only,
   so low-value changes never queue up for a paid Claude Code run. An issue
   can cover several prompts: each `<!-- prism:id=... -->` marker in its body
   stops PRISM from proposing that prompt again while the issue is open.
4. **Approval.** Add the `prism:approved` label to the issue. Only a label
   added by the repository owner starts `.github/workflows/prism-implement.yml`.
5. **Implementation.** The official
   [Claude Code GitHub Action](https://github.com/anthropics/claude-code-action)
   implements the prompt on `claude/prism-issue-N`; the workflow rejects
   protected paths, pushes the branch and opens a PR that `Closes #N`.
6. **Verification.** The same reusable `sentinel-checks.yml` runs lint,
   typecheck, unit tests, build and Playwright on the branch; PRISM then
   screenshots the live site and the PR build and measures the change, the
   distance to Design A and the audit counts for all four screens (both pages,
   desktop and phone), plus every `/event` state at all four sizes. Audit
   numbers are reported, not asserted, so animations and timestamps cannot
   make the check flaky; the capture fails only if a state that works on the
   live site cannot be reached on the PR build. Results are posted on the PR
   and re-run whenever you push to the branch. If any check or the
   before/after capture fails, the verify job fails, so a red result is never
   shown as green.
   `tests/e2e/tap-targets.spec.ts` audits every visible control on `/event` at
   390×844, both on the page and inside the playing narrated demo (real box
   size, must receive a tap at its centre), and fails on any target below
   40×40px.
7. **You review and merge, or close.** `/agents` shows each prompt's tier and
   state: awaiting approval → approved → PR open → merged / declined. Merging
   or closing a `claude/prism-issue-N` PR, or closing or reopening a PRISM
   issue, triggers the `status` job in `prism-implement.yml`, which republishes
   these states within a minute (plus the dashboard's 10-minute cache). It
   runs code from `main` only and writes nothing but `agent-data/prism/index.json`.

### PRISM setup

| Step | Where | Needed for |
|---|---|---|
| Install the Claude GitHub App on this repository | https://github.com/apps/claude (or `/install-github-app` in Claude Code) | Implementation |
| Add `ANTHROPIC_API_KEY` **or** `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`; uses your Claude plan) | Settings → Secrets and variables → Actions | Implementation |
| Add `ANTHROPIC_API_KEY` (optional) | same | Claude-refined prompts; without it prompts are rule-based |
| Tick "Allow GitHub Actions to create and approve pull requests" | Settings → Actions → General | PRs opened automatically (otherwise a compare link is posted) |
| Protect `main` (require a PR) | Settings → Branches | Platform guarantee against direct pushes |

Credentials are never printed, written to files, or exposed to the site. To
pause PRISM, set `prism.weekday` to `-1`; to stop implementations, disable the
"PRISM implement" workflow or remove the secrets.

## Local commands

```bash
node --test scripts/agents/tests/*.test.mjs           # unit tests (no network)
node scripts/agents/astra.mjs --dry-run --no-git       # real checks, nothing published
node scripts/agents/astra.mjs --dry-run --no-git --only=scout,sync --no-browser
node scripts/agents/astra.mjs --dry-run --no-git --only=sentinel,pulse,sync,prism   # one PRISM generation run
node scripts/agents/prism-compare.mjs --head=http://localhost:3100              # before/after vs a local build
```

Local runs are labelled `local` and never shown on the public dashboard.
