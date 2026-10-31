export type TerminalCommand = {
  command: string;
  output: string[];
};

export const terminalCommands: TerminalCommand[] = [
  {
    command: "whoami",
    output: ["Lohith Kovuri, Data Analyst (Data Engineering, Analytics, AI/LLM Systems)"],
  },
  {
    command: "status",
    output: [
      "Status: Data Analyst @ Uline (Remote, USA), Jul 2025 – Present",
      "Previously: Data Analyst @ Worldpay, LLC, Jan 2022 – Jul 2023",
      "Open to: data analyst, data engineering, and AI data roles",
    ],
  },
  {
    command: "skills --top",
    output: ["Python · SQL · Snowflake · PySpark · Airflow · Kafka · AWS · Tableau · Power BI · LLM evaluation"],
  },
  {
    command: "projects --top",
    output: [
      "1. PipelineMedic AI            (17 MCP tools, 63 MCP tests, github.com/LOHITHK22/PipelineMedic-AI)",
      "2. RAG Sentinel                (0.82 Cohen's kappa, 0.89 ROC-AUC)",
      "3. AWS Streaming Data Platform (Kafka → S3/Iceberg → Kimball model in Athena + dbt)",
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
