// A TypeScript port of PipelineMedic's autonomy policy, used by the Incident Commander simulation.
// Source of truth: backend/app/policies/autonomy_policy.yaml and backend/app/policies/engine.py
// at PIPELINEMEDIC_COMMIT. data/pipelinemedic/autonomy_policy.yaml is a verbatim copy of the YAML,
// and tests check that this table matches it. Nothing here touches real infrastructure.

export const PIPELINEMEDIC_REPO = "https://github.com/LOHITHK22/PipelineMedic-AI";
export const PIPELINEMEDIC_COMMIT = "bff6d31c9986bbc22c99b5d56f4c9633f2825faf";
export const sourceUrl = (path: string) => `${PIPELINEMEDIC_REPO}/blob/${PIPELINEMEDIC_COMMIT}/${path}`;

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AutonomyDecision = "AUTO_EXECUTE" | "APPROVAL_REQUIRED" | "BLOCKED";

/** tool_risk from autonomy_policy.yaml. */
export const TOOL_RISK: Record<string, RiskLevel> = {
  get_kafka_consumer_lag: "LOW",
  get_topic_metadata: "LOW",
  get_recent_pipeline_errors: "LOW",
  get_flink_job_status: "LOW",
  get_airflow_dag_status: "LOW",
  get_airflow_task_logs: "LOW",
  get_database_schema: "LOW",
  get_schema_versions: "LOW",
  compare_schema_versions: "LOW",
  validate_pipeline_health: "LOW",
  quarantine_message: "LOW",
  request_human_approval: "LOW",
  rerun_airflow_task: "MEDIUM",
  restart_flink_job: "MEDIUM",
  change_flink_parallelism: "MEDIUM",
  apply_safe_config_patch: "MEDIUM",
  rollback_change: "MEDIUM",
  drop_database_table: "CRITICAL",
  truncate_topic: "CRITICAL",
  delete_dag: "CRITICAL",
  run_arbitrary_sql: "CRITICAL",
  run_shell_command: "CRITICAL",
};

/** autonomy_by_risk from autonomy_policy.yaml. */
export const AUTONOMY_BY_RISK: Record<RiskLevel, AutonomyDecision> = {
  LOW: "AUTO_EXECUTE",
  MEDIUM: "APPROVAL_REQUIRED",
  HIGH: "APPROVAL_REQUIRED",
  CRITICAL: "BLOCKED",
};

/** hard_blocked_tools from autonomy_policy.yaml (also enforced in code by tools/registry.py). */
export const HARD_BLOCKED_TOOLS = ["drop_database_table", "truncate_topic", "delete_dag", "run_arbitrary_sql", "run_shell_command"];

/** _SEVERITY_TO_RISK_FLOOR in policies/engine.py. */
export const SEVERITY_TO_RISK_FLOOR: Record<Severity, RiskLevel> = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "MEDIUM",
  CRITICAL: "HIGH",
};

const ORDER: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
const maxRisk = (levels: RiskLevel[]) => levels.reduce<RiskLevel>((a, b) => (ORDER[b] > ORDER[a] ? b : a), "LOW");

/** get_tool_risk: tools missing from the policy default to HIGH. */
export const getToolRisk = (tool: string): RiskLevel => TOOL_RISK[tool] ?? "HIGH";
export const isHardBlocked = (tool: string) => HARD_BLOCKED_TOOLS.includes(tool);

export type RiskAssessment = {
  maxToolRisk: RiskLevel;
  severityFloor: RiskLevel;
  riskLevel: RiskLevel;
  decision: AutonomyDecision;
  blockedActions: string[];
  rationale: string;
};

/** assess_risk in policies/engine.py: max(tool risks, severity floor); any hard-blocked tool forces CRITICAL / BLOCKED. */
export function assessRisk(tools: string[], severity: Severity): RiskAssessment {
  const blockedActions = tools.filter(isHardBlocked);
  const maxToolRisk = maxRisk(tools.map(getToolRisk));
  const severityFloor = SEVERITY_TO_RISK_FLOOR[severity];
  let riskLevel = maxRisk([maxToolRisk, severityFloor]);
  if (blockedActions.length) riskLevel = "CRITICAL";
  const decision: AutonomyDecision = blockedActions.length ? "BLOCKED" : AUTONOMY_BY_RISK[riskLevel];
  let rationale = `max tool risk=${maxToolRisk}, severity floor=${severityFloor} (from incident severity ${severity}) => overall=${riskLevel}.`;
  if (blockedActions.length) rationale += ` HARD-BLOCKED actions present: [${blockedActions.map((t) => `'${t}'`).join(", ")}].`;
  return { maxToolRisk, severityFloor, riskLevel, decision, blockedActions, rationale };
}
