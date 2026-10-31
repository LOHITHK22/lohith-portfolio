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
const pipelineMedicProject = flagshipProjects.find((p) => p.id === "pipelinemedic-ai")!;
const ragSentinelProject = flagshipProjects.find((p) => p.id === "rag-sentinel")!;

export const guidedTourSteps: GuideStep[] = [
  {
    id: "intro",
    sectionId: "top",
    eyebrow: "Who I am",
    // Narrated by the hero video itself (see Hero.tsx's play-hero-video-with-
    // sound bridge) — audioFile below is only a fallback if the video can't
    // play for some reason. Keep this in sync with the video's script.
    line: `Hi, I'm ${profile.name}. Welcome to my world: data, pipelines, and AI. Take a look.`,
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
    id: "project-pipelinemedic",
    sectionId: "projects",
    eyebrow: "What I've built",
    line: `Take ${pipelineMedicProject.name}. The problem: data pipelines break in predictable ways, but letting an AI fix production data on its own is too risky. The fix: plain detectors find the failure first, an LLM proposes a typed repair, and anything risky waits for a human. Every repair is validated and rolled back if it fails, and the whole thing runs as an MCP server with 17 tools and 63 tests.`,
    audioFile: "/audio/tour-project-pipelinemedic.mp3",
  },
  {
    id: "project-rag-sentinel",
    sectionId: "projects",
    eyebrow: "What I've built",
    line: `Then there's ${ragSentinelProject.name}, an LLM evaluation framework. Before trusting an AI judge, I checked it against a thousand human labels and got 0.82 Cohen's kappa. Then I used it to A/B test prompts, and built a hallucination-risk classifier at 0.89 ROC-AUC.`,
    audioFile: "/audio/tour-project-rag-sentinel.mp3",
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
    line: "Right now, I'm a Data Analyst at Uline, working remote on supply chain data: automated reporting, Snowflake validation, and demand forecasting. Before that, I was a Data Analyst at Worldpay, working on payments data.",
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
