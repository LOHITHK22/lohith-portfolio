import { agentById, teamSteps } from "./agentTeam";
import type { HqAgentId } from "@/lib/agentHq/layout";
import type { MeetingLine } from "@/lib/agentHq/sim";

// Agent HQ reuses the AI team's existing personas, captions and recorded voices.
// Nothing here is new script: every line is quoted from data/agentTeam.ts.

/** Each character's existing self-introduction (caption + recorded clip). */
export const HQ_INTRO: Record<HqAgentId, { caption: string; audioFile: string }> = {
  astra: pick("astra-intro"),
  nova: pick("nova"),
  forge: pick("forge"),
  atlas: pick("atlas"),
  pulse: pick("pulse"),
  sentinel: pick("sentinel"),
  echo: pick("echo"),
};

function pick(stepId: string) {
  const s = teamSteps.find((x) => x.id === stepId);
  if (!s) throw new Error(`Missing team step ${stepId}`);
  return { caption: s.caption, audioFile: s.audioFile };
}

/**
 * Lines shown in speech bubbles during a captions-only meeting: one sentence from
 * each character's existing caption, quoted exactly. ASTRA opens; ECHO closes with
 * the team summary.
 */
export const SILENT_MEETING_LINES: MeetingLine[] = [
  { agent: "astra", text: "Every system starts with a clear plan." },
  { agent: "nova", text: "My goal is to make complex technology feel elegant and understandable." },
  { agent: "forge", text: "I transform design systems into working applications, building responsive interfaces, interactive components, and polished user experiences." },
  { agent: "atlas", text: "I focus on AI architecture, agent orchestration, tool calling, and data infrastructure." },
  { agent: "pulse", text: "I'm Pulse, the performance and optimization agent." },
  { agent: "sentinel", text: "My responsibility is quality, reliability, accessibility, and security." },
  { agent: "echo", text: "Together, our team represents the different disciplines involved in building reliable digital systems." },
];

/**
 * A voiced meeting plays the team's recorded introductions in their handoff order:
 * ASTRA opens, each specialist hands to the next, ECHO sums up and hands back, and
 * ASTRA's recorded closing ends it.
 */
export const VOICED_MEETING_LINES: MeetingLine[] = teamSteps.map((s) => ({ agent: s.agentId, text: s.caption, audio: s.audioFile, id: s.id }));

/**
 * Length of each existing recording in seconds, by team step id, measured from the
 * browser's decoded audio (an e2e test checks these against the decoded durations).
 */
export const CLIP_SECONDS: Record<string, number> = {
  "astra-intro": 29.9,
  nova: 24.8,
  forge: 26.7,
  atlas: 29.6,
  pulse: 24.9,
  sentinel: 23.5,
  echo: 20.9,
  "astra-closing": 18.8,
};

/** The recording a character plays when a visitor selects it. */
export const INTRO_STEP: Record<HqAgentId, string> = {
  astra: "astra-intro",
  nova: "nova",
  forge: "forge",
  atlas: "atlas",
  pulse: "pulse",
  sentinel: "sentinel",
  echo: "echo",
};

export const lineSeconds = (l: MeetingLine) => CLIP_SECONDS[l.id ?? INTRO_STEP[l.agent]] ?? 0;

/** Total recorded audio in a full voiced meeting. */
export const FULL_MEETING_AUDIO_SECONDS = VOICED_MEETING_LINES.reduce((n, l) => n + lineSeconds(l), 0);

/**
 * "Meet the team" comes in two versions. The full one plays every agent's recorded
 * introduction; the quick one is captions only, one line each, for a visitor short on time
 * (or without sound). Both use the same choreography and controls. The durations below are
 * what the simulation measures with the real clip lengths and reading pace (an e2e test
 * keeps them honest), rounded for the labels.
 */
export const INTRO_QUICK_LINES = Object.fromEntries(SILENT_MEETING_LINES.map((l) => [l.agent, l.text])) as Record<HqAgentId, string>;
export const INTRO_FULL_ABOUT_SECONDS = 210;
export const INTRO_FULL_LABEL = "about 3½ min";
export const INTRO_QUICK_ABOUT_SECONDS = 60;
export const INTRO_QUICK_LABEL = "about 1 min";

/** Reading time of the quick meeting's lines (the same pacing the simulation uses). */
export const QUICK_MEETING_SPEAKING_SECONDS = SILENT_MEETING_LINES.reduce((n, l) => n + Math.max(3.2, l.text.trim().split(/\s+/).length / 2.6), 0);

export const formatClip = (s: number) => {
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
};

export const hqAgent = (id: HqAgentId) => agentById[id];
