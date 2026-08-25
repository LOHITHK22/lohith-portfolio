// Builds the grounding context for the "Ask about me" Q&A feature
// (app/api/ask/route.ts). Everything the model is allowed to know is
// assembled here from the site's own approved data files — nothing else.
// Also exports the valid section/project ids so the API route can reject
// any id the model invents rather than trusting it blindly.
import { profile, whyMeSignals, recruiterSummary } from "@/data/profile";
import { flagshipProjects, secondaryProjects } from "@/data/projects";
import { experience } from "@/data/experience";
import { skillGroups } from "@/data/skills";
import { education, certifications } from "@/data/education";

export const VALID_SECTION_IDS = [
  "top",
  "why-me",
  "projects",
  "skills",
  "experience",
  "education-heading",
  "contact",
] as const;

export const VALID_PROJECT_IDS = flagshipProjects.map((p) => p.id);

export function buildPortfolioContext(): string {
  const parts: string[] = [];

  parts.push(`Name: ${profile.name}`);
  parts.push(`Headline: ${profile.headline}`);
  parts.push(`Current status: ${profile.currentStatus}`);
  parts.push(`Location: ${profile.location} (${profile.locationNote})`);
  parts.push(`Targeting roles: ${profile.targetRoles.join(", ")}`);

  parts.push("\n--- WHY HIM (evidence signals) ---");
  whyMeSignals.forEach((s) => parts.push(`- ${s.signal}`));

  parts.push("\n--- STRONGEST SKILLS (recruiter shortlist) ---");
  parts.push(recruiterSummary.strongestSkills.join(", "));

  parts.push("\n--- FULL SKILLS BY CAPABILITY ---");
  skillGroups.forEach((g) => parts.push(`${g.verb} (${g.label}): ${g.skills.join(", ")}`));

  parts.push("\n--- EXPERIENCE ---");
  experience.forEach((e) => {
    parts.push(`\n${e.role} at ${e.company} (${e.location}, ${e.period})${e.current ? " [CURRENT ROLE]" : ""}`);
    parts.push(`Summary: ${e.summary}`);
    parts.push(`Tech: ${e.tech.join(", ")}`);
    e.bullets.forEach((b) => parts.push(`- ${b}`));
  });

  parts.push("\n--- FLAGSHIP PROJECTS (id, use the id verbatim in project_id) ---");
  flagshipProjects.forEach((p) => {
    parts.push(`\nProject id: "${p.id}", ${p.name}`);
    parts.push(`Tagline: ${p.tagline}`);
    parts.push(`Problem: ${p.problem}`);
    parts.push(`Solution: ${p.solution}`);
    parts.push(`Architecture: ${p.architecture}`);
    parts.push(`Engineering challenge: ${p.challenge}`);
    parts.push(`Impact: ${p.impact}`);
    parts.push(`Tech: ${p.tech.join(", ")}`);
    parts.push(`GitHub: ${p.githubUrl ?? "closed source, no public repo"}`);
  });

  parts.push("\n--- OTHER GITHUB PROJECTS ---");
  secondaryProjects.forEach((p) => {
    parts.push(`- ${p.name}: ${p.description} (${p.stack}). Why it matters: ${p.whyItMatters}`);
  });

  parts.push("\n--- EDUCATION ---");
  education.forEach((e) => {
    parts.push(`- ${e.degree}, ${e.institution} (${e.location}, ${e.period})${e.detail ? `. ${e.detail}` : ""}`);
  });

  parts.push("\n--- CERTIFICATIONS ---");
  certifications.forEach((c) => parts.push(`- ${c.name} (${c.issuer})`));

  parts.push("\n--- CONTACT ---");
  parts.push(`Email: ${profile.email}`);
  parts.push(`LinkedIn: ${profile.linkedinUrl}`);
  parts.push(`GitHub: ${profile.githubUrl}`);
  parts.push(`Resume: available for download on this site`);

  return parts.join("\n");
}

export function buildSystemPrompt(): string {
  return `You are an AI assistant embedded in ${profile.name}'s portfolio website, answering recruiters' and hiring managers' questions about him. You are NOT Lohith, so refer to him in the third person.

STRICT RULES:
1. Only answer using the facts provided below. Never invent employers, dates, metrics, technologies, or claims that aren't in this context.
2. If a question asks about something not covered here (personal life, salary expectations, availability dates, opinions, anything you don't have facts for), say plainly that you don't have that information and suggest they ask him directly via the contact section. Do not guess or make something up.
3. Keep answers concise: 2-4 sentences, professional, confident, no fluff. Write in plain natural sentences, the way a person types, not a press release. Never use em dashes (—); use periods or commas instead.
4. When your answer is primarily about ONE specific flagship project, set project_id to that project's exact id string from the context. Otherwise leave project_id null.
5. When your answer is best illustrated by scrolling to a specific section, set section_id to one of: ${VALID_SECTION_IDS.join(", ")}. Otherwise leave section_id null. Prefer project_id over section_id when a specific project applies.
6. Respond ONLY with a JSON object of the exact shape: {"answer": string, "project_id": string | null, "section_id": string | null}. No other text.

CONTEXT (the only facts you know about ${profile.name}):
${buildPortfolioContext()}`;
}
