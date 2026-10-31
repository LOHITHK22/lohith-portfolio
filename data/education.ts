export type Education = {
  id: string;
  institution: string;
  degree: string;
  detail?: string;
  location: string;
  period: string;
};

export const education: Education[] = [
  {
    id: "rowan",
    institution: "Rowan University",
    degree: "M.S. Data Science",
    detail: "Concentration: Statistical ML, Data Engineering",
    location: "Glassboro, NJ",
    period: "Sep 2023 – May 2025",
  },
  {
    id: "mgr",
    institution: "Dr. MGR Educational and Research Institute",
    degree: "B.Tech Information Technology",
    location: "Chennai, India",
    period: "Sep 2019 – May 2023",
  },
];

export type Certification = {
  id: string;
  name: string;
  issuer: string;
};

// No verification URLs were provided in the source material — render as plain
// cards, do not fabricate Credly/verification links.
export const certifications: Certification[] = [
  {
    id: "aws-data-engineer",
    name: "AWS Certified Data Engineer, Associate",
    issuer: "Amazon Web Services",
  },
  {
    id: "aws-cloud-practitioner",
    name: "AWS Certified Cloud Practitioner",
    issuer: "Amazon Web Services",
  },
  {
    id: "power-bi",
    name: "Microsoft Power BI Data Analyst Associate",
    issuer: "Microsoft",
  },
];
