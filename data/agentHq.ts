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
};

function pick(stepId: string) {
  const s = teamSteps.find((x) => x.id === stepId);
  if (!s) throw new Error(`Missing team step ${stepId}`);
  return { caption: s.caption, audioFile: s.audioFile };
}

/**
 * Lines shown in speech bubbles during a captions-only meeting: one sentence from
 * each character's existing caption, quoted exactly.
 */
export const SILENT_MEETING_LINES: MeetingLine[] = [
  { agent: "astra", text: "Every system starts with a clear plan." },
  { agent: "nova", text: "My goal is to make complex technology feel elegant and understandable." },
  { agent: "forge", text: "I transform design systems into working applications, building responsive interfaces, interactive components, and polished user experiences." },
];

/** A voiced meeting plays each character's full recorded introduction, in handoff order. */
export const VOICED_MEETING_LINES: MeetingLine[] = (["astra", "nova", "forge"] as HqAgentId[]).map((agent) => ({
  agent,
  text: HQ_INTRO[agent].caption,
}));

/**
 * Length of each existing recording in seconds, measured from the MP3 frame headers
 * (an e2e test checks these against the browser's own decoded durations).
 */
export const CLIP_SECONDS: Record<HqAgentId, number> = { astra: 29.9, nova: 24.8, forge: 26.7 };

/** Total recorded audio in a full voiced meeting. */
export const FULL_MEETING_AUDIO_SECONDS = VOICED_MEETING_LINES.reduce((n, l) => n + CLIP_SECONDS[l.agent], 0);

export const formatClip = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export const hqAgent = (id: HqAgentId) => agentById[id];
