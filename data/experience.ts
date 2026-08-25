export type ExperienceEntry = {
  id: string;
  role: string;
  company: string;
  location: string;
  period: string;
  current?: boolean;
  tech: string[];
  summary: string;
  bullets: string[];
};

// Most recent first, per brief.
export const experience: ExperienceEntry[] = [
  {
    id: "mercury",
    role: "Software Engineer",
    company: "Mercury",
    location: "Remote, USA",
    period: "Oct 2025 – Jul 2026",
    current: false,
    tech: ["AWS (ECS, S3, SQS/SNS, Lambda, CloudWatch)", "OpenAI API", "CI/CD"],
    summary:
      "Designed fault-tolerant, high-throughput AWS event-ingestion infrastructure for a fintech platform.",
    bullets: [
      "Designed a fault-tolerant, distributed event-ingestion service on AWS with idempotent writes and dead-letter replay, sustaining 99.9% write availability across 8x traffic bursts.",
      "Reduced MTTR by 40% by redesigning failure-recovery logic with exponential backoff and documenting recovery procedures per failure mode.",
      "Built an AI-powered test-generation system in CI that synthesizes edge cases from schema definitions across 3 services, cutting development time by 60%.",
      "Instrumented CloudWatch multi-signal observability and anomaly-detection alarms, cutting mean incident detection time from hours to minutes and shifting the team from reactive to proactive response.",
    ],
  },
  {
    id: "rowan-acm",
    role: "Backend Engineer (Contract)",
    company: "Rowan ACM Engineering",
    location: "Remote, USA",
    period: "Jun 2025 – Oct 2025",
    tech: ["Python", "FastAPI", "LangChain", "OpenAI Vision", "AWS ECS/Lambda", "GitHub Actions"],
    summary:
      "Built a multi-tenant conversational AI / RAG backend from the ground up, with strict per-tenant isolation and aggressive latency optimization.",
    bullets: [
      "Architected a multi-tenant conversational AI backend (LangChain + RAG) serving 200+ concurrent tenants with per-tenant FAISS namespace isolation and zero cross-tenant data leaks.",
      "Cut redundant OpenAI calls by 62% with a SHA-256 query-fingerprint cache, dropping average latency from 1.8s to 680ms.",
      "Converted synchronous LLM calls to an async FastAPI service with connection pooling and backpressure, lowering p95 latency from 120s to under 60s.",
      "Used OpenAI Vision in a multi-stage retrieval pipeline (exact, full-text, regex, fuzzy matching) to map unstructured restaurant menu data to 18,000+ SKUs at 90%+ accuracy.",
      "Deployed a RAGAS evaluation harness that catches LLM quality/faithfulness drops before user impact, wired to automatic rollback in the release pipeline.",
    ],
  },
  {
    id: "roothoot",
    role: "Software Developer",
    company: "Roothoot Pvt Ltd",
    location: "Hyderabad, India",
    period: "Sep 2022 – Aug 2023",
    tech: ["Kafka", "Flink", "Spring Boot", "Airflow", "AWS CloudWatch"],
    summary:
      "Tuned streaming pipelines and REST services for throughput and latency, and automated operational workflows.",
    bullets: [
      "Built Kafka and Flink streaming pipelines with tuned checkpointing and backpressure handling, improving throughput by 30% and cutting retry rates by 35%.",
      "Reduced P95 latency by 25% on Spring Boot REST services through SQL/index tuning and caching.",
      "Automated Airflow ETL workflows with retry/alerting logic, cutting manual operational effort by 40%.",
      "Built CloudWatch dashboards for offsets, lag, and failure signatures, cutting incident triage time by 50%.",
    ],
  },
];
