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
const codeReviewProject = flagshipProjects.find((p) => p.id === "ai-code-review-agent")!;
const vendorOpsProject = flagshipProjects.find((p) => p.id === "vendorops-ai")!;

export const guidedTourSteps: GuideStep[] = [
  {
    id: "intro",
    sectionId: "top",
    eyebrow: "Who I am",
    // Narrated by the hero video itself (see Hero.tsx's play-hero-video-with-
    // sound bridge) — audioFile below is only a fallback if the video can't
    // play for some reason. Keep this in sync with the video's script.
    line: `Hi, I'm ${profile.name}. Welcome to my world: backend, distributed systems, and AI. Take a look.`,
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
    id: "project-code-review",
    sectionId: "projects",
    eyebrow: "What I've built",
    line: `Take the ${codeReviewProject.name}. The problem: most AI code review tools are single-shot, so one failed step means the whole review restarts. The fix: a four-tool agent chain with retry and state checkpointing, so a mid-chain failure resumes instead of starting over. The result: it catches 85%+ of seeded defects, automatically, on every pull request, for under 5 cents a review.`,
    audioFile: "/audio/tour-project-code-review.mp3",
  },
  {
    id: "project-vendorops",
    sectionId: "projects",
    eyebrow: "What I've built",
    line: `Then there's ${vendorOpsProject.name}, an agentic pipeline for contract intelligence. The hard part: coordinating multiple AI agents with a human checking anything the model wasn't confident about. It now hits over 90% extraction accuracy at 60% lower cost per document.`,
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
    line: "Most recently, I was a Software Engineer at Mercury, working remote on production backend and AI-assisted testing for financial event-ingestion systems. Right now, I'm open to new full-time roles.",
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
