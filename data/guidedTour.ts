// Script for the optional "AI Pitch" guided tour: auto-scrolls + narrates a
// ~75-90s highlight reel using pre-generated audio (see
// scripts/generate-tour-audio.ts). Every line is grounded in data already
// approved in profile.ts / projects.ts — no new claims are introduced here.
// If you edit a `line` below, re-run `npm run generate:tour-audio` so the
// static audio file matches the new text.
import { profile, whyMeSignals, recruiterSummary } from "./profile";
import { flagshipProjects } from "./projects";

export type GuideStep = {
  id: string;
  sectionId: string;
  eyebrow: string;
  line: string;
  /** Path to the pre-generated narration clip for this step. */
  audioFile: string;
};

const [primarySignal] = whyMeSignals;
const ragProject = flagshipProjects.find((p) => p.id === "multi-tenant-rag-api")!;
const vendorOpsProject = flagshipProjects.find((p) => p.id === "vendorops-ai")!;

export const guidedTourSteps: GuideStep[] = [
  {
    id: "intro",
    sectionId: "top",
    eyebrow: "Who I am",
    line: `Hi, I'm ${profile.name} — a Software Engineer focused on backend systems, distributed systems, and AI/LLM platforms.`,
    audioFile: "/audio/tour-intro.mp3",
  },
  {
    id: "why-me",
    sectionId: "why-me",
    eyebrow: "Why me",
    line: `Here's proof, not adjectives: ${primarySignal.signal}`,
    audioFile: "/audio/tour-why-me.mp3",
  },
  {
    id: "project-rag",
    sectionId: "projects",
    eyebrow: "What I've built",
    line: `Take the ${ragProject.name}. The problem: a shared vector index could leak one company's private data into another's answers. The fix: isolating every tenant at the embedding layer itself. The result: 200-plus concurrent tenants, zero data leaks, and 62% fewer redundant AI calls.`,
    audioFile: "/audio/tour-project-rag.mp3",
  },
  {
    id: "project-vendorops",
    sectionId: "projects",
    eyebrow: "What I've built",
    line: `Then there's ${vendorOpsProject.name} — an agentic pipeline for contract intelligence. The hard part: coordinating multiple AI agents with a human checking anything the model wasn't confident about. It now hits over 90% extraction accuracy at 60% lower cost per document.`,
    audioFile: "/audio/tour-project-vendorops.mp3",
  },
  {
    id: "skills",
    sectionId: "skills",
    eyebrow: "My stack",
    line: `The stack I ship with most: ${recruiterSummary.strongestSkills.slice(0, 4).join(", ")}.`,
    audioFile: "/audio/tour-skills.mp3",
  },
  {
    id: "experience",
    sectionId: "experience",
    eyebrow: "Right now",
    line: "Right now, I'm a Software Engineer at Nordstrom, working remote — production backend and AI-assisted testing on retail event-ingestion systems.",
    audioFile: "/audio/tour-experience.mp3",
  },
  {
    id: "contact",
    sectionId: "contact",
    eyebrow: "Let's talk",
    line: `${profile.contactCtaLine} My resume, GitHub, and contact info are right here.`,
    audioFile: "/audio/tour-contact.mp3",
  },
];
