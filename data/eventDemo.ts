// PipelineMedic AI "Recorded Architecture Walkthrough" for /event.
//
// Every tool name, field name, threshold, risk level, status string and
// lifecycle event below is taken from the PipelineMedic-AI repository
// (paths cited per item). The *values* (lag numbers, ids, timestamps) are a
// sanitized sample. Nothing here talks to live infrastructure.
//
// Note: the repo's live-stack verification covers schema drift, poison
// messages, and Airflow failures. The Kafka-lag path shown here runs on the
// same detector -> agent graph -> policy -> tools code (and its mock-LLM
// branch), but was not one of the live-injected scenarios. The demo panel
// and the architecture explorer both say so.

export const PM_REPO = "https://github.com/LOHITHK22/PipelineMedic-AI";
export const pmFile = (path: string) => `${PM_REPO}/blob/HEAD/${path}`;

export const DEMO_LABEL = "Recorded Architecture Walkthrough · Simulated Incident";

export type DemoStage = {
  id: string;
  step: string;
  label: string;
  actor: string;
  summary: string;
  /** Sample structured payload, shaped like the repo's Pydantic models. */
  payload: Record<string, unknown>;
  source: { label: string; path: string };
  tone: "info" | "warn" | "gate" | "ok";
};

export const demoStages: DemoStage[] = [
  {
    id: "detect",
    step: "01",
    label: "Detect",
    actor: "KafkaLagDetector",
    summary: "Total consumer lag 1,840 crosses the 500 warning threshold. Deterministic, no LLM involved.",
    payload: {
      incident_type: "KAFKA_LAG",
      severity: "HIGH",
      source_component: "kafka:orders.raw:pipelinemedic-backend",
      evidence: {
        topic: "orders.raw",
        group_id: "pipelinemedic-backend",
        lag_by_partition: { "0": 640, "1": 590, "2": 610 },
        total_lag: 1840,
        warning_threshold: 500,
        critical_threshold: 5000,
      },
    },
    source: { label: "detectors/kafka_lag.py", path: "backend/app/detectors/kafka_lag.py" },
    tone: "warn",
  },
  {
    id: "context",
    step: "02",
    label: "Context",
    actor: "context_collector",
    summary: "Reads recent dead-letter messages plus similar past incidents and correlated system events.",
    payload: {
      tool: "get_recent_pipeline_errors",
      input: { topic: "pipeline.dlq", limit: 10 },
      output: { topic: "pipeline.dlq", messages: [], error: null },
      event: "CONTEXT_COLLECTED",
    },
    source: { label: "agents/context_collector.py", path: "backend/app/agents/context_collector.py" },
    tone: "info",
  },
  {
    id: "diagnose",
    step: "03",
    label: "Diagnose",
    actor: "LLM provider (structured output)",
    summary: "The LLM returns a typed DiagnosisResult and RepairPlan. It proposes; it never executes.",
    payload: {
      root_cause:
        "Consumer group 'pipelinemedic-backend' is falling behind on 'orders.raw' (lag=1840), most likely due to reduced Flink task parallelism or a slow downstream sink.",
      confidence: 0.85,
      repair_plan: {
        summary: "Scale up Flink parallelism to drain backlog.",
        actions: [
          {
            tool_name: "change_flink_parallelism",
            tool_input: { job_name: "order-validator", parallelism: 4 },
            is_reversible: true,
            rollback_tool_name: "change_flink_parallelism",
            rollback_input: { job_name: "order-validator", parallelism: 2 },
          },
        ],
        estimated_risk_level: "MEDIUM",
      },
    },
    source: { label: "llm/mock_provider.py", path: "backend/app/llm/mock_provider.py" },
    tone: "info",
  },
  {
    id: "policy",
    step: "04",
    label: "Policy",
    actor: "Policy engine (autonomy_policy.yaml)",
    summary: "Deterministic risk scoring. The LLM's own risk estimate is never authoritative.",
    payload: {
      risk_level: "MEDIUM",
      rationale: "max tool risk=MEDIUM, severity floor=MEDIUM (from incident severity HIGH) => overall=MEDIUM.",
      autonomy_decision: "APPROVAL_REQUIRED",
      blocked_actions: [],
    },
    source: { label: "policies/engine.py", path: "backend/app/policies/engine.py" },
    tone: "gate",
  },
  {
    id: "approval",
    step: "05",
    label: "Approve",
    actor: "Human operator",
    summary: "The agent pauses. A person approves the persisted request before anything changes.",
    payload: {
      incident_status: "AWAITING_APPROVAL",
      event: "APPROVAL_REQUESTED",
      decision: "POST /incidents/{id}/approve",
      body: { decided_by: "on-call" },
      then: "HUMAN_APPROVED",
    },
    source: { label: "agents/graph.py", path: "backend/app/agents/graph.py" },
    tone: "gate",
  },
  {
    id: "mcp",
    step: "06",
    label: "MCP call",
    actor: "MCP server · PolicyGateway",
    summary: "With AGENT_TOOL_TRANSPORT=mcp, the call crosses the MCP gateway, which re-checks policy and consumes the single-use grant.",
    payload: {
      discovery: { method: "tools/list", listed: "17 tools (MCP_ALLOW_STATE_CHANGING_TOOLS=true; default lists 10 read-only)" },
      method: "tools/call",
      params: {
        name: "change_flink_parallelism",
        arguments: { job_name: "order-validator", parallelism: 4 },
        _meta: { "pipelinemedic/incident_id": "6f1c2a9e-4b7d-4e15-9a3c-2d8e5f0b7a41" },
      },
      gateway: {
        validation: "PASSED",
        approval: "APPROVED:incident_plan",
      },
      structuredContent: {
        job_name: "order-validator",
        parallelism: 4,
        status: "APPLIED_PENDING_REDEPLOY",
        note: "Parallelism recorded; requires job resubmission via flink/jobs deploy script to take effect.",
      },
    },
    source: { label: "mcp_server.py", path: "backend/app/mcp_server.py" },
    tone: "info",
  },
  {
    id: "validate",
    step: "07",
    label: "Validate",
    actor: "validate_pipeline_health",
    summary: "A canary re-measurement runs first, then full validation re-measures lag instead of trusting the repair's return code. Every step is in audit_log.",
    payload: {
      tool: "validate_pipeline_health",
      input: { topic: "orders.raw", group_id: "pipelinemedic-backend" },
      output: { healthy: true, checks: { consumer_lag_ok: true, measured_lag: 212, lag_error: null } },
      events: ["CANARY_STARTED", "CANARY_VALIDATION_PASSED", "CANARY_EXPANDED", "REPAIR_COMPLETED", "VALIDATION_PASSED", "INCIDENT_RESOLVED"],
      on_failure: ["CANARY_VALIDATION_FAILED", "rollback: change_flink_parallelism(parallelism=2)", "INCIDENT_ROLLED_BACK"],
      audit_log_row: { actor: "agent", action: "mcp_tool_call:change_flink_parallelism", details: { status: "SUCCESS", approval: "APPROVED:incident_plan" } },
    },
    source: { label: "tools/ops_tools.py", path: "backend/app/tools/ops_tools.py" },
    tone: "ok",
  },
];

// ---- Interactive architecture (after the presentation) ----

export type ArchNode = {
  id: string;
  label: string;
  group: "agent" | "control" | "mcp" | "infra" | "safety";
  what: string;
  input: Record<string, unknown> | string;
  output: Record<string, unknown> | string;
  boundary: string;
  why: string;
  testing: string;
  source: { label: string; path: string };
};

export const architectureNodes: ArchNode[] = [
  {
    id: "client",
    label: "User / Agent",
    group: "agent",
    what: "Either the PipelineMedic agent graph or an external MCP client (MCP Inspector was verified; Claude Desktop and Cursor configs are provided but unverified).",
    input: "Incident raised by the monitor, or a human using an MCP client",
    output: "Tool calls over JSON-RPC (stdio) or in-process registry calls",
    boundary: "External clients never pass through the agent graph, so the MCP server enforces authorization itself on every call.",
    why: "One set of typed tools serves both the autonomous agent and human-driven AI clients.",
    testing: "test_mcp_server.py: SDK client over in-process transport (mcp_protocol) and a real server subprocess (mcp_stdio).",
    source: { label: "agents/tool_transport.py", path: "backend/app/agents/tool_transport.py" },
  },
  {
    id: "detect",
    label: "Incident Detection",
    group: "control",
    what: "Deterministic detectors for schema drift, poison messages, Kafka consumer lag, Airflow task failures, Flink job failures, and data quality.",
    input: { topic: "orders.raw", group_id: "pipelinemedic-backend", lag_by_partition: { "0": 640, "1": 590, "2": 610 } },
    output: { incident_type: "KAFKA_LAG", severity: "HIGH", total_lag: 1840 },
    boundary: "Detection is never delegated to an LLM.",
    why: "Thresholds and schema checks are cheap, explainable, and testable. An LLM guessing at incidents would not be.",
    testing: "test_schema_drift.py, test_data_quality.py, test_incident_dedup.py.",
    source: { label: "detectors/", path: "backend/app/detectors/kafka_lag.py" },
  },
  {
    id: "context",
    label: "Context Collection",
    group: "control",
    what: "Gathers evidence through read-only tools, plus incident memory (similar past incidents) and event correlation (deployments, schema bumps).",
    input: { tool: "get_recent_pipeline_errors", topic: "pipeline.dlq", limit: 10 },
    output: { recent_errors: "...", similar_incidents: "...", correlated_events: "..." },
    boundary: "Read-only (LOW risk) tools only. Memory and correlation inform the diagnosis; they never override it.",
    why: "The LLM gets facts measured by tools rather than being asked to infer system state.",
    testing: "test_advanced_features.py covers event correlation against Postgres.",
    source: { label: "agents/context_collector.py", path: "backend/app/agents/context_collector.py" },
  },
  {
    id: "llm",
    label: "LLM Diagnosis",
    group: "agent",
    what: "Pluggable provider (mock / OpenAI / Azure OpenAI) returning structured DiagnosisResult and RepairPlan objects.",
    input: "Incident evidence + collected context",
    output: { tool_name: "change_flink_parallelism", tool_input: { job_name: "order-validator", parallelism: 4 }, estimated_risk_level: "MEDIUM" },
    boundary: "The plan is data. The LLM cannot execute anything, and its self-reported risk is only a sanity signal.",
    why: "Typed outputs remove regex parsing of free text and make every proposed action checkable.",
    testing: "test_mock_llm_structured_output.py. Only the mock provider is verified end to end; OpenAI/Azure need keys not used in verification.",
    source: { label: "llm/provider.py", path: "backend/app/llm/provider.py" },
  },
  {
    id: "policy",
    label: "Policy Gateway",
    group: "safety",
    what: "Loads autonomy_policy.yaml: LOW auto-executes, MEDIUM/HIGH need human approval, CRITICAL is blocked. Incident severity sets a risk floor.",
    input: { action: "change_flink_parallelism", tool_risk: "MEDIUM", incident_severity: "HIGH" },
    output: { risk_level: "MEDIUM", autonomy_decision: "APPROVAL_REQUIRED" },
    boundary: "Single choke point: no autonomy decision lives in scattered if-statements.",
    why: "Risk rules are reviewable config, and the same function governs the agent path and the MCP path.",
    testing: "test_policy_engine.py (6 tests).",
    source: { label: "policies/autonomy_policy.yaml", path: "backend/app/policies/autonomy_policy.yaml" },
  },
  {
    id: "mcp",
    label: "MCP Server",
    group: "mcp",
    what: "Official MCP Python SDK (mcp 2.3.0, MCPServer) over stdio. Pydantic input/output models become inputSchema/outputSchema.",
    input: { method: "tools/call", name: "change_flink_parallelism", arguments: { job_name: "order-validator", parallelism: 4 } },
    output: { status: "APPLIED_PENDING_REDEPLOY" },
    boundary:
      "Audit row opened first (no audit store means AUDIT_UNAVAILABLE, call refused) → hard-block → exposure and policy check (state-changing gate) → argument validation (unknown keys, identifier safety, Pydantic) → persisted approval → execute → audit row updated. Approvals are single-use, bound to the tool and a SHA-256 of the exact arguments, and expire.",
    why: "Any MCP-capable AI client can use the tools, but none can bypass the gateway. No MCP tool can approve anything.",
    testing: "63 MCP tests in test_mcp_server.py; verified with MCP Inspector 2.10.1 CLI including request → approve → execute → replay-rejected.",
    source: { label: "mcp_server.py", path: "backend/app/mcp_server.py" },
  },
  {
    id: "tools",
    label: "Typed Tools",
    group: "mcp",
    what: "17 executable tools (12 LOW, 5 MEDIUM) plus 5 destructive operations that are never registered.",
    input: "Validated Pydantic model",
    output: "Validated Pydantic model, redacted before it leaves the server",
    boundary: "By default the MCP server lists only the 10 read-only diagnostics. The 7 state-changing tools appear only with MCP_ALLOW_STATE_CHANGING_TOOLS=true.",
    why: "Typed, audited, permissioned execution instead of free-form shell or SQL.",
    testing: "test_tool_permissions.py; the server refuses to start if a hard-blocked tool is ever registered.",
    source: { label: "tools/registry.py", path: "backend/app/tools/registry.py" },
  },
  {
    id: "infra",
    label: "Kafka / Flink / Airflow / PostgreSQL",
    group: "infra",
    what: "Kafka (KRaft) topics orders.raw, orders.validated, pipeline.dlq; a PyFlink validator job; an Airflow data-quality DAG; Postgres for orders, incidents and audit.",
    input: "Tool calls (Kafka admin/consumer, Flink REST, Airflow REST, SQL)",
    output: "Measured state: offsets, job status, DAG runs, schemas",
    boundary: "Never reachable from this portfolio. The public site shows a recorded walkthrough only.",
    why: "A real multi-component pipeline gives the agent genuine failure modes to detect and repair.",
    testing: "Verified via docker compose against live Kafka/Postgres/Flink/Airflow for schema drift, poison message, and Airflow failure scenarios.",
    source: { label: "docker-compose.yml", path: "docker-compose.yml" },
  },
  {
    id: "validate",
    label: "Validation / Rollback / Audit",
    group: "safety",
    what: "validate_pipeline_health re-measures state independently. Failed validation triggers the plan's rollback action. Every transition and tool call is written to audit_log.",
    input: { topic: "orders.raw", group_id: "pipelinemedic-backend" },
    output: { healthy: true, checks: { consumer_lag_ok: true, measured_lag: 212 } },
    boundary: "A call that cannot be audited is refused (AUDIT_UNAVAILABLE). Credentials are redacted from results and audit rows.",
    why: "A repair is only done when an independent measurement says so, and every decision is traceable.",
    testing: "test_e2e.py and test_advanced_features.py exercise the full lifecycle, including canary re-measurement, on Postgres.",
    source: { label: "tools/ops_tools.py", path: "backend/app/tools/ops_tools.py" },
  },
];

export const readOnlyTools = [
  "get_kafka_consumer_lag",
  "get_topic_metadata",
  "get_recent_pipeline_errors",
  "get_flink_job_status",
  "get_airflow_dag_status",
  "get_airflow_task_logs",
  "get_database_schema",
  "get_schema_versions",
  "compare_schema_versions",
  "validate_pipeline_health",
];

export const stateChangingTools = [
  { name: "quarantine_message", risk: "LOW" },
  { name: "request_human_approval", risk: "LOW" },
  { name: "rerun_airflow_task", risk: "MEDIUM" },
  { name: "restart_flink_job", risk: "MEDIUM" },
  { name: "change_flink_parallelism", risk: "MEDIUM" },
  { name: "apply_safe_config_patch", risk: "MEDIUM" },
  { name: "rollback_change", risk: "MEDIUM" },
];

export const blockedTools = ["drop_database_table", "truncate_topic", "delete_dag", "run_arbitrary_sql", "run_shell_command"];
