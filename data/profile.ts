// Core identity, positioning, and contact data.
// Every value here traces back to Lohith_Resume_Base.pdf; do not add or "improve" facts here.

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
  location: "San Francisco, CA, USA",
  locationNote: "Open to new opportunities",
  resumeUrl: "/Lohith_Kovuri_Resume.pdf",
  resumeFileName: "Lohith_Kovuri_Resume.pdf",

  headline: "Data Analyst working across Data Engineering & AI/LLM Systems",
  subIdentity: "Python & SQL • Data Engineering (AWS) • Analytics & BI • LLM Evaluation & Agents",

  heroParagraph:
    "I turn messy supply chain and payments data into reports, checks, and forecasts people trust. On my own time I build AWS data pipelines in PySpark and Kafka, an LLM evaluation framework, and an agent that repairs data pipelines with human approval.",

  // Portrait-led hero (components/Hero.tsx).
  heroHeadlineLead: "I Build AI Systems That",
  heroHeadlineAccent: "Think, Act, and Evolve.",
  heroSupporting:
    "Exploring the engineering behind autonomous AI agents, LLM applications, MCP integrations, reliable data platforms, and intelligent automation.",
  portrait: {
    src: "/images/lohith-portrait-1200.webp",
    alt: "Portrait of Lohith Kovuri",
  },

  careerFairTagline: "Here's what I actually ship.",
  recruiterModeCta: "Skip to the 30-second version.",

  targetRoles: [
    "Data Analyst",
    "Data Engineer",
    "Analytics Engineer",
    "Business Intelligence Analyst",
    "AI/ML Data Engineer",
  ],

  currentStatus:
    "Currently Data Analyst at Uline (Remote, USA), since Jul 2025. Open to data analyst, data engineering, and AI data roles",

  contactCtaLine: "Let's talk about your data team.",
} as const;

// The 6 evidence-based "Why Me" signals. Numbers are verbatim from the resume.
export const whyMeSignals = [
  {
    id: "report-automation",
    signal:
      "At Uline, automated about 50 daily shipping reports in Python, saving roughly 15 hours of manual work a week, and wired SQL results into an LLM API to draft inventory and shipping reports, with checks.",
    stat: "15 hrs",
    statLabel: "manual work saved weekly",
  },
  {
    id: "data-validation",
    signal:
      "Builds the checks that make numbers trustworthy: Snowflake validation that cut procurement reporting discrepancies by 22% at Uline, and SQL billing validation that cut billing discrepancies by 18% at Worldpay.",
    stat: "22%",
    statLabel: "fewer reporting discrepancies",
  },
  {
    id: "pipelinemedic",
    signal:
      "Built PipelineMedic AI, an agent that detects and repairs failures in a Kafka, Flink, and Airflow pipeline, with a human approving risky fixes, exposed as an MCP server with 17 typed tools and 63 MCP tests.",
    stat: "17",
    statLabel: "typed MCP tools",
  },
  {
    id: "rag-sentinel",
    signal:
      "Validated an LLM judge against 1,000 human-annotated responses (0.82 Cohen's kappa) and built an XGBoost hallucination-risk classifier with SHAP at 0.89 ROC-AUC.",
    stat: "0.82",
    statLabel: "Cohen's kappa vs. humans",
  },
  {
    id: "spark-tuning",
    signal:
      "Tuned a PySpark job on EMR over 100+ GB of TPC-H data from 24.6 to 13.8 minutes (44% faster) with partitioning, broadcast joins, and skew handling.",
    stat: "44%",
    statLabel: "faster Spark runtime",
  },
  {
    id: "certifications",
    signal:
      "Credentialed on the cloud and data stack he works on: AWS Certified Data Engineer, Associate; AWS Certified Cloud Practitioner; and Microsoft Power BI Data Analyst Associate.",
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
  { id: "reports", value: 50, suffix: "", label: "daily reports automated", decimals: 0 },
  { id: "records", value: 75000, suffix: "+", label: "monthly records analyzed", decimals: 0 },
  { id: "discrepancies", value: 22, suffix: "%", label: "fewer reporting discrepancies", decimals: 0 },
  { id: "forecast", value: 15, suffix: "%", label: "lower forecast error", decimals: 0 },
];

// Recruiter Mode: 30-second summary.
export const recruiterSummary = {
  who: "Lohith Kovuri, Data Analyst",
  degree: [
    "M.S. Data Science, Rowan University (2023–2025)",
    "B.Tech Information Technology, Dr. MGR Educational and Research Institute (2019–2023)",
  ],
  currentStatus:
    "Currently Data Analyst at Uline (Remote, USA), since Jul 2025. Open to data analyst, data engineering, and AI data roles",
  targeting: ["Data Analyst", "Data Engineer", "Analytics Engineer", "BI Analyst", "AI/ML Data Engineer"],
  strongestSkills: ["Python", "SQL", "Snowflake", "PySpark", "Airflow", "AWS", "Tableau / Power BI", "LLM evaluation"],
  topProjects: ["PipelineMedic AI", "RAG Sentinel", "AWS Streaming Data Platform"],
  certifications: [
    "AWS Certified Data Engineer, Associate",
    "AWS Certified Cloud Practitioner",
    "Microsoft Power BI Data Analyst Associate",
  ],
  location: "San Francisco, CA, USA",
} as const;

// Career Fair Mode banner copy (?careerfair=true)
export const careerFairCopy = {
  heading: "Welcome. Here's a quick look at what I build.",
  intro: profile.heroParagraph,
} as const;
