// A deterministic, pure state machine for the Incident Commander simulation. It follows the flow of
// PipelineMedic's agents/graph.py: diagnose → plan → calculate_risk → BLOCKED | AUTO_EXECUTE |
// APPROVAL_REQUIRED → execute → canary (MEDIUM/HIGH) → validate → resolve | rollback.
// The same decisions always produce the same result. Nothing here performs I/O.

import { assessRisk, type RiskAssessment, type RiskLevel } from "./policy";
import { getScenario, LAG_WARNING_THRESHOLD, type Metrics, type RepairPlanOption, type Scenario, type ScenarioId, type ToolCall } from "./scenarios";

export type Phase = "investigate" | "plan" | "approval" | "validate" | "done";

/** PipelineMedic's IncidentStatus values used here. */
export type IncidentStatus =
  | "DETECTED"
  | "DIAGNOSING"
  | "PLAN_READY"
  | "AWAITING_APPROVAL"
  | "EXECUTING"
  | "VALIDATING"
  | "RESOLVED"
  | "ROLLED_BACK"
  | "REJECTED";

export type Outcome = "recovered" | "degraded" | "worsened";

/** "pm" is an incident_events type from graph.py, "tool" a simulated tool call, "sim" a note from this simulator only. */
export type LogEntry = { kind: "pm" | "tool" | "sim"; label: string; detail?: string };

export type CheckId = "consumer_lag_ok" | "dlq_rate_ok" | "validated_ratio_ok" | "flink_job_running" | "airflow_task_success" | "postgres_ok";

export type CheckDef = {
  id: CheckId;
  label: string;
  /** consumer_lag_ok is the check PipelineMedic's validate_pipeline_health really runs. The others exist only in this simulation. */
  real: boolean;
  test: (m: Metrics) => boolean;
  describe: (m: Metrics) => string;
};

export const CHECKS: CheckDef[] = [
  {
    id: "consumer_lag_ok",
    label: `Consumer lag below ${LAG_WARNING_THRESHOLD}`,
    real: true,
    test: (m) => m.lag < LAG_WARNING_THRESHOLD,
    describe: (m) => `measured_lag=${m.lag}`,
  },
  { id: "dlq_rate_ok", label: "DLQ below 5 records/min", real: false, test: (m) => m.dlqPerMin < 5, describe: (m) => `${m.dlqPerMin}/min` },
  {
    id: "validated_ratio_ok",
    label: "At least 99% of orders validated",
    real: false,
    test: (m) => m.validatedPct >= 99,
    describe: (m) => `${m.validatedPct}%`,
  },
  { id: "flink_job_running", label: "Flink job RUNNING", real: false, test: (m) => m.flink === "RUNNING", describe: (m) => m.flink },
  {
    id: "airflow_task_success",
    label: "Airflow task succeeded",
    real: false,
    test: (m) => m.airflow === "success",
    describe: (m) => m.airflow,
  },
  { id: "postgres_ok", label: "PostgreSQL fresh and schema intact", real: false, test: (m) => m.postgres === "healthy", describe: (m) => m.postgres },
];
export const REQUIRED_CHECK: CheckId = "consumer_lag_ok";
export const getCheck = (id: CheckId) => CHECKS.find((c) => c.id === id)!;

export type CheckResult = { id: CheckId; passed: boolean; value: string };

export type DecisionStep = "evidence" | "diagnosis" | "plan" | "policy" | "approval" | "validation";
export type Decision = { step: DecisionStep; choice: string; note: string; good: boolean | null };

export type PolicyRecord = { planId: string; tools: string[]; assessment: RiskAssessment };

export type Diagnosis = {
  hypothesisId: string;
  rootCause: string;
  /** Simulated LLM confidence: depends on the hypothesis and on whether key evidence was gathered. */
  confidence: number;
  contradicted: boolean;
  affectedComponents: string[];
};

export type SimState = {
  scenarioId: ScenarioId;
  phase: Phase;
  status: IncidentStatus;
  metrics: Metrics;
  evidence: string[];
  diagnosis: Diagnosis | null;
  planId: string | null;
  policy: PolicyRecord[];
  /** The latest plan the policy engine blocked; cleared when a new plan is chosen. */
  blocked: PolicyRecord | null;
  approval: "approved" | "rejected" | null;
  canary: { ran: boolean; passed: boolean; lag: number } | null;
  validation: { checks: CheckResult[]; passed: boolean; missed: CheckResult[] } | null;
  rolledBack: string[];
  outcome: Outcome | null;
  /** True when validation passed only because a failing check was not run. */
  falseAllClear: boolean;
  decisions: Decision[];
  log: LogEntry[];
};

export type SimAction =
  | { type: "evidence"; id: string }
  | { type: "diagnose"; hypothesisId: string }
  | { type: "plan"; planId: string }
  | { type: "approve" }
  | { type: "reject" }
  | { type: "validate"; checks: CheckId[] }
  | { type: "restart" }
  | { type: "load"; scenarioId: ScenarioId };

const fmtInput = (call: ToolCall) => JSON.stringify(call.input);

export function initialState(scenarioId: ScenarioId): SimState {
  const s = getScenario(scenarioId);
  return {
    scenarioId,
    phase: "investigate",
    status: "DETECTED",
    metrics: { ...s.initial },
    evidence: [],
    diagnosis: null,
    planId: null,
    policy: [],
    blocked: null,
    approval: null,
    canary: null,
    validation: null,
    rolledBack: [],
    outcome: null,
    falseAllClear: false,
    decisions: [],
    log: [
      { kind: "pm", label: "INCIDENT_DETECTED", detail: `${s.incidentType} · severity ${s.severity} · ${s.sourceComponent}` },
      { kind: "sim", label: "Deterministic detector", detail: s.detectorRule },
    ],
  };
}

/** Plans the simulated planner offers for a hypothesis, forbidden ones included. */
export const plansFor = (s: Scenario, hypothesisId: string) => s.plans.filter((p) => p.forHypotheses.includes(hypothesisId));

const planTools = (p: RepairPlanOption) => p.actions.map((a) => a.tool);
export const assessPlan = (s: Scenario, p: RepairPlanOption) => assessRisk(planTools(p), s.severity);

export function diagnose(s: Scenario, hypothesisId: string, evidence: string[]): Diagnosis {
  const h = s.hypotheses.find((x) => x.id === hypothesisId)!;
  const keyIds = s.evidence.filter((e) => e.key).map((e) => e.id);
  const keyGathered = keyIds.filter((id) => evidence.includes(id)).length;
  // Correct + all key evidence: 0.93, the confidence PipelineMedic's mock planner gives a confirmed breaking
  // schema change. Correct without evidence: 0.6, its figure for an unconfirmed one. Wrong hypotheses stay
  // low and drop further when the gathered key evidence contradicts them.
  let confidence: number;
  if (h.correct) confidence = keyGathered === keyIds.length ? 0.93 : keyGathered > 0 ? 0.78 : 0.6;
  else confidence = keyGathered > 0 ? 0.31 : 0.52;
  return {
    hypothesisId,
    rootCause: h.label,
    confidence,
    contradicted: !h.correct && keyGathered > 0,
    affectedComponents: [s.sourceComponent, ...(s.component === "Airflow" ? ["postgres"] : ["flink-validator"])],
  };
}

/** graph.py runs a canary only for MEDIUM and HIGH risk repairs. */
export const needsCanary = (r: RiskLevel) => r === "MEDIUM" || r === "HIGH";

/** Lower is healthier. Used only to tell a degraded outcome from a worsened one. */
export function healthScore(m: Metrics) {
  return (
    Math.min(m.lag / LAG_WARNING_THRESHOLD, 30) +
    m.dlqPerMin / 10 +
    (100 - m.validatedPct) / 5 +
    (m.flink === "RUNNING" ? 0 : 3) +
    (m.airflow === "success" ? 0 : 3) +
    (m.postgres === "healthy" ? 0 : 2)
  );
}

function rollback(state: SimState, s: Scenario, plan: RepairPlanOption): SimState {
  const log = [...state.log];
  const rolledBack: string[] = [];
  for (const a of [...plan.actions].reverse()) {
    if (a.rollback) {
      log.push({ kind: "tool", label: a.rollback.tool, detail: `${fmtInput(a.rollback)} (rollback of ${a.tool})` });
      rolledBack.push(a.rollback.tool);
    }
  }
  const irreversible = plan.actions.filter((a) => !a.reversible).map((a) => a.tool);
  if (irreversible.length) log.push({ kind: "sim", label: "Not reversible", detail: `${irreversible.join(", ")} cannot be rolled back.` });
  const metrics = plan.afterRollback ?? (irreversible.length ? plan.after! : { ...s.initial });
  return { ...state, log, rolledBack, metrics, status: "ROLLED_BACK" };
}

function finish(state: SimState, s: Scenario): SimState {
  let outcome: Outcome;
  if (state.status === "RESOLVED" && !state.falseAllClear) outcome = "recovered";
  else if (state.falseAllClear) outcome = "worsened";
  else outcome = healthScore(state.metrics) > healthScore(s.initial) + 0.01 ? "worsened" : "degraded";
  return { ...state, phase: "done", outcome };
}

/** execute → canary → (validate phase | rolled back). Mirrors _execute_and_validate in graph.py. */
function execute(state: SimState, s: Scenario, plan: RepairPlanOption, risk: RiskLevel): SimState {
  const log: LogEntry[] = [...state.log, { kind: "pm", label: "REPAIR_STARTED", detail: plan.summary }];
  for (const a of plan.actions) log.push({ kind: "tool", label: a.tool, detail: fmtInput(a) });
  let next: SimState = { ...state, status: "EXECUTING", metrics: { ...plan.after! }, log };

  if (needsCanary(risk)) {
    const lag = next.metrics.lag;
    const passed = lag < LAG_WARNING_THRESHOLD;
    next.log = [
      ...next.log,
      { kind: "pm", label: "CANARY_STARTED", detail: `risk_level=${risk}; single-instance validation gate` },
      { kind: "tool", label: "validate_pipeline_health", detail: `canary: consumer_lag_ok=${passed}, measured_lag=${lag}` },
    ];
    next.canary = { ran: true, passed, lag };
    if (!passed) {
      next.log.push({ kind: "pm", label: "CANARY_VALIDATION_FAILED", detail: `measured_lag=${lag} ≥ ${LAG_WARNING_THRESHOLD}` });
      next = rollback(next, s, plan);
      next.log.push({ kind: "pm", label: "INCIDENT_ROLLED_BACK" });
      return finish(next, s);
    }
    next.log.push({ kind: "pm", label: "CANARY_VALIDATION_PASSED" }, { kind: "pm", label: "CANARY_EXPANDED", detail: "expanded_scope=full" });
  } else {
    next.canary = { ran: false, passed: true, lag: next.metrics.lag };
  }
  next.log.push({ kind: "pm", label: "REPAIR_COMPLETED" });
  return { ...next, status: "VALIDATING", phase: "validate" };
}

export function reducer(state: SimState, action: SimAction): SimState {
  const s = getScenario(state.scenarioId);
  switch (action.type) {
    case "restart":
      return initialState(state.scenarioId);
    case "load":
      return initialState(action.scenarioId);

    case "evidence": {
      if (state.phase !== "investigate" || state.evidence.includes(action.id)) return state;
      const e = s.evidence.find((x) => x.id === action.id);
      if (!e) return state;
      return {
        ...state,
        status: "DIAGNOSING",
        evidence: [...state.evidence, e.id],
        decisions: [...state.decisions, { step: "evidence", choice: e.tool, note: e.key ? "Key evidence" : "Context", good: null }],
        log: [...state.log, { kind: "tool", label: e.tool, detail: fmtInput(e) }],
      };
    }

    case "diagnose": {
      if (state.phase !== "investigate" || !s.hypotheses.some((h) => h.id === action.hypothesisId)) return state;
      const d = diagnose(s, action.hypothesisId, state.evidence);
      const h = s.hypotheses.find((x) => x.id === action.hypothesisId)!;
      return {
        ...state,
        phase: "plan",
        status: "PLAN_READY",
        diagnosis: d,
        decisions: [...state.decisions, { step: "diagnosis", choice: h.label, note: h.explanation, good: h.correct }],
        log: [
          ...state.log,
          { kind: "pm", label: "CONTEXT_COLLECTED", detail: `${state.evidence.length} read-only tool call(s)` },
          { kind: "pm", label: "DIAGNOSIS_CREATED", detail: `confidence ${d.confidence.toFixed(2)} (simulated LLM)` },
          { kind: "pm", label: "REPAIR_PLAN_CREATED", detail: `${plansFor(s, action.hypothesisId).length} typed plans` },
        ],
      };
    }

    case "plan": {
      if (state.phase !== "plan" || !state.diagnosis) return state;
      const plan = plansFor(s, state.diagnosis.hypothesisId).find((p) => p.id === action.planId);
      if (!plan) return state;
      const assessment = assessPlan(s, plan);
      const record: PolicyRecord = { planId: plan.id, tools: planTools(plan), assessment };
      const decisions: Decision[] = [
        ...state.decisions,
        { step: "plan", choice: plan.summary, note: plan.lesson, good: plan.quality === "correct" ? true : plan.quality === "partial" ? null : false },
        { step: "policy", choice: assessment.decision, note: assessment.rationale, good: null },
      ];
      const base: SimState = { ...state, planId: plan.id, policy: [...state.policy, record], decisions, blocked: null };

      if (assessment.decision === "BLOCKED") {
        return {
          ...base,
          // The visitor stays on the plan step and can pick a safer plan. In PipelineMedic the incident ends as FAILED.
          blocked: record,
          planId: null,
          log: [...state.log, { kind: "pm", label: "INCIDENT_BLOCKED", detail: assessment.rationale }],
        };
      }
      if (assessment.decision === "AUTO_EXECUTE") {
        return execute({ ...base, log: [...state.log, { kind: "sim", label: "Policy: AUTO_EXECUTE", detail: assessment.rationale }] }, s, plan, assessment.riskLevel);
      }
      return {
        ...base,
        phase: "approval",
        status: "AWAITING_APPROVAL",
        log: [...state.log, { kind: "pm", label: "APPROVAL_REQUESTED", detail: `risk_level=${assessment.riskLevel}` }],
      };
    }

    case "approve":
    case "reject": {
      if (state.phase !== "approval" || !state.planId) return state;
      const plan = s.plans.find((p) => p.id === state.planId)!;
      const approved = action.type === "approve";
      const decisions: Decision[] = [
        ...state.decisions,
        {
          step: "approval",
          choice: approved ? "Approved (simulated)" : "Rejected (simulated)",
          note: approved ? "The plan runs." : "Nothing runs; the incident stays open.",
          good: approved ? plan.quality === "correct" : plan.quality !== "correct",
        },
      ];
      if (!approved) {
        return finish(
          {
            ...state,
            approval: "rejected",
            status: "REJECTED",
            decisions,
            log: [...state.log, { kind: "pm", label: "HUMAN_REJECTED", detail: "decided_by=visitor (simulation)" }],
          },
          s,
        );
      }
      const risk = state.policy[state.policy.length - 1].assessment.riskLevel;
      return execute(
        { ...state, approval: "approved", decisions, log: [...state.log, { kind: "pm", label: "HUMAN_APPROVED", detail: "decided_by=visitor (simulation)" }] },
        s,
        plan,
        risk,
      );
    }

    case "validate": {
      if (state.phase !== "validate" || !state.planId) return state;
      const plan = s.plans.find((p) => p.id === state.planId)!;
      const ids = Array.from(new Set<CheckId>([REQUIRED_CHECK, ...action.checks]));
      const evaluate = (id: CheckId): CheckResult => {
        const c = getCheck(id);
        return { id, passed: c.test(state.metrics), value: c.describe(state.metrics) };
      };
      const checks = CHECKS.filter((c) => ids.includes(c.id)).map((c) => evaluate(c.id));
      const missed = CHECKS.filter((c) => !ids.includes(c.id)).map((c) => evaluate(c.id)).filter((r) => !r.passed);
      const passed = checks.every((c) => c.passed);
      const detail = checks.map((c) => `${c.id}=${c.passed}`).join(", ");
      let next: SimState = {
        ...state,
        validation: { checks, passed, missed },
        decisions: [
          ...state.decisions,
          {
            step: "validation",
            choice: `${checks.length} check(s): ${checks.map((c) => c.id).join(", ")}`,
            note: passed ? (missed.length ? "Passed, but a failing check was not run." : "All checks passed.") : "A check failed, so the repair was rolled back.",
            good: passed ? missed.length === 0 : true,
          },
        ],
        log: [...state.log, { kind: "pm", label: "VALIDATION_STARTED" }, { kind: "tool", label: "validate_pipeline_health", detail }],
      };
      if (passed) {
        next.log.push({ kind: "pm", label: "VALIDATION_PASSED" }, { kind: "pm", label: "INCIDENT_RESOLVED" });
        next.status = "RESOLVED";
        if (missed.length) {
          next.falseAllClear = true;
          next.log.push({
            kind: "sim",
            label: "Incident reopened",
            detail: `Unchecked problem surfaced later: ${missed.map((m) => `${m.id} (${m.value})`).join(", ")}.`,
          });
        }
      } else {
        next.log.push({ kind: "pm", label: "VALIDATION_FAILED", detail });
        next = rollback(next, s, plan);
        next.log.push({ kind: "pm", label: "INCIDENT_ROLLED_BACK" });
      }
      return finish(next, s);
    }
  }
}

/** Convenience for tests and the summary: the plan currently or last chosen. */
export const currentPlan = (state: SimState) => {
  const id = state.planId ?? state.policy[state.policy.length - 1]?.planId;
  return id ? getScenario(state.scenarioId).plans.find((p) => p.id === id) ?? null : null;
};
