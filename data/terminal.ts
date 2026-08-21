export type TerminalCommand = {
  command: string;
  output: string[];
};

// Exact script from CONTENT_BRIEF.md.
export const terminalCommands: TerminalCommand[] = [
  {
    command: "whoami",
    output: ["Lohith Kovuri — Software Engineer (Backend, Distributed Systems, AI/LLM Platforms)"],
  },
  {
    command: "status",
    output: [
      "Currently: Software Engineer @ Mercury (Remote, USA)",
      "Previously: Rowan ACM Club (AI/Backend Eng.) · Roothoot Pvt Ltd (SWE Intern)",
    ],
  },
  {
    command: "skills --top",
    output: ["Python · Java · TypeScript · AWS · FastAPI · LangChain/LangGraph · Kafka · PostgreSQL · Docker · Kubernetes"],
  },
  {
    command: "projects --top",
    output: [
      "1. Multi-Tenant RAG API        (200+ tenants, zero data leaks)",
      "2. VendorOps AI                (LangGraph agents, github.com/LOHITHK22/vendorops-ai)",
      "3. Distributed Job Scheduler   (2,000 jobs/min, p99 < 200ms)",
    ],
  },
  {
    command: "education",
    output: [
      "M.S. Data Science — Rowan University (2023–2025)",
      "B.Tech Information Technology — Dr. MGR Educational and Research Institute (2019–2023)",
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
