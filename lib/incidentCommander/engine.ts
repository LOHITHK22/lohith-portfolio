// A deterministic, pure state machine for the Incident Commander simulation. It follows the flow of
// PipelineMedic's agents/graph.py: diagnose → plan → calculate_risk → BLOCKED | AUTO_EXECUTE |
// APPROVAL_REQUIRED → execute → canary (MEDIUM/HIGH) → validate → resolve | rollback.
// Two deliberate differences, both labelled in the UI:
//  - A plan can pause for an out-of-band human repair (PipelineMedic's request_human_approval only
//    records an escalation; a person does the repair outside the system).
//  - After a failed repair the simulator reports what was actually undone. graph.py marks every
//    failed validation ROLLED_BACK, even when no action had a rollback tool.
// The same decisions always produce the same result. Nothing here performs I/O.

import { assessRisk, type RiskAssessment, type RiskLevel } from "./policy";
import {
  getScenario,
  LAG_WARNING_THRESHOLD,
  type Metrics,
  type PlanAction,
  type RepairPlanOption,
  type Scenario,
  type ScenarioId,
  type ToolCall,
} from "./scenarios";

export type Phase = "investigate" | "plan" | "approval" | "human" | "validate" | "done";

/** IncidentStatus values from PipelineMedic's db/models.py used here. */
export type PipelineMedicStatus =
  | "DETECTED"
  | "DIAGNOSING"
  | "PLAN_READY"
  | "AWAITING_APPROVAL"
  | "EXECUTING"
  | "VALIDATING"
  | "RESOLVED"
  | "ROLLED_BACK"
  | "REJECTED"
  | "FAILED";
/** Statuses that exist only in this simulator, to describe states PipelineMedic doesn't model. */
export const SIMULATOR_STATUSES = ["AWAITING_HUMAN_REPAIR", "ESCALATED", "PARTIALLY_ROLLED_BACK", "REOPENED"] as const;
export type SimulatorStatus = (typeof SIMULATOR_STATUSES)[number];
export type IncidentStatus = PipelineMedicStatus | SimulatorStatus;
export const isSimulatorStatus = (s: IncidentStatus) => (SIMULATOR_STATUSES as readonly string[]).includes(s);

export type Outcome = "recovered" | "degraded" | "worsened";

/** How the incident ended. Each one maps to exactly one final status. */
export type Resolution =
  | "recovered" // validation passed and nothing failing was left unchecked
  | "false_all_clear" // validation passed only because a failing check was not run; reopened
  | "rolled_back" // repair failed; every executed action was undone
  | "partial_rollback" // repair failed; some actions undone, others remain in effect
  | "failed_no_rollback" // repair failed; nothing executed could be undone
  | "rejected" // the visitor rejected the plan; nothing ran
  | "escalated_unresolved"; // escalation recorded, but the human repair was not confirmed

export const RESOLUTION_STATUS: Record<Resolution, IncidentStatus> = {
  recovered: "RESOLVED",
  false_all_clear: "REOPENED",
  rolled_back: "ROLLED_BACK",
  partial_rollback: "PARTIALLY_ROLLED_BACK",
  failed_no_rollback: "FAILED",
  rejected: "REJECTED",
  escalated_unresolved: "ESCALATED",
};

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

export type DecisionStep = "evidence" | "diagnosis" | "plan" | "policy" | "approval" | "human" | "validation";
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

/** What happened to each executed action after a failed repair. */
export type RollbackReport = {
  reverted: { tool: string; rollbackTool: string }[];
  remaining: { tool: string; reason: "not_reversible" | "no_rollback_tool" }[];
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
  /** Indexes of plan actions that actually ran. */
  executed: number[];
  humanRepair: "pending" | "confirmed" | "withheld" | null;
  canary: { ran: boolean; passed: boolean; lag: number } | null;
  validation: { checks: CheckResult[]; passed: boolean; missed: CheckResult[] } | null;
  rollback: RollbackReport | null;
  resolution: Resolution | null;
  outcome: Outcome | null;
  decisions: Decision[];
  log: LogEntry[];
};

export type SimAction =
  | { type: "evidence"; id: string }
  | { type: "diagnose"; hypothesisId: string }
  | { type: "plan"; planId: string }
  | { type: "approve" }
  | { type: "reject" }
  | { type: "confirmRepair" }
  | { type: "withholdRepair" }
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
    executed: [],
    humanRepair: null,
    canary: null,
    validation: null,
    rollback: null,
    resolution: null,
    outcome: null,
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

/**
 * Classifies executed actions after a failure, newest first (graph.py rolls back in reverse order).
 * Only an action with a rollback tool is undone; is_reversible alone undoes nothing.
 */
export function classifyRollback(actions: PlanAction[]): { report: RollbackReport; resolution: Resolution } {
  const report: RollbackReport = { reverted: [], remaining: [] };
  for (const a of [...actions].reverse()) {
    if (a.rollback) report.reverted.push({ tool: a.tool, rollbackTool: a.rollback.tool });
    else report.remaining.push({ tool: a.tool, reason: a.reversible ? "no_rollback_tool" : "not_reversible" });
  }
  const resolution: Resolution = !report.remaining.length ? "rolled_back" : report.reverted.length ? "partial_rollback" : "failed_no_rollback";
  return { report, resolution };
}

function rollback(state: SimState, s: Scenario, plan: RepairPlanOption): SimState {
  const executed = state.executed.map((i) => plan.actions[i]);
  const { report, resolution } = classifyRollback(executed);
  const log = [...state.log];
  for (const a of [...executed].reverse()) {
    if (a.rollback) log.push({ kind: "tool", label: a.rollback.tool, detail: `${fmtInput(a.rollback)} (rollback of ${a.tool})` });
  }
  for (const r of report.remaining) {
    log.push({
      kind: "sim",
      label: "Still in effect",
      detail: r.reason === "not_reversible" ? `${r.tool} cannot be rolled back.` : `${r.tool} has no rollback tool, so it stays applied.`,
    });
  }
  // Fully undone: back to where the incident started. Otherwise whatever remains stays in effect.
  const metrics = resolution === "rolled_back" ? { ...s.initial } : plan.afterRollback ?? { ...state.metrics };
  return { ...state, log, rollback: report, metrics, resolution, status: RESOLUTION_STATUS[resolution] };
}

function finish(state: SimState, s: Scenario, resolution: Resolution): SimState {
  let outcome: Outcome;
  switch (resolution) {
    case "recovered":
      outcome = "recovered";
      break;
    case "false_all_clear":
      outcome = "worsened";
      break;
    case "rolled_back":
    case "rejected":
    case "escalated_unresolved":
      outcome = "degraded";
      break;
    case "partial_rollback":
    case "failed_no_rollback":
      outcome = healthScore(state.metrics) > healthScore(s.initial) + 0.01 ? "worsened" : "degraded";
      break;
  }
  return { ...state, phase: "done", resolution, status: RESOLUTION_STATUS[resolution], outcome };
}

/** Runs plan actions [from, to) and logs each simulated tool call. */
function runActions(state: SimState, plan: RepairPlanOption, from: number, to: number): SimState {
  const log = [...state.log];
  const executed = [...state.executed];
  for (let i = from; i < to; i++) {
    const a = plan.actions[i];
    log.push({ kind: "tool", label: a.tool, detail: `${fmtInput(a)}${a.output ? ` → ${JSON.stringify(a.output)}` : ""}` });
    executed.push(i);
  }
  return { ...state, log, executed };
}

/** After every action has run: canary for MEDIUM/HIGH, then the validation step. Mirrors _execute_and_validate. */
function afterActions(state: SimState, s: Scenario, plan: RepairPlanOption): SimState {
  const risk = state.policy[state.policy.length - 1].assessment.riskLevel;
  let next: SimState = { ...state, metrics: { ...plan.after! }, log: [...state.log] };
  if (needsCanary(risk)) {
    const lag = next.metrics.lag;
    const passed = lag < LAG_WARNING_THRESHOLD;
    next.log.push(
      { kind: "pm", label: "CANARY_STARTED", detail: `risk_level=${risk}; single-instance validation gate` },
      { kind: "tool", label: "validate_pipeline_health", detail: `canary: consumer_lag_ok=${passed}, measured_lag=${lag}` },
    );
    next.canary = { ran: true, passed, lag };
    if (!passed) {
      next.log.push({ kind: "pm", label: "CANARY_VALIDATION_FAILED", detail: `measured_lag=${lag} ≥ ${LAG_WARNING_THRESHOLD}` });
      next = rollback(next, s, plan);
      next.log.push(rollbackEndEntry(next.resolution!));
      return finish(next, s, next.resolution!);
    }
    next.log.push({ kind: "pm", label: "CANARY_VALIDATION_PASSED" }, { kind: "pm", label: "CANARY_EXPANDED", detail: "expanded_scope=full" });
  } else {
    next.canary = { ran: false, passed: true, lag: next.metrics.lag };
  }
  next.log.push({ kind: "pm", label: "REPAIR_COMPLETED" });
  return { ...next, status: "VALIDATING", phase: "validate" };
}

/** graph.py logs INCIDENT_ROLLED_BACK for every failed validation; the simulator adds what that really meant. */
function rollbackEndEntry(resolution: Resolution): LogEntry {
  const detail =
    resolution === "rolled_back"
      ? "every executed action was undone"
      : resolution === "partial_rollback"
        ? "partial: some actions remain in effect (simulator status PARTIALLY_ROLLED_BACK)"
        : "nothing could be undone (simulator status FAILED)";
  return { kind: "pm", label: "INCIDENT_ROLLED_BACK", detail };
}

/** REPAIR_STARTED, then actions up to an out-of-band human step (pause) or to the end. */
function execute(state: SimState, s: Scenario, plan: RepairPlanOption): SimState {
  let next: SimState = { ...state, status: "EXECUTING", log: [...state.log, { kind: "pm", label: "REPAIR_STARTED", detail: plan.summary }] };
  const pauseAfter = plan.humanRepair?.afterAction;
  if (pauseAfter !== undefined) {
    next = runActions(next, plan, 0, pauseAfter + 1);
    next.log.push({
      kind: "sim",
      label: "Paused for human repair",
      detail: `Waiting for the ${plan.humanRepair!.owner} to do this outside PipelineMedic: ${plan.humanRepair!.task}`,
    });
    return { ...next, phase: "human", status: "AWAITING_HUMAN_REPAIR", humanRepair: "pending" };
  }
  next = runActions(next, plan, 0, plan.actions.length);
  return afterActions(next, s, plan);
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
        return execute({ ...base, log: [...state.log, { kind: "sim", label: "Policy: AUTO_EXECUTE", detail: assessment.rationale }] }, s, plan);
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
            decisions,
            log: [...state.log, { kind: "pm", label: "HUMAN_REJECTED", detail: "decided_by=visitor (simulation)" }],
          },
          s,
          "rejected",
        );
      }
      return execute(
        { ...state, approval: "approved", decisions, log: [...state.log, { kind: "pm", label: "HUMAN_APPROVED", detail: "decided_by=visitor (simulation)" }] },
        s,
        plan,
      );
    }

    case "confirmRepair":
    case "withholdRepair": {
      if (state.phase !== "human" || !state.planId) return state;
      const plan = s.plans.find((p) => p.id === state.planId)!;
      const hr = plan.humanRepair!;
      if (action.type === "withholdRepair") {
        return finish(
          {
            ...state,
            humanRepair: "withheld",
            decisions: [
              ...state.decisions,
              { step: "human", choice: "Repair not confirmed", note: "The escalation is on record, but the column was never restored, so the rerun never ran.", good: false },
            ],
            log: [
              ...state.log,
              { kind: "sim", label: "Human repair not confirmed", detail: `The ${hr.owner} has not completed: ${hr.task} The rerun is not attempted.` },
            ],
          },
          s,
          "escalated_unresolved",
        );
      }
      let next: SimState = {
        ...state,
        humanRepair: "confirmed",
        metrics: { ...hr.repaired },
        decisions: [
          ...state.decisions,
          { step: "human", choice: "Repair confirmed (simulated)", note: `The ${hr.owner} reported the fix done, so the remaining actions run.`, good: true },
        ],
        log: [
          ...state.log,
          {
            kind: "sim",
            label: "Human repair confirmed",
            detail: `Simulated ${hr.owner} reports done: ${hr.task} A simulated confirmation, not an external authorization.`,
          },
        ],
      };
      next = runActions(next, plan, hr.afterAction + 1, plan.actions.length);
      return afterActions({ ...next, status: "EXECUTING" }, s, plan);
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
            note: passed ? (missed.length ? "Passed, but a failing check was not run." : "All checks passed.") : "A check failed, so the repair was rolled back where possible.",
            good: passed ? missed.length === 0 : true,
          },
        ],
        log: [...state.log, { kind: "pm", label: "VALIDATION_STARTED" }, { kind: "tool", label: "validate_pipeline_health", detail }],
      };
      if (passed) {
        next.log.push({ kind: "pm", label: "VALIDATION_PASSED" }, { kind: "pm", label: "INCIDENT_RESOLVED" });
        if (!missed.length) return finish(next, s, "recovered");
        next.log.push({
          kind: "sim",
          label: "Incident reopened",
          detail: `Unchecked problem surfaced later: ${missed.map((m) => `${m.id} (${m.value})`).join(", ")}. Simulator status REOPENED.`,
        });
        return finish(next, s, "false_all_clear");
      }
      next.log.push({ kind: "pm", label: "VALIDATION_FAILED", detail });
      next = rollback(next, s, plan);
      next.log.push(rollbackEndEntry(next.resolution!));
      return finish(next, s, next.resolution!);
    }
  }
}
