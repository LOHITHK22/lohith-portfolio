export type SkillGroup = {
  id: string;
  /** Capability framing — what this group of tools lets him DO. */
  verb: string;
  /** Original category name, kept as context under the verb. */
  label: string;
  skills: string[];
};

// Grouped by capability, mirroring the resume's skill categories. No
// percentage bars, rendered as chips.
export const skillGroups: SkillGroup[] = [
  {
    id: "languages",
    verb: "Build",
    label: "Programming",
    skills: ["Python", "SQL", "R", "FastAPI", "REST APIs", "Pydantic", "pytest"],
  },
  {
    id: "data-streaming",
    verb: "Flow",
    label: "Data Engineering",
    skills: ["PySpark", "Airflow", "Kafka", "Flink", "dbt", "Iceberg", "AWS (S3, EMR, Glue)", "Terraform"],
  },
  {
    id: "databases",
    verb: "Model",
    label: "Databases",
    skills: ["Snowflake", "Amazon Redshift", "PostgreSQL", "Dimensional modeling", "Data validation"],
  },
  {
    id: "ai-genai",
    verb: "Reason",
    label: "AI and ML",
    skills: [
      "LLM APIs",
      "Tool calling",
      "MCP server (Python SDK)",
      "LLM and RAG evaluation",
      "XGBoost",
      "SHAP",
      "A/B testing",
    ],
  },
  {
    id: "visualization",
    verb: "Explain",
    label: "Visualization and Tools",
    skills: ["Tableau", "Power BI", "Excel", "Git", "GitHub", "Docker"],
  },
];

// Compact 8-skill chip list for Recruiter Mode / Career Fair Mode.
export const topSkills = ["Python", "SQL", "Snowflake", "PySpark", "Airflow", "AWS", "Tableau / Power BI", "LLM evaluation"];
