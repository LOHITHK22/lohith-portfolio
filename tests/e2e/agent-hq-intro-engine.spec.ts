import { test, expect } from "@playwright/test";
import { DESKS, HQ_AGENTS, PRESENTATION_SPOT, walkableFor, type HqAgentId } from "../../lib/agentHq/layout";
import {
  DT,
  INTRO_HURRY,
  STYLES,
  callMeeting,
  charById,
  createSim,
  drainEvents,
  finishIntro,
  introGoTo,
  introNarrationDone,
  introPresenter,
  run,
  seatedAtDesk,
  setReduced,
  startIntro,
  step,
  type Sim,
  type SimEvent,
} from "../../lib/agentHq/sim";
import { CLIP_SECONDS, INTRO_STEP, SILENT_MEETING_LINES } from "../../data/agentHq";

// "Meet the team" introduction, simulation only: one agent at a time walks to the
// presentation spot, faces the visitor, waves, speaks, and walks back to its desk before
// the next one speaks. Every movement invariant is checked on every fixed step.

const tile = (v: number) => Math.floor(v);
const key = (t: { x: number; y: number }) => `${t.x},${t.y}`;

type Log = {
  violations: string[];
  speakers: HqAgentId[];
  approaches: HqAgentId[];
  ended: boolean;
  /** Most characters speaking at any one moment. */
  maxSpeaking: number;
  longestStuck: number;
  /** At each speaker event: where the speaker stood, which way it faced, and whether the previous presenter was back in its chair. */
  atSpeak: { agent: HqAgentId; at: string; face: number; previousSeated: boolean; time: number }[];
};

/**
 * Runs an introduction, standing in for the page: when a speaker starts, its narration
 * "plays" for `speakFor(agent)` seconds and then reports done. Checks the invariants each step.
 */
function runIntro(sim: Sim, opts: { speakFor?: (id: HqAgentId) => number; limit?: number; onStep?: (s: Sim, log: Log) => void } = {}): Log {
  const speakFor = opts.speakFor ?? (() => 2);
  const log: Log = { violations: [], speakers: [], approaches: [], ended: false, maxSpeaking: 0, longestStuck: 0, atSpeak: [] };
  const push = (v: string) => log.violations.length < 20 && log.violations.push(v);
  const prev = new Map<HqAgentId, { x: number; y: number }>();
  const stuck = new Map<HqAgentId, { tile: string; t: number }>();
  // The pending "narration finished" (kept in an object so the event handler can set it).
  const pending: { done: { index: number; t: number } | null } = { done: null };
  const limit = opts.limit ?? 600;
  const handle = (events: SimEvent[]) => {
    for (const e of events) {
      if (e.type === "intro-approach") log.approaches.push(e.agent);
      if (e.type === "intro-speaker") {
        log.speakers.push(e.agent);
        const c = charById(sim, e.agent);
        log.atSpeak.push({
          agent: e.agent,
          at: key(c.at),
          face: c.face,
          previousSeated: !log.speakers[log.speakers.length - 2] || seatedAtDesk(charById(sim, log.speakers[log.speakers.length - 2])),
          time: sim.time,
        });
        pending.done = { index: e.index, t: sim.time + speakFor(e.agent) };
      }
      if (e.type === "intro-end") log.ended = true;
    }
  };
  handle(drainEvents(sim));
  while (sim.time < limit && !log.ended) {
    step(sim, DT);
    handle(drainEvents(sim));
    if (pending.done && sim.time >= pending.done.t) {
      const d = pending.done;
      pending.done = null;
      introNarrationDone(sim, d.index);
      handle(drainEvents(sim));
    }
    opts.onStep?.(sim, log);
    const tiles = new Map<string, HqAgentId>();
    let speaking = 0;
    for (const c of sim.chars) {
      const at = `${c.id} at ${c.x.toFixed(2)},${c.y.toFixed(2)} t=${sim.time.toFixed(2)}`;
      if (!walkableFor(c.id, tile(c.x), tile(c.y))) push(`not walkable: ${at}`);
      const p = prev.get(c.id);
      if (p && Math.hypot(c.x - p.x, c.y - p.y) > STYLES[c.id].speed * INTRO_HURRY * DT + 1e-6) push(`jump: ${at}`);
      prev.set(c.id, { x: c.x, y: c.y });
      if (c.to && Math.abs(c.to.x - c.at.x) + Math.abs(c.to.y - c.at.y) !== 1) push(`non-adjacent step: ${at}`);
      for (const t of c.to ? [c.at, c.to] : [c.at]) {
        const other = tiles.get(key(t));
        if (other && other !== c.id) push(`shared tile ${key(t)}: ${c.id} and ${other} t=${sim.time.toFixed(2)}`);
        tiles.set(key(t), c.id);
      }
      if (c.activity === "speaking") speaking++;
      // Stuck: somewhere to go, but on the same tile for a long time.
      const goingSomewhere = c.tasks[0]?.k === "goto" || !!c.to;
      const s = stuck.get(c.id);
      const here = key(c.at);
      if (!goingSomewhere || !s || s.tile !== here) stuck.set(c.id, { tile: here, t: sim.time });
      else log.longestStuck = Math.max(log.longestStuck, sim.time - s.t);
    }
    log.maxSpeaking = Math.max(log.maxSpeaking, speaking);
  }
  return log;
}

const ORDER: HqAgentId[] = ["astra", "nova", "forge", "atlas", "pulse", "sentinel", "echo"];

test.describe("Agent HQ introduction (simulation)", () => {
  test("introduces all seven in order, one at a time, at the presentation spot facing the visitor", () => {
    const sim = createSim({ silentLines: SILENT_MEETING_LINES });
    run(sim, 20); // the office has been going for a while: some are away on errands
    startIntro(sim);
    const log = runIntro(sim);
    expect(log.violations).toEqual([]);
    expect(log.speakers).toEqual(ORDER);
    expect(log.approaches).toEqual(ORDER);
    expect(log.ended).toBe(true);
    expect(log.maxSpeaking).toBe(1);
    for (const s of log.atSpeak) {
      expect(s.at, `${s.agent} speaks from the presentation spot`).toBe(key(PRESENTATION_SPOT));
      expect(Math.abs(s.face - PRESENTATION_SPOT.face), `${s.agent} faces the visitor`).toBeLessThan(0.05);
      // The previous presenter is back in its chair before the next one speaks.
      expect(s.previousSeated, `the previous presenter is seated when ${s.agent} speaks`).toBe(true);
    }
    expect(log.longestStuck).toBeLessThan(4);
  });

  test("with the real clip lengths it takes about as long as the recordings plus short walks", () => {
    const sim = createSim({ silentLines: SILENT_MEETING_LINES });
    startIntro(sim);
    const t0 = sim.time;
    const log = runIntro(sim, { speakFor: (id) => CLIP_SECONDS[INTRO_STEP[id]] });
    expect(log.violations).toEqual([]);
    expect(log.speakers).toEqual(ORDER);
    const audio = ORDER.reduce((n, id) => n + CLIP_SECONDS[INTRO_STEP[id]], 0);
    const walking = sim.time - t0 - audio;
    // ASTRA's first walk plus the six handovers (each next agent walks while the last one heads back).
    expect(walking).toBeGreaterThan(0);
    expect(walking, `time between and before speakers: ${walking.toFixed(1)} s`).toBeLessThan(60);
    // Gaps between speakers: never a long wait.
    for (let i = 1; i < log.atSpeak.length; i++) {
      const prevEnd = log.atSpeak[i - 1].time + CLIP_SECONDS[INTRO_STEP[log.atSpeak[i - 1].agent]];
      expect(log.atSpeak[i].time - prevEnd, `gap before ${log.atSpeak[i].agent}`).toBeLessThan(12);
    }
  });

  test("everyone ends at their own desk and the office resumes its routines afterwards", () => {
    const sim = createSim({ silentLines: SILENT_MEETING_LINES });
    startIntro(sim);
    const log = runIntro(sim);
    expect(log.ended).toBe(true);
    expect(sim.mode).toBe("ambient");
    expect(sim.intro).toBeNull();
    run(sim, 15);
    for (const c of sim.chars) expect(seatedAtDesk(c) || c.tasks.length > 0, `${c.id} has something to do`).toBe(true);
    // Ambient life resumes: somebody leaves their desk within a minute.
    let left = false;
    run(sim, 60, (s) => {
      if (s.chars.some((c) => !seatedAtDesk(c) && c.errand)) left = true;
    });
    expect(left).toBe(true);
  });

  test("next and previous move the right agent forward and send the current one back", () => {
    const sim = createSim({ silentLines: SILENT_MEETING_LINES });
    startIntro(sim);
    const log = runIntro(sim, {
      speakFor: () => 3,
      onStep: (s, l) => {
        // While ASTRA walks out the first time, skip ahead to FORGE, then back to NOVA mid-walk.
        if (l.approaches.length === 1 && s.time > 1.5) introGoTo(s, 2);
        if (l.approaches.length === 2 && introPresenter(s) === "forge" && s.time > 3) introGoTo(s, 1);
      },
    });
    expect(log.violations).toEqual([]);
    expect(log.approaches.slice(0, 3)).toEqual(["astra", "forge", "nova"]);
    expect(log.speakers).toEqual(["nova", "forge", "atlas", "pulse", "sentinel", "echo"]);
    expect(log.ended).toBe(true);
    expect(log.maxSpeaking).toBe(1);
  });

  test("next during speech and repeated previous presses never deadlock", () => {
    const sim = createSim({ silentLines: SILENT_MEETING_LINES });
    startIntro(sim);
    let presses = 0;
    const log = runIntro(sim, {
      speakFor: () => 4,
      onStep: (s) => {
        // A restless visitor: every 1.7 s alternate next and previous, eight times.
        if (presses < 8 && s.time > (presses + 1) * 1.7) {
          const i = s.intro!.index;
          introGoTo(s, presses % 2 === 0 ? Math.min(6, i + 1) : Math.max(0, i - 1));
          presses++;
        }
      },
    });
    expect(log.violations).toEqual([]);
    expect(log.ended).toBe(true);
    expect(log.longestStuck).toBeLessThan(4);
    expect(log.maxSpeaking).toBe(1);
  });

  test("skipping ends it at once and everyone walks back to their desk", () => {
    const sim = createSim({ silentLines: SILENT_MEETING_LINES });
    startIntro(sim);
    run(sim, 4);
    expect(introPresenter(sim)).toBe("astra");
    finishIntro(sim);
    const events = drainEvents(sim);
    expect(events.some((e) => e.type === "intro-end")).toBe(true);
    expect(sim.intro).toBeNull();
    let speaking = 0;
    run(sim, 20, (s) => (speaking = Math.max(speaking, s.chars.filter((c) => c.activity === "speaking").length)));
    expect(speaking).toBe(0);
    expect(seatedAtDesk(charById(sim, "astra")) || charById(sim, "astra").errand !== null).toBe(true);
  });

  test("a narration-done for a speaker that is no longer current is ignored", () => {
    const sim = createSim({ silentLines: SILENT_MEETING_LINES });
    startIntro(sim);
    const log = runIntro(sim, { speakFor: () => 1, limit: 40, onStep: (s) => introNarrationDone(s, 0) });
    expect(log.speakers[0]).toBe("astra");
    expect(log.violations).toEqual([]);
  });

  test("starting during a meeting takes over cleanly", () => {
    const sim = createSim({ silentLines: SILENT_MEETING_LINES });
    callMeeting(sim, { voiced: false, lines: SILENT_MEETING_LINES });
    run(sim, 8);
    startIntro(sim);
    expect(sim.meeting).toBeNull();
    const log = runIntro(sim);
    expect(log.violations).toEqual([]);
    expect(log.speakers).toEqual(ORDER);
  });

  test("other seeds and start times: no collisions, no deadlocks", () => {
    for (const seed of [1, 3, 11, 23]) {
      for (const warm of [0, 47, 133]) {
        const sim = createSim({ silentLines: SILENT_MEETING_LINES, seed });
        run(sim, warm);
        startIntro(sim);
        const log = runIntro(sim, { speakFor: () => 1.5 });
        expect(log.violations, `seed ${seed}, after ${warm} s`).toEqual([]);
        expect(log.speakers, `seed ${seed}, after ${warm} s`).toEqual(ORDER);
        expect(log.longestStuck, `seed ${seed}, after ${warm} s`).toBeLessThan(4);
      }
    }
  });

  test("reduced motion: no walking, everyone appears in place and the order is the same", () => {
    const sim = createSim({ silentLines: SILENT_MEETING_LINES, reduced: true });
    startIntro(sim);
    let moved = false;
    const log = runIntro(sim, { onStep: (s) => (moved = moved || s.chars.some((c) => !!c.to)) });
    expect(moved).toBe(false);
    expect(log.speakers).toEqual(ORDER);
    expect(log.ended).toBe(true);
    run(sim, 1);
    for (const id of HQ_AGENTS) {
      const c = charById(sim, id);
      expect(key(c.at)).toBe(key(DESKS[id].seat));
    }
    // Switching reduced motion off mid-introduction keeps the introduction in charge.
    const s2 = createSim({ silentLines: SILENT_MEETING_LINES });
    startIntro(s2);
    run(s2, 2);
    setReduced(s2, true);
    expect(s2.mode).toBe("intro");
    expect(runIntro(s2).speakers).toEqual(ORDER);
  });
});
