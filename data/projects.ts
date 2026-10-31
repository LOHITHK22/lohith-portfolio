export type FlagshipProject = {
  id: string;
  name: string;
  tagline: string;
  problem: string;
  solution: string;
  /** Steps separated by "→" — rendered as a step-flow diagram, not prose. */
  architecture: string;
  tech: string[];
  challenge: string;
  impact: string;
  githubUrl?: string;
  featured?: boolean;
};

// The 4 flagship case studies, matching the Personal Projects section of
// Lohith_Resume_Base.pdf. Links are omitted (not guessed) for projects
// without a public repo.
export const flagshipProjects: FlagshipProject[] = [
  {
    id: "pipelinemedic-ai",
    name: "PipelineMedic AI",
    tagline: "Pipeline repair agent: deterministic detectors find the failure, an LLM proposes the fix, a human approves the risky ones",
    problem:
      "Streaming pipelines break in predictable ways (schema drift, poison messages, consumer lag, failed tasks), and letting an LLM fix production data on its own is too risky to trust.",
    solution:
      "A Python and FastAPI agent for a Kafka, Flink, PostgreSQL, and Airflow pipeline. Deterministic detectors flag the failure before any LLM is involved, the LLM diagnoses the cause and proposes a typed repair plan, and a risk policy runs low-risk repairs automatically while routing riskier ones to a human.",
    architecture:
      "Kafka / Flink / Airflow pipeline → Deterministic detectors (schema drift, poison messages, consumer lag, task failures) → LLM diagnosis → Typed repair plan → Risk policy (auto-run low risk, human approval for high risk) → Validate repair, roll back on failure → MCP server (17 typed tools, audit log)",
    tech: ["Python", "FastAPI", "Kafka", "Flink", "PostgreSQL", "Airflow", "LLM APIs", "MCP (Python SDK)", "pytest"],
    challenge:
      "Keeping the LLM out of detection entirely and putting a risk policy, single-use approvals, and rollback between its suggestions and the real pipeline.",
    impact:
      "Every repair is validated and rolled back if it fails; 17 typed tools exposed through an MCP server (official Python SDK, stdio) with single-use approvals, audit logging, and 63 MCP tests.",
    githubUrl: "https://github.com/LOHITHK22/PipelineMedic-AI",
    featured: true,
  },
  {
    id: "rag-sentinel",
    name: "RAG Sentinel",
    tagline: "LLM evaluation framework: a validated LLM judge, prompt A/B tests, and a hallucination-risk classifier with drift monitoring",
    problem:
      "RAG systems are often judged by another LLM that nobody has checked against humans, and quality can quietly slip when prompts, embeddings, or traffic change.",
    solution:
      "An evaluation framework that first validates the LLM judge against human labels, then uses it to A/B test prompt and embedding setups, and adds an XGBoost hallucination-risk classifier with SHAP explanations plus a drift monitor.",
    architecture:
      "RAG responses → LLM judge (validated on 1,000 human-annotated responses) → A/B tests across 4 prompt and embedding setups → XGBoost hallucination-risk classifier + SHAP → PSI and KS drift monitor",
    tech: ["Python", "XGBoost", "SHAP", "LLM APIs", "A/B testing"],
    challenge:
      "Proving the judge is trustworthy before using it, and finding where it is weakest (multi-hop questions) instead of reporting one average score.",
    impact:
      "0.82 Cohen's kappa between the LLM judge and human labels; found a 12% relative faithfulness drop on multi-part questions; hallucination-risk classifier at 0.89 ROC-AUC.",
    featured: true,
  },
  {
    id: "aws-streaming-platform",
    name: "AWS Streaming Data Platform",
    tagline: "Kafka to S3/Iceberg lakehouse with layered zones, Glue PySpark jobs, and a Kimball model in Athena and dbt",
    problem:
      "Streaming events need to land reliably, get cleaned and deduplicated, and end up in a model analysts can actually query, without bad records silently breaking reports.",
    solution:
      "A Kafka-to-S3/Iceberg pipeline across landing, raw, processed, and reporting layers. Glue PySpark jobs validate records, drop duplicates, and load increments, with Airflow checks, error quarantine, and Terraform for the infrastructure.",
    architecture:
      "Kafka → S3 landing → Raw (Iceberg) → Glue PySpark (validate, dedupe, incremental load, quarantine errors) → Processed → Reporting (Kimball model) → Athena + dbt, orchestrated by Airflow, provisioned with Terraform",
    tech: ["Kafka", "PySpark", "Iceberg", "AWS Glue", "S3", "Athena", "Airflow", "dbt", "Terraform"],
    challenge:
      "Making incremental loads and deduplication correct across layers while quarantining bad records instead of failing the whole run.",
    impact:
      "End-to-end layered pipeline from Kafka to a Kimball reporting model, with Airflow data checks and error quarantine, fully defined in Terraform.",
    featured: true,
  },
  {
    id: "retailbench",
    name: "RetailBench Data Platform",
    tagline: "PySpark on EMR over 100+ GB of TPC-H data into a dimensional Redshift warehouse, tuned 44% faster",
    problem:
      "Spark jobs over large benchmark datasets run slowly when partitioning, joins, and skewed keys are left at their defaults.",
    solution:
      "A PySpark pipeline on EMR for 100+ GB of TPC-H benchmark data that loads a dimensional Redshift warehouse, built with Airflow and Glue, then tuned for runtime.",
    architecture:
      "TPC-H data (100+ GB) → PySpark on EMR (partitioning, broadcast joins, skew handling) → Glue → Dimensional model in Redshift, with Airflow",
    tech: ["PySpark", "AWS EMR", "Airflow", "AWS Glue", "Amazon Redshift"],
    challenge: "Finding where the job actually spent its time and fixing partitioning, join strategy, and skew.",
    impact: "Cut job runtime from 24.6 to 13.8 minutes (44%) by tuning partitioning, broadcast joins, and skew handling.",
    featured: true,
  },
];

export type SecondaryProject = {
  id: string;
  name: string;
  description: string;
  stack: string;
  whyItMatters: string;
  githubUrl: string;
};

export const secondaryProjects: SecondaryProject[] = [
  {
    id: "vendorops-ai",
    name: "vendorops-ai",
    description: "AI-powered data pipeline for vendor document extraction, validation, storage, and reporting.",
    stack: "Python, FastAPI",
    whyItMatters: "Shows LLM extraction paired with validation rules before anything is stored or reported.",
    githubUrl: "https://github.com/LOHITHK22/vendorops-ai",
  },
  {
    id: "rag-document-chatbot",
    name: "RAG-Powered-Document-Chatbot",
    description:
      "Fully local document Q&A: PDF text extraction, embeddings in FAISS, and a local LLM via Ollama, with cited source passages.",
    stack: "Python",
    whyItMatters: "Shows retrieval end-to-end with no document content leaving the machine.",
    githubUrl: "https://github.com/LOHITHK22/RAG-Powered-Document-Chatbot",
  },
  {
    id: "meeting-intelligence-agent",
    name: "meeting-intelligence-agent",
    description:
      "In-progress AI agent for meetings, split into modules for transcription, extraction, agent orchestration, and memory.",
    stack: "Python",
    whyItMatters: "Shows current hands-on work with agent architecture.",
    githubUrl: "https://github.com/LOHITHK22/meeting-intelligence-agent",
  },
];

export const viewAllReposUrl = "https://github.com/LOHITHK22?tab=repositories";

// Top 3 projects for Recruiter Mode / Career Fair Mode condensed views.
export const topProjectIds = ["pipelinemedic-ai", "rag-sentinel", "aws-streaming-platform"];

export const topProjects = flagshipProjects.filter((p) => topProjectIds.includes(p.id));
