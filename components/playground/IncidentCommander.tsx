"use client";

import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  ExternalLink,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  UserCheck,
  XCircle,
} from "lucide-react";
import { track } from "@/lib/analytics";
import { getToolRisk, isHardBlocked, sourceUrl, PIPELINEMEDIC_COMMIT, type RiskLevel } from "@/lib/incidentCommander/policy";
import { getScenario, SCENARIOS, type Metrics, type Scenario, type ScenarioId } from "@/lib/incidentCommander/scenarios";
import {
  assessPlan,
  CHECKS,
  initialState,
  isSimulatorStatus,
  plansFor,
  reducer,
  REQUIRED_CHECK,
  type CheckId,
  type LogEntry,
  type Outcome,
  type SimState,
} from "@/lib/incidentCommander/engine";

type Tone = "ok" | "warn" | "crit";

const TONE_TEXT: Record<Tone, string> = { ok: "text-teal", warn: "text-amber-300", crit: "text-rose-400" };
const TONE_BORDER: Record<Tone, string> = { ok: "border-teal/30", warn: "border-amber-300/40", crit: "border-rose-400/50" };
const RISK_TONE: Record<RiskLevel, string> = {
  LOW: "border-teal/40 text-teal",
  MEDIUM: "border-amber-300/50 text-amber-200",
  HIGH: "border-orange-400/60 text-orange-300",
  CRITICAL: "border-rose-400/60 text-rose-300",
};
const BUTTON =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:cursor-not-allowed disabled:opacity-40";
const PRIMARY = `${BUTTON} bg-teal text-ink-950 hover:bg-teal-soft`;
const SECONDARY = `${BUTTON} border border-white/15 text-slate-200 hover:border-teal/50 hover:text-white`;

const RiskBadge = ({ level }: { level: RiskLevel }) => (
  <span className={`rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] ${RISK_TONE[level]}`}>{level}</span>
);

const lagTone = (lag: number): Tone => (lag >= 5000 ? "crit" : lag >= 500 ? "warn" : "ok");

function tiles(m: Metrics): { label: string; value: string; tone: Tone }[] {
  return [
    { label: "Consumer lag", value: m.lag.toLocaleString("en-US"), tone: lagTone(m.lag) },
    { label: "DLQ / min", value: String(m.dlqPerMin), tone: m.dlqPerMin >= 5 ? "crit" : m.dlqPerMin > 0 ? "warn" : "ok" },
    { label: "Validated", value: `${m.validatedPct}%`, tone: m.validatedPct >= 99 ? "ok" : m.validatedPct >= 90 ? "warn" : "crit" },
    { label: "Flink job", value: m.flink, tone: m.flink === "RUNNING" ? "ok" : "warn" },
    { label: "Airflow task", value: m.airflow, tone: m.airflow === "success" ? "ok" : "crit" },
    {
      label: "PostgreSQL",
      value: m.postgres === "schema_mismatch" ? "schema mismatch" : m.postgres,
      tone: m.postgres === "healthy" ? "ok" : m.postgres === "stale" ? "warn" : "crit",
    },
  ];
}

function PipelineMap({ m }: { m: Metrics }) {
  const nodes: { name: string; detail: string; tone: Tone }[] = [
    { name: "Producer", detail: "order events", tone: "ok" },
    { name: "Kafka", detail: "orders.raw", tone: lagTone(m.lag) },
    { name: "Flink", detail: "order-validator", tone: m.flink !== "RUNNING" ? "warn" : m.validatedPct < 90 ? "crit" : m.validatedPct < 99 ? "warn" : "ok" },
    { name: "DLQ", detail: "pipeline.dlq", tone: m.dlqPerMin >= 5 ? "crit" : m.dlqPerMin > 0 ? "warn" : "ok" },
    { name: "PostgreSQL", detail: "orders", tone: m.postgres === "healthy" ? "ok" : m.postgres === "stale" ? "warn" : "crit" },
    { name: "Airflow", detail: "order_data_quality_dag", tone: m.airflow === "success" ? "ok" : "crit" },
  ];
  return (
    <ol aria-label="Simulated pipeline" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {nodes.map((n) => (
        <li key={n.name} className={`rounded-xl border bg-white/[0.02] px-3 py-2 ${TONE_BORDER[n.tone]}`} data-tone={n.tone}>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
            <span className={`h-2 w-2 shrink-0 rounded-full ${n.tone === "ok" ? "bg-teal" : n.tone === "warn" ? "bg-amber-300" : "bg-rose-400"}`} aria-hidden="true" />
            {n.name}
            <span className="sr-only">: {n.tone === "ok" ? "healthy" : n.tone === "warn" ? "degraded" : "failing"}</span>
          </span>
          <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-400">{n.detail}</span>
        </li>
      ))}
    </ol>
  );
}

function Console({ m }: { m: Metrics }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="ic-metrics">
      {tiles(m).map((t) => (
        <div key={t.label} className="rounded-xl border border-white/10 bg-ink-900/60 px-3 py-2">
          <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-slate-400">{t.label}</dt>
          <dd className={`mt-0.5 font-mono text-base font-bold ${TONE_TEXT[t.tone]}`} data-metric={t.label}>
            {t.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const STEPS = ["Detect", "Diagnose", "Plan", "Policy", "Approval", "Execute", "Validate", "Resolve / Rollback"] as const;

function stepIndex(state: SimState): number {
  switch (state.phase) {
    case "investigate":
      return state.evidence.length ? 1 : 0;
    case "plan":
      return state.blocked ? 3 : 2;
    case "approval":
      return 4;
    case "human":
      return 5;
    case "validate":
      return 6;
    case "done":
      return 7;
  }
}

function Stepper({ state }: { state: SimState }) {
  const current = stepIndex(state);
  return (
    <ol aria-label="Incident workflow" className="flex flex-wrap gap-1.5">
      {STEPS.map((label, i) => (
        <li
          key={label}
          aria-current={i === current ? "step" : undefined}
          className={`rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] ${
            i === current ? "border-teal bg-teal/10 text-teal" : i < current ? "border-teal/25 text-slate-300" : "border-white/10 text-slate-500"
          }`}
        >
          {i + 1}. {label}
        </li>
      ))}
    </ol>
  );
}

const LOG_STYLE: Record<LogEntry["kind"], string> = {
  pm: "text-teal",
  tool: "text-accent-cyan",
  sim: "text-amber-200",
};
const LOG_TAG: Record<LogEntry["kind"], string> = { pm: "event", tool: "tool", sim: "sim" };

function EventLog({ log }: { log: LogEntry[] }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log.length]);
  return (
    <section aria-labelledby="ic-log-heading" className="rounded-2xl border border-white/10 bg-ink-900/60 p-4">
      <h2 id="ic-log-heading" className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">
        Incident event log
      </h2>
      <p className="mt-1 text-xs text-slate-400">
        <span className="text-teal">event</span> = PipelineMedic incident_events type · <span className="text-accent-cyan">tool</span> = simulated tool call ·{" "}
        <span className="text-amber-200">sim</span> = simulator note
      </p>
      <ol ref={ref} className="mt-3 max-h-80 space-y-1.5 overflow-y-auto pr-1 font-mono text-[12px] leading-snug" data-testid="ic-log" aria-live="polite">
        {log.map((e, i) => (
          <li key={i} className="[overflow-wrap:anywhere]">
            <span className="text-slate-500">[{LOG_TAG[e.kind]}]</span> <span className={LOG_STYLE[e.kind]}>{e.label}</span>
            {e.detail && <span className="text-slate-400"> {e.detail}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Panel({ title, kicker, children, headingRef, testId }: { title: string; kicker: string; children: ReactNode; headingRef: React.RefObject<HTMLHeadingElement>; testId: string }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5" data-testid={testId} aria-labelledby={`${testId}-heading`}>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-teal">{kicker}</p>
      <h2 id={`${testId}-heading`} ref={headingRef} tabIndex={-1} className="mt-1 text-lg font-semibold text-white focus:outline-none">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const ToolLine = ({ tool, input }: { tool: string; input: Record<string, unknown> }) => (
  <code className="block min-w-0 flex-1 font-mono text-[12px] text-slate-300 [overflow-wrap:anywhere]">
    <span className="text-accent-cyan">{tool}</span>({JSON.stringify(input)})
  </code>
);

function Investigate({ s, state, dispatch }: { s: Scenario; state: SimState; dispatch: React.Dispatch<Parameters<typeof reducer>[1]> }) {
  const [choice, setChoice] = useState<string>("");
  return (
    <>
      <div className="rounded-xl border border-rose-400/30 bg-rose-400/[0.05] p-3" data-testid="ic-alert">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
          <AlertTriangle className="h-4 w-4 text-rose-300" aria-hidden="true" />
          {s.title}
        </p>
        <p className="mt-1 text-xs text-slate-300">{s.description}</p>
        <p className="mt-2 text-xs text-slate-400">
          <span className="font-semibold text-slate-300">Deterministic detection</span> ({s.detectorSource}): {s.detectorRule} Severity{" "}
          <span className="font-mono font-bold text-rose-300">{s.severity}</span>.
        </p>
      </div>

      <h3 className="mt-5 text-sm font-semibold text-white">1. Gather evidence with read-only tools</h3>
      <p className="mt-1 text-xs text-slate-400">All of these are LOW risk in the policy. Run as many as you need; the strongest evidence raises the diagnosis confidence.</p>
      <ul className="mt-3 space-y-2">
        {s.evidence.map((e) => {
          const done = state.evidence.includes(e.id);
          return (
            <li key={e.id} className="rounded-xl border border-white/10 bg-ink-900/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ToolLine tool={e.tool} input={e.input} />
                <button type="button" className={SECONDARY} disabled={done} onClick={() => dispatch({ type: "evidence", id: e.id })}>
                  <Search className="h-4 w-4" aria-hidden="true" />
                  {done ? "Done" : "Run"}
                  <span className="sr-only"> {e.tool}</span>
                </button>
              </div>
              {done && (
                <p className="mt-2 text-sm text-slate-200" data-testid={`ic-finding-${e.id}`}>
                  {e.finding}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <form
        className="mt-5"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (choice) dispatch({ type: "diagnose", hypothesisId: choice });
        }}
      >
        <fieldset>
          <legend className="text-sm font-semibold text-white">2. What is the root cause?</legend>
          <div className="mt-3 space-y-2">
            {s.hypotheses.map((h) => (
              <label key={h.id} className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-white/10 p-3 text-sm text-slate-200 has-[:checked]:border-teal/60 has-[:checked]:bg-teal/[0.05]">
                <input type="radio" name="hypothesis" value={h.id} checked={choice === h.id} onChange={() => setChoice(h.id)} className="mt-1 accent-teal" />
                <span>{h.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className={`${PRIMARY} mt-3`} disabled={!choice}>
          Submit diagnosis
        </button>
      </form>
    </>
  );
}

function PolicyResult({ s, state }: { s: Scenario; state: SimState }) {
  const record = state.policy[state.policy.length - 1];
  if (!record) return null;
  const { assessment } = record;
  const blocked = assessment.decision === "BLOCKED";
  return (
    <div
      className={`rounded-xl border p-3 ${blocked ? "border-rose-400/50 bg-rose-400/[0.06]" : "border-amber-300/40 bg-amber-300/[0.04]"}`}
      data-testid="ic-policy"
      data-decision={assessment.decision}
    >
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
        {blocked ? <ShieldX className="h-4 w-4 text-rose-300" aria-hidden="true" /> : <ShieldAlert className="h-4 w-4 text-amber-200" aria-hidden="true" />}
        Policy decision: <span className="font-mono">{assessment.decision}</span> <RiskBadge level={assessment.riskLevel} />
      </p>
      <p className="mt-2 font-mono text-[12px] text-slate-300 [overflow-wrap:anywhere]" data-testid="ic-rationale">
        {assessment.rationale}
      </p>
      {blocked ? (
        <p className="mt-2 text-sm text-slate-200">
          <span className="font-semibold">Blocked: nothing was executed.</span> {assessment.blockedActions.join(", ")}{" "}
          {assessment.blockedActions.length > 1 ? "are" : "is"} listed under hard_blocked_tools in autonomy_policy.yaml, which forces the plan to CRITICAL. PipelineMedic
          also enforces this in code: tools/registry.py raises ToolPermissionError before a hard-blocked tool can run. {s.plans.find((p) => p.id === record.planId)?.lesson}{" "}
          Choose a different plan below.
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate-200">
          MEDIUM and HIGH risk plans need a human. PipelineMedic persists the request and pauses until someone approves or rejects it.
        </p>
      )}
    </div>
  );
}

function PlanStep({ s, state, dispatch }: { s: Scenario; state: SimState; dispatch: React.Dispatch<Parameters<typeof reducer>[1]> }) {
  const [choice, setChoice] = useState<string>("");
  const d = state.diagnosis!;
  const plans = plansFor(s, d.hypothesisId);
  const tried = new Set(state.policy.map((p) => p.planId));
  return (
    <>
      <div className="rounded-xl border border-white/10 bg-ink-900/40 p-3" data-testid="ic-diagnosis">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-amber-200">Simulated LLM diagnosis · not a live model</p>
        <p className="mt-1 text-sm text-slate-200">root_cause: {d.rootCause}</p>
        <p className="mt-1 font-mono text-[12px] text-slate-400">
          confidence: <span data-testid="ic-confidence">{d.confidence.toFixed(2)}</span> · affected: {d.affectedComponents.join(", ")}
        </p>
        {d.contradicted && <p className="mt-2 text-sm text-amber-200">The evidence you gathered does not support this diagnosis.</p>}
        {!state.evidence.length && <p className="mt-2 text-sm text-amber-200">No evidence was gathered, so confidence is low.</p>}
      </div>

      {state.blocked && (
        <div className="mt-4">
          <PolicyResult s={s} state={state} />
        </div>
      )}

      <form
        className="mt-5"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (choice) dispatch({ type: "plan", planId: choice });
        }}
      >
        <fieldset>
          <legend className="text-sm font-semibold text-white">Typed repair plans proposed for this diagnosis</legend>
          <p className="mt-1 text-xs text-slate-400">Each action is a typed tool call with a fixed input schema. Pick one to submit to the policy engine.</p>
          <div className="mt-3 space-y-2">
            {plans.map((p) => {
              const risk = assessPlan(s, p);
              return (
                <label
                  key={p.id}
                  className="block cursor-pointer rounded-xl border border-white/10 p-3 has-[:checked]:border-teal/60 has-[:checked]:bg-teal/[0.05]"
                  data-testid={`ic-plan-${p.id}`}
                >
                  <span className="flex items-start gap-3">
                    <input type="radio" name="plan" value={p.id} checked={choice === p.id} onChange={() => setChoice(p.id)} className="mt-1 accent-teal" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-white">
                        {p.summary}
                        {tried.has(p.id) && risk.decision === "BLOCKED" && <span className="ml-2 font-mono text-[11px] text-rose-300">(blocked)</span>}
                      </span>
                      <span className="mt-2 block space-y-1.5">
                        {p.actions.map((a, i) => (
                          <span key={i} className="block">
                            <span className="flex flex-wrap items-center gap-2">
                              <RiskBadge level={getToolRisk(a.tool)} />
                              {isHardBlocked(a.tool) && <span className="font-mono text-[11px] text-rose-300">hard-blocked</span>}
                              <span className="font-mono text-[11px] text-slate-500">{a.rollback ? "reversible · rollback tool" : a.reversible ? "no rollback tool" : "not reversible"}</span>
                            </span>
                            <ToolLine tool={a.tool} input={a.input} />
                            <span className="block text-xs text-slate-400">{a.description}</span>
                            {a.rollback && (
                              <span className="block font-mono text-[11px] text-slate-500 [overflow-wrap:anywhere]">
                                rollback: {a.rollback.tool}({JSON.stringify(a.rollback.input)})
                              </span>
                            )}
                          </span>
                        ))}
                      </span>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <button type="submit" className={`${PRIMARY} mt-3`} disabled={!choice}>
          Submit to policy engine
        </button>
      </form>
    </>
  );
}

function ApprovalStep({ s, state, dispatch }: { s: Scenario; state: SimState; dispatch: React.Dispatch<Parameters<typeof reducer>[1]> }) {
  const plan = s.plans.find((p) => p.id === state.planId)!;
  return (
    <>
      <PolicyResult s={s} state={state} />
      <div className="mt-4 rounded-xl border border-white/10 bg-ink-900/40 p-3">
        <p className="text-sm font-semibold text-white">{plan.summary}</p>
        <div className="mt-2 space-y-1">
          {plan.actions.map((a, i) => (
            <ToolLine key={i} tool={a.tool} input={a.input} />
          ))}
        </div>
      </div>
      <p className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/[0.04] p-3 text-sm text-amber-100" data-testid="ic-approval-notice">
        This is a simulated approval. Approving only advances this simulation in your browser. It does not authorize, trigger or reach any real infrastructure
        operation.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={PRIMARY} onClick={() => dispatch({ type: "approve" })}>
          <UserCheck className="h-4 w-4" aria-hidden="true" />
          Approve (simulation)
        </button>
        <button type="button" className={SECONDARY} onClick={() => dispatch({ type: "reject" })}>
          <Ban className="h-4 w-4" aria-hidden="true" />
          Reject
        </button>
      </div>
    </>
  );
}

function HumanRepairStep({ s, state, dispatch }: { s: Scenario; state: SimState; dispatch: React.Dispatch<Parameters<typeof reducer>[1]> }) {
  const plan = s.plans.find((p) => p.id === state.planId)!;
  const hr = plan.humanRepair!;
  const escalation = plan.actions[hr.afterAction];
  const rest = plan.actions.slice(hr.afterAction + 1);
  return (
    <>
      <div className="rounded-xl border border-white/10 bg-ink-900/40 p-3" data-testid="ic-escalation">
        <p className="text-sm font-semibold text-white">Escalation recorded</p>
        <ToolLine tool={escalation.tool} input={escalation.input} />
        {escalation.output && <p className="mt-1 font-mono text-[12px] text-teal">→ {JSON.stringify(escalation.output)}</p>}
        <p className="mt-2 text-sm text-slate-300">This only notes the escalation. It does not change the database; no PipelineMedic tool can.</p>
      </div>
      <div className="mt-4 rounded-xl border border-amber-300/40 bg-amber-300/[0.04] p-3">
        <p className="text-sm font-semibold text-white">Paused: waiting for an out-of-band repair</p>
        <p className="mt-1 text-sm text-slate-200">
          <span className="font-semibold">{hr.owner[0].toUpperCase() + hr.owner.slice(1)}:</span> {hr.task}
        </p>
        <p className="mt-1 text-sm text-slate-300">
          Waiting to run: <span className="font-mono text-[12px]">{rest.map((a) => a.tool).join(", ")}</span>
        </p>
      </div>
      <p className="mt-4 rounded-xl border border-white/10 p-3 text-sm text-slate-300" data-testid="ic-human-notice">
        Confirming stands in for the simulated {hr.owner} reporting the repair done. It is part of this simulation, not an external authorization, and changes
        nothing outside your browser.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={PRIMARY} onClick={() => dispatch({ type: "confirmRepair" })}>
          <UserCheck className="h-4 w-4" aria-hidden="true" />
          Confirm the {hr.owner} restored the column
        </button>
        <button type="button" className={SECONDARY} onClick={() => dispatch({ type: "withholdRepair" })}>
          <Ban className="h-4 w-4" aria-hidden="true" />
          Repair not done: withhold confirmation
        </button>
      </div>
    </>
  );
}

function ValidateStep({ state, dispatch }: { state: SimState; dispatch: React.Dispatch<Parameters<typeof reducer>[1]> }) {
  const [checks, setChecks] = useState<CheckId[]>([REQUIRED_CHECK]);
  const toggle = (id: CheckId) => setChecks((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  return (
    <>
      <p className="text-sm text-slate-200">
        The repair ran.
        {state.canary?.ran
          ? ` The canary gate re-measured consumer lag (${state.canary.lag.toLocaleString("en-US")}) and passed, so the change expanded to full scope.`
          : " LOW-risk repairs skip the canary."}{" "}
        Now decide what to verify before calling it resolved. PipelineMedic never trusts a tool&apos;s return code; it re-measures.
      </p>
      <form
        className="mt-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          dispatch({ type: "validate", checks });
        }}
      >
        <fieldset>
          <legend className="text-sm font-semibold text-white">Validation checks</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {CHECKS.map((c) => (
              <label key={c.id} className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-white/10 p-3 text-sm text-slate-200 has-[:checked]:border-teal/60">
                <input
                  type="checkbox"
                  className="mt-1 accent-teal"
                  checked={checks.includes(c.id)}
                  disabled={c.id === REQUIRED_CHECK}
                  onChange={() => toggle(c.id)}
                  value={c.id}
                />
                <span>
                  <span className="block font-mono text-[12px] text-white">{c.id}</span>
                  <span className="block text-xs text-slate-400">
                    {c.label} · {c.real ? "the check PipelineMedic's validate_pipeline_health runs (always on)" : "simulation-only check"}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className={`${PRIMARY} mt-3`}>
          Run validation
        </button>
      </form>
    </>
  );
}

const OUTCOME: Record<Outcome, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  recovered: { label: "Recovered", tone: "border-teal/50 bg-teal/[0.06] text-teal", icon: CheckCircle2 },
  degraded: { label: "Degraded: incident still open", tone: "border-amber-300/50 bg-amber-300/[0.05] text-amber-200", icon: AlertTriangle },
  worsened: { label: "Worsened", tone: "border-rose-400/50 bg-rose-400/[0.06] text-rose-300", icon: XCircle },
};

function outcomeExplanation(s: Scenario, state: SimState): string {
  const plan = state.planId ? s.plans.find((p) => p.id === state.planId) : null;
  const lesson = plan?.lesson ?? "";
  const failedAt = state.canary?.ran && !state.canary.passed ? "The canary gate failed." : "Validation failed.";
  switch (state.resolution) {
    case "rejected":
      return "You rejected the plan, so nothing ran. Nothing got worse, but the incident is still open.";
    case "escalated_unresolved":
      return `The escalation is on record, but the ${plan?.humanRepair?.owner ?? "owner"} never confirmed the repair, so the rerun was not attempted. request_human_approval only notes an escalation; it can't fix the table. The incident is still open.`;
    case "false_all_clear":
      return `Validation passed only because the failing check was not run: ${state.validation!.missed.map((m) => `${m.id} (${m.value})`).join(", ")}. The incident was declared resolved and then reopened. ${lesson}`;
    case "rolled_back":
      return `${failedAt} Every executed action was undone (${state.rollback!.reverted.map((r) => r.rollbackTool).join(", ")}), so the pipeline is back where it started and the incident is still open. ${lesson}`;
    case "partial_rollback":
      return `${failedAt} Only part of the repair could be undone; ${state.rollback!.remaining.map((r) => r.tool).join(", ")} is still in effect. ${lesson}`;
    case "failed_no_rollback":
      return `${failedAt} Nothing that ran could be undone (${state.rollback!.remaining.map((r) => r.tool).join(", ")}), so its effects remain. ${lesson}`;
    default:
      return lesson;
  }
}

function RollbackDetails({ state }: { state: SimState }) {
  const r = state.rollback;
  if (!r) return null;
  return (
    <section aria-labelledby="ic-sum-rollback">
      <h3 id="ic-sum-rollback" className="text-sm font-semibold text-white">
        Rollback
      </h3>
      <ul className="mt-1 space-y-0.5 text-sm" data-testid="ic-rollback">
        {r.reverted.map((x) => (
          <li key={x.tool} className="text-teal">
            ↺ <span className="font-mono text-[12px]">{x.tool}</span> <span className="text-slate-400">undone by {x.rollbackTool}</span>
          </li>
        ))}
        {r.remaining.map((x) => (
          <li key={x.tool} className="text-amber-200">
            ! <span className="font-mono text-[12px]">{x.tool}</span>{" "}
            <span className="text-slate-400">still in effect ({x.reason === "not_reversible" ? "not reversible" : "no rollback tool"})</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-slate-400">
        PipelineMedic&apos;s graph.py records any failed validation as ROLLED_BACK. This simulator reports what was actually undone instead.
      </p>
    </section>
  );
}

const StatusText = ({ status }: { status: SimState["status"] }) => (
  <>
    status={status}
    {isSimulatorStatus(status) && <span className="text-amber-200"> (simulator status)</span>}
  </>
);

function Summary({ s, state, dispatch, onNext }: { s: Scenario; state: SimState; dispatch: React.Dispatch<Parameters<typeof reducer>[1]>; onNext: () => void }) {
  const o = OUTCOME[state.outcome!];
  const Icon = o.icon;
  const plan = state.planId ? s.plans.find((p) => p.id === state.planId) : null;
  const correct = s.hypotheses.find((h) => h.correct)!;
  const evidenceTools = state.evidence.map((id) => s.evidence.find((e) => e.id === id)!.tool);
  const sources = [...s.sources, "backend/app/policies/autonomy_policy.yaml", "backend/app/policies/engine.py", "backend/app/agents/graph.py", "backend/app/tools/registry.py"];
  return (
    <div data-testid="ic-summary" data-outcome={state.outcome} data-status={state.status} data-resolution={state.resolution ?? undefined}>
      <p className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 text-base font-semibold ${o.tone}`} data-testid="ic-outcome">
        <Icon className="h-5 w-5" aria-hidden="true" />
        Simulated outcome: {o.label}{" "}
        <span className="font-mono text-xs text-slate-300">
          <StatusText status={state.status} />
        </span>
      </p>
      <p className="mt-3 text-sm text-slate-200">{outcomeExplanation(s, state)}</p>
      {plan?.sourceNote && <p className="mt-2 text-xs text-slate-400">{plan.sourceNote}</p>}
      <p className="mt-3 text-sm text-slate-300">
        <span className="font-semibold text-white">Root cause:</span> {correct.label} {correct.explanation}
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="ic-sum-decisions">
          <h3 id="ic-sum-decisions" className="text-sm font-semibold text-white">
            Decisions taken
          </h3>
          <ol className="mt-2 space-y-1.5 text-sm" data-testid="ic-decisions">
            {state.decisions
              .filter((d) => d.step !== "evidence")
              .map((d, i) => (
                <li key={i} className="rounded-lg border border-white/10 p-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-slate-400">{d.step}</span>
                  {d.good === true && <span className="ml-2 text-teal">✓ good call</span>}
                  {d.good === false && <span className="ml-2 text-rose-300">✗ poor call</span>}
                  <span className="block text-slate-200 [overflow-wrap:anywhere]">{d.choice}</span>
                  <span className="block break-words text-xs text-slate-400">{d.note}</span>
                </li>
              ))}
          </ol>
        </section>
        <div className="space-y-4">
          <section aria-labelledby="ic-sum-tools">
            <h3 id="ic-sum-tools" className="text-sm font-semibold text-white">
              Tools selected
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              Evidence: <span className="font-mono text-[12px]">{evidenceTools.join(", ") || "none"}</span>
            </p>
            <p className="mt-1 text-sm text-slate-300">
              Repair executed:{" "}
              <span className="font-mono text-[12px]" data-testid="ic-executed">
                {plan && state.executed.length ? state.executed.map((i) => plan.actions[i].tool).join(", ") : "none"}
              </span>
            </p>
            {plan && state.executed.length > 0 && state.executed.length < plan.actions.length && (
              <p className="mt-1 text-sm text-slate-300">
                Never ran: <span className="font-mono text-[12px]">{plan.actions.filter((_, i) => !state.executed.includes(i)).map((a) => a.tool).join(", ")}</span>
              </p>
            )}
          </section>
          <RollbackDetails state={state} />
          <section aria-labelledby="ic-sum-policy">
            <h3 id="ic-sum-policy" className="text-sm font-semibold text-white">
              Policy decisions
            </h3>
            <ul className="mt-1 space-y-1.5" data-testid="ic-policy-history">
              {state.policy.map((p, i) => (
                <li key={i} className="text-sm text-slate-300">
                  <span className="font-mono text-[12px]">{p.tools.join(" + ")}</span> → <span className="font-mono text-white">{p.assessment.decision}</span>{" "}
                  <RiskBadge level={p.assessment.riskLevel} />
                  <span className="block font-mono text-[11px] text-slate-500 [overflow-wrap:anywhere]">{p.assessment.rationale}</span>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="ic-sum-validation">
            <h3 id="ic-sum-validation" className="text-sm font-semibold text-white">
              Recovery validation
            </h3>
            {state.canary?.ran && (
              <p className="mt-1 text-sm text-slate-300">
                Canary: consumer_lag_ok={String(state.canary.passed)} (lag {state.canary.lag.toLocaleString("en-US")})
              </p>
            )}
            {state.validation ? (
              <ul className="mt-1 space-y-0.5 text-sm" data-testid="ic-validation">
                {state.validation.checks.map((c) => (
                  <li key={c.id} className={c.passed ? "text-teal" : "text-rose-300"}>
                    {c.passed ? "✓" : "✗"} <span className="font-mono text-[12px]">{c.id}</span> <span className="text-slate-400">({c.value})</span>
                  </li>
                ))}
                {state.validation.missed.map((c) => (
                  <li key={c.id} className="text-amber-200">
                    ! <span className="font-mono text-[12px]">{c.id}</span> was not run and would have failed <span className="text-slate-400">({c.value})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-slate-400">{state.canary?.ran ? "Full validation never ran because the canary failed." : "No repair ran, so there was nothing to validate."}</p>
            )}
          </section>
        </div>
      </div>

      <section aria-labelledby="ic-sum-sources" className="mt-5">
        <h3 id="ic-sum-sources" className="text-sm font-semibold text-white">
          PipelineMedic source (commit {PIPELINEMEDIC_COMMIT.slice(0, 7)})
        </h3>
        <ul className="mt-2 flex flex-wrap gap-2" data-testid="ic-sources">
          {sources.map((p) => (
            <li key={p}>
              <a
                href={sourceUrl(p)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-white/10 px-3 font-mono text-[12px] text-slate-300 hover:border-teal/50 hover:text-white"
              >
                {p.split("/").pop()}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                <span className="sr-only">(opens GitHub in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className={PRIMARY} onClick={() => dispatch({ type: "restart" })}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Retry this incident
        </button>
        <button type="button" className={SECONDARY} onClick={onNext}>
          Next incident
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** Interactive, deterministic PipelineMedic incident simulation. Runs entirely in the browser. */
export function IncidentCommander() {
  const [state, dispatch] = useReducer(reducer, "schema-drift" as ScenarioId, initialState);
  const s = getScenario(state.scenarioId);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const interacted = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const phaseKey = `${state.scenarioId}:${state.phase}:${state.policy.length}`;

  // Move focus to the new step's heading after each transition, so keyboard and screen-reader users follow along.
  useEffect(() => {
    if (!interacted.current) return;
    headingRef.current?.focus();
  }, [phaseKey]);

  useEffect(() => {
    if (state.phase === "done" && state.outcome) track("incident_scenario_complete", { scenario: state.scenarioId, outcome: state.outcome });
  }, [state.phase, state.outcome, state.scenarioId]);

  const act: React.Dispatch<Parameters<typeof reducer>[1]> = (a) => {
    interacted.current = true;
    dispatch(a);
  };
  const load = (id: ScenarioId) => act({ type: "load", scenarioId: id });
  const next = () => load(SCENARIOS[(SCENARIOS.findIndex((x) => x.id === state.scenarioId) + 1) % SCENARIOS.length].id);

  const panel = (() => {
    switch (state.phase) {
      case "investigate":
        return (
          <Panel key={phaseKey} testId="ic-step-investigate" kicker="Detect · Diagnose" title="Investigate the alert" headingRef={headingRef}>
            <Investigate s={s} state={state} dispatch={act} />
          </Panel>
        );
      case "plan":
        return (
          <Panel key={phaseKey} testId="ic-step-plan" kicker="Plan · Policy" title={state.blocked ? "Blocked by policy: choose another plan" : "Choose a repair plan"} headingRef={headingRef}>
            <PlanStep s={s} state={state} dispatch={act} />
          </Panel>
        );
      case "approval":
        return (
          <Panel key={phaseKey} testId="ic-step-approval" kicker="Policy · Approval" title="Approval required" headingRef={headingRef}>
            <ApprovalStep s={s} state={state} dispatch={act} />
          </Panel>
        );
      case "human":
        return (
          <Panel key={phaseKey} testId="ic-step-human" kicker="Execute · Human repair" title="Waiting for a human repair" headingRef={headingRef}>
            <HumanRepairStep s={s} state={state} dispatch={act} />
          </Panel>
        );
      case "validate":
        return (
          <Panel key={phaseKey} testId="ic-step-validate" kicker="Execute · Validate" title="Validate the repair" headingRef={headingRef}>
            <ValidateStep state={state} dispatch={act} />
          </Panel>
        );
      case "done":
        return (
          <Panel key={phaseKey} testId="ic-step-done" kicker="Resolve · Rollback" title="Incident summary" headingRef={headingRef}>
            <Summary s={s} state={state} dispatch={act} onNext={next} />
          </Panel>
        );
    }
  })();

  return (
    <div className="space-y-5" data-testid="incident-commander" data-ready={hydrated} data-phase={state.phase} data-scenario={state.scenarioId}>
      <nav aria-label="Incident scenarios">
        <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {SCENARIOS.map((x) => {
            const active = x.id === state.scenarioId;
            return (
              <li key={x.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => load(x.id)}
                  className={`flex min-h-[44px] w-full flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal ${
                    active ? "border-teal/60 bg-teal/[0.07]" : "border-white/10 hover:border-teal/40"
                  }`}
                >
                  <span className="text-sm font-semibold text-white">{x.name}</span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {x.component} · {x.severity}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <section aria-labelledby="ic-monitor-heading" className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.015] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="ic-monitor-heading" className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">
            Monitoring console · simulated
          </h2>
          <span className="font-mono text-[11px] text-slate-400" data-testid="ic-status">
            <StatusText status={state.status} />
          </span>
        </div>
        <PipelineMap m={state.metrics} />
        <Console m={state.metrics} />
        <Stepper state={state} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">{panel}</div>
        <EventLog log={state.log} />
      </div>

      <p className="flex items-start gap-2 text-xs text-slate-400">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
        Simulation only. No Kafka, Flink, PostgreSQL, Airflow, Kubernetes or MCP endpoint is contacted, and no repair is executed. Policy decisions are computed by a
        TypeScript port of PipelineMedic&apos;s policy engine; metrics and outcomes are scripted per scenario.
      </p>
    </div>
  );
}
