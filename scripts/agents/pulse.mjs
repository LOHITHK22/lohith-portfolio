// PULSE: compares this run's measured timings with the previous successful
// measurement and flags regressions. Numbers are medians of real page loads
// from a GitHub-hosted runner; they are not Lighthouse scores.
import { result } from "./lib.mjs";

export function compareMeasurements(current, previous, { regressionPercent, regressionMinMs }) {
  const regressions = [];
  for (const cur of current) {
    const prev = previous?.find((p) => p.page === cur.page);
    if (!prev) continue;
    for (const k of ["ttfb", "fcp", "lcp", "load"]) {
      if (cur[k] == null || prev[k] == null) continue;
      const delta = cur[k] - prev[k];
      if (delta >= regressionMinMs && delta / prev[k] >= regressionPercent / 100)
        regressions.push({ page: cur.page, metric: k, previous: prev[k], current: cur[k], change: `+${Math.round((delta / prev[k]) * 100)}%` });
    }
    if (cur.cls != null && prev.cls != null && cur.cls - prev.cls > 0.05) regressions.push({ page: cur.page, metric: "cls", previous: prev.cls, current: cur.cls, change: `+${(cur.cls - prev.cls).toFixed(3)}` });
    const newA11y = cur.a11y.filter((i) => !(prev.a11y ?? []).includes(i));
    if (newA11y.length) regressions.push({ page: cur.page, metric: "a11y", previous: (prev.a11y ?? []).length, current: cur.a11y.length, change: newA11y.slice(0, 3).join("; ") });
  }
  return regressions;
}

export async function runPulse({ config, measure, previous }) {
  let measurements;
  try {
    measurements = await measure();
  } catch (e) {
    return result("PULSE", "failure", `Measurement could not run: ${e.message.split("\n")[0]}`, { errors: [e.message], measurements: [] });
  }
  const regressions = compareMeasurements(measurements, previous, config.pulse);
  const a11yCount = measurements.reduce((n, m) => n + m.a11y.length, 0);
  const line = measurements.map((m) => `${m.page} LCP ${m.lcp ?? "n/a"} ms, TTFB ${m.ttfb ?? "n/a"} ms`).join("; ");
  const status = regressions.length ? "failure" : "success";
  const summary = `${line}. ${previous ? `${regressions.length} regression(s) vs previous run` : "First measurement; baseline recorded"}. ${a11yCount} automated a11y finding(s).`;
  return result("PULSE", status, summary, {
    measurements,
    regressions,
    findings: [
      ...regressions.map((r) => ({ title: `${r.page}: ${r.metric} regressed ${r.change}`, detail: `previous ${r.previous}, now ${r.current}` })),
      ...measurements.flatMap((m) => m.a11y.slice(0, 5).map((i) => ({ title: `${m.page}: ${i}`, detail: "automated DOM check" }))),
    ],
  });
}
