#!/usr/bin/env node
// PRISM before/after comparison for a pull request.
//   node scripts/agents/prism-compare.mjs --head=http://localhost:3100 [--base=<live site>] [--out=prism-compare]
//
// Captures every configured PRISM screen on the live site (before) and on the
// pull request's production build (after), measures how much each region
// changed, how far each side is from the Design A reference, and how the
// layout audit moved. Writes PNGs, compare.json and report.md (posted as a PR
// comment by the implementation workflow).
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadConfig } from "./lib.mjs";
import { regionDiff, cellName } from "./imagediff.mjs";

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
  fs.writeFileSync(path.join(out, "compare.json"), JSON.stringify({ base, head, rows }, null, 2) + "\n");
  const md = toReport(rows, { base, head, runUrl });
  fs.writeFileSync(path.join(out, "report.md"), md + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  console.log(md);
}

// Run only when executed directly (tests import the pure functions).
if (process.argv[1]?.endsWith("prism-compare.mjs")) {
  main().catch((e) => {
    console.error("PRISM compare failed:", e.message);
    process.exitCode = 1;
  });
}
