# Content Brief — Source of Truth

This file is the ONLY source of factual content for the site. Every claim, number, and link on the
site must trace back to something in this file. Do not invent metrics, repos, URLs, employers, or
certifications that aren't listed here. Lohith maintains ~20 resume variants tailored per company with
inconsistent/inflated numbers for the same bullet — this brief already resolved those conflicts by
picking the version supported by the majority of resumes, or by grounding the claim in the actual
GitHub README where a public repo exists. Treat this file as final; do not "improve" the numbers.

## Identity

- Name: Lohith Kovuri
- Email: lohithkovuri321@gmail.com
- Phone (vCard/Save Contact only — do NOT print in plain text anywhere else on the page): +1 (856) 652-4065
- LinkedIn: https://linkedin.com/in/contact-lohithkovuri
- GitHub: https://github.com/LOHITHK22
- Location: Glassboro, NJ, USA — currently working remote (US)
- Work authorization: NOT specified in source material. Do not display a work-authorization line at all
  (do not guess, do not write "authorized to work in the US" or similar).

## Brand / Positioning

- Headline identity: "Software Engineer — Backend, Distributed Systems & AI/LLM Platforms"
- One-line sub-identity (for hero, nav, meta description): "Backend • Distributed Systems • Cloud (AWS) • AI/LLM Platforms"
- Target roles: Software Engineer, Backend Engineer, Full-Stack Engineer, Java Developer, Python Developer,
  Data Engineer, AI/GenAI Engineer, Cloud Engineer, entry-level/early-career SWE roles.
- What he builds (one paragraph, for hero subtext): "I build fault-tolerant backend systems and
  production AI/LLM platforms — event-driven AWS pipelines processing tens of thousands of events a day,
  and multi-tenant RAG systems serving hundreds of concurrent tenants without leaking a byte between them."
- Career-fair tagline (hero, tasteful, not childish): "You scanned my shirt. Here's what I actually ship."
- Recruiter Mode entry CTA copy: "Skip to the 30-second version."

## "Why Me" — 5 evidence-based signals (use verbatim numbers, do not round up further)

1. Operate production AWS infrastructure at Nordstrom (a Fortune 100 retailer) sustaining **99.9% write
   availability** across **50,000+ events/day**, including 8x traffic bursts, with zero data loss.
2. Architected a multi-tenant RAG backend serving **200+ concurrent tenants** with per-tenant vector-store
   isolation — **zero cross-tenant data leaks** in stress testing — while cutting redundant LLM calls by
   **62%** and dropping latency from **1.8s to 680ms**.
3. Took a synchronous LLM pipeline from **p95 latency of 120s down to under 60s** by rebuilding it as an
   async, backpressure-aware FastAPI service.
4. Shipped an agentic document-intelligence pipeline (VendorOps AI, LangGraph, public repo) achieving
   **90%+ clause-extraction accuracy** on the 100+ contract CUAD legal benchmark, at **60% lower LLM cost
   per document** via small/large-model routing.
5. Credentialed on the cloud and data stack he ships on: **AWS Certified Data Engineer – Associate**,
   **AWS Certified Cloud Practitioner**, and **Microsoft Certified: Power BI Data Analyst Associate**.

## Recruiter Mode — 30-second summary (all fields, use exactly this data)

- Who: Lohith Kovuri, Software Engineer
- Degree: M.S. Data Science, Rowan University (2023–2025); B.Tech Information Technology, Dr. MGR
  Educational and Research Institute (2019–2023)
- Current status: Software Engineer at Nordstrom (Remote, USA) since Oct 2025 — production backend +
  AI-assisted testing on retail event-ingestion systems
- Targeting: Software Engineer / Backend Engineer / Full-Stack / Data Engineer / AI-GenAI Engineer /
  Cloud Engineer roles
- Strongest technical skills (pick 8 for the compact recruiter-mode chip list): Python, Java, AWS,
  FastAPI, LangChain/LangGraph, Kafka, PostgreSQL, Docker/Kubernetes
- Top 3 projects: (1) Multi-Tenant RAG API, (2) VendorOps AI, (3) Distributed Job Scheduler
- Certifications: AWS Certified Data Engineer – Associate; AWS Certified Cloud Practitioner; Microsoft
  Certified: Power BI Data Analyst Associate
- Work authorization: not shown (see Identity section — omit, don't guess)
- Location: Glassboro, NJ, USA / open to remote
- Resume download, LinkedIn, GitHub, Email CTA: always present, all four, no digging required

## Education

1. Rowan University — M.S. Data Science (concentration: Statistical ML, Data Engineering) — Glassboro, NJ
   — Sep 2023 – May 2025
2. Dr. MGR Educational and Research Institute — B.Tech Information Technology — Chennai, India —
   Sep 2019 – May 2023

## Certifications (no verification URLs were provided — render as plain cards, no fake Credly links)

1. AWS Certified Data Engineer – Associate — Amazon Web Services
2. AWS Certified Cloud Practitioner — Amazon Web Services
3. Microsoft Certified: Power BI Data Analyst Associate — Microsoft

## Experience Timeline (most recent first)

### Software Engineer — Nordstrom — Remote, USA — Oct 2025 – Present
Tech: AWS (ECS, S3, SQS/SNS, Lambda, CloudWatch), OpenAI API, CI/CD
- Designed and operate a fault-tolerant ECS + SQS + S3 event-ingestion pipeline sustaining **99.9% write
  availability** across **50,000+ events/day**, including 8x traffic bursts, with zero data loss.
- Redesigned the SQS consumer with idempotent processing, deduplication keys, and exponential backoff —
  cut **MTTR by 40%** and eliminated a recurring class of duplicate-write incidents.
- Built an OpenAI-powered test-generation pipeline into CI, closing a full class of schema/input-validation
  gaps across 3 services before they reached production.
- Instrumented CloudWatch multi-signal observability and anomaly-detection alarms, cutting mean incident
  detection time **from hours to minutes** and shifting the team from reactive to proactive response.

### Software / AI Backend Engineer — Rowan ACM Club (MenuMatch AI) — Remote, USA — Jun 2025 – Oct 2025
Tech: Python, FastAPI, LangChain, OpenAI Vision, AWS ECS/Lambda, GitHub Actions
- Architected a multi-tenant conversational AI backend (LangChain + RAG) serving **200+ concurrent
  tenants** with per-tenant FAISS namespace isolation and zero cross-tenant data leaks.
- Cut redundant OpenAI calls by **62%** with a SHA-256 query-fingerprint cache, dropping average latency
  from **1.8s to 680ms**.
- Converted synchronous LLM calls to an async FastAPI service with connection pooling and backpressure,
  lowering **p95 latency from 120s to under 60s**.
- Used OpenAI Vision in a multi-stage retrieval pipeline (exact, full-text, regex, fuzzy matching) to map
  unstructured restaurant menu data to **18,000+ SKUs at 90%+ accuracy**.
- Deployed a RAGAS evaluation harness that catches LLM quality/faithfulness drops before user impact, wired
  to automatic rollback in the release pipeline.

### Software Developer Intern — Roothoot Pvt Ltd — Hyderabad, India — Sep 2022 – Dec 2022
Tech: Kafka, Flink, Spring Boot, Airflow, AWS CloudWatch
- Built Kafka–Flink streaming pipelines with tuned checkpointing and backpressure handling — improved
  throughput by **30%** and cut retry rates by **35%**.
- Reduced **P95 latency by 25%** on Spring Boot REST services through SQL/index tuning and caching.
- Automated Airflow ETL workflows with retry/alerting logic, cutting manual operational effort by **40%**.
- Built CloudWatch dashboards for offsets, lag, and failure signatures, cutting incident triage time by **50%**.

## Flagship Project Case Studies (6) — full detail for Project Showcase

Each needs: Problem / Solution / Architecture / Tech / Engineering Challenge / Impact / Links.
Architecture strings below use `→` and should be rendered as a small step diagram (not prose) per project.

### 1. Multi-Tenant RAG API
- Problem: Multiple product teams needed a shared LLM/RAG backend, but a single shared vector index risks
  leaking one tenant's private documents into another tenant's answers, and unmetered LLM calls make cost
  unpredictable at scale.
- Solution: A production-grade Retrieval-Augmented Generation API where tenant isolation is enforced at the
  embedding layer itself, not just at the API layer, plus a semantic response cache to cut redundant model calls.
- Architecture: Client → FastAPI (async) → LangChain orchestration → per-tenant FAISS namespace →
  Redis (semantic cache + per-tenant token budget) → PostgreSQL (metadata) → OpenAI API → RAGAS eval loop
  (watches live traffic, fires alerts on faithfulness drops)
- Tech: Python, FastAPI, LangChain, FAISS, Redis, PostgreSQL, OpenAI API, RAGAS
- Engineering challenge: Isolating tenants at the vector-index layer (dedicated FAISS namespace per tenant,
  not a filtered query on a shared index) while keeping p95 latency low under concurrent multi-tenant load.
- Impact: 200+ concurrent tenants, zero cross-tenant data access under stress testing, 62% fewer redundant
  OpenAI calls via SHA-256 query fingerprint caching, average latency 1.8s → 680ms.
- Links: none public (built as part of Rowan ACM engineering work — closed source). Do not attach a GitHub link.

### 2. VendorOps AI — Agentic Contract & Invoice Intelligence
- Problem: Vendor documents (contracts, invoices) arrive unstructured across PDFs, CSVs, and email, and
  need reliable structured extraction with a human check on anything the model isn't confident about.
- Solution: A LangGraph-orchestrated pipeline that ingests documents, extracts structured fields with an
  LLM (or a mock extractor for offline dev), validates the output against business rules, persists it, and
  produces operational reports and analytics.
- Architecture (grounded in the real repo): Upload (PDF / CSV / TXT / EML) → Parser (normalizes to text +
  metadata + pages + tables) → LLM extraction layer (mock or OpenAI) → Validation rules engine → Storage
  (SQLAlchemy → SQLite / PostgreSQL) → Audit log + Analytics API → React dashboard. Background job queue
  handles async pipeline execution; Docker Compose + Nginx for deployment.
- Tech: Python, FastAPI, LangGraph, OpenAI API, SQLAlchemy, PostgreSQL, Pydantic, Docker, React
- Engineering challenge: Coordinating a multi-agent pipeline with supervisor retry logic and human-in-the-loop
  gates on low-confidence extractions, while keeping per-document LLM cost down.
- Impact: 90%+ clause-extraction accuracy across 100+ CUAD benchmark contracts; ~60% lower LLM cost per
  document by routing classification to a small model and reserving frontier-model calls for complex
  extraction; blocked seeded prompt-injection attempts by isolating untrusted document content and
  validating structured outputs.
- Links: GitHub → https://github.com/LOHITHK22/vendorops-ai (real, public, verified)

### 3. Distributed Job Scheduler
- Problem: A naive job queue lets two workers grab and execute the same job under concurrent load,
  producing duplicate side effects (double charges, double emails, double writes).
- Solution: A 6-state job-lifecycle scheduler where claims are atomic distributed locks, not database rows
  you hope nobody else reads first.
- Architecture: Producers enqueue → PostgreSQL job table (SKIP LOCKED polling) → Worker acquires a Redis
  Redlock distributed claim → executes job → sends heartbeat → on failure/stall, job is auto-requeued or
  routed to a dead-letter queue with full stack trace → Prometheus scrapes queue depth, heartbeat failures,
  and latency percentiles.
- Tech: Python, FastAPI, Redis (Redlock), PostgreSQL, Docker, Kubernetes, Prometheus
- Engineering challenge: Guaranteeing exactly-once claim semantics under high worker contention without a
  single point of failure, and recovering cleanly when a worker dies mid-job.
- Impact: Zero duplicate executions across load tests; p99 scheduling latency under 200ms at 2,000 jobs/min.
- Links: none public — closed source personal/work project. Do not attach a GitHub link.

### 4. Java Distributed Key-Value Store
- Problem: Wanted to understand, from first principles, how systems like early Redis/etcd guarantee
  durability and stay consistent across replicas after a crash.
- Solution: A concurrent TCP key-value server built on Java NIO with write-ahead logging, snapshotting,
  and leader-follower replication.
- Architecture: Clients → TCP listener (NIO selector + thread pool) → in-memory store + write-ahead log →
  periodic snapshot compaction → replication stream → follower nodes (3-node Docker Compose cluster), with
  resync logic after a network partition or node restart.
- Tech: Java, Java NIO, Docker Compose
- Engineering challenge: Crash-safe durability (WAL + snapshotting) combined with follower resynchronization
  after a partition, without losing any committed write.
- Impact: Benchmarked throughput, P95 latency, and lock contention under concurrency; validated
  replication, failover, and recovery end-to-end on a 3-node cluster.
- Links: none public — closed source personal project. Do not attach a GitHub link.

### 5. RAG-Powered Document Chatbot (open source, real repo)
- Problem: Answering questions over your own PDFs usually means sending private document content to a
  third-party API — not always acceptable for sensitive documents.
- Solution: A privacy-preserving document chatbot that runs the LLM locally via Ollama, so no document
  content ever leaves the machine, with source citations on every answer.
- Architecture: PDF upload → PyMuPDF text extraction → chunking + embeddings (sentence-transformers) →
  FAISS vector index → Streamlit chat UI → local LLM via Ollama (Mistral / Llama 3) → answer with cited
  source passages and similarity scores.
- Tech: Python, PyMuPDF, sentence-transformers, FAISS, Streamlit, Ollama, Docker
- Engineering challenge: Keeping the whole retrieval + generation loop fully local (no external API calls)
  while still surfacing transparent, cited answers.
- Impact: Fully local RAG pipeline with cited, similarity-scored answers; MIT licensed and open source.
- Links: GitHub → https://github.com/LOHITHK22/RAG-Powered-Document-Chatbot (real, public, MIT license)

### 6. Rust + Polars Data Pipeline
- Problem: Needed a fast, memory-safe way to ingest and statistically summarize customer CSV data without
  the overhead of a JVM/Python runtime, and get it into a form BI tools can chart directly.
- Solution: A modular Rust ingestion engine using the Polars DataFrame library for vectorized statistical
  analysis, writing results asynchronously into PostgreSQL for downstream visualization.
- Architecture: CSV source → Polars DataFrame (mean / std-dev / min / max on numeric columns) → async
  PostgreSQL writes (SQLx) → Tableau dashboards for visualization.
- Tech: Rust, Polars, PostgreSQL, SQLx, Tableau
- Engineering challenge: Structuring ingestion, analysis, storage, and visualization as independently
  testable modules in Rust, with unit tests covering CSV parsing and the statistical operations.
- Impact: Working end-to-end Rust data pipeline with async DB writes and unit-tested statistical core;
  results feed Tableau dashboards.
- Links: GitHub → https://github.com/LOHITHK22/rust_data_pipeline (real, public)

## Secondary GitHub Projects (smaller grid — name, one-line description, stack, why it matters, link)

1. **meeting-intelligence-agent** — https://github.com/LOHITHK22/meeting-intelligence-agent — In-progress
   AI agent for meetings, split into service-oriented modules (transcription, extraction, agent
   orchestration, memory). Python. Why it matters: shows current hands-on work with agent architecture and
   service decomposition, actively updated.
2. **Linkedin-post-generator** — https://github.com/LOHITHK22/Linkedin-post-generator — LangChain +
   Groq-hosted LLaMA app that generates LinkedIn posts (English/Telugu) from topic tags using few-shot
   prompting, served via Streamlit. Python. Why it matters: shows practical LLM prompting/product work
   end-to-end, shipped and usable.

Do not build cards for: smart-agriculture, BigData, BIGDATA-project, Multivariate-Statistical-Analysis-of-
Bone-Mineral-Content, Rust-Cli-calc — these are coursework/small-utility repos with low hiring signal.
Instead, a single "View all repositories on GitHub" link/CTA should cover them.

## Skills (grouped — do NOT use percentage bars)

- **Languages:** Python, Java, TypeScript, JavaScript, Rust, C++, SQL
- **Backend & APIs:** FastAPI, Spring Boot, Flask, Node.js/Express, REST APIs, async & event-driven microservices
- **AI / GenAI:** LangChain, LangGraph, OpenAI API, RAG pipelines, FAISS, MCP (Model Context Protocol),
  RAGAS evaluation, prompt engineering, multi-agent orchestration
- **Cloud & DevOps:** AWS (ECS, Lambda, SQS/SNS, EC2, RDS, S3, CloudWatch), Azure (Service Bus, Functions,
  CosmosDB), Docker, Kubernetes, Terraform, GitHub Actions, Jenkins, CI/CD
- **Data & Streaming:** Kafka, Flink, Spark, Airflow, PostgreSQL, DynamoDB, Redis, MySQL
- **Frontend:** React, TypeScript
- **Practices:** Agile/Scrum, code review, distributed tracing, observability, Pytest, Postman, Jest

## Terminal component script (exact copy)

```
$ whoami
Lohith Kovuri — Software Engineer (Backend, Distributed Systems, AI/LLM Platforms)

$ status
Currently: Software Engineer @ Nordstrom (Remote, USA)
Previously: Rowan ACM Club (AI/Backend Eng.) · Roothoot Pvt Ltd (SWE Intern)

$ skills --top
Python · Java · TypeScript · AWS · FastAPI · LangChain/LangGraph · Kafka · PostgreSQL · Docker · Kubernetes

$ projects --top
1. Multi-Tenant RAG API        (200+ tenants, zero data leaks)
2. VendorOps AI                (LangGraph agents, github.com/LOHITHK22/vendorops-ai)
3. Distributed Job Scheduler   (2,000 jobs/min, p99 < 200ms)

$ education
M.S. Data Science — Rowan University (2023–2025)
B.Tech Information Technology — Dr. MGR Educational and Research Institute (2019–2023)

$ contact
email   lohithkovuri321@gmail.com
linkedin.com/in/contact-lohithkovuri
github.com/LOHITHK22

$ resume --download
Opening resume.pdf ...
```

## CTAs / Navigation (must always be reachable, not buried)

- Primary nav / hero: View Resume, Explore Projects, GitHub, LinkedIn, Contact Me, Recruiter Mode
- Contact section CTA line: "Let's talk about your engineering team."
- Save Contact: downloadable vCard (.vcf) using Name, Title, Email, Phone, LinkedIn, GitHub

## Career Fair Mode (`?careerfair=true`)

Landing copy: "Welcome — you probably just scanned the QR code on my shirt." Immediately below: 15-second
intro (one paragraph, reuse hero subtext), Resume download, top skills chips, top 3 projects (condensed
cards), GitHub, LinkedIn, Contact. No animations that delay content paint; this mode should render the
essentials first.

## Analytics events to track (privacy-conscious, anonymous, no PII)

qr_landing_view, careerfair_mode_view, resume_view_click, resume_download_click, github_click,
linkedin_click, project_click (with project id), contact_click, recruiter_mode_open, vcard_download,
terminal_open, ai_pitch_start, ai_pitch_complete, ai_pitch_close, ai_pitch_skip

## AI Pitch guided tour (added post-launch)

An optional floating trigger (bottom-right, appears once scrolled past the hero, all pages except
/recruiter) that, only on explicit user click (never autoplay), auto-scrolls through Hero → Why Me →
Projects (two flagship project stories: Multi-Tenant RAG API, VendorOps AI) → Skills → Experience →
Contact while narrating a ~75-90s highlight script. Script lines are composed from data already in
profile.ts / projects.ts (see data/guidedTour.ts) — no new claims.

**Audio architecture:** narration is pre-rendered *once* via the ElevenLabs API into static MP3s under
public/audio/ (see scripts/generate-tour-audio.ts, run manually with `npm run generate:tour-audio`,
never at request time) — no runtime API cost, no API key shipped to the client, consistent voice
quality on every device. A glowing orb reacts to the real audio waveform via the Web Audio API
(hooks/useAudioNarration.ts). If a clip is ever missing, it falls back to the browser's built-in
SpeechSynthesis (hooks/useSpeechSynthesis.ts), then to a silent timed caption-only tour if that's
unsupported too — the tour always works, audio quality is just best with the pre-generated files.

Fully user-controlled: pause/resume, skip, and close at any time; respects prefers-reduced-motion
(instant scroll instead of smooth).

## Resume file

Use the file at C:\Lohith\Lohith Resumes\Lohith_Resume_Software_Engineer.pdf as the canonical downloadable
resume (most complete, most current version — includes Nordstrom, Education, and both flagship projects).
Copy it into the Next.js `public/` directory as `public/Lohith_Kovuri_Resume.pdf`.
