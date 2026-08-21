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

// The 6 flagship engineering case studies. Links are omitted entirely (not
// guessed) for projects the brief marks as closed-source / no public repo.
export const flagshipProjects: FlagshipProject[] = [
  {
    id: "ai-code-review-agent",
    name: "AI Code Review Agent",
    tagline: "Multi-tool agentic code reviewer wired into GitHub Actions — recovers mid-chain instead of restarting",
    problem:
      "Manual code review doesn't scale with PR volume, and most \"AI code review\" tools are single-shot LLM calls with no way to recover if one step fails partway through.",
    solution:
      "A multi-tool agent system — diff retriever, static analyzer, test generator, and PR commenter — with tool-call retry and state checkpointing, so a mid-chain failure resumes from the last completed tool instead of restarting the whole review.",
    architecture:
      "GitHub Actions (on pull_request) → Agent orchestrator (LangGraph, model-agnostic) → Diff retriever → Static analyzer → Test generator → PR commenter → GitHub PR comment API",
    tech: ["Python", "LangGraph", "FastAPI", "OpenAI API", "GitHub Actions"],
    challenge:
      "Keeping the orchestration loop model-agnostic while making a 4-tool agent chain resilient to mid-run failures, via state checkpointing rather than an all-or-nothing retry.",
    impact:
      "Catches 85%+ of seeded defects in benchmark diffs, at under $0.05 per review, running automatically on every pull request.",
    featured: true,
  },
  {
    id: "multi-tenant-rag-api",
    name: "Multi-Tenant RAG API",
    tagline: "Production RAG backend with tenant isolation enforced at the embedding layer",
    problem:
      "Multiple product teams needed a shared LLM/RAG backend, but a single shared vector index risks leaking one tenant's private documents into another tenant's answers, and unmetered LLM calls make cost unpredictable at scale.",
    solution:
      "A production-grade Retrieval-Augmented Generation API where tenant isolation is enforced at the embedding layer itself, not just at the API layer, plus a semantic response cache to cut redundant model calls.",
    architecture:
      "Client → FastAPI (async) → LangChain orchestration → per-tenant FAISS namespace → Redis (semantic cache + per-tenant token budget) → PostgreSQL (metadata) → OpenAI API → RAGAS eval loop (watches live traffic, fires alerts on faithfulness drops)",
    tech: ["Python", "FastAPI", "LangChain", "FAISS", "Redis", "PostgreSQL", "OpenAI API", "RAGAS"],
    challenge:
      "Isolating tenants at the vector-index layer (dedicated FAISS namespace per tenant, not a filtered query on a shared index) while keeping p95 latency low under concurrent multi-tenant load.",
    impact:
      "200+ concurrent tenants, zero cross-tenant data access under stress testing, 62% fewer redundant OpenAI calls via SHA-256 query fingerprint caching, average latency 1.8s → 680ms.",
    featured: true,
  },
  {
    id: "vendorops-ai",
    name: "VendorOps AI",
    tagline: "Agentic contract & invoice intelligence — LangGraph pipeline with human-in-the-loop gates",
    problem:
      "Vendor documents (contracts, invoices) arrive unstructured across PDFs, CSVs, and email, and need reliable structured extraction with a human check on anything the model isn't confident about.",
    solution:
      "A LangGraph-orchestrated pipeline that ingests documents, extracts structured fields with an LLM (or a mock extractor for offline dev), validates the output against business rules, persists it, and produces operational reports and analytics.",
    architecture:
      "Upload (PDF / CSV / TXT / EML) → Parser (normalizes to text + metadata + pages + tables) → LLM extraction layer (mock or OpenAI) → Validation rules engine → Storage (SQLAlchemy → SQLite / PostgreSQL) → Audit log + Analytics API → React dashboard",
    tech: ["Python", "FastAPI", "LangGraph", "OpenAI API", "MCP", "SQLAlchemy", "PostgreSQL", "Pydantic", "Docker", "React", "TypeScript"],
    challenge:
      "Coordinating a multi-agent pipeline with supervisor retry logic and human-in-the-loop gates on low-confidence extractions, while keeping per-document LLM cost down.",
    impact:
      "90%+ clause-extraction accuracy across 100+ CUAD benchmark contracts; ~60% lower LLM cost per document by routing classification to a small model and reserving frontier-model calls for complex extraction; blocked seeded prompt-injection attempts by isolating untrusted document content and validating structured outputs; exposed as an MCP server so external agents/tools can discover and call its capabilities without hardcoded integrations.",
    githubUrl: "https://github.com/LOHITHK22/vendorops-ai",
    featured: true,
  },
  {
    id: "distributed-job-scheduler",
    name: "Distributed Job Scheduler",
    tagline: "6-state job lifecycle with atomic distributed locks — exactly-once claim semantics",
    problem:
      "A naive job queue lets two workers grab and execute the same job under concurrent load, producing duplicate side effects (double charges, double emails, double writes).",
    solution:
      "A 6-state job-lifecycle scheduler where claims are atomic distributed locks, not database rows you hope nobody else reads first.",
    architecture:
      "Producers enqueue → PostgreSQL job table (SKIP LOCKED polling) → Worker acquires a Redis Redlock distributed claim → executes job → sends heartbeat → on failure/stall, job is auto-requeued or routed to a dead-letter queue with full stack trace → Prometheus scrapes queue depth, heartbeat failures, and latency percentiles",
    tech: ["Python", "FastAPI", "Redis (Redlock)", "PostgreSQL", "Docker", "Kubernetes", "Prometheus"],
    challenge:
      "Guaranteeing exactly-once claim semantics under high worker contention without a single point of failure, and recovering cleanly when a worker dies mid-job.",
    impact: "Zero duplicate executions across load tests; p99 scheduling latency under 200ms at 2,000 jobs/min.",
    featured: true,
  },
  {
    id: "java-kv-store",
    name: "Java Distributed Key-Value Store",
    tagline: "Crash-safe TCP KV server with WAL, snapshotting, and leader-follower replication",
    problem:
      "Wanted to understand, from first principles, how systems like early Redis/etcd guarantee durability and stay consistent across replicas after a crash.",
    solution:
      "A concurrent TCP key-value server built on Java NIO with write-ahead logging, snapshotting, and leader-follower replication.",
    architecture:
      "Clients → TCP listener (NIO selector + thread pool) → in-memory store + write-ahead log → periodic snapshot compaction → replication stream → follower nodes (3-node Docker Compose cluster), with resync logic after a network partition or node restart",
    tech: ["Java", "Java NIO", "Docker Compose"],
    challenge:
      "Crash-safe durability (WAL + snapshotting) combined with follower resynchronization after a partition, without losing any committed write.",
    impact:
      "Benchmarked throughput, P95 latency, and lock contention under concurrency; validated replication, failover, and recovery end-to-end on a 3-node cluster.",
  },
  {
    id: "rag-document-chatbot",
    name: "RAG-Powered Document Chatbot",
    tagline: "Fully local, privacy-preserving document Q&A with cited sources",
    problem:
      "Answering questions over your own PDFs usually means sending private document content to a third-party API — not always acceptable for sensitive documents.",
    solution:
      "A privacy-preserving document chatbot that runs the LLM locally via Ollama, so no document content ever leaves the machine, with source citations on every answer.",
    architecture:
      "PDF upload → PyMuPDF text extraction → chunking + embeddings (sentence-transformers) → FAISS vector index → Streamlit chat UI → local LLM via Ollama (Mistral / Llama 3) → answer with cited source passages and similarity scores",
    tech: ["Python", "PyMuPDF", "sentence-transformers", "FAISS", "Streamlit", "Ollama", "Docker"],
    challenge:
      "Keeping the whole retrieval + generation loop fully local (no external API calls) while still surfacing transparent, cited answers.",
    impact: "Fully local RAG pipeline with cited, similarity-scored answers; MIT licensed and open source.",
    githubUrl: "https://github.com/LOHITHK22/RAG-Powered-Document-Chatbot",
  },
  {
    id: "rust-polars-pipeline",
    name: "High-Throughput Data Pipeline",
    tagline: "Zero-copy Rust ingestion engine processing 1M+ records/hour, instrumented end-to-end with Prometheus",
    problem:
      "Needed a fast, memory-safe way to ingest and process high-volume customer data without the overhead of a garbage-collected runtime, with real visibility into exactly where a pipeline saturates under load.",
    solution:
      "Learned Rust from scratch specifically for the zero-copy memory control a garbage-collected language couldn't offer, then built a modular ingestion engine (Polars for vectorized analysis) with async PostgreSQL writes and Prometheus instrumentation on every stage.",
    architecture:
      "Data source → Rust ingestion engine (Polars, vectorized, zero-copy) → async PostgreSQL writes (SQLx) → Prometheus (query latency, retry rates, buffer utilization) → Tableau dashboards",
    tech: ["Rust", "Polars", "PostgreSQL", "SQLx", "Prometheus", "Tableau"],
    challenge:
      "Learning a new systems language specifically to get compile-time memory safety without garbage collection, then instrumenting every stage closely enough to catch failure modes before they became incidents.",
    impact:
      "1M+ records/hour at under 1% failure rate; caught and resolved 2 connection-pool saturation events under load before they breached write SLAs.",
    githubUrl: "https://github.com/LOHITHK22/rust_data_pipeline",
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
    id: "meeting-intelligence-agent",
    name: "meeting-intelligence-agent",
    description:
      "In-progress AI agent for meetings, split into service-oriented modules (transcription, extraction, agent orchestration, memory).",
    stack: "Python",
    whyItMatters:
      "Shows current hands-on work with agent architecture and service decomposition, actively updated.",
    githubUrl: "https://github.com/LOHITHK22/meeting-intelligence-agent",
  },
  {
    id: "linkedin-post-generator",
    name: "Linkedin-post-generator",
    description:
      "LangChain + Groq-hosted LLaMA app that generates LinkedIn posts (English/Telugu) from topic tags using few-shot prompting, served via Streamlit.",
    stack: "Python",
    whyItMatters: "Shows practical LLM prompting/product work end-to-end, shipped and usable.",
    githubUrl: "https://github.com/LOHITHK22/Linkedin-post-generator",
  },
];

export const viewAllReposUrl = "https://github.com/LOHITHK22?tab=repositories";

// Top 3 projects for Recruiter Mode / Career Fair Mode condensed views —
// kept in sync with the 3 projects on the actual career-fair resume handout.
export const topProjectIds = ["ai-code-review-agent", "vendorops-ai", "rust-polars-pipeline"];

export const topProjects = flagshipProjects.filter((p) => topProjectIds.includes(p.id));
