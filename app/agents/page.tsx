import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, GitPullRequest, CircleDot, Github } from "lucide-react";
import { SubpageNav } from "@/components/SubpageNav";
import { Footer } from "@/components/Footer";
import { maintenanceAgents } from "@/data/maintenanceAgents";
import { getActivity, REVALIDATE_SECONDS, type AgentRun, type AgentStatus, type RunRecord } from "@/lib/agentData";

export const revalidate = REVALIDATE_SECONDS;

export const metadata: Metadata = {
  title: "Agent Activity Center",
  description: "Real scheduled maintenance runs for this portfolio: research, repository sync, live-site testing and performance checks on GitHub Actions.",
};

const REPO = "https://github.com/LOHITHK22/lohith-portfolio";
const STATUS: Record<AgentStatus, { label: string; cls: string }> = {
  success: { label: "Success", cls: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" },
  "no-change": { label: "No change", cls: "border-slate-400/30 bg-slate-400/10 text-slate-300" },
  partial: { label: "Partial", cls: "border-amber-400/40 bg-amber-400/10 text-amber-300" },
  failure: { label: "Failure", cls: "border-rose-400/40 bg-rose-400/10 text-rose-300" },
  skipped: { label: "Skipped", cls: "border-white/10 bg-white/[0.03] text-slate-500" },
};

function Badge({ status }: { status: AgentStatus }) {
  const s = STATUS[status] ?? STATUS.skipped;
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${s.cls}`}>{s.label}</span>;
}

const utc = (iso?: string | null) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : "n/a");

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-ink-900/60 ${className}`}>
      <h2 className="border-b border-white/[0.07] px-5 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{title}</h2>
      <div className="p-5">{children}</div>
    </section>
  );
}

function lastRunOf(runs: RunRecord[], agent: string): { run: RunRecord; a: AgentRun } | null {
  for (const run of runs) {
    const a = run.agents.find((x) => x.agent === agent && x.status !== "skipped");
    if (a) return { run, a };
  }
  return null;
}

export default async function AgentsPage() {
  const { runs, error, source } = await getActivity();
  const latest = runs[0];
  const sentinel = lastRunOf(runs, "SENTINEL");
  const pulse = lastRunOf(runs, "PULSE");
  const tracked = runs
    .flatMap((r) => [
      ...(r.pr ? [{ kind: "pr" as const, title: r.pr.action === "blocked" ? "Resource proposal (open PR manually)" : `Pull request #${r.pr.number}`, url: r.pr.url, at: r.startedAt }] : []),
      ...r.agents.flatMap((a) => (a.issues ?? []).map((i) => ({ kind: "issue" as const, title: i.title ?? `Issue #${i.number}`, url: i.url, at: r.startedAt }))),
    ])
    .filter((x, i, arr) => arr.findIndex((y) => y.url === x.url) === i)
    .slice(0, 12);

  return (
    <>
      <SubpageNav current="/agents" />
      <main id="main-content" className="min-h-screen bg-ink-950 pb-20">
        <div className="section-shell pt-12 sm:pt-16">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-teal">Portfolio operations</p>
          <h1 className="mt-4 font-hero text-4xl font-black leading-[0.98] tracking-[-0.03em] text-white sm:text-6xl">
            Agent Activity <span className="text-teal">Center</span>
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-slate-300">
            Seven maintenance agents run on GitHub Actions, so they keep working when my laptop is off. They research, check my
            repositories, test this site and measure its performance, then report here. Everything below is read from their
            actual run records. Changes they propose wait for my review as pull requests; they cannot push to the production
            branch.
          </p>
          <p className="mt-3 max-w-3xl text-sm text-slate-400">
            These are deterministic Node.js scripts, not language models, and they are separate from the{" "}
            <Link href="/#ai-team" className="text-teal hover:underline">narrated presentation characters</Link> on the homepage.
            Source: <a href={`${REPO}/tree/main/scripts/agents`} className="text-teal hover:underline" target="_blank" rel="noopener noreferrer">scripts/agents</a>.
          </p>

          {/* Status strip */}
          <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-4">
            {[
              { k: "Last run", v: latest ? utc(latest.startedAt) : "No runs yet" },
              { k: "Result", v: latest ? <Badge status={latest.status} /> : "n/a" },
              { k: "Trigger", v: latest ? (latest.trigger === "schedule" ? "Daily schedule" : latest.trigger === "workflow_dispatch" ? "Manual dispatch" : latest.trigger) + (latest.dryRun ? " · dry run" : "") : "n/a" },
              { k: "Log", v: latest?.runUrl ? <a href={latest.runUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal hover:underline">GitHub Actions <ExternalLink className="h-3 w-3" /></a> : "n/a" },
            ].map((c) => (
              <div key={c.k} className="bg-ink-900 px-5 py-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{c.k}</p>
                <div className="mt-1.5 text-sm font-semibold text-white">{c.v}</div>
              </div>
            ))}
          </div>

          {error && (
            <p role="status" className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
              The activity log could not be loaded right now ({error}). Nothing is shown rather than stale or invented data.
            </p>
          )}
          {!runs.length && !error && (
            <p role="status" className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
              No cloud runs have been recorded yet. The first results appear here after the workflow runs on GitHub Actions.
            </p>
          )}

          {/* Agents */}
          <ul className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {maintenanceAgents.map((ag) => {
              const last = lastRunOf(runs, ag.name);
              return (
                <li key={ag.id} className="flex flex-col rounded-2xl border border-white/10 bg-ink-900/60 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-hero text-xl font-black tracking-tight text-white">{ag.name}</p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-teal">{ag.role}</p>
                    </div>
                    {last ? <Badge status={last.a.status} /> : <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">Not run yet</span>}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-slate-300">{ag.does}</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    <span className="font-semibold text-slate-400">Never: </span>
                    {ag.never}
                  </p>
                  <div className="mt-4 border-t border-white/[0.07] pt-3 text-xs text-slate-400">
                    {last ? (
                      <>
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Last executed {utc(last.a.finishedAt ?? last.run.startedAt)}</p>
                        <p className="mt-1.5 leading-relaxed text-slate-300">{last.a.summary}</p>
                      </>
                    ) : (
                      <p>No recorded execution.</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {latest && (
            <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <Panel title={`Findings · ${utc(latest.startedAt)}`}>
                {latest.agents.some((a) => a.findings.length || a.errors.length) ? (
                  <div className="space-y-5">
                    {latest.agents
                      .filter((a) => a.findings.length || a.errors.length)
                      .map((a) => (
                        <div key={a.agent}>
                          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-teal">{a.agent}</p>
                          <ul className="mt-2 space-y-2">
                            {a.findings.map((f, i) => (
                              <li key={i} className="text-sm leading-snug">
                                {f.url ? (
                                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="font-medium text-white hover:text-teal">
                                    {f.title}
                                  </a>
                                ) : (
                                  <span className="font-medium text-white">{f.title}</span>
                                )}
                                {f.detail && <span className="block text-xs text-slate-400">{f.detail}</span>}
                              </li>
                            ))}
                            {a.errors.map((e, i) => (
                              <li key={`e${i}`} className="font-mono text-xs text-rose-300">error: {e}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No findings in the latest run. A run with nothing to report is a valid result.</p>
                )}
              </Panel>

              <div className="space-y-5">
                <Panel title="Pull requests & issues">
                  {tracked.length ? (
                    <ul className="space-y-2.5">
                      {tracked.map((t) => (
                        <li key={t.url} className="flex items-start gap-2 text-sm">
                          {t.kind === "pr" ? <GitPullRequest className="mt-0.5 h-4 w-4 shrink-0 text-teal" /> : <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />}
                          <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-slate-200 hover:text-teal">
                            {t.title}
                            <span className="block font-mono text-[10px] text-slate-500">{utc(t.at)}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-400">None opened by the agents yet.</p>
                  )}
                </Panel>

                <Panel title="Tests · SENTINEL">
                  {sentinel ? (
                    <div className="space-y-4 text-sm">
                      {sentinel.a.ci ? (
                        <ul className="grid grid-cols-2 gap-2">
                          {Object.entries(sentinel.a.ci.steps).map(([k, v]) => (
                            <li key={k} className="flex items-center justify-between rounded-lg border border-white/[0.07] px-3 py-2">
                              <span className="text-slate-300">{k}</span>
                              <span className={`font-mono text-[11px] ${v === "success" ? "text-emerald-300" : v === "failure" ? "text-rose-300" : "text-slate-500"}`}>{v}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-slate-400">Build and test job not part of the latest SENTINEL run.</p>
                      )}
                      <ul className="space-y-1">
                        {(sentinel.a.checks ?? []).map((c) => (
                          <li key={c.path} className="flex items-baseline justify-between gap-3 font-mono text-xs">
                            <span className={c.ok ? "text-slate-300" : "text-rose-300"}>{c.ok ? "✓" : "✗"} {c.path}</span>
                            <span className="text-slate-500">{c.ok ? `${c.ms} ms` : c.reason}</span>
                          </li>
                        ))}
                        {(sentinel.a.smoke ?? []).map((c) => (
                          <li key={c.name} className={`font-mono text-xs ${c.ok ? "text-slate-300" : "text-rose-300"}`}>
                            {c.ok ? "✓" : "✗"} {c.name}
                            {c.reason ? ` · ${c.reason}` : ""}
                          </li>
                        ))}
                      </ul>
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Checked {utc(sentinel.run.startedAt)}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">No test results recorded yet.</p>
                  )}
                </Panel>
              </div>
            </div>
          )}

          {pulse?.a.measurements?.length ? (
            <Panel title={`Performance · PULSE · ${utc(pulse.run.startedAt)}`} className="mt-5">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <thead className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
                    <tr>
                      {["Page", "TTFB", "FCP", "LCP", "CLS", "Transfer", "A11y findings"].map((h) => (
                        <th key={h} className="pb-2 pr-4 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="font-mono text-xs text-slate-200">
                    {pulse.a.measurements.map((m) => (
                      <tr key={m.page} className="border-t border-white/[0.06]">
                        <td className="py-2 pr-4 text-teal">{m.page}</td>
                        <td className="pr-4">{m.ttfb ?? "n/a"} ms</td>
                        <td className="pr-4">{m.fcp ?? "n/a"} ms</td>
                        <td className="pr-4">{m.lcp ?? "n/a"} ms</td>
                        <td className="pr-4">{m.cls ?? "n/a"}</td>
                        <td className="pr-4">{m.transferKB ?? "n/a"} KB</td>
                        <td>{m.a11y?.length ?? m.a11yCount ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Median of {pulse.a.measurements[0].samples} page loads from a GitHub-hosted runner in Chrome. These are measured timings, not Lighthouse scores.
              </p>
            </Panel>
          ) : null}

          {/* History */}
          <Panel title="Execution history" className="mt-5">
            {runs.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
                    <tr>
                      <th className="pb-2 pr-4 font-semibold">Started</th>
                      <th className="pb-2 pr-4 font-semibold">Trigger</th>
                      <th className="pb-2 pr-4 font-semibold">Result</th>
                      <th className="pb-2 pr-4 font-semibold">Agents</th>
                      <th className="pb-2 font-semibold">Log</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.slice(0, 30).map((r) => (
                      <tr key={r.id} className="border-t border-white/[0.06] align-middle">
                        <td className="py-2.5 pr-4 font-mono text-xs text-slate-300">{utc(r.startedAt)}</td>
                        <td className="pr-4 text-xs text-slate-400">{r.trigger === "schedule" ? "schedule" : "manual"}{r.dryRun ? " · dry run" : ""}</td>
                        <td className="pr-4"><Badge status={r.status} /></td>
                        <td className="pr-4">
                          <span className="flex flex-wrap gap-1">
                            {r.agents.filter((a) => !["ASTRA", "SCRIBE"].includes(a.agent)).map((a) => (
                              <span key={a.agent} title={`${a.agent}: ${a.status}`} className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ${STATUS[a.status]?.cls ?? ""} border`}>
                                {a.agent.slice(0, 3)}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td>
                          {r.runUrl ? (
                            <a href={r.runUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-teal hover:underline">
                              Run <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-slate-500">n/a</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No runs recorded yet.</p>
            )}
          </Panel>

          <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
            <a href={`${REPO}/actions/workflows/portfolio-agents.yml`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-teal">
              <Github className="h-3.5 w-3.5" /> Workflow
            </a>
            <a href={source} target="_blank" rel="noopener noreferrer" className="hover:text-teal">Raw activity log</a>
            <span>Refreshed at most every {REVALIDATE_SECONDS / 60} minutes.</span>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
