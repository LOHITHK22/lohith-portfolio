// "45-Second AI Experience" for /event: a scripted, narrated walkthrough built
// for in-person events. The seven characters reuse the agent roster from
// data/agentTeam.ts. They are illustrative roles narrated by recorded TTS
// voices, NOT autonomous agents running in the browser, and the UI says so.
//
// `caption` is what visitors read. `spoken` is what the TTS engine reads
// (same words, acronyms spelled out). After editing either, re-run
// `npm run generate:event-audio`, which re-measures every clip and rewrites
// data/eventAudioManifest.json.

import type { AgentId } from "@/data/agentTeam";
import manifest from "@/data/eventAudioManifest.json";

export type EventSceneId = "welcome" | "design" | "engineering" | "pipelinemedic" | "performance" | "testing" | "closing";

export type EventScene = {
  id: EventSceneId;
  agentId: AgentId;
  title: string;
  caption: string;
  spoken: string;
  /** Acting direction for this line (event pacing is brisker than the full tour). */
  instructions: string;
  audioFile: string;
  /** Target slot from the 45-second plan, including the handoff that follows. */
  targetMs: number;
};

/** Signal animation between two agents. Counted inside each scene's target slot. */
export const HANDOFF_MS = 550;
export const HANDOFF_MS_REDUCED = 150;
/** Extra pause after a clip ends (clips already carry ~150 ms of trailing silence). */
export const POST_CLIP_HOLD_MS = 60;

export const eventScenes: EventScene[] = [
  {
    id: "welcome",
    agentId: "astra",
    title: "Welcome",
    caption: "I'm Astra. Welcome to Lohith's AI lab. Meet the team behind this experience.",
    spoken: "I'm Astra. Welcome to Lohith's AI lab. Meet the team behind this experience.",
    instructions: "Confident and strategic, like a mission lead kicking off a live demo. Energized and brisk, no lingering pauses.",
    audioFile: "/audio/event/01-astra.mp3",
    targetMs: 6000,
  },
  {
    id: "design",
    agentId: "nova",
    title: "Design",
    caption: "I'm Nova. I turn complex ideas into clear interfaces.",
    spoken: "I'm Nova. I turn complex ideas into clear interfaces.",
    instructions: "Creative and articulate, bright and expressive, with a smile in the voice. Natural pace.",
    audioFile: "/audio/event/02-nova.mp3",
    targetMs: 5000,
  },
  {
    id: "engineering",
    agentId: "forge",
    title: "Engineering",
    caption: "Forge here. I build the interactive systems you can explore.",
    spoken: "Forge here. I build the interactive systems you can explore.",
    instructions: "Practical and technical, grounded and direct, like an engineer at a whiteboard. Natural pace.",
    audioFile: "/audio/event/03-forge.mp3",
    targetMs: 5000,
  },
  {
    id: "pipelinemedic",
    agentId: "atlas",
    title: "PipelineMedic AI",
    caption:
      "I'm Atlas. Watch PipelineMedic detect a failure, let an LLM propose a repair, and route an authorized tool call through MCP. Risky actions stop for human approval. Recovery is checked afterward.",
    spoken:
      "I'm Atlas. Watch PipelineMedic detect a failure, let an L-L-M propose a repair, and route an authorized tool call through M-C-P. Risky actions stop for human approval. Recovery is checked afterward.",
    instructions:
      "Precise and knowledgeable, like a systems architect explaining a diagram. Crisp diction and an efficient, brisk delivery with only brief pauses between sentences.",
    audioFile: "/audio/event/04-atlas.mp3",
    targetMs: 14000,
  },
  {
    id: "performance",
    agentId: "pulse",
    title: "Performance",
    caption: "I'm Pulse. I keep the experience fast and responsive.",
    spoken: "I'm Pulse. I keep the experience fast and responsive.",
    instructions: "Energetic and concise, upbeat and quick but never rushed or shouty.",
    audioFile: "/audio/event/05-pulse.mp3",
    targetMs: 5000,
  },
  {
    id: "testing",
    agentId: "sentinel",
    title: "Testing",
    caption: "I'm Sentinel. I verify tests, safety, and system behavior.",
    spoken: "I'm Sentinel. I verify tests, safety, and system behavior.",
    instructions: "Analytical and calm, even and reassuring, like a reliability lead reading a clean report.",
    audioFile: "/audio/event/06-sentinel.mp3",
    targetMs: 5000,
  },
  {
    id: "closing",
    agentId: "echo",
    title: "Connect",
    caption: "I'm Echo. Explore the projects, or scan to connect with Lohith.",
    spoken: "I'm Echo. Explore the projects, or scan to connect with Lohith.",
    instructions: "Warm and polished, like a friendly host closing a session. Inviting, natural pace.",
    audioFile: "/audio/event/07-echo.mp3",
    targetMs: 5000,
  },
];

type ManifestEntry = { file: string; durationMs: number; bytes: number };
const clips = manifest.clips as Record<string, ManifestEntry | undefined>;

/** Measured clip length from the generation script, or null if the clip is missing. */
export function clipDurationMs(scene: EventScene): number | null {
  return clips[scene.id]?.durationMs ?? null;
}

/** Fallback length for a scene with no audio: roughly 15 characters per second. */
export function readingTimeMs(text: string): number {
  return Math.max(2500, Math.round((text.length / 15) * 1000));
}

/**
 * How long a scene stays on screen before its handoff (or, for the last
 * scene, before the closing screen settles). Uses the measured clip length,
 * never stretches a voice, and never cuts a clip short.
 */
export function sceneHoldMs(scene: EventScene, index: number, clipMs: number | null, handoffMs = HANDOFF_MS): number {
  const spoken = (clipMs ?? readingTimeMs(scene.caption)) + POST_CLIP_HOLD_MS;
  // The closing screen stays up indefinitely, so the last scene ends when
  // Echo finishes speaking rather than padding out to its slot.
  if (index === eventScenes.length - 1) return spoken;
  return Math.max(spoken, scene.targetMs - handoffMs);
}

/** Planned total runtime including handoffs, using measured clip lengths. */
export function plannedRuntimeMs(): number {
  return eventScenes.reduce(
    (sum, s, i) => sum + sceneHoldMs(s, i, clipDurationMs(s)) + (i < eventScenes.length - 1 ? HANDOFF_MS : 0),
    0
  );
}

export const EVENT_URL = "https://lohithkovuri.store/event";
export const EVENT_QR_URL = `${EVENT_URL}?source=ai-event`;
