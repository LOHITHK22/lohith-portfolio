export type TerminalCommand = {
  command: string;
  output: string[];
};

// Exact script from CONTENT_BRIEF.md.
export const terminalCommands: TerminalCommand[] = [
  {
    command: "whoami",
    output: ["Lohith Kovuri, Software Engineer (Backend, Distributed Systems, AI/LLM Platforms)"],
  },
  {
    command: "status",
    output: [
      "Status: open to new full-time roles (backend, cloud, AI/GenAI)",
      "Most recent: Software Engineer @ Mercury (Remote, USA), Oct 2025 – Jul 2026",
      "Previously: Rowan ACM Engineering (Backend Eng., Contract) · Roothoot Pvt Ltd (Software Developer)",
    ],
  },
  {
    command: "skills --top",
    output: ["Python · Java · TypeScript · AWS · FastAPI · LangChain/LangGraph · Kafka · PostgreSQL · Docker · Kubernetes"],
  },
  {
    command: "projects --top",
    output: [
      "1. AI Code Review Agent        (85%+ defects caught, <$0.05/review)",
      "2. VendorOps AI                (LangGraph agents, github.com/LOHITHK22/vendorops-ai)",
      "3. High-Throughput Data Pipeline (1M+ records/hour, <1% failure rate)",
    ],
  },
  {
    command: "education",
    output: [
      "M.S. Data Science, Rowan University (2023-2025)",
      "B.Tech Information Technology, Dr. MGR Educational and Research Institute (2019-2023)",
    ],
  },
  {
    command: "contact",
    output: ["email   lohithkovuri321@gmail.com", "linkedin.com/in/contact-lohithkovuri", "github.com/LOHITHK22"],
  },
  {
    command: "resume --download",
    output: ["Opening resume.pdf ..."],
  },
];

export const terminalHelpText = [
  "Available commands:",
  "  whoami           who is this",
  "  status            current role + history",
  "  skills --top      top technical skills",
  "  projects --top    top 3 projects",
  "  education         degrees",
  "  contact           email / linkedin / github",
  "  resume --download open the resume PDF",
  "  help              show this list",
  "  clear             clear the terminal",
];
