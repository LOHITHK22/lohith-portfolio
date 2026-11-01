import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  assessRisk,
  AUTONOMY_BY_RISK,
  getToolRisk,
  HARD_BLOCKED_TOOLS,
  isHardBlocked,
  PIPELINEMEDIC_COMMIT,
  sourceUrl,
  TOOL_RISK,
} from "../../lib/incidentCommander/policy";
import {
  airflowFailureSeverity,
  kafkaLagSeverity,
  poisonBatchSeverity,
  SCENARIOS,
  getScenario,
  type ScenarioId,
} from "../../lib/incidentCommander/scenarios";
import {
  CHECKS,
  classifyRollback,
  initialState,
  isSimulatorStatus,
  plansFor,
  reducer,
  RESOLUTION_STATUS,
  type CheckId,
  type Resolution,
  type SimAction,
  type SimState,
} from "../../lib/incidentCommander/engine";

// Engine-level tests for the Incident Commander: the policy port against PipelineMedic's real
// autonomy_policy.yaml, the detector severity rules, and every scenario path. No browser needed.

const YAML_PATH = path.join(__dirname, "../../data/pipelinemedic/autonomy_policy.yaml");
// sha256 of backend/app/policies/autonomy_policy.yaml at PIPELINEMEDIC_COMMIT, LF line endings.
const YAML_SHA256 = "5c57d4e40ad2496ecad7caed07bda68e83a22edcc6735ed407eb5fafbbeeb0bd";

/** A minimal parser for the three top-level sections of autonomy_policy.yaml. */
function parsePolicyYaml(text: string) {
  const out: { tool_risk: Record<string, string>; autonomy_by_risk: Record<string, string>; hard_blocked_tools: string[] } = {
    tool_risk: {},
    autonomy_by_risk: {},
    hard_blocked_tools: [],
  };
  let section: keyof typeof out | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) continue;
    const top = line.match(/^(\w+):\s*$/);
    if (top) {
      section = top[1] as keyof typeof out;
      continue;
    }
    if (section === "hard_blocked_tools") {
      const m = line.match(/^\s+-\s+(\w+)$/);
      if (m) out.hard_blocked_tools.push(m[1]);
    } else if (section) {
      const m = line.match(/^\s+(\w+):\s+(\w+)$/);
      if (m) (out[section] as Record<string, string>)[m[1]] = m[2];
    }
  }
  return out;
}

type Path = {
  evidence?: "none" | "key" | "all";
  hypothesis?: "correct" | string;
  plan: string;
  approve?: boolean;
  /** For a plan that pauses for an out-of-band human repair. Defaults to confirm. */
  human?: "confirm" | "withhold";
  checks?: "all" | "lag" | CheckId[];
};

const ALL_CHECKS = CHECKS.map((c) => c.id);

function play(id: ScenarioId, p: Path): SimState {
  const s = getScenario(id);
  const actions: SimAction[] = [];
  const ev = p.evidence ?? "key";
  for (const e of s.evidence) if (ev === "all" || (ev === "key" && e.key)) actions.push({ type: "evidence", id: e.id });
  const hyp = !p.hypothesis || p.hypothesis === "correct" ? s.hypotheses.find((h) => h.correct)!.id : p.hypothesis;
  actions.push({ type: "diagnose", hypothesisId: hyp }, { type: "plan", planId: p.plan });
  let state = actions.reduce(reducer, initialState(id));
  if (state.phase === "approval") state = reducer(state, { type: p.approve === false ? "reject" : "approve" });
  if (state.phase === "human") state = reducer(state, { type: p.human === "withhold" ? "withholdRepair" : "confirmRepair" });
  if (state.phase === "validate") {
    const checks = p.checks === "lag" ? [] : p.checks === "all" || !p.checks ? ALL_CHECKS : p.checks;
    state = reducer(state, { type: "validate", checks });
  }
  return state;
}

const events = (s: SimState) => s.log.filter((e) => e.kind === "pm").map((e) => e.label);
const tools = (s: SimState) => s.log.filter((e) => e.kind === "tool").map((e) => e.label);
const correctPlan = (id: ScenarioId) => getScenario(id).plans.find((p) => p.quality === "correct")!;

test.describe("Policy port matches PipelineMedic", () => {
  test("the vendored autonomy_policy.yaml is byte-identical to the pinned commit", () => {
    const text = readFileSync(YAML_PATH, "utf8").replace(/\r\n/g, "\n");
    expect(createHash("sha256").update(text).digest("hex")).toBe(YAML_SHA256);
    expect(PIPELINEMEDIC_COMMIT).toMatch(/^[0-9a-f]{40}$/);
    expect(sourceUrl("backend/app/policies/engine.py")).toBe(
      `https://github.com/LOHITHK22/PipelineMedic-AI/blob/${PIPELINEMEDIC_COMMIT}/backend/app/policies/engine.py`,
    );
  });

  test("tool risks, autonomy table and hard blocks equal the YAML", () => {
    const yaml = parsePolicyYaml(readFileSync(YAML_PATH, "utf8").replace(/\r\n/g, "\n"));
    expect(Object.keys(yaml.tool_risk)).toHaveLength(22);
    expect(TOOL_RISK).toEqual(yaml.tool_risk);
    expect(AUTONOMY_BY_RISK).toEqual(yaml.autonomy_by_risk);
    expect(HARD_BLOCKED_TOOLS).toEqual(yaml.hard_blocked_tools);
    for (const t of HARD_BLOCKED_TOOLS) expect(TOOL_RISK[t]).toBe("CRITICAL");
  });

  test("assessRisk reproduces engine.py: max(tool risk, severity floor), hard blocks force CRITICAL", () => {
    expect(assessRisk(["get_kafka_consumer_lag"], "LOW")).toMatchObject({ riskLevel: "LOW", decision: "AUTO_EXECUTE", blockedActions: [] });
    // A LOW tool still needs approval when the severity floor lifts it.
    expect(assessRisk(["quarantine_message"], "HIGH")).toMatchObject({ maxToolRisk: "LOW", severityFloor: "MEDIUM", riskLevel: "MEDIUM", decision: "APPROVAL_REQUIRED" });
    expect(assessRisk(["change_flink_parallelism"], "CRITICAL")).toMatchObject({ riskLevel: "HIGH", decision: "APPROVAL_REQUIRED" });
    expect(assessRisk(["quarantine_message"], "MEDIUM").riskLevel).toBe("MEDIUM");
    // Tools missing from the policy default to HIGH.
    expect(getToolRisk("some_new_tool")).toBe("HIGH");
    expect(assessRisk(["some_new_tool"], "LOW")).toMatchObject({ riskLevel: "HIGH", decision: "APPROVAL_REQUIRED" });
    // Hard-blocked, even next to a LOW tool and at LOW severity.
    const blocked = assessRisk(["quarantine_message", "truncate_topic"], "LOW");
    expect(blocked).toMatchObject({ riskLevel: "CRITICAL", decision: "BLOCKED", blockedActions: ["truncate_topic"] });
    expect(blocked.rationale).toBe("max tool risk=CRITICAL, severity floor=LOW (from incident severity LOW) => overall=CRITICAL. HARD-BLOCKED actions present: ['truncate_topic'].");
    expect(assessRisk(["quarantine_message"], "HIGH").rationale).toBe("max tool risk=LOW, severity floor=MEDIUM (from incident severity HIGH) => overall=MEDIUM.");
    for (const t of HARD_BLOCKED_TOOLS) expect(assessRisk([t], "MEDIUM").decision).toBe("BLOCKED");
    expect(assessRisk([], "HIGH")).toMatchObject({ maxToolRisk: "LOW", riskLevel: "MEDIUM" });
  });

  test("detector severity rules match PipelineMedic's thresholds", () => {
    expect(kafkaLagSeverity(499)).toBeNull();
    expect(kafkaLagSeverity(500)).toBe("HIGH");
    expect(kafkaLagSeverity(4999)).toBe("HIGH");
    expect(kafkaLagSeverity(5000)).toBe("CRITICAL");
    expect(airflowFailureSeverity("failed", 1)).toBe("MEDIUM");
    expect(airflowFailureSeverity("failed", 2)).toBe("HIGH");
    expect(airflowFailureSeverity("upstream_failed", 3)).toBe("HIGH");
    expect(airflowFailureSeverity("success", 2)).toBeNull();
    expect(poisonBatchSeverity(0)).toBeNull();
    expect(poisonBatchSeverity(5)).toBe("MEDIUM");
    expect(poisonBatchSeverity(6)).toBe("HIGH");
    expect(SCENARIOS.map((s) => [s.id, s.severity])).toEqual([
      ["schema-drift", "HIGH"],
      ["poison-messages", "HIGH"],
      ["consumer-lag", "CRITICAL"],
      ["airflow-failure", "HIGH"],
    ]);
  });
});

test.describe("Scenario definitions", () => {
  test("cover Kafka, Flink, PostgreSQL and Airflow and use only real PipelineMedic tools", () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(["schema-drift", "poison-messages", "consumer-lag", "airflow-failure"]);
    const components = new Set<string>(SCENARIOS.flatMap((s) => [s.component, ...(s.initial.postgres !== "healthy" ? ["PostgreSQL"] : [])]));
    for (const c of ["Kafka", "Flink", "Airflow", "PostgreSQL"]) expect(components.has(c), c).toBe(true);
    for (const s of SCENARIOS) {
      for (const e of s.evidence) {
        expect(TOOL_RISK[e.tool], `${s.id} evidence ${e.tool}`).toBe("LOW");
      }
      for (const p of s.plans) {
        for (const a of p.actions) {
          expect(TOOL_RISK[a.tool], `${s.id}/${p.id} ${a.tool}`).toBeDefined();
          if (a.rollback) expect(TOOL_RISK[a.rollback.tool], `${s.id}/${p.id} rollback`).toBeDefined();
        }
      }
    }
  });

  test("each scenario has one correct root cause, key evidence, one correct plan, and forbidden plans that really are blocked", () => {
    for (const s of SCENARIOS) {
      expect(s.hypotheses.filter((h) => h.correct), s.id).toHaveLength(1);
      expect(s.evidence.some((e) => e.key), s.id).toBe(true);
      const correctHyp = s.hypotheses.find((h) => h.correct)!.id;
      const correct = s.plans.filter((p) => p.quality === "correct");
      expect(correct, s.id).toHaveLength(1);
      expect(correct[0].forHypotheses).toEqual([correctHyp]);
      for (const h of s.hypotheses) {
        const offered = plansFor(s, h.id);
        expect(offered.length, `${s.id}/${h.id}`).toBeGreaterThanOrEqual(2);
        expect(offered.some((p) => p.quality === "forbidden"), `${s.id}/${h.id} offers a forbidden plan`).toBe(true);
      }
      for (const p of s.plans) {
        const hasBlocked = p.actions.some((a) => isHardBlocked(a.tool));
        expect(hasBlocked, `${s.id}/${p.id}`).toBe(p.quality === "forbidden");
        if (p.quality !== "forbidden") expect(p.after, `${s.id}/${p.id} has an effect`).toBeDefined();
      }
    }
  });
});

test.describe("Scenario engine", () => {
  for (const s of SCENARIOS) {
    test(`${s.name}: the correct path recovers through approval, canary and validation`, () => {
      const state = play(s.id, { plan: correctPlan(s.id).id });
      expect(state.status).toBe("RESOLVED");
      expect(state.resolution).toBe("recovered");
      expect(state.outcome).toBe("recovered");
      expect(state.rollback).toBeNull();
      expect(state.executed).toEqual(correctPlan(s.id).actions.map((_, i) => i));
      expect(state.validation!.passed).toBe(true);
      expect(state.validation!.checks).toHaveLength(CHECKS.length);
      expect(state.diagnosis!.confidence).toBe(0.93);
      // Policy: every scenario's severity floor is at least MEDIUM, so a human approves and a canary runs.
      expect(state.policy).toHaveLength(1);
      expect(state.policy[0].assessment.decision).toBe("APPROVAL_REQUIRED");
      expect(events(state)).toEqual([
        "INCIDENT_DETECTED",
        "CONTEXT_COLLECTED",
        "DIAGNOSIS_CREATED",
        "REPAIR_PLAN_CREATED",
        "APPROVAL_REQUESTED",
        "HUMAN_APPROVED",
        "REPAIR_STARTED",
        "CANARY_STARTED",
        "CANARY_VALIDATION_PASSED",
        "CANARY_EXPANDED",
        "REPAIR_COMPLETED",
        "VALIDATION_STARTED",
        "VALIDATION_PASSED",
        "INCIDENT_RESOLVED",
      ]);
      expect(tools(state)).toEqual(expect.arrayContaining(correctPlan(s.id).actions.map((a) => a.tool)));
    });

    test(`${s.name}: every forbidden plan is hard-blocked, nothing executes, and a safer plan can follow`, () => {
      const forbidden = s.plans.filter((p) => p.quality === "forbidden");
      expect(forbidden.length).toBeGreaterThan(0);
      for (const p of forbidden) {
        const hyp = p.forHypotheses[0];
        let state = [{ type: "diagnose", hypothesisId: hyp } as SimAction, { type: "plan", planId: p.id } as SimAction].reduce(reducer, initialState(s.id));
        expect(state.phase, p.id).toBe("plan");
        expect(state.blocked!.assessment).toMatchObject({ decision: "BLOCKED", riskLevel: "CRITICAL" });
        expect(state.blocked!.assessment.rationale).toContain("HARD-BLOCKED actions present");
        expect(events(state)).toContain("INCIDENT_BLOCKED");
        expect(events(state)).not.toContain("REPAIR_STARTED");
        expect(tools(state)).not.toContain(p.actions[0].tool);
        expect(state.metrics).toEqual(s.initial);
        // Choose another plan offered for the same diagnosis.
        const alt = plansFor(s, hyp).find((x) => x.quality !== "forbidden")!;
        state = reducer(state, { type: "plan", planId: alt.id });
        expect(state.phase).toBe("approval");
        expect(state.blocked).toBeNull();
        expect(state.policy.map((r) => r.assessment.decision)).toEqual(["BLOCKED", "APPROVAL_REQUIRED"]);
      }
    });

    test(`${s.name}: rejecting the approval runs nothing and leaves the incident open`, () => {
      const state = play(s.id, { plan: correctPlan(s.id).id, approve: false });
      expect(state.status).toBe("REJECTED");
      expect(state.resolution).toBe("rejected");
      expect(state.outcome).toBe("degraded");
      expect(state.metrics).toEqual(s.initial);
      expect(state.executed).toEqual([]);
      expect(tools(state)).not.toContain("request_human_approval");
      expect(events(state).slice(-2)).toEqual(["APPROVAL_REQUESTED", "HUMAN_REJECTED"]);
    });

    test(`${s.name}: a wrong diagnosis never offers the correct plan`, () => {
      for (const h of s.hypotheses.filter((x) => !x.correct)) {
        expect(plansFor(s, h.id).some((p) => p.quality === "correct"), h.id).toBe(false);
      }
    });
  }

  // Every executable non-correct plan, with thorough and with lag-only validation. Each row says how the repair
  // ends, what was undone (rollback tools) and what stays in effect.
  type Row = {
    id: ScenarioId;
    plan: string;
    all: [Resolution, string];
    lagOnly: [Resolution, string];
    reverted: string[];
    remaining: string[];
    canaryFails?: boolean;
  };
  const WRONG: Row[] = [
    // quarantine_message is is_reversible in PipelineMedic but has no rollback tool, so nothing undoes it.
    { id: "schema-drift", plan: "quarantine-only", all: ["failed_no_rollback", "degraded"], lagOnly: ["false_all_clear", "worsened"], reverted: [], remaining: ["quarantine_message"] },
    { id: "schema-drift", plan: "scale-validator", all: ["rolled_back", "degraded"], lagOnly: ["false_all_clear", "worsened"], reverted: ["change_flink_parallelism"], remaining: [] },
    // The failed Flink restart: irreversible, nothing undone, and the pipeline is worse than before.
    { id: "poison-messages", plan: "restart", all: ["failed_no_rollback", "worsened"], lagOnly: ["failed_no_rollback", "worsened"], reverted: [], remaining: ["restart_flink_job"], canaryFails: true },
    { id: "poison-messages", plan: "patch-mapping", all: ["rolled_back", "degraded"], lagOnly: ["false_all_clear", "worsened"], reverted: ["rollback_change"], remaining: [] },
    { id: "consumer-lag", plan: "patch-parallelism", all: ["rolled_back", "degraded"], lagOnly: ["rolled_back", "degraded"], reverted: ["rollback_change"], remaining: [], canaryFails: true },
    { id: "consumer-lag", plan: "restart", all: ["failed_no_rollback", "worsened"], lagOnly: ["failed_no_rollback", "worsened"], reverted: [], remaining: ["restart_flink_job"], canaryFails: true },
    { id: "consumer-lag", plan: "quarantine", all: ["failed_no_rollback", "degraded"], lagOnly: ["failed_no_rollback", "degraded"], reverted: [], remaining: ["quarantine_message"], canaryFails: true },
    // The failed Airflow rerun: irreversible, the task is still failed, nothing could be undone.
    { id: "airflow-failure", plan: "rerun-only", all: ["failed_no_rollback", "degraded"], lagOnly: ["false_all_clear", "worsened"], reverted: [], remaining: ["rerun_airflow_task"] },
    { id: "airflow-failure", plan: "flink-mapping", all: ["rolled_back", "degraded"], lagOnly: ["false_all_clear", "worsened"], reverted: ["rollback_change"], remaining: [] },
  ];

  test("the wrong-plan table covers every executable non-correct plan", () => {
    const listed = WRONG.map((w) => `${w.id}/${w.plan}`).sort();
    const actual = SCENARIOS.flatMap((s) => s.plans.filter((p) => p.quality === "partial" || p.quality === "wrong").map((p) => `${s.id}/${p.id}`)).sort();
    expect(listed).toEqual(actual);
  });

  for (const w of WRONG) {
    test(`${w.id} / ${w.plan}: thorough validation ends ${w.all.join(" ")}; lag-only validation ends ${w.lagOnly.join(" ")}`, () => {
      const s = getScenario(w.id);
      const plan = s.plans.find((p) => p.id === w.plan)!;
      const hyp = plan.forHypotheses[0];
      const thorough = play(w.id, { hypothesis: hyp, plan: w.plan, checks: "all" });
      expect([thorough.resolution, thorough.outcome]).toEqual(w.all);
      expect(thorough.status).toBe(RESOLUTION_STATUS[w.all[0]]);
      expect(thorough.rollback!.reverted.map((r) => r.rollbackTool)).toEqual(w.reverted);
      expect(thorough.rollback!.remaining.map((r) => r.tool)).toEqual(w.remaining);
      // ROLLED_BACK only when everything executed was undone, and then the metrics are back at the start.
      if (thorough.status === "ROLLED_BACK") {
        expect(w.remaining).toEqual([]);
        expect(thorough.metrics).toEqual(s.initial);
      } else {
        expect(thorough.status).not.toBe("ROLLED_BACK");
      }
      for (const r of w.remaining) {
        expect(thorough.log.some((e) => e.label === "Still in effect" && e.detail!.startsWith(r)), r).toBe(true);
      }
      if (w.canaryFails) {
        // graph.py: a failed canary rolls back straight away and never starts full validation.
        const ev = events(thorough);
        expect(ev).toContain("CANARY_VALIDATION_FAILED");
        expect(ev).not.toContain("VALIDATION_STARTED");
        expect(ev.at(-1)).toBe("INCIDENT_ROLLED_BACK");
        expect(thorough.validation).toBeNull();
      } else {
        expect(events(thorough)).toEqual(expect.arrayContaining(["CANARY_VALIDATION_PASSED", "VALIDATION_FAILED", "INCIDENT_ROLLED_BACK"]));
      }
      // The INCIDENT_ROLLED_BACK event (graph.py's name) says what it really meant.
      const end = thorough.log.find((e) => e.label === "INCIDENT_ROLLED_BACK")!;
      expect(end.detail).toContain(w.all[0] === "rolled_back" ? "every executed action was undone" : "nothing could be undone");
      // Rollback tools run after the failure and before INCIDENT_ROLLED_BACK.
      const log = thorough.log.map((e) => e.label);
      for (const r of w.reverted) {
        const i = log.lastIndexOf(r);
        expect(i).toBeGreaterThan(log.indexOf(w.canaryFails ? "CANARY_VALIDATION_FAILED" : "VALIDATION_FAILED"));
        expect(i).toBeLessThan(log.indexOf("INCIDENT_ROLLED_BACK"));
      }

      const lagOnly = play(w.id, { hypothesis: hyp, plan: w.plan, checks: "lag" });
      expect([lagOnly.resolution, lagOnly.outcome]).toEqual(w.lagOnly);
      expect(lagOnly.status).toBe(RESOLUTION_STATUS[w.lagOnly[0]]);
      if (w.lagOnly[0] === "false_all_clear") {
        // The lag check alone passes; the problem it doesn't measure resurfaces and the incident reopens.
        expect(lagOnly.status).toBe("REOPENED");
        expect(lagOnly.rollback).toBeNull();
        expect(lagOnly.validation!.missed.length).toBeGreaterThan(0);
        expect(events(lagOnly).slice(-2)).toEqual(["VALIDATION_PASSED", "INCIDENT_RESOLVED"]);
        expect(lagOnly.log.at(-1)!.label).toBe("Incident reopened");
      }
    });
  }

  test("the failed Flink restart and failed Airflow rerun are reported as failed, not rolled back", () => {
    const restart = play("consumer-lag", { hypothesis: "stuck", plan: "restart" });
    expect(restart).toMatchObject({ status: "FAILED", resolution: "failed_no_rollback", outcome: "worsened" });
    expect(restart.rollback).toEqual({ reverted: [], remaining: [{ tool: "restart_flink_job", reason: "not_reversible" }] });
    expect(restart.metrics.lag).toBe(9100);
    const rerun = play("airflow-failure", { plan: "rerun-only", checks: ["airflow_task_success"] });
    expect(rerun).toMatchObject({ status: "FAILED", resolution: "failed_no_rollback", outcome: "degraded" });
    expect(rerun.rollback!.remaining).toEqual([{ tool: "rerun_airflow_task", reason: "not_reversible" }]);
    expect(rerun.metrics.airflow).toBe("failed");
  });

  test("classifyRollback distinguishes full, partial and impossible rollback", () => {
    const undoable = { tool: "apply_safe_config_patch", input: {}, description: "", reversible: true, rollback: { tool: "rollback_change", input: {} } };
    const noTool = { tool: "quarantine_message", input: {}, description: "", reversible: true };
    const irreversible = { tool: "restart_flink_job", input: {}, description: "", reversible: false };
    expect(classifyRollback([undoable]).resolution).toBe("rolled_back");
    const partial = classifyRollback([noTool, undoable]);
    expect(partial.resolution).toBe("partial_rollback");
    // Newest first, as graph.py rolls back in reverse.
    expect(partial.report).toEqual({
      reverted: [{ tool: "apply_safe_config_patch", rollbackTool: "rollback_change" }],
      remaining: [{ tool: "quarantine_message", reason: "no_rollback_tool" }],
    });
    expect(classifyRollback([irreversible, noTool]).resolution).toBe("failed_no_rollback");
    expect(classifyRollback([irreversible]).report.remaining).toEqual([{ tool: "restart_flink_job", reason: "not_reversible" }]);
  });

  test("every resolution maps to one status; simulator-only statuses are flagged", () => {
    expect(RESOLUTION_STATUS).toEqual({
      recovered: "RESOLVED",
      false_all_clear: "REOPENED",
      rolled_back: "ROLLED_BACK",
      partial_rollback: "PARTIALLY_ROLLED_BACK",
      failed_no_rollback: "FAILED",
      rejected: "REJECTED",
      escalated_unresolved: "ESCALATED",
    });
    for (const st of ["RESOLVED", "ROLLED_BACK", "FAILED", "REJECTED"] as const) expect(isSimulatorStatus(st), st).toBe(false);
    for (const st of ["REOPENED", "PARTIALLY_ROLLED_BACK", "ESCALATED", "AWAITING_HUMAN_REPAIR"] as const) expect(isSimulatorStatus(st), st).toBe(true);
  });

  test("the right validation check alone is enough to catch a bad repair", () => {
    expect(play("schema-drift", { plan: "quarantine-only", checks: ["dlq_rate_ok"] }).validation!.passed).toBe(false);
    expect(play("airflow-failure", { plan: "rerun-only", checks: ["airflow_task_success"] }).status).toBe("FAILED");
    // An irrelevant extra check still misses it.
    expect(play("airflow-failure", { plan: "rerun-only", checks: ["flink_job_running"] }).resolution).toBe("false_all_clear");
  });

  test("Airflow escalation: the rerun waits for a confirmed out-of-band human repair", () => {
    const pre = [
      { type: "evidence", id: "logs" },
      { type: "diagnose", hypothesisId: "column-renamed" },
      { type: "plan", planId: "escalate-then-rerun" },
    ] as SimAction[];
    let state = pre.reduce(reducer, initialState("airflow-failure"));
    // The policy evaluates the plan: LOW escalation + MEDIUM rerun at HIGH severity → MEDIUM → approval.
    expect(state.phase).toBe("approval");
    expect(state.policy[0].assessment).toMatchObject({ riskLevel: "MEDIUM", decision: "APPROVAL_REQUIRED" });
    state = reducer(state, { type: "approve" });

    // Only the escalation ran. It returns ESCALATION_NOTED and changes nothing; the pipeline is still broken.
    expect(state).toMatchObject({ phase: "human", status: "AWAITING_HUMAN_REPAIR", humanRepair: "pending", executed: [0] });
    expect(tools(state)).toEqual(["get_airflow_task_logs", "request_human_approval"]);
    expect(state.log.find((e) => e.label === "request_human_approval")!.detail).toContain('→ {"status":"ESCALATION_NOTED"}');
    expect(state.metrics).toEqual(getScenario("airflow-failure").initial);
    expect(state.log.at(-1)!.label).toBe("Paused for human repair");
    // Nothing else can happen while paused.
    expect(reducer(state, { type: "validate", checks: [] })).toBe(state);
    expect(reducer(state, { type: "approve" })).toBe(state);

    // Withholding: the escalation stays on record, the rerun never runs, nothing recovers.
    const withheld = reducer(state, { type: "withholdRepair" });
    expect(withheld).toMatchObject({ phase: "done", status: "ESCALATED", resolution: "escalated_unresolved", outcome: "degraded", executed: [0] });
    expect(tools(withheld)).not.toContain("rerun_airflow_task");
    expect(withheld.metrics.airflow).toBe("failed");
    expect(withheld.metrics.postgres).toBe("schema_mismatch");
    expect(withheld.validation).toBeNull();
    expect(events(withheld)).not.toContain("INCIDENT_RESOLVED");

    // Confirming: the column is restored first, then the rerun runs, then canary and validation decide.
    let confirmed = reducer(state, { type: "confirmRepair" });
    const labels = confirmed.log.map((e) => e.label);
    expect(labels.indexOf("Human repair confirmed")).toBeLessThan(labels.indexOf("rerun_airflow_task"));
    expect(labels.indexOf("rerun_airflow_task")).toBeLessThan(labels.indexOf("CANARY_STARTED"));
    expect(confirmed.log.find((e) => e.label === "Human repair confirmed")!.detail).toContain("not an external authorization");
    expect(confirmed).toMatchObject({ phase: "validate", humanRepair: "confirmed", executed: [0, 1] });
    confirmed = reducer(confirmed, { type: "validate", checks: ["airflow_task_success", "postgres_ok"] });
    expect(confirmed).toMatchObject({ status: "RESOLVED", resolution: "recovered", outcome: "recovered" });

    // The play() helper reaches the same results.
    expect(play("airflow-failure", { plan: "escalate-then-rerun", human: "withhold" }).resolution).toBe("escalated_unresolved");
    // Rejecting the escalation plan records nothing.
    const rejected = play("airflow-failure", { plan: "escalate-then-rerun", approve: false });
    expect(rejected).toMatchObject({ status: "REJECTED", executed: [] });
  });

  test("request_human_approval is described as recording an escalation, never as changing the schema", () => {
    const plan = getScenario("airflow-failure").plans.find((p) => p.id === "escalate-then-rerun")!;
    const escalation = plan.actions[0];
    expect(escalation.tool).toBe("request_human_approval");
    expect(escalation.output).toEqual({ status: "ESCALATION_NOTED" });
    expect(escalation.description).toMatch(/does not and cannot change the table/);
    expect(plan.humanRepair).toMatchObject({ afterAction: 0, owner: "database owner" });
    for (const text of [plan.summary, plan.lesson, plan.sourceNote!, ...plan.actions.map((a) => a.description)]) {
      expect(text).not.toMatch(/simulated: the owner restores it/);
    }
  });

  test("evidence changes the simulated diagnosis confidence", () => {
    const conf = (ev: Path["evidence"], hypothesis = "correct") => play("schema-drift", { evidence: ev, hypothesis, plan: "truncate-raw" }).diagnosis!;
    expect(conf("all").confidence).toBe(0.93);
    expect(conf("key").confidence).toBe(0.93);
    expect(conf("none").confidence).toBe(0.6);
    const partial = [{ type: "evidence", id: "compare" } as SimAction, { type: "diagnose", hypothesisId: "rename" } as SimAction].reduce(reducer, initialState("schema-drift"));
    expect(partial.diagnosis!.confidence).toBe(0.78);
    expect(conf("key", "poison")).toMatchObject({ confidence: 0.31, contradicted: true });
    expect(conf("none", "poison")).toMatchObject({ confidence: 0.52, contradicted: false });
  });

  test("is deterministic, ignores out-of-order actions, and restarts cleanly", () => {
    const a = play("consumer-lag", { plan: "scale-up" });
    const b = play("consumer-lag", { plan: "scale-up" });
    expect(a).toEqual(b);

    const start = initialState("consumer-lag");
    expect(reducer(start, { type: "approve" })).toBe(start);
    expect(reducer(start, { type: "validate", checks: [] })).toBe(start);
    expect(reducer(start, { type: "plan", planId: "scale-up" })).toBe(start);
    expect(reducer(start, { type: "evidence", id: "nope" })).toBe(start);
    const once = reducer(start, { type: "evidence", id: "lag" });
    expect(reducer(once, { type: "evidence", id: "lag" })).toBe(once);
    // A plan not offered for the chosen diagnosis is refused.
    const diagnosed = reducer(start, { type: "diagnose", hypothesisId: "stuck" });
    expect(reducer(diagnosed, { type: "plan", planId: "scale-up" })).toBe(diagnosed);

    expect(reducer(a, { type: "restart" })).toEqual(initialState("consumer-lag"));
    expect(reducer(a, { type: "load", scenarioId: "airflow-failure" })).toEqual(initialState("airflow-failure"));
  });

  test("the required lag check always runs, even when the visitor selects nothing", () => {
    const state = play("consumer-lag", { plan: "scale-up", checks: [] });
    expect(state.validation!.checks.map((c) => c.id)).toEqual(["consumer_lag_ok"]);
    expect(state.outcome).toBe("recovered");
  });
});
