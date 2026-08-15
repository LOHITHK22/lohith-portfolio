export type SkillGroup = {
  id: string;
  label: string;
  skills: string[];
};

// Grouped exactly as in the brief. No percentage bars — rendered as chips.
export const skillGroups: SkillGroup[] = [
  {
    id: "languages",
    label: "Languages",
    skills: ["Python", "Java", "TypeScript", "JavaScript", "Rust", "C++", "SQL"],
  },
  {
    id: "backend",
    label: "Backend & APIs",
    skills: ["FastAPI", "Spring Boot", "Flask", "Node.js/Express", "REST APIs", "Async & event-driven microservices"],
  },
  {
    id: "ai-genai",
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
    label: "Data & Streaming",
    skills: ["Kafka", "Flink", "Spark", "Airflow", "PostgreSQL", "DynamoDB", "Redis", "MySQL"],
  },
  {
    id: "frontend",
    label: "Frontend",
    skills: ["React", "TypeScript"],
  },
  {
    id: "practices",
    label: "Practices",
    skills: ["Agile/Scrum", "Code review", "Distributed tracing", "Observability", "Pytest", "Postman", "Jest"],
  },
];

// Compact 8-skill chip list for Recruiter Mode / Career Fair Mode.
export const topSkills = ["Python", "Java", "AWS", "FastAPI", "LangChain/LangGraph", "Kafka", "PostgreSQL", "Docker/Kubernetes"];
