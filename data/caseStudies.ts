// Long-form case-study content for /projects/[id]. Sources:
// - PipelineMedic AI: the public repo's README and docs/ (verified 2026-10-30).
// - RAG Sentinel, AWS Streaming, RetailBench: Lohith_Resume_Base.pdf only. No
//   public repo exists, and the pages say so. Do not add numbers beyond these.

export type CaseStudy = {
  /** One line on where the facts come from, shown on the page. */
  source: string;
  sourceKind: "repo" | "resume";
  stats: { value: string; label: string }[];
  /** One entry per "→" step in the project's `architecture` string. */
  stepDetails: string[];
  decisions: { title: string; body: string }[];
  evidence: { label: string; href?: string }[];
  limitations: string[];
};

const PM = "https://github.com/LOHITHK22/PipelineMedic-AI";

export const caseStudies: Record<string, CaseStudy> = {
  "pipelinemedic-ai": {
    source: "Verified against the public repository's README and docs.",
    sourceKind: "repo",
    stats: [
      { value: "17", label: "typed executable tools" },
      { value: "5", label: "destructive tools hard-blocked" },
      { value: "121", label: "pytest tests" },
      { value: "63", label: "MCP tests" },
    ],
    stepDetails: [
      "An order pipeline: a producer writes to orders.raw, a stream validator (a PyFlink job, or a Python fallback) routes records to orders.validated or pipeline.dlq, and an Airflow DAG runs data-quality checks on Postgres.",
      "Detectors for schema drift, poison messages, Kafka consumer lag, Airflow task failures, and Flink job failures. Detection is plain code. An LLM never decides whether something is broken.",
      "A pluggable provider (mock, OpenAI, or Azure OpenAI) returns a structured diagnosis. Similar past incidents and preceding system events, like a deployment, are passed in as context but never override the evidence.",
      "The LLM proposes a repair plan made of typed tool calls, each validated against a Pydantic input schema.",
      "A deterministic policy engine scores risk from one YAML file. LOW auto-executes; MEDIUM and HIGH wait for durable human approval (dashboard, API, or a signed one-click link); CRITICAL is blocked in code.",
      "After a canary re-measurement, recovery is validated independently. If the pipeline is still unhealthy, the change is rolled back.",
      "The same tools are served over a standards-compliant MCP server (official Python SDK, stdio) with server-side policy enforcement, persisted single-use approvals, and redacted audit logging.",
    ],
    decisions: [
      {
        title: "Keep the LLM out of detection",
        body: "Failures are found by deterministic detectors. The model only explains and plans, so a hallucination can't invent an incident.",
      },
      {
        title: "One policy file, plus a hard-block in code",
        body: "Every tool's risk lives in autonomy_policy.yaml, and the five destructive tools are also blocked by a code literal, so editing the YAML can't unlock them.",
      },
      {
        title: "Enforce policy inside the MCP server too",
        body: "External MCP clients never pass through the agent graph, so the server itself checks hard-blocks, arguments, policy, and approvals before running anything.",
      },
      {
        title: "Validate independently, then roll back",
        body: "A repair isn't done when the tool returns. Recovery is re-measured, and a failed repair triggers rollback.",
      },
      {
        title: "Cap LLM spend",
        body: "Invocations and estimated tokens are tracked, and a repeat incident with the same evidence signature skips the second diagnosis call.",
      },
    ],
    evidence: [
      { label: "Repository", href: PM },
      { label: "docs/architecture.md", href: `${PM}/blob/HEAD/docs/architecture.md` },
      { label: "docs/safety-model.md", href: `${PM}/blob/HEAD/docs/safety-model.md` },
      { label: "docs/mcp-tools.md", href: `${PM}/blob/HEAD/docs/mcp-tools.md` },
      { label: "docs/limitations.md", href: `${PM}/blob/HEAD/docs/limitations.md` },
    ],
    limitations: [
      "Only the mock LLM provider is verified end to end. The OpenAI and Azure providers are coded against structured outputs but weren't run without API keys.",
      "\"Canary\" is a re-measurement gate, not literal traffic splitting.",
      "MCP Inspector is verified; the Claude Desktop, Cursor, and Claude Code configurations are provided but not verified.",
      "The repo documents a known dedup-key collision in the poison-message detector that isn't fixed yet.",
    ],
  },
  "rag-sentinel": {
    source: "From the resume. There's no public repository yet.",
    sourceKind: "resume",
    stats: [
      { value: "0.82", label: "Cohen's kappa vs. humans" },
      { value: "1,000", label: "human-annotated responses" },
      { value: "12%", label: "relative faithfulness drop (multi-part)" },
      { value: "0.89", label: "ROC-AUC, hallucination risk" },
    ],
    stepDetails: [
      "Answers from a RAG system are the unit being evaluated.",
      "Before trusting the judge, its verdicts were compared with 1,000 human-annotated responses: 0.82 Cohen's kappa, with the weakest agreement on multi-hop questions.",
      "With the judge validated, 4 prompt and embedding setups were A/B tested. Multi-part questions showed a 12% relative drop in faithfulness.",
      "An XGBoost classifier predicts hallucination risk at 0.89 ROC-AUC, with SHAP values explaining what drives each prediction.",
      "PSI and KS tests flag when inputs or scores drift away from the reference distribution.",
    ],
    decisions: [
      { title: "Validate the judge first", body: "An LLM judge is only useful if it agrees with people, so agreement was measured with kappa before any comparisons." },
      { title: "Report weak spots, not one average", body: "Breaking results down by question type surfaced the multi-hop and multi-part weaknesses." },
      { title: "Make risk explainable", body: "SHAP turns the classifier from a score into reasons someone can act on." },
      { title: "Watch for drift", body: "PSI and KS checks catch when yesterday's evaluation stops describing today's traffic." },
    ],
    evidence: [{ label: "Resume (PDF)", href: "/Lohith_Kovuri_Resume.pdf" }],
    limitations: ["No public repository yet, so these numbers can't be independently checked from this site."],
  },
  "aws-streaming-platform": {
    source: "From the resume. There's no public repository yet.",
    sourceKind: "resume",
    stats: [
      { value: "4", label: "data layers" },
      { value: "Kimball", label: "reporting model" },
      { value: "Iceberg", label: "table format" },
    ],
    stepDetails: [
      "Streaming events arrive on Kafka.",
      "Events land in an S3 landing zone.",
      "Raw data is stored in Apache Iceberg tables.",
      "Glue PySpark jobs validate records, drop duplicates, load increments, and quarantine bad records instead of failing the run.",
      "Cleaned data is written to the processed layer.",
      "A Kimball dimensional model serves reporting.",
      "Analysts query through Athena and dbt; Airflow runs the jobs and data checks, and Terraform defines the infrastructure.",
    ],
    decisions: [
      { title: "Layered zones", body: "Landing, raw, processed, and reporting layers keep the original data replayable and each transformation inspectable." },
      { title: "Quarantine, don't crash", body: "Bad records are set aside with their errors so one bad batch doesn't block the pipeline." },
      { title: "Infrastructure as code", body: "Terraform makes the whole platform reproducible." },
    ],
    evidence: [{ label: "Resume (PDF)", href: "/Lohith_Kovuri_Resume.pdf" }],
    limitations: ["No public repository yet. No throughput or cost numbers are claimed."],
  },
  retailbench: {
    source: "From the resume. There's no public repository yet.",
    sourceKind: "resume",
    stats: [
      { value: "100+ GB", label: "TPC-H benchmark data" },
      { value: "24.6 → 13.8", label: "minutes per run" },
      { value: "44%", label: "faster" },
    ],
    stepDetails: [
      "Over 100 GB of data from TPC-H, a standard decision-support benchmark.",
      "PySpark on EMR does the heavy lifting. Tuning partitioning, switching to broadcast joins for small dimensions, and handling skewed keys cut runtime from 24.6 to 13.8 minutes.",
      "Glue is part of the pipeline's processing.",
      "Data lands in a dimensional model in Redshift, with Airflow in the pipeline.",
    ],
    decisions: [
      { title: "Partition for the workload", body: "Partition counts and keys were tuned to the job instead of left at defaults." },
      { title: "Broadcast small tables", body: "Broadcasting small dimension tables avoids expensive shuffles in joins." },
      { title: "Handle skew explicitly", body: "Skewed keys were addressed so a few hot partitions don't stall the whole stage." },
    ],
    evidence: [{ label: "Resume (PDF)", href: "/Lohith_Kovuri_Resume.pdf" }],
    limitations: ["No public repository yet, so the runtime numbers can't be independently checked from this site."],
  },
};
