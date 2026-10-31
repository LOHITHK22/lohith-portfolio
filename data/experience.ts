export type ExperienceEntry = {
  id: string;
  role: string;
  company: string;
  location?: string;
  period: string;
  current?: boolean;
  tech: string[];
  summary: string;
  bullets: string[];
};

// Most recent first. Bullets mirror Lohith_Resume_Base.pdf verbatim.
export const experience: ExperienceEntry[] = [
  {
    id: "uline",
    role: "Data Analyst",
    company: "Uline",
    location: "Remote, USA",
    period: "Jul 2025 – Present",
    current: true,
    tech: ["Python", "SQL", "Snowflake", "R", "LLM APIs", "Tableau", "Power BI"],
    summary:
      "Automates supply chain reporting and builds the validation, forecasting, and dashboards behind inventory and shipping decisions.",
    bullets: [
      "Automated about 50 daily shipping reports in Python, saving roughly 15 hours of manual work a week.",
      "Wrote Python workflows that send SQL results to an LLM API to draft inventory and shipping reports, with checks.",
      "Added validation checks in Snowflake that cut reporting discrepancies by 22% for the procurement team.",
      "Analyzed 75,000+ monthly inventory and order records in SQL to find bottlenecks and support demand planning.",
      "Built demand forecasting models in R that reduced forecast error by 15% against baseline methods.",
      "Built Tableau and Power BI dashboards for 8 supply chain KPIs, cutting reporting turnaround by 30%.",
    ],
  },
  {
    id: "worldpay",
    role: "Data Analyst",
    company: "Worldpay, LLC",
    period: "Jan 2022 – Jul 2023",
    tech: ["SQL", "Python", "Pandas", "AWS Redshift", "REST APIs", "Excel / Power Query", "Jira", "Confluence"],
    summary:
      "Worked on merchant and payment gateway data: reconciliation, fraud and billing checks, and forecasting for treasury.",
    bullets: [
      "Helped consolidate merchant account data in AWS Redshift, cutting monthly reconciliation time by 30%, and wrote Python scripts that pulled internal REST API data into gateway performance views.",
      "Wrote SQL fraud detection alerts and billing validation checks that cut billing discrepancies by 18%.",
      "Automated payment gateway data cleaning with Python and Pandas, cutting manual prep time by 35%.",
      "Built Excel and Power Query models for daily volume forecasts that fed treasury budget and cash planning.",
      "Defined data requirements with the product team in Jira and documented the data definitions in Confluence.",
    ],
  },
];
