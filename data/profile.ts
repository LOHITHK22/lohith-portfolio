// Core identity, positioning, and contact data.
// Every value here traces back to CONTENT_BRIEF.md — do not add or "improve" facts here.

export const profile = {
  name: "Lohith Kovuri",
  firstName: "Lohith",
  email: "lohithkovuri321@gmail.com",
  // Phone is intentionally NOT exposed anywhere in plain text on the page.
  // It is only embedded into the generated vCard (.vcf) file client-side.
  phoneForVCardOnly: "+1 (856) 652-4065",
  linkedinUrl: "https://linkedin.com/in/contact-lohithkovuri",
  linkedinLabel: "linkedin.com/in/contact-lohithkovuri",
  githubUrl: "https://github.com/LOHITHK22",
  githubLabel: "github.com/LOHITHK22",
  location: "Glassboro, NJ, USA",
  locationNote: "Currently working remote (US)",
  resumeUrl: "/Lohith_Kovuri_Resume.pdf",
  resumeFileName: "Lohith_Kovuri_Resume.pdf",

  headline: "Software Engineer — Backend, Distributed Systems & AI/LLM Platforms",
  subIdentity: "Backend • Distributed Systems • Cloud (AWS) • AI/LLM Platforms",

  heroParagraph:
    "I build fault-tolerant backend systems and production AI/LLM platforms — event-driven AWS pipelines processing tens of thousands of events a day, and multi-tenant RAG systems serving hundreds of concurrent tenants without leaking a byte between them.",

  careerFairTagline: "You scanned my shirt. Here's what I actually ship.",
  recruiterModeCta: "Skip to the 30-second version.",

  targetRoles: [
    "Software Engineer",
    "Backend Engineer",
    "Full-Stack Engineer",
    "Java Developer",
    "Python Developer",
    "Data Engineer",
    "AI/GenAI Engineer",
    "Cloud Engineer",
  ],

  currentStatus:
    "Software Engineer at Mercury (Remote, USA) since Oct 2025 — production backend + AI-assisted testing on financial event-ingestion systems",

  contactCtaLine: "Let's talk about your engineering team.",
} as const;

// The 5 evidence-based "Why Me" signals — verbatim numbers from the brief.
export const whyMeSignals = [
  {
    id: "aws-availability",
    signal:
      "Operate production AWS infrastructure at Mercury (a fintech platform) sustaining 99.9% write availability across 50,000+ events/day, including 8x traffic bursts, with zero data loss.",
    stat: "99.9%",
    statLabel: "write availability",
  },
  {
    id: "multi-tenant-rag",
    signal:
      "Architected a multi-tenant RAG backend serving 200+ concurrent tenants with per-tenant vector-store isolation — zero cross-tenant data leaks in stress testing — while cutting redundant LLM calls by 62% and dropping latency from 1.8s to 680ms.",
    stat: "200+",
    statLabel: "concurrent tenants",
  },
  {
    id: "latency-rebuild",
    signal:
      "Took a synchronous LLM pipeline from p95 latency of 120s down to under 60s by rebuilding it as an async, backpressure-aware FastAPI service.",
    stat: "120s → <60s",
    statLabel: "p95 latency",
  },
  {
    id: "vendorops",
    signal:
      "Shipped an agentic document-intelligence pipeline (VendorOps AI, LangGraph, public repo) achieving 90%+ clause-extraction accuracy on the 100+ contract CUAD legal benchmark, at 60% lower LLM cost per document via small/large-model routing.",
    stat: "90%+",
    statLabel: "clause-extraction accuracy",
  },
  {
    id: "certifications",
    signal:
      "Credentialed on the cloud and data stack he ships on: AWS Certified Data Engineer – Associate, AWS Certified Cloud Practitioner, and Microsoft Certified: Power BI Data Analyst Associate.",
    stat: "3",
    statLabel: "cloud & data certifications",
  },
] as const;

// Animated hero/stat counters (numbers pulled straight from the signals above).
export const heroStats: Array<{
  id: string;
  value: number;
  suffix: string;
  label: string;
  decimals: number;
}> = [
  { id: "availability", value: 99.9, suffix: "%", label: "write availability", decimals: 1 },
  { id: "events", value: 50000, suffix: "+", label: "events/day processed", decimals: 0 },
  { id: "tenants", value: 200, suffix: "+", label: "concurrent RAG tenants", decimals: 0 },
  { id: "llm-cut", value: 62, suffix: "%", label: "fewer redundant LLM calls", decimals: 0 },
];

// Recruiter Mode — 30-second summary, exact fields per the brief.
export const recruiterSummary = {
  who: "Lohith Kovuri, Software Engineer",
  degree: [
    "M.S. Data Science, Rowan University (2023–2025)",
    "B.Tech Information Technology, Dr. MGR Educational and Research Institute (2019–2023)",
  ],
  currentStatus:
    "Software Engineer at Mercury (Remote, USA) since Oct 2025 — production backend + AI-assisted testing on financial event-ingestion systems",
  targeting: [
    "Software Engineer",
    "Backend Engineer",
    "Full-Stack",
    "Data Engineer",
    "AI/GenAI Engineer",
    "Cloud Engineer",
  ],
  strongestSkills: [
    "Python",
    "Java",
    "AWS",
    "FastAPI",
    "LangChain/LangGraph",
    "Kafka",
    "PostgreSQL",
    "Docker/Kubernetes",
  ],
  topProjects: ["Multi-Tenant RAG API", "VendorOps AI", "Distributed Job Scheduler"],
  certifications: [
    "AWS Certified Data Engineer – Associate",
    "AWS Certified Cloud Practitioner",
    "Microsoft Certified: Power BI Data Analyst Associate",
  ],
  location: "Glassboro, NJ, USA / open to remote",
} as const;

// Career Fair Mode banner copy (?careerfair=true)
export const careerFairCopy = {
  heading: "Welcome — you probably just scanned the QR code on my shirt.",
  intro: profile.heroParagraph,
} as const;
