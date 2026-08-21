export type SkillGroup = {
  id: string;
  /** Capability framing — what this group of tools lets him DO. */
  verb: string;
  /** Original category name, kept as context under the verb. */
  label: string;
  skills: string[];
};

// Grouped by engineering capability, not generic category nouns. No
// percentage bars — rendered as chips.
export const skillGroups: SkillGroup[] = [
  {
    id: "languages",
    verb: "Build",
    label: "Languages",
    skills: ["Python", "Java", "TypeScript", "JavaScript", "Rust", "C++", "SQL"],
  },
  {
    id: "backend",
    verb: "Architect",
    label: "Backend & APIs",
    skills: ["FastAPI", "Spring Boot", "Flask", "Node.js/Express", "REST APIs", "Async & event-driven microservices"],
  },
  {
    id: "ai-genai",
    verb: "Reason",
    label: "AI / GenAI",
    skills: [
      "LangChain",
      "LangGraph",
      "OpenAI API",
      "RAG pipelines",
      "FAISS",
      "MCP (Model Context Protocol)",
      "RAGAS evaluation",
      "Prompt engineering",
      "Multi-agent orchestration",
    ],
  },
  {
    id: "cloud-devops",
    verb: "Ship",
    label: "Cloud & DevOps",
    skills: [
      "AWS (ECS, Lambda, SQS/SNS, EC2, RDS, S3, CloudWatch)",
      "Azure (Service Bus, Functions, CosmosDB)",
      "Docker",
      "Kubernetes",
      "Terraform",
      "GitHub Actions",
      "Jenkins",
      "CI/CD",
    ],
  },
  {
    id: "data-streaming",
    verb: "Flow",
    label: "Data & Streaming",
    skills: ["Kafka", "Flink", "Spark", "Airflow", "PostgreSQL", "DynamoDB", "Redis", "MySQL"],
  },
  {
    id: "frontend",
    verb: "Interface",
    label: "Frontend",
    skills: ["React", "TypeScript"],
  },
  {
    id: "practices",
    verb: "Verify",
    label: "Practices",
    skills: ["Agile/Scrum", "Code review", "Distributed tracing", "Observability", "Pytest", "Postman", "Jest"],
  },
];

// Compact 8-skill chip list for Recruiter Mode / Career Fair Mode.
export const topSkills = ["Python", "Java", "AWS", "FastAPI", "LangChain/LangGraph", "Kafka", "PostgreSQL", "Docker/Kubernetes"];
