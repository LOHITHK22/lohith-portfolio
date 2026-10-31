"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Bot,
  CheckCircle2,
  Circle,
  ExternalLink,
  FlaskConical,
  GitBranch,
  Loader2,
  Network,
  Play,
  Radar,
  ShieldCheck,
  TestTube2,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { track } from "@/lib/analytics";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fadeUpVariants } from "@/lib/motion";

const REPO = "https://github.com/LOHITHK22/PipelineMedic-AI";
const repoFile = (path: string) => `${REPO}/blob/HEAD/${path}`;

type Evidence = { label: string; href?: string };

type Concept = {
  id: string;
  label: string;
  icon: LucideIcon;
  title: string;
  explain: string;
  evidence: Evidence[];
  Demo: () => JSX.Element;
};

// Real tool risk levels, copied from PipelineMedic's
// backend/app/policies/autonomy_policy.yaml.
const TOOL_RISK: Record<string, "LOW" | "MEDIUM" | "CRITICAL"> = {
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
const DECISION = { LOW: "AUTO_EXECUTE", MEDIUM: "APPROVAL_REQUIRED", CRITICAL: "BLOCKED" } as const;
const RISK_COLOR = { LOW: "#34d399", MEDIUM: "#fbbf24", CRITICAL: "#fb7185" } as const;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs an async "script" once at a time, and cancels it on unmount. */
function useRunner() {
  const tokenRef = useRef(0);
  const [running, setRunning] = useState(false);
  useEffect(() => () => void (tokenRef.current += 1), []);
  const run = async (script: (alive: () => boolean) => Promise<void>) => {
    const token = ++tokenRef.current;
    setRunning(true);
    try {
      await script(() => token === tokenRef.current);
    } finally {
      if (token === tokenRef.current) setRunning(false);
    }
  };
  return { run, running };
}

function useStepDelay() {
  const reduced = useReducedMotion();
  return reduced ? 120 : 650;
}

/* ------------------------------ demos ------------------------------ */

const GRAPH_NODES = ["Detect", "Diagnose (LLM)", "Plan", "Policy", "Execute", "Validate", "Resolve"];

function OrchestrationDemo() {
  const delay = useStepDelay();
  const { run, running } = useRunner();
  const [active, setActive] = useState(-1);
  const [failed, setFailed] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const start = (fail: boolean) =>
    run(async (alive) => {
      track("lab_demo_run", { demo: "orchestration", variant: fail ? "rollback" : "healthy" });
      setFailed(false);
      setLog([]);
      const lines = [
        "schema_drift detector fired on orders.raw (deterministic, no LLM)",
        "LLM returns structured diagnosis: producer added field 'coupon_code'",
        "typed repair plan: compare_schema_versions → apply_safe_config_patch",
        "policy engine: apply_safe_config_patch is MEDIUM → approval granted",
        "executing typed tools through the registry",
        fail ? "validation: pipeline still unhealthy" : "validation: lag and DLQ back to baseline",
        fail ? "rollback_change executed, incident escalated" : "incident RESOLVED, audit trail written",
      ];
      for (let i = 0; i < GRAPH_NODES.length; i++) {
        if (!alive()) return;
        setActive(i);
        setLog((l) => [...l, lines[i]]);
        if (fail && i === GRAPH_NODES.length - 1) setFailed(true);
        await wait(delay);
      }
    });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {GRAPH_NODES.map((n, i) => {
          const label = failed && i === GRAPH_NODES.length - 1 ? "Rollback" : n;
          const done = i < active;
          const current = i === active;
          return (
            <div key={n} className="flex items-center gap-1.5">
              <span
                className={`rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-colors ${
                  current
                    ? failed && i === GRAPH_NODES.length - 1
                      ? "border-rose-400/60 bg-rose-400/15 text-rose-200"
                      : "border-accent-cyan/60 bg-accent-cyan/15 text-cyan-100"
                    : done
                      ? "border-white/15 bg-white/5 text-slate-300"
                      : "border-white/10 text-slate-400"
                }`}
              >
                {label}
              </span>
              {i < GRAPH_NODES.length - 1 && <span className="text-slate-600" aria-hidden="true">→</span>}
            </div>
          );
        })}
      </div>
      <DemoButtons>
        <RunButton onClick={() => start(false)} disabled={running}>Run: repair succeeds</RunButton>
        <RunButton onClick={() => start(true)} disabled={running} secondary>Run: repair fails</RunButton>
      </DemoButtons>
      <LogPane lines={log} />
    </div>
  );
}

// Response shapes follow the repo: quarantine_message echoes the input topic
// with status "QUARANTINED"; hard-blocked tools are never registered; and
// state-changing tools are only listed with MCP_ALLOW_STATE_CHANGING_TOOLS=true.
const MCP_SCENARIOS = {
  list: {
    label: "tools/list",
    request: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    response: {
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: ["get_kafka_consumer_lag", "get_topic_metadata", "validate_pipeline_health", "…"],
        note: "read-only tools by default; state-changing tools appear only when MCP_ALLOW_STATE_CHANGING_TOOLS=true",
      },
    },
  },
  call: {
    label: "tools/call quarantine_message",
    request: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "quarantine_message", arguments: { topic: "orders.raw", reason: "poison message" } },
    },
    response: {
      jsonrpc: "2.0",
      id: 2,
      result: { quarantined_topic: "orders.raw", reason: "poison message", status: "QUARANTINED" },
    },
  },
  blocked: {
    label: "tools/call drop_database_table",
    request: {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "drop_database_table", arguments: { table: "orders" } },
    },
    response: {
      jsonrpc: "2.0",
      id: 3,
      result: { isError: true, content: "Tool 'drop_database_table' is permanently blocked." },
    },
  },
} as const;

function McpDemo() {
  const [key, setKey] = useState<keyof typeof MCP_SCENARIOS>("list");
  const s = MCP_SCENARIOS[key];
  const layers = ["MCP client", "stdio JSON-RPC", "Policy + approvals", "Tool registry", "Kafka · Flink · Airflow · Postgres"];
  const stopAt = key === "blocked" ? 2 : layers.length - 1;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {layers.map((l, i) => (
          <div key={l} className="flex items-center gap-1.5">
            <span
              className={`rounded-lg border px-2.5 py-1.5 font-mono text-[11px] ${
                i <= stopAt
                  ? i === stopAt && key === "blocked"
                    ? "border-rose-400/60 bg-rose-400/10 text-rose-200"
                    : "border-accent-violet/50 bg-accent-violet/10 text-violet-100"
                  : "border-white/10 text-slate-600"
              }`}
            >
              {l}
            </span>
            {i < layers.length - 1 && <span className="text-slate-600" aria-hidden="true">→</span>}
          </div>
        ))}
      </div>
      <DemoButtons>
        {(Object.keys(MCP_SCENARIOS) as (keyof typeof MCP_SCENARIOS)[]).map((k) => (
          <RunButton
            key={k}
            onClick={() => {
              setKey(k);
              track("lab_demo_run", { demo: "mcp", variant: k });
            }}
            secondary={k !== key}
          >
            {MCP_SCENARIOS[k].label}
          </RunButton>
        ))}
      </DemoButtons>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <CodePane title="request" value={s.request} />
        <CodePane title="response (illustrative, shaped like the repo's)" value={s.response} />
      </div>
    </div>
  );
}

const TOOL_CALLS = [
  {
    id: "valid",
    label: "Valid arguments",
    call: { name: "quarantine_message", arguments: { topic: "orders.raw", reason: "poison message" } },
    verdict: "ok" as const,
    result: "Pydantic validation passed → risk LOW → executed → audited",
  },
  {
    id: "missing",
    label: "Missing field",
    call: { name: "quarantine_message", arguments: { topic: "orders.raw" } },
    verdict: "rejected" as const,
    result: "ValidationError: field 'reason' required. Nothing executed.",
  },
  {
    id: "destructive",
    label: "Destructive tool",
    call: { name: "run_shell_command", arguments: { cmd: "kafka-topics --delete …" } },
    verdict: "blocked" as const,
    result: "Hard-blocked in code before policy is even consulted. Nothing executed.",
  },
];

function ToolCallingDemo() {
  const [idx, setIdx] = useState(0);
  const c = TOOL_CALLS[idx];
  return (
    <div>
      <div className="grid gap-3 md:grid-cols-2">
        <CodePane
          title="typed tool schema (from the repo)"
          value={`class QuarantineMessageInput(BaseModel):\n    topic: str\n    reason: str\n\nrisk_level = ToolRiskLevel.LOW`}
          raw
        />
        <CodePane title="model proposes a call" value={c.call} />
      </div>
      <DemoButtons>
        {TOOL_CALLS.map((t, i) => (
          <RunButton
            key={t.id}
            secondary={i !== idx}
            onClick={() => {
              setIdx(i);
              track("lab_demo_run", { demo: "tool_calling", variant: t.id });
            }}
          >
            {t.label}
          </RunButton>
        ))}
      </DemoButtons>
      <Verdict kind={c.verdict}>{c.result}</Verdict>
    </div>
  );
}

function KappaDemo() {
  // Toy counts the visitor can edit; not RAG Sentinel's data.
  const [m, setM] = useState({ pp: 40, pf: 5, fp: 6, ff: 49 });
  const n = m.pp + m.pf + m.fp + m.ff || 1;
  const po = (m.pp + m.ff) / n;
  const judgePass = (m.pp + m.pf) / n;
  const humanPass = (m.pp + m.fp) / n;
  const pe = judgePass * humanPass + (1 - judgePass) * (1 - humanPass);
  const kappa = pe === 1 ? 1 : (po - pe) / (1 - pe);
  const cell = (k: keyof typeof m, label: string, agree: boolean) => (
    <label className={`flex flex-col gap-1 rounded-lg border p-2 text-[11px] ${agree ? "border-emerald-400/30 bg-emerald-400/5" : "border-rose-400/30 bg-rose-400/5"}`}>
      <span className="text-slate-400">{label}</span>
      <input
        type="number"
        min={0}
        max={999}
        value={m[k]}
        onChange={(e) => setM((p) => ({ ...p, [k]: Math.max(0, Math.min(999, Number(e.target.value) || 0)) }))}
        className="w-full rounded bg-base-950/60 px-2 py-1 font-mono text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent-cyan"
      />
    </label>
  );
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
      <div className="grid grid-cols-2 gap-2">
        {cell("pp", "Judge pass · Human pass", true)}
        {cell("pf", "Judge pass · Human fail", false)}
        {cell("fp", "Judge fail · Human pass", false)}
        {cell("ff", "Judge fail · Human fail", true)}
      </div>
      <div className="rounded-xl border border-white/10 bg-base-950/50 p-4 font-mono text-xs text-slate-300">
        <p>observed agreement p₀ = {po.toFixed(2)}</p>
        <p>chance agreement pₑ = {pe.toFixed(2)}</p>
        <p className="mt-2 text-2xl font-bold text-white">κ = {kappa.toFixed(2)}</p>
        <p className="mt-1 text-[11px] text-slate-400">κ = (p₀ − pₑ) / (1 − pₑ)</p>
      </div>
      <p className="text-xs text-slate-400 md:col-span-2">
        Edit the counts (toy numbers). Raw agreement flatters a judge when most answers pass anyway; kappa corrects for
        chance. RAG Sentinel&apos;s judge scored 0.82 against 1,000 human-annotated responses.
      </p>
    </div>
  );
}

function ApprovalDemo() {
  const [tool, setTool] = useState("rerun_airflow_task");
  const [token, setToken] = useState<"none" | "issued" | "used">("none");
  const [msg, setMsg] = useState<string | null>(null);
  const risk = TOOL_RISK[tool];
  const decision = DECISION[risk];

  const approve = () => {
    if (token === "used") {
      setMsg("Rejected: approval token already used. Approvals are single-use.");
      return;
    }
    setToken("used");
    setMsg(`Approved by a human. ${tool} executed once, validated, and audited.`);
    track("lab_demo_run", { demo: "approval", variant: tool });
  };

  return (
    <div>
      <label className="block text-xs text-slate-400">
        Tool the agent wants to run
        <select
          value={tool}
          onChange={(e) => {
            setTool(e.target.value);
            setToken("none");
            setMsg(null);
          }}
          className="mt-1 block w-full rounded-lg border border-white/10 bg-base-950/70 px-3 py-2 font-mono text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent-cyan sm:w-80"
        >
          {Object.keys(TOOL_RISK).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-xs">
        <span className="rounded-md border px-2 py-1" style={{ borderColor: `${RISK_COLOR[risk]}66`, color: RISK_COLOR[risk] }}>
          risk: {risk}
        </span>
        <span aria-hidden="true" className="text-slate-600">→</span>
        <span className="rounded-md border border-white/15 px-2 py-1 text-white">{decision}</span>
      </div>
      {decision === "AUTO_EXECUTE" && <Verdict kind="ok">Low risk: runs automatically, then validated and audited.</Verdict>}
      {decision === "BLOCKED" && <Verdict kind="blocked">Hard-blocked. No approval can unlock it; it needs manual, out-of-band action.</Verdict>}
      {decision === "APPROVAL_REQUIRED" && (
        <div className="mt-3">
          <p className="text-sm text-slate-300">The agent pauses and persists an approval request with a single-use token.</p>
          <DemoButtons>
            <RunButton onClick={approve}>{token === "used" ? "Approve again (replay)" : "Approve as human"}</RunButton>
          </DemoButtons>
          {msg && <Verdict kind={msg.startsWith("Rejected") ? "rejected" : "ok"}>{msg}</Verdict>}
        </div>
      )}
    </div>
  );
}

const FAILURES = [
  { id: "schema", label: "Schema drift", detector: "detectors/schema_drift.py", signal: "new field in orders.raw not in the registered schema", plan: ["compare_schema_versions", "apply_safe_config_patch"] },
  { id: "poison", label: "Poison message", detector: "stream validator → pipeline.dlq", signal: "record fails validation and lands in the DLQ", plan: ["get_recent_pipeline_errors", "quarantine_message"] },
  { id: "lag", label: "Consumer lag", detector: "detectors/kafka_lag.py", signal: "consumer group lag above threshold", plan: ["get_kafka_consumer_lag", "change_flink_parallelism"] },
  { id: "airflow", label: "Airflow task failure", detector: "detectors/airflow_failure.py", signal: "order_data_quality_dag run failed", plan: ["get_airflow_task_logs", "rerun_airflow_task"] },
];

function MonitoringDemo() {
  const delay = useStepDelay();
  const { run, running } = useRunner();
  const [sel, setSel] = useState<(typeof FAILURES)[number] | null>(null);
  const [stage, setStage] = useState(0);

  const inject = (f: (typeof FAILURES)[number]) =>
    run(async (alive) => {
      track("lab_demo_run", { demo: "monitoring", variant: f.id });
      setSel(f);
      for (let i = 1; i <= 3; i++) {
        if (!alive()) return;
        setStage(i);
        await wait(delay);
      }
    });

  return (
    <div>
      <p className="text-xs text-slate-400">Inject a failure into the simulated order pipeline:</p>
      <DemoButtons>
        {FAILURES.map((f) => (
          <RunButton key={f.id} onClick={() => inject(f)} disabled={running} secondary={sel?.id !== f.id}>
            {f.label}
          </RunButton>
        ))}
      </DemoButtons>
      {sel && (
        <ol className="mt-3 space-y-2 text-sm">
          <Stage n={1} on={stage >= 1} title="Detected deterministically" body={`${sel.detector}: ${sel.signal}`} />
          <Stage n={2} on={stage >= 2} title="Example repair plan (proposed by the LLM)" body={sel.plan.join(" → ")} />
          <Stage
            n={3}
            on={stage >= 3}
            title="Policy decision"
            body={sel.plan.map((t) => `${t}: ${DECISION[TOOL_RISK[t]]}`).join(" · ")}
          />
        </ol>
      )}
    </div>
  );
}

const AUDIT_EVENTS = [
  "CANARY_STARTED",
  "CANARY_VALIDATION_PASSED",
  "CANARY_EXPANDED",
  "REPAIR_COMPLETED",
  "…",
  "INCIDENT_RESOLVED",
];

function ObservabilityDemo() {
  const delay = useStepDelay();
  const { run, running } = useRunner();
  const [shown, setShown] = useState(0);
  const [llmCalls, setLlmCalls] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [seen, setSeen] = useState(false);

  const replay = () =>
    run(async (alive) => {
      track("lab_demo_run", { demo: "observability", variant: "audit" });
      for (let i = 1; i <= AUDIT_EVENTS.length; i++) {
        if (!alive()) return;
        setShown(i);
        await wait(delay * 0.7);
      }
    });

  const incident = () => {
    if (seen) setSkipped((s) => s + 1);
    else {
      setLlmCalls((c) => c + 2);
      setSeen(true);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Audit trail (event sequence from the repo)</p>
        <DemoButtons>
          <RunButton onClick={replay} disabled={running}>Replay a MEDIUM-risk repair</RunButton>
        </DemoButtons>
        <ul className="mt-2 space-y-1 font-mono text-xs">
          {AUDIT_EVENTS.slice(0, shown).map((e, i) => (
            <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="text-emerald-300">
              {e}
            </motion.li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">LLM cost protection</p>
        <DemoButtons>
          <RunButton onClick={incident}>Raise identical incident</RunButton>
          <RunButton
            secondary
            onClick={() => {
              setLlmCalls(0);
              setSkipped(0);
              setSeen(false);
            }}
          >
            Reset
          </RunButton>
        </DemoButtons>
        <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-xs">
          <div className="rounded-lg border border-white/10 p-2">
            <p className="text-slate-400">llm invocations</p>
            <p className="text-lg text-white">{llmCalls}</p>
          </div>
          <div className="rounded-lg border border-white/10 p-2">
            <p className="text-slate-400">dedup skips</p>
            <p className="text-lg text-white">{skipped}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          A repeat incident with the same evidence signature skips the diagnose and plan calls. Counters are illustrative.
        </p>
      </div>
    </div>
  );
}

const TEST_GROUPS = [
  { group: "MCP server", files: ["test_mcp_server.py", "test_tool_permissions.py"] },
  { group: "Policy & approvals", files: ["test_policy_engine.py", "test_notification_approval_link_qa.py"] },
  { group: "Detection", files: ["test_schema_drift.py", "test_data_quality.py", "test_incident_dedup.py"] },
  { group: "LLM & evaluation", files: ["test_mock_llm_structured_output.py", "test_eval_harness.py"] },
  { group: "End to end", files: ["test_e2e.py", "test_advanced_features.py", "test_health_endpoint.py"] },
];

function TestingDemo() {
  const delay = useStepDelay();
  const { run, running } = useRunner();
  const all = TEST_GROUPS.flatMap((g) => g.files);
  const [ticked, setTicked] = useState(0);

  const replay = () =>
    run(async (alive) => {
      track("lab_demo_run", { demo: "testing", variant: "replay" });
      for (let i = 1; i <= all.length; i++) {
        if (!alive()) return;
        setTicked(i);
        await wait(delay * 0.35);
      }
    });

  return (
    <div>
      <div className="flex flex-wrap gap-4 font-mono text-sm">
        <span><span className="text-2xl font-bold text-white">121</span> <span className="text-slate-400">pytest tests</span></span>
        <span><span className="text-2xl font-bold text-white">63</span> <span className="text-slate-400">of them for MCP</span></span>
      </div>
      <DemoButtons>
        <RunButton onClick={replay} disabled={running}>Walk through the suite</RunButton>
      </DemoButtons>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TEST_GROUPS.map((g) => (
          <div key={g.group} className="rounded-lg border border-white/10 p-3">
            <p className="text-xs font-semibold text-slate-300">{g.group}</p>
            <ul className="mt-1.5 space-y-1 font-mono text-[11px]">
              {g.files.map((f) => {
                const on = all.indexOf(f) < ticked;
                return (
                  <li key={f} className={`flex items-center gap-1.5 ${on ? "text-emerald-300" : "text-slate-400"}`}>
                    {on ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : <Circle className="h-3 w-3" aria-hidden="true" />}
                    <a href={repoFile(`backend/app/tests/${f}`)} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {f}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        A walkthrough of the real test files, not a test run. Per the repo README, the suite passes with pytest against
        real Postgres and Kafka; DB-backed tests are skipped without them.
      </p>
    </div>
  );
}

/* ---------------------------- concept list ---------------------------- */

const CONCEPTS: Concept[] = [
  {
    id: "orchestration",
    label: "Agent orchestration",
    icon: GitBranch,
    title: "An agent graph with guardrails at every hop",
    explain:
      "PipelineMedic runs incidents through a fixed graph. The LLM only diagnoses and plans; detection, risk scoring, validation, and rollback are deterministic code.",
    evidence: [{ label: "backend/app/agents/graph.py", href: repoFile("backend/app/agents/graph.py") }],
    Demo: OrchestrationDemo,
  },
  {
    id: "mcp",
    label: "MCP server",
    icon: Network,
    title: "The same typed tools, exposed over the Model Context Protocol",
    explain:
      "Any MCP client can discover and call the tools over stdio. Because external clients skip the agent graph, the server enforces hard-blocks, policy, and approvals itself.",
    evidence: [
      { label: "backend/app/mcp_server.py", href: repoFile("backend/app/mcp_server.py") },
      { label: "docs/mcp-tools.md", href: repoFile("docs/mcp-tools.md") },
    ],
    Demo: McpDemo,
  },
  {
    id: "tool-calling",
    label: "LLM tool calling",
    icon: Wrench,
    title: "Models propose; typed schemas decide",
    explain:
      "Every tool has a Pydantic input and output model. A malformed or destructive call is rejected before anything touches the pipeline.",
    evidence: [{ label: "backend/app/tools/kafka_tools.py", href: repoFile("backend/app/tools/kafka_tools.py") }],
    Demo: ToolCallingDemo,
  },
  {
    id: "rag-eval",
    label: "RAG evaluation",
    icon: Bot,
    title: "Check the judge before trusting the judge",
    explain:
      "RAG Sentinel validated its LLM judge against human labels using Cohen's kappa before using it to compare prompt and embedding setups.",
    evidence: [{ label: "RAG Sentinel case study (resume-sourced, no public repo)", href: "/projects/rag-sentinel" }],
    Demo: KappaDemo,
  },
  {
    id: "approval",
    label: "Human approval",
    icon: ShieldCheck,
    title: "Risk-based autonomy with single-use approvals",
    explain:
      "One YAML policy maps every tool to a risk level. LOW runs automatically, MEDIUM and HIGH wait for a human, CRITICAL is blocked in code no matter what.",
    evidence: [
      { label: "backend/app/policies/autonomy_policy.yaml", href: repoFile("backend/app/policies/autonomy_policy.yaml") },
      { label: "backend/app/services/approval_tokens.py", href: repoFile("backend/app/services/approval_tokens.py") },
    ],
    Demo: ApprovalDemo,
  },
  {
    id: "monitoring",
    label: "Pipeline monitoring",
    icon: Radar,
    title: "Deterministic detectors, never guessed by an LLM",
    explain:
      "Each failure mode has its own detector over Kafka, the DLQ, Flink, and Airflow. Only after detection does the LLM get involved.",
    evidence: [{ label: "backend/app/detectors/", href: `${REPO}/tree/HEAD/backend/app/detectors` }],
    Demo: MonitoringDemo,
  },
  {
    id: "observability",
    label: "AI observability",
    icon: Activity,
    title: "Every decision leaves a trace",
    explain:
      "Lifecycle transitions, tool calls, and decisions go to a Postgres audit log; Prometheus metrics and LLM usage counters are exposed by the API.",
    evidence: [
      { label: "backend/app/observability/", href: `${REPO}/tree/HEAD/backend/app/observability` },
      { label: "backend/app/agents/cost_tracking.py", href: repoFile("backend/app/agents/cost_tracking.py") },
    ],
    Demo: ObservabilityDemo,
  },
  {
    id: "testing",
    label: "Automated testing",
    icon: TestTube2,
    title: "Evidence that it works",
    explain: "Unit, MCP, policy, and DB-backed end-to-end tests cover the lifecycle the agent runs.",
    evidence: [{ label: "backend/app/tests/", href: `${REPO}/tree/HEAD/backend/app/tests` }],
    Demo: TestingDemo,
  },
];

export function AILab() {
  const reducedMotion = useReducedMotion();
  const [activeId, setActiveId] = useState(CONCEPTS[0].id);
  const active = CONCEPTS.find((c) => c.id === activeId)!;
  const { Demo } = active;

  return (
    <section id="ai-lab" className="section-shell py-16 sm:py-24">
      <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeUpVariants(reducedMotion)}>
        <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-teal">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
          03 · AI Lab
        </p>
        <h2 className="mt-4 font-hero text-4xl font-black leading-[0.98] tracking-[-0.03em] text-white sm:text-6xl">How these systems <span className="text-teal">actually work</span></h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
          Eight hands-on demos of the ideas behind PipelineMedic AI and RAG Sentinel, each tied to the real file it&apos;s
          based on.
        </p>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/[0.06] px-3 py-1 text-[11px] text-amber-200/90">
          Simulated: these run in your browser. No live models, pipelines, or agents are called.
        </p>
      </motion.div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[15rem_1fr]">
        <div
          role="tablist"
          aria-label="AI Lab concepts"
          aria-orientation="vertical"
          onKeyDown={(e) => {
            const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"];
            if (!keys.includes(e.key)) return;
            e.preventDefault();
            const focusedId = document.activeElement?.id.replace("lab-tab-", "");
            const i = CONCEPTS.findIndex((c) => c.id === (focusedId || activeId));
            const n = CONCEPTS.length;
            const next =
              e.key === "Home" ? 0 : e.key === "End" ? n - 1 : e.key === "ArrowDown" || e.key === "ArrowRight" ? (i + 1) % n : (i - 1 + n) % n;
            setActiveId(CONCEPTS[next].id);
            document.getElementById(`lab-tab-${CONCEPTS[next].id}`)?.focus();
          }}
          className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {CONCEPTS.map((c) => {
            const Icon = c.icon;
            const selected = c.id === activeId;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                id={`lab-tab-${c.id}`}
                aria-selected={selected}
                aria-controls="lab-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveId(c.id)}
                className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                  selected
                    ? "border-accent-cyan/40 bg-accent-cyan/10 text-white"
                    : "border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {c.label}
              </button>
            );
          })}
        </div>

        <div
          id="lab-panel"
          role="tabpanel"
          aria-labelledby={`lab-tab-${active.id}`}
          className="glass-panel min-w-0 rounded-2xl p-5 sm:p-6"
        >
          <div className="relative z-10">
            <h3 className="font-display text-xl font-semibold text-white">{active.title}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">{active.explain}</p>
            <div className="mt-5" key={active.id}>
              <Demo />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 pt-3 text-xs text-slate-400">
              <span>Based on:</span>
              {active.evidence.map((e) =>
                e.href ? (
                  <a
                    key={e.label}
                    href={e.href}
                    target={e.href.startsWith("http") ? "_blank" : undefined}
                    rel={e.href.startsWith("http") ? "noopener noreferrer" : undefined}
                    className="inline-flex items-center gap-1 font-mono text-slate-300 hover:text-white"
                  >
                    {e.label}
                    {e.href.startsWith("http") && <ExternalLink className="h-3 w-3" aria-hidden="true" />}
                  </a>
                ) : (
                  <span key={e.label}>{e.label}</span>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ primitives ------------------------------ */

function DemoButtons({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex flex-wrap gap-2">{children}</div>;
}

function RunButton({
  children,
  onClick,
  disabled,
  secondary,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
        secondary
          ? "border border-white/15 text-slate-300 hover:bg-white/10"
          : "bg-accent-cyan text-base-950 hover:bg-cyan-300"
      }`}
    >
      {!secondary && (disabled ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />)}
      {children}
    </button>
  );
}

function LogPane({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-base-950/70 p-3 font-mono text-[11px] leading-relaxed text-slate-300" aria-live="polite">
      {lines.map((l, i) => (
        <p key={i}>
          <span className="text-slate-600">{String(i + 1).padStart(2, "0")} </span>
          {l}
        </p>
      ))}
    </div>
  );
}

function CodePane({ title, value, raw }: { title: string; value: unknown; raw?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-base-950/70">
      <p className="border-b border-white/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-400">{title}</p>
      <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-cyan-100">
        {raw ? String(value) : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function Verdict({ kind, children }: { kind: "ok" | "rejected" | "blocked"; children: ReactNode }) {
  const styles = {
    ok: "border-emerald-400/30 bg-emerald-400/5 text-emerald-200",
    rejected: "border-amber-300/30 bg-amber-300/5 text-amber-100",
    blocked: "border-rose-400/30 bg-rose-400/5 text-rose-200",
  }[kind];
  const Icon = kind === "ok" ? CheckCircle2 : XCircle;
  return (
    <p className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${styles}`} role="status">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}

function Stage({ n, on, title, body }: { n: number; on: boolean; title: string; body: string }) {
  return (
    <li className={`rounded-lg border p-3 transition-opacity ${on ? "border-white/15 opacity-100" : "border-white/5 opacity-30"}`}>
      <p className="text-xs font-semibold text-slate-200">
        {n}. {title}
      </p>
      <p className="mt-0.5 font-mono text-[11px] text-slate-400">{body}</p>
    </li>
  );
}
