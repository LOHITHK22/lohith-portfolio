// The four Incident Commander scenarios. Tool names, tool inputs, detector thresholds, topics and
// event names come from PipelineMedic at PIPELINEMEDIC_COMMIT (see policy.ts). The metric values,
// evidence text and outcomes are synthetic and authored for this simulation.

import type { Severity } from "./policy";

export type ScenarioId = "schema-drift" | "poison-messages" | "consumer-lag" | "airflow-failure";

export type FlinkState = "RUNNING" | "RESTARTING";
export type AirflowState = "success" | "failed";
export type PostgresState = "healthy" | "stale" | "schema_mismatch";

/** What the simulated monitoring console shows. */
export type Metrics = {
  lag: number;
  dlqPerMin: number;
  validatedPct: number;
  flink: FlinkState;
  airflow: AirflowState;
  postgres: PostgresState;
};

export type ToolCall = { tool: string; input: Record<string, unknown> };

export type EvidenceStep = ToolCall & {
  id: string;
  /** What the read-only tool reports in this scenario. */
  finding: string;
  /** Evidence that pins down the root cause. Gathering it raises the simulated diagnosis confidence. */
  key?: boolean;
};

export type Hypothesis = {
  id: string;
  label: string;
  correct: boolean;
  /** Shown once the scenario ends, or when the evidence contradicts the choice. */
  explanation: string;
};

export type PlanAction = ToolCall & {
  description: string;
  reversible: boolean;
  rollback?: ToolCall;
};

export type PlanQuality = "correct" | "partial" | "wrong" | "forbidden";

export type RepairPlanOption = {
  id: string;
  summary: string;
  actions: PlanAction[];
  quality: PlanQuality;
  /** Hypotheses for which the simulated planner proposes this plan. */
  forHypotheses: string[];
  /** Metrics straight after the actions run. Not used for blocked plans. */
  after?: Metrics;
  /** Metrics after rolling back the reversible actions. Defaults to the incident's starting metrics. */
  afterRollback?: Metrics;
  /** Shown in the summary to explain the result. */
  lesson: string;
  /** A note tying the plan to PipelineMedic's own code, if relevant. */
  sourceNote?: string;
};

export type Scenario = {
  id: ScenarioId;
  name: string;
  component: "Kafka" | "Flink" | "Airflow" | "PostgreSQL";
  incidentType: "SCHEMA_DRIFT" | "POISON_MESSAGE" | "KAFKA_LAG" | "AIRFLOW_FAILURE";
  severity: Severity;
  /** The deterministic detector rule that produced the severity. */
  detectorRule: string;
  detectorSource: string;
  title: string;
  sourceComponent: string;
  description: string;
  initial: Metrics;
  evidence: EvidenceStep[];
  hypotheses: Hypothesis[];
  plans: RepairPlanOption[];
  /** Sources at the pinned commit that this scenario follows. */
  sources: string[];
};

// Detector severity rules ported from PipelineMedic, so the tests can check each scenario's severity.

/** detectors/kafka_lag.py with config.py thresholds (warning 500, critical 5000). */
export const LAG_WARNING_THRESHOLD = 500;
export const LAG_CRITICAL_THRESHOLD = 5000;
export const kafkaLagSeverity = (totalLag: number): Severity | null =>
  totalLag < LAG_WARNING_THRESHOLD ? null : totalLag >= LAG_CRITICAL_THRESHOLD ? "CRITICAL" : "HIGH";

/** detectors/airflow_failure.py */
export const airflowFailureSeverity = (state: string, tryNumber: number): Severity | null =>
  state === "failed" || state === "upstream_failed" ? (tryNumber >= 2 ? "HIGH" : "MEDIUM") : null;

/** detectors/data_quality.py: detect_from_dlq_batch */
export const poisonBatchSeverity = (count: number): Severity | null => (count === 0 ? null : count > 5 ? "HIGH" : "MEDIUM");

/** services/pipeline_monitor.py raises breaking schema drift as HIGH. */
export const SCHEMA_DRIFT_SEVERITY: Severity = "HIGH";

/** REQUIRED_FIELDS in detectors/data_quality.py */
export const REQUIRED_FIELDS = ["event_id", "order_id", "customer_id", "amount", "currency", "event_time"];

const HEALTHY: Metrics = { lag: 180, dlqPerMin: 0, validatedPct: 100, flink: "RUNNING", airflow: "success", postgres: "healthy" };

const AIRFLOW_RUN_ID = "scheduled__2026-11-01T18:15:00+00:00";
const POISON_COUNT = 12;
const LAG_BY_PARTITION = [1240, 1180, 1320, 1210, 1260, 1240];
const TOTAL_LAG = LAG_BY_PARTITION.reduce((a, b) => a + b, 0); // 7,450

export const SCENARIOS: Scenario[] = [
  {
    id: "schema-drift",
    name: "Schema drift",
    component: "Kafka",
    incidentType: "SCHEMA_DRIFT",
    severity: SCHEMA_DRIFT_SEVERITY,
    detectorRule: "A deterministic schema diff classifies the change as BREAKING; the pipeline monitor raises breaking drift as HIGH.",
    detectorSource: "backend/app/services/pipeline_monitor.py",
    title: "Breaking schema drift detected on orders.raw",
    sourceComponent: "kafka:orders.raw",
    description: "1 field change(s) detected, overall BREAKING. Most new orders are landing in pipeline.dlq instead of orders.validated.",
    initial: { lag: 320, dlqPerMin: 140, validatedPct: 38, flink: "RUNNING", airflow: "success", postgres: "stale" },
    evidence: [
      {
        id: "versions",
        tool: "get_schema_versions",
        input: { subject: "orders.raw" },
        finding: "Version 4 of orders.raw was registered at 18:02:13, 47 seconds before the DLQ spike. Version 3 had been stable for 9 days.",
      },
      {
        id: "compare",
        tool: "compare_schema_versions",
        input: { subject: "orders.raw", old_version: 3, new_version: 4 },
        finding: "amount → order_total: RENAMED, compatibility BREAKING. Old-format consumers no longer find the required field amount.",
        key: true,
      },
      {
        id: "dlq",
        tool: "get_recent_pipeline_errors",
        input: { topic: "pipeline.dlq", limit: 20 },
        finding: "20 of the last 20 DLQ records fail with MISSING_FIELDS ['amount']. Each one carries an order_total field instead.",
        key: true,
      },
      {
        id: "lag",
        tool: "get_kafka_consumer_lag",
        input: { topic: "orders.raw", group_id: "flink-order-validator" },
        finding: "Total lag 320 across 6 partitions, below the 500 warning threshold. The validator is keeping up; this is not a throughput problem.",
      },
      {
        id: "flink",
        tool: "get_flink_job_status",
        input: { job_name: "order-validator" },
        finding: "order-validator is RUNNING with 0 restarts. The job is healthy; it is rejecting records, not crashing.",
      },
    ],
    hypotheses: [
      {
        id: "rename",
        label: "The producer renamed amount to order_total, a breaking change, so the validator rejects every new-format order.",
        correct: true,
        explanation: "The schema diff shows a BREAKING rename and every DLQ record is missing amount.",
      },
      {
        id: "poison",
        label: "A buggy producer batch is sending corrupt messages (poison messages).",
        correct: false,
        explanation: "The failures are uniform (all MISSING_FIELDS ['amount']) and began with a new schema version, which points to drift, not a corrupt batch.",
      },
      {
        id: "capacity",
        label: "The Flink validator is under-provisioned and dropping records under load.",
        correct: false,
        explanation: "Lag is below the warning threshold and the job is RUNNING. Records are rejected by validation, not dropped for capacity.",
      },
    ],
    plans: [
      {
        id: "quarantine-and-shim",
        summary: "Quarantine drifted messages and apply a compatibility shim in the Flink validator.",
        quality: "correct",
        forHypotheses: ["rename"],
        actions: [
          {
            tool: "quarantine_message",
            input: { topic: "orders.raw", reason: "schema_drift" },
            description: "Quarantine messages matching the drifted schema so they stop failing downstream validation.",
            reversible: true,
          },
          {
            tool: "apply_safe_config_patch",
            input: { component: "flink-validator", patch: { field_mapping: { order_total: "amount" } } },
            description: "Map order_total back to amount in the Flink validator.",
            reversible: true,
            rollback: { tool: "rollback_change", input: { component: "flink-validator" } },
          },
        ],
        after: { ...HEALTHY, lag: 210, dlqPerMin: 1, validatedPct: 99.7 },
        lesson: "Quarantining stops the bleeding and the field mapping makes new-format orders valid again. Both actions can be rolled back.",
        sourceNote: "This is the plan PipelineMedic's mock planner generates for schema drift (llm/mock_provider.py).",
      },
      {
        id: "quarantine-only",
        summary: "Quarantine the drifted messages already in the DLQ.",
        quality: "partial",
        forHypotheses: ["rename", "poison"],
        actions: [
          {
            tool: "quarantine_message",
            input: { topic: "orders.raw", reason: "schema_drift" },
            description: "Quarantine messages matching the drifted schema.",
            reversible: true,
          },
        ],
        after: { lag: 300, dlqPerMin: 138, validatedPct: 39, flink: "RUNNING", airflow: "success", postgres: "stale" },
        lesson: "Quarantining clears what has already failed, but every new order still arrives without amount and fails validation. Lag stays low, so a lag-only health check passes.",
      },
      {
        id: "scale-validator",
        summary: "Scale the Flink validator from 2 to 4 parallel tasks.",
        quality: "wrong",
        forHypotheses: ["capacity"],
        actions: [
          {
            tool: "change_flink_parallelism",
            input: { job_name: "order-validator", parallelism: 4 },
            description: "Increase Flink job parallelism.",
            reversible: true,
            rollback: { tool: "change_flink_parallelism", input: { job_name: "order-validator", parallelism: 2 } },
          },
        ],
        after: { lag: 90, dlqPerMin: 140, validatedPct: 38, flink: "RUNNING", airflow: "success", postgres: "stale" },
        lesson: "More validator capacity rejects the drifted records faster. Lag drops, which hides the problem from a lag-only check, but nothing becomes valid.",
      },
      {
        id: "truncate-raw",
        summary: "Truncate orders.raw and let producers start fresh.",
        quality: "forbidden",
        forHypotheses: ["poison", "capacity"],
        actions: [
          {
            tool: "truncate_topic",
            input: { topic: "orders.raw" },
            description: "Delete every message on orders.raw, valid orders included.",
            reversible: false,
          },
        ],
        lesson: "Truncating a topic destroys valid orders and cannot be undone, so the policy blocks it outright.",
      },
      {
        id: "alter-table",
        summary: "Rename the orders column to match the producer with a SQL migration.",
        quality: "forbidden",
        forHypotheses: ["rename"],
        actions: [
          {
            tool: "run_arbitrary_sql",
            input: { sql: "ALTER TABLE orders RENAME COLUMN amount TO order_total;" },
            description: "Change the warehouse schema to follow the producer.",
            reversible: false,
          },
        ],
        lesson: "The intent is understandable, but arbitrary SQL is hard-blocked: an agent never gets free-form write access to the database.",
      },
    ],
    sources: [
      "backend/app/services/pipeline_monitor.py",
      "backend/app/detectors/schema_drift.py",
      "backend/app/llm/mock_provider.py",
      "backend/app/tools/schema_tools.py",
    ],
  },
  {
    id: "poison-messages",
    name: "Poison messages",
    component: "Kafka",
    incidentType: "POISON_MESSAGE",
    severity: poisonBatchSeverity(POISON_COUNT)!,
    detectorRule: `More than 5 poison messages in a DLQ batch is HIGH, otherwise MEDIUM. This batch has ${POISON_COUNT}.`,
    detectorSource: "backend/app/detectors/data_quality.py",
    title: `${POISON_COUNT} poison message(s) routed to DLQ from orders.raw`,
    sourceComponent: "kafka:orders.raw",
    description: "Detected violation reasons: INVALID_JSON, MISSING_FIELDS, TYPE_VIOLATION.",
    initial: { lag: 260, dlqPerMin: 12, validatedPct: 96.8, flink: "RUNNING", airflow: "success", postgres: "healthy" },
    evidence: [
      {
        id: "dlq",
        tool: "get_recent_pipeline_errors",
        input: { topic: "pipeline.dlq", limit: 20 },
        finding: "12 records: 5 INVALID_JSON, 4 TYPE_VIOLATION (amount sent as the string \"12.50\"), 3 MISSING_FIELDS ['currency']. All carry producer batch id b-7731.",
        key: true,
      },
      {
        id: "metadata",
        tool: "get_topic_metadata",
        input: { topic: "orders.raw" },
        finding: "6 partitions, 7-day retention. Every poison record sits on partition 2, written within a 40-second window.",
        key: true,
      },
      {
        id: "versions",
        tool: "get_schema_versions",
        input: { subject: "orders.raw" },
        finding: "No new schema version in the last 24 hours. The registered schema is unchanged.",
      },
      {
        id: "flink",
        tool: "get_flink_job_status",
        input: { job_name: "order-validator" },
        finding: "order-validator is RUNNING with 0 restarts. Bad records are routed to the DLQ, as designed, instead of crashing the job.",
      },
      {
        id: "lag",
        tool: "get_kafka_consumer_lag",
        input: { topic: "orders.raw", group_id: "flink-order-validator" },
        finding: "Total lag 260, below the 500 warning threshold.",
      },
    ],
    hypotheses: [
      {
        id: "bad-batch",
        label: "One producer batch sent malformed records: invalid JSON, a string amount and a missing currency.",
        correct: true,
        explanation: "All 12 records share one batch id, one partition and a 40-second window, with three different violation types.",
      },
      {
        id: "drift",
        label: "The producer made a breaking schema change.",
        correct: false,
        explanation: "No schema version changed, and the violations are mixed rather than one consistent field change.",
      },
      {
        id: "flink-unstable",
        label: "The Flink job is unstable and corrupting records.",
        correct: false,
        explanation: "The job is RUNNING with no restarts and is doing its job: routing invalid input to the DLQ.",
      },
    ],
    plans: [
      {
        id: "quarantine",
        summary: "Quarantine the poison messages currently polluting the DLQ.",
        quality: "correct",
        forHypotheses: ["bad-batch"],
        actions: [
          {
            tool: "quarantine_message",
            input: { topic: "orders.raw", reason: "poison_message" },
            description: "Quarantine poison messages already identified in evidence.samples.",
            reversible: true,
          },
        ],
        after: { ...HEALTHY, lag: 240 },
        lesson: "Quarantine is a LOW-risk tool, but the incident is HIGH severity, so the severity floor lifts the plan to MEDIUM and a human still has to approve it.",
        sourceNote: "This is the plan PipelineMedic's mock planner generates for poison messages (llm/mock_provider.py).",
      },
      {
        id: "restart",
        summary: "Restart the Flink job from its last checkpoint.",
        quality: "wrong",
        forHypotheses: ["flink-unstable"],
        actions: [
          {
            tool: "restart_flink_job",
            input: { job_id: "order-validator" },
            description: "Restart the Flink job from the last checkpoint.",
            reversible: false,
          },
        ],
        after: { lag: 2300, dlqPerMin: 24, validatedPct: 95.1, flink: "RUNNING", airflow: "success", postgres: "stale" },
        lesson: "Restarting replays from the checkpoint, so the same poison records hit the DLQ again and lag spikes while the job catches up. A restart cannot be rolled back.",
      },
      {
        id: "patch-mapping",
        summary: "Patch the validator's field mapping to accept the new format.",
        quality: "wrong",
        forHypotheses: ["drift"],
        actions: [
          {
            tool: "apply_safe_config_patch",
            input: { component: "flink-validator", patch: { field_mapping: { amount_str: "amount" } } },
            description: "Add a field mapping for a schema change that never happened.",
            reversible: true,
            rollback: { tool: "rollback_change", input: { component: "flink-validator" } },
          },
        ],
        after: { lag: 250, dlqPerMin: 12, validatedPct: 96.8, flink: "RUNNING", airflow: "success", postgres: "healthy" },
        lesson: "There was no schema change to map, so the patch changes nothing and the poison records keep arriving in the DLQ.",
      },
      {
        id: "truncate-dlq",
        summary: "Truncate pipeline.dlq to clear the alert.",
        quality: "forbidden",
        forHypotheses: ["bad-batch", "drift", "flink-unstable"],
        actions: [
          {
            tool: "truncate_topic",
            input: { topic: "pipeline.dlq" },
            description: "Delete every record in the dead-letter queue.",
            reversible: false,
          },
        ],
        lesson: "Emptying the DLQ destroys the evidence and any records that need replaying. truncate_topic is hard-blocked.",
      },
      {
        id: "shell-delete",
        summary: "Delete the bad offsets with the Kafka CLI.",
        quality: "forbidden",
        forHypotheses: ["bad-batch"],
        actions: [
          {
            tool: "run_shell_command",
            input: { command: "kafka-delete-records.sh --offset-json-file poison-offsets.json" },
            description: "Run a shell command against the Kafka cluster.",
            reversible: false,
          },
        ],
        lesson: "Shell access is hard-blocked regardless of intent. The typed quarantine tool does the same job safely.",
      },
    ],
    sources: ["backend/app/detectors/data_quality.py", "backend/app/llm/mock_provider.py", "backend/app/tools/kafka_tools.py"],
  },
  {
    id: "consumer-lag",
    name: "Consumer lag",
    component: "Flink",
    incidentType: "KAFKA_LAG",
    severity: kafkaLagSeverity(TOTAL_LAG)!,
    detectorRule: `Total lag of ${LAG_WARNING_THRESHOLD} or more raises an incident; ${LAG_CRITICAL_THRESHOLD.toLocaleString("en-US")} or more is CRITICAL. Measured: ${TOTAL_LAG.toLocaleString("en-US")}.`,
    detectorSource: "backend/app/detectors/kafka_lag.py",
    title: `Consumer lag on orders.raw (flink-order-validator) is ${TOTAL_LAG}`,
    sourceComponent: "kafka:orders.raw:flink-order-validator",
    description: `Total consumer lag across 6 partitions is ${TOTAL_LAG}, exceeding threshold ${LAG_WARNING_THRESHOLD}.`,
    initial: { lag: TOTAL_LAG, dlqPerMin: 0, validatedPct: 100, flink: "RUNNING", airflow: "success", postgres: "stale" },
    evidence: [
      {
        id: "lag",
        tool: "get_kafka_consumer_lag",
        input: { topic: "orders.raw", group_id: "flink-order-validator" },
        finding: `Lag by partition: ${LAG_BY_PARTITION.map((n, i) => `${i}: ${n.toLocaleString("en-US")}`).join(", ")}. The even spread rules out a single hot partition.`,
        key: true,
      },
      {
        id: "flink",
        tool: "get_flink_job_status",
        input: { job_name: "order-validator" },
        finding: "order-validator is RUNNING at parallelism 2 with 0 restarts. Backpressure on the validate operator is HIGH.",
        key: true,
      },
      {
        id: "metadata",
        tool: "get_topic_metadata",
        input: { topic: "orders.raw" },
        finding: "Producer write rate is up 2.4× since 18:00, in line with evening sale traffic.",
      },
      {
        id: "dlq",
        tool: "get_recent_pipeline_errors",
        input: { topic: "pipeline.dlq", limit: 20 },
        finding: "No new DLQ records in the last hour. The data is valid, just late.",
      },
      {
        id: "airflow",
        tool: "get_airflow_dag_status",
        input: { dag_id: "order_data_quality_dag" },
        finding: "Last run succeeded. Downstream checks are fine but are reading orders that are about 9 minutes old.",
      },
    ],
    hypotheses: [
      {
        id: "throughput",
        label: "Two Flink tasks can't keep up with 2.4× producer traffic; the job needs more parallelism.",
        correct: true,
        explanation: "Lag is spread evenly, the job is healthy but backpressured, and traffic is up 2.4×.",
      },
      {
        id: "stuck",
        label: "The Flink job is stuck and needs a restart.",
        correct: false,
        explanation: "The job is RUNNING and processing; it is slow, not stuck. A restart throws away in-flight progress.",
      },
      {
        id: "poison",
        label: "Poison messages are blocking the partitions.",
        correct: false,
        explanation: "There are no new DLQ records and the lag is spread across every partition.",
      },
    ],
    plans: [
      {
        id: "scale-up",
        summary: "Scale up Flink parallelism to drain backlog.",
        quality: "correct",
        forHypotheses: ["throughput"],
        actions: [
          {
            tool: "change_flink_parallelism",
            input: { job_name: "order-validator", parallelism: 4 },
            description: "Increase Flink job parallelism to drain consumer lag faster.",
            reversible: true,
            rollback: { tool: "change_flink_parallelism", input: { job_name: "order-validator", parallelism: 2 } },
          },
        ],
        after: { ...HEALTHY, lag: 340 },
        lesson: "Doubling parallelism drains the backlog below the warning threshold, and the change can be rolled back to 2 if validation fails.",
        sourceNote: "This is the plan PipelineMedic's mock planner generates for consumer lag (llm/mock_provider.py).",
      },
      {
        id: "patch-parallelism",
        summary: "Nudge parallelism from 2 to 3 through a config patch.",
        quality: "partial",
        forHypotheses: ["throughput"],
        actions: [
          {
            tool: "apply_safe_config_patch",
            input: { component: "flink-validator", patch: { parallelism: 3 } },
            description: "Apply a whitelisted parallelism patch.",
            reversible: true,
            rollback: { tool: "rollback_change", input: { component: "flink-validator" } },
          },
        ],
        after: { lag: 1900, dlqPerMin: 0, validatedPct: 100, flink: "RUNNING", airflow: "success", postgres: "stale" },
        lesson: "One extra task slows the growth but lag is still 1,900 when the canary measures it, so the change is rolled back.",
      },
      {
        id: "restart",
        summary: "Restart the Flink job.",
        quality: "wrong",
        forHypotheses: ["stuck"],
        actions: [
          {
            tool: "restart_flink_job",
            input: { job_id: "order-validator" },
            description: "Restart the Flink job from the last checkpoint.",
            reversible: false,
          },
        ],
        after: { lag: 9100, dlqPerMin: 0, validatedPct: 100, flink: "RUNNING", airflow: "success", postgres: "stale" },
        lesson: "The restart rewinds to the last checkpoint and pauses consumption, so lag grows to 9,100. A restart has no rollback.",
      },
      {
        id: "quarantine",
        summary: "Quarantine messages on orders.raw.",
        quality: "wrong",
        forHypotheses: ["poison"],
        actions: [
          {
            tool: "quarantine_message",
            input: { topic: "orders.raw", reason: "poison_message" },
            description: "Quarantine messages believed to be poison.",
            reversible: true,
          },
        ],
        after: { lag: TOTAL_LAG, dlqPerMin: 0, validatedPct: 100, flink: "RUNNING", airflow: "success", postgres: "stale" },
        lesson: "There were no poison messages to quarantine, so lag is unchanged.",
      },
      {
        id: "truncate",
        summary: "Truncate orders.raw to skip the backlog.",
        quality: "forbidden",
        forHypotheses: ["throughput", "stuck", "poison"],
        actions: [
          {
            tool: "truncate_topic",
            input: { topic: "orders.raw" },
            description: "Discard 7,450 unprocessed orders.",
            reversible: false,
          },
        ],
        lesson: "Skipping the backlog means silently losing 7,450 valid orders. truncate_topic is hard-blocked.",
      },
      {
        id: "kubectl",
        summary: "Scale the TaskManagers with kubectl.",
        quality: "forbidden",
        forHypotheses: ["throughput"],
        actions: [
          {
            tool: "run_shell_command",
            input: { command: "kubectl scale deployment flink-taskmanager --replicas=8" },
            description: "Run a shell command against the cluster.",
            reversible: false,
          },
        ],
        lesson: "Right idea, wrong tool. Arbitrary shell commands are hard-blocked; change_flink_parallelism is the typed, reversible way to do it.",
      },
    ],
    sources: ["backend/app/detectors/kafka_lag.py", "backend/app/config.py", "backend/app/llm/mock_provider.py", "backend/app/tools/flink_tools.py"],
  },
  {
    id: "airflow-failure",
    name: "Airflow task failure",
    component: "Airflow",
    incidentType: "AIRFLOW_FAILURE",
    severity: airflowFailureSeverity("failed", 2)!,
    detectorRule: "A failed task on try 2 or later is HIGH, otherwise MEDIUM. The DAG retries once, so this is try 2.",
    detectorSource: "backend/app/detectors/airflow_failure.py",
    title: `Airflow task order_data_quality_dag.check_orders_schema failed (run ${AIRFLOW_RUN_ID}, try 2)`,
    sourceComponent: "airflow:order_data_quality_dag.check_orders_schema",
    description: "Task state=failed after 2 attempt(s). See evidence.logs_tail for details.",
    initial: { lag: 230, dlqPerMin: 0, validatedPct: 100, flink: "RUNNING", airflow: "failed", postgres: "schema_mismatch" },
    evidence: [
      {
        id: "logs",
        tool: "get_airflow_task_logs",
        input: { dag_id: "order_data_quality_dag", task_id: "check_orders_schema", run_id: AIRFLOW_RUN_ID, try_number: 2 },
        finding:
          "ValueError: orders table is missing expected column(s): ['customer_id']. Actual columns: ['amount', 'currency', 'customerId', 'event_time', 'order_id'].",
        key: true,
      },
      {
        id: "db-schema",
        tool: "get_database_schema",
        input: { table_name: "orders" },
        finding: "orders has customerId (camel case) and no customer_id. The column was renamed in PostgreSQL at 18:09.",
        key: true,
      },
      {
        id: "dag",
        tool: "get_airflow_dag_status",
        input: { dag_id: "order_data_quality_dag" },
        finding: "check_orders_schema failed on both tries; check_orders_completeness is upstream_failed. The DAG runs every 15 minutes.",
      },
      {
        id: "versions",
        tool: "get_schema_versions",
        input: { subject: "orders.raw" },
        finding: "No new version of the orders.raw message schema. Kafka messages still carry customer_id.",
      },
      {
        id: "lag",
        tool: "get_kafka_consumer_lag",
        input: { topic: "orders.raw", group_id: "flink-order-validator" },
        finding: "Total lag 230. Streaming is healthy; the failure is in the warehouse.",
      },
    ],
    hypotheses: [
      {
        id: "column-renamed",
        label: "Someone renamed orders.customer_id to customerId in PostgreSQL, so the schema check fails on every try.",
        correct: true,
        explanation: "The task log and the table schema both show customerId in place of customer_id, while the Kafka message schema is unchanged.",
      },
      {
        id: "transient",
        label: "A transient worker failure. Rerunning the task will fix it.",
        correct: false,
        explanation: "The same ValueError on both tries is deterministic, not transient. A rerun will fail the same way.",
      },
      {
        id: "kafka-drift",
        label: "Upstream Kafka schema drift; the Flink validator needs a field mapping.",
        correct: false,
        explanation: "The orders.raw schema hasn't changed and lag is normal. The rename happened in the warehouse table.",
      },
    ],
    plans: [
      {
        id: "escalate-then-rerun",
        summary: "Escalate the column fix to the database owner, then rerun the task.",
        quality: "correct",
        forHypotheses: ["column-renamed"],
        actions: [
          {
            tool: "request_human_approval",
            input: { reason: "orders.customerId must be renamed back to customer_id by the database owner before check_orders_schema can pass." },
            description: "Hand the column fix to a human. No PipelineMedic tool can alter a table.",
            reversible: true,
          },
          {
            tool: "rerun_airflow_task",
            input: { dag_id: "order_data_quality_dag", task_id: "check_orders_schema", run_id: AIRFLOW_RUN_ID },
            description: "Rerun the task once the owner confirms the column is restored (simulated: the owner restores it).",
            reversible: false,
          },
        ],
        after: { ...HEALTHY, lag: 220 },
        lesson: "The agent's typed tools can't change a table, and arbitrary SQL is hard-blocked, so the safe move is to escalate the fix and rerun afterwards.",
        sourceNote:
          "PipelineMedic's mock planner proposes a rerun only for Airflow failures. Its failure-injection script renames customer_id to customerId, and its docs describe repairing the column before the rerun succeeds.",
      },
      {
        id: "rerun-only",
        summary: "Rerun the failed Airflow task.",
        quality: "partial",
        forHypotheses: ["column-renamed", "transient"],
        actions: [
          {
            tool: "rerun_airflow_task",
            input: { dag_id: "order_data_quality_dag", task_id: "check_orders_schema", run_id: AIRFLOW_RUN_ID },
            description: "Rerun the failed Airflow task.",
            reversible: false,
          },
        ],
        after: { lag: 230, dlqPerMin: 0, validatedPct: 100, flink: "RUNNING", airflow: "failed", postgres: "schema_mismatch" },
        lesson: "The column is still renamed, so the rerun fails a third time. Consumer lag is fine, so a lag-only health check would call this healthy.",
        sourceNote: "This is the plan PipelineMedic's mock planner generates for Airflow failures (llm/mock_provider.py).",
      },
      {
        id: "flink-mapping",
        summary: "Map customerId to customer_id in the Flink validator.",
        quality: "wrong",
        forHypotheses: ["kafka-drift"],
        actions: [
          {
            tool: "apply_safe_config_patch",
            input: { component: "flink-validator", patch: { field_mapping: { customerId: "customer_id" } } },
            description: "Add a field mapping in the streaming validator.",
            reversible: true,
            rollback: { tool: "rollback_change", input: { component: "flink-validator" } },
          },
        ],
        after: { lag: 230, dlqPerMin: 0, validatedPct: 100, flink: "RUNNING", airflow: "failed", postgres: "schema_mismatch" },
        lesson: "The streaming messages were never wrong. Patching Flink leaves the warehouse column renamed and the task still failing.",
      },
      {
        id: "alter-table",
        summary: "Rename the column back with a SQL statement.",
        quality: "forbidden",
        forHypotheses: ["column-renamed"],
        actions: [
          {
            tool: "run_arbitrary_sql",
            input: { sql: 'ALTER TABLE orders RENAME COLUMN "customerId" TO customer_id;' },
            description: "Run a schema change directly against PostgreSQL.",
            reversible: false,
          },
        ],
        lesson: "This is the right fix, but not one an agent may run. run_arbitrary_sql is hard-blocked; a human owns schema changes.",
      },
      {
        id: "delete-dag",
        summary: "Delete the failing DAG to stop the alerts.",
        quality: "forbidden",
        forHypotheses: ["transient", "kafka-drift"],
        actions: [
          {
            tool: "delete_dag",
            input: { dag_id: "order_data_quality_dag" },
            description: "Remove the data-quality DAG.",
            reversible: false,
          },
        ],
        lesson: "Deleting the check silences the alarm and leaves the data broken. delete_dag is hard-blocked.",
      },
    ],
    sources: [
      "backend/app/detectors/airflow_failure.py",
      "airflow/dags/order_data_quality_dag.py",
      "backend/app/llm/mock_provider.py",
      "docs/limitations.md",
    ],
  },
];

export const getScenario = (id: ScenarioId) => SCENARIOS.find((s) => s.id === id)!;
