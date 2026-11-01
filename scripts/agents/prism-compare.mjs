#!/usr/bin/env node
// PRISM before/after comparison for a pull request.
//   node scripts/agents/prism-compare.mjs --head=http://localhost:3100 [--base=<live site>] [--out=prism-compare]
//
// Captures every configured PRISM screen on the live site (before) and on the
// pull request's production build (after), measures how much each region
// changed, how far each side is from the Design A reference, and how the
// layout audit moved. It does the same for every reachable /event state
// (landing, demo playing and paused, MCP expanded, contact + QR, mobile nav)
// at 390, 820, 1440 and 1920 px. Writes PNGs, compare.json and report.md
// (posted as a PR comment by the implementation workflow). Exits non-zero
// only when a state that works on the live site cannot be reached on the PR
// build; audit numbers are reported, not asserted.
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadConfig } from "./lib.mjs";
import { regionDiff, cellName } from "./imagediff.mjs";
import { EVENT_STATES } from "./event-states.mjs";

export function compareScreens(before, after, referencePng, { designDriftRegion }) {
  const change = regionDiff(before.png, after.png);
  const ref = referencePng
    ? { before: regionDiff(before.png, referencePng).overall, after: regionDiff(after.png, referencePng).overall }
    : null;
  const a = before.audit ?? {};
  const b = after.audit ?? {};
  return {
    screen: before.id,
    path: before.path,
    size: `${before.width}×${before.height}`,
    changed: change.overall,
    changedRegions: change.cells.filter((c) => c.diff >= designDriftRegion / 2).map((c) => ({ region: cellName(c), diff: c.diff })),
    reference: ref,
    audit: {
      overflowX: [a.overflowX ?? null, b.overflowX ?? null],
      smallTargets: [a.smallTargetCount ?? null, b.smallTargetCount ?? null],
      smallText: [a.smallTextCount ?? null, b.smallTextCount ?? null],
    },
  };
}

/** Before/after rows for the /event states; a state lost on the PR build is a regression. */
export function compareStates(before, after) {
  const order = (r) => EVENT_STATES.indexOf(r.state) * 10_000 + r.width;
  return before
    .map((b) => {
      const a = after.find((x) => x.id === b.id);
      const row = { id: b.id, state: b.state, size: `${b.width}×${b.height}`, width: b.width, reachable: [b.ok, Boolean(a?.ok)], error: b.ok ? (a?.ok ? null : a?.error ?? "not captured") : b.error };
      if (!b.ok || !a?.ok) return { ...row, regression: b.ok && !a?.ok };
      const pick = (k) => [b.audit[k], a.audit[k]];
      return {
        ...row,
        regression: false,
        changed: regionDiff(b.png, a.png).overall,
        audit: { smallTargets: pick("smallTargetCount"), smallText: pick("smallTextCount"), overlaps: pick("overlapCount"), lowContrast: pick("lowContrastCount"), overflowX: pick("overflowX") },
      };
    })
    .sort((x, y) => order(x) - order(y));
}

export function toStatesReport(rows) {
  if (!rows.length) return "";
  const arrow = ([x, y]) => (x === y ? `${y}` : `${x} → **${y}**`);
  return [
    "### /event states",
    "",
    "| State | Size | Pixels changed | Small tap targets | Text < 11px | Overlapping controls | Low contrast | Horizontal overflow |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map((r) =>
      r.audit
        ? `| ${r.state} | ${r.size} | ${(r.changed * 100).toFixed(1)}% | ${arrow(r.audit.smallTargets)} | ${arrow(r.audit.smallText)} | ${arrow(r.audit.overlaps)} | ${arrow(r.audit.lowContrast)} | ${arrow(r.audit.overflowX)} |`
        : `| ${r.state} | ${r.size} | ${r.regression ? "❌ **unreachable on this build**" : "unreachable on the live site"}: ${r.error ?? ""} | | | | | |`
    ),
    "",
    "Informational: these audit numbers never pass or fail the check. Only a state that works live but is unreachable on this build fails it; the 40×40px tap-target rule is enforced by `tests/e2e/tap-targets.spec.ts`. Tap targets are counted below 1024 px only. Contrast is judged against solid backgrounds (WCAG AA); text over images or gradients is not judged.",
  ].join("\n");
}

export function toReport(rows, { base, head, runUrl }) {
  const arrow = ([x, y]) => (x === y ? `${y}` : `${x} → **${y}**`);
  const lines = [
    "## PRISM · before / after",
    "",
    `Before: ${base} (live) · After: this pull request's production build${runUrl ? ` · [run](${runUrl})` : ""}`,
    "",
    "| Screen | Pixels changed | Distance to Design A (lower is closer) | Horizontal overflow | Small tap targets | Small text |",
    "|---|---|---|---|---|---|",
    ...rows.map((r) =>
      r.error
        ? `| ${r.screen} | error: ${r.error} | | | | |`
        : `| ${r.screen} (${r.size}) | ${(r.changed * 100).toFixed(1)}% | ${r.reference ? `${r.reference.before} → **${r.reference.after}**` : "n/a"} | ${arrow(r.audit.overflowX)} | ${arrow(r.audit.smallTargets)} | ${arrow(r.audit.smallText)} |`
    ),
    "",
  ];
  for (const r of rows) {
    if (r.changedRegions?.length) lines.push(`- **${r.screen}** changed regions: ${r.changedRegions.map((c) => `${c.region} (${c.diff})`).join(", ")}`);
  }
  lines.push(
    "",
    "Screenshots are in the `prism-compare` artifact of this run. Numbers are measured, not judged: review the images before merging. PRISM never merges."
  );
  return lines.join("\n");
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
  const config = loadConfig();
  const cfg = config.prism;
  const base = args.base ?? config.site;
  const head = args.head;
  if (!head) throw new Error("--head is required");
  const out = path.resolve(ROOT, args.out ?? "prism-compare");
  fs.mkdirSync(out, { recursive: true });

  const { captureScreens } = await import("./browser.mjs");
  const [before, after] = [
    await captureScreens({ site: base, screens: cfg.screens, thresholds: cfg.thresholds }),
    await captureScreens({ site: head, screens: cfg.screens, thresholds: cfg.thresholds }),
  ];
  const rows = before.map((b) => {
    const a = after.find((x) => x.id === b.id);
    fs.writeFileSync(path.join(out, `${b.id}-before.png`), b.png);
    if (a) fs.writeFileSync(path.join(out, `${b.id}-after.png`), a.png);
    try {
      return compareScreens(b, a, b.reference ? fs.readFileSync(path.join(ROOT, b.reference)) : null, cfg.thresholds);
    } catch (e) {
      return { screen: b.id, error: e.message };
    }
  });
  const runUrl = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;
  const { captureEventStates } = await import("./event-states.mjs");
  const statesBefore = await captureEventStates({ site: base, thresholds: cfg.thresholds });
  const statesAfter = await captureEventStates({ site: head, thresholds: cfg.thresholds });
  fs.mkdirSync(path.join(out, "event-states"), { recursive: true });
  for (const [side, list] of [["before", statesBefore], ["after", statesAfter]])
    for (const s of list) if (s.png) fs.writeFileSync(path.join(out, "event-states", `${s.id}-${side}.png`), s.png);
  const stateRows = compareStates(statesBefore, statesAfter);
  fs.writeFileSync(path.join(out, "compare.json"), JSON.stringify({ base, head, rows, states: stateRows }, null, 2) + "\n");
  const md = [toReport(rows, { base, head, runUrl }), "", toStatesReport(stateRows)].join("\n");
  fs.writeFileSync(path.join(out, "report.md"), md + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  console.log(md);
  const lost = stateRows.filter((r) => r.regression);
  if (lost.length) throw new Error(`${lost.length} /event state(s) work on the live site but not on this build: ${lost.map((r) => r.id).join(", ")}`);
}

// Run only when executed directly (tests import the pure functions).
if (process.argv[1]?.endsWith("prism-compare.mjs")) {
  main().catch((e) => {
    console.error("PRISM compare failed:", e.message);
    process.exitCode = 1;
  });
}
