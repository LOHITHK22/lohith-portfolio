import { test, expect } from "@playwright/test";
import {
  DESKS,
  ERRANDS,
  FACE,
  HQ_AGENTS,
  MEETING_SPOTS,
  PROPS,
  TABLE_CENTER,
  isFloor,
  walkableFor,
  type HqAgentId,
} from "../../lib/agentHq/layout";
import { findPath } from "../../lib/agentHq/path";
import { BODY, computePose, toWorld } from "../../lib/agentHq/pose";
import {
  AUTO_MEETING_EVERY,
  DT,
  FIRST_AUTO_MEETING,
  STYLES,
  advanceSpeaker,
  angleDiff,
  callMeeting,
  charById,
  clearFocus,
  createSim,
  drainEvents,
  jumpToSpeaker,
  narrationDone,
  run,
  seatedAtDesk,
  selectAgent,
  skipMeeting,
  step,
  type Sim,
  type SimEvent,
} from "../../lib/agentHq/sim";
import { HQ_INTRO, SILENT_MEETING_LINES, VOICED_MEETING_LINES } from "../../data/agentHq";
import { agentById, teamSteps } from "../../data/agentTeam";

// Engine tests for Agent HQ: the floor plan, pathfinding, collision avoidance, the
// meeting director, selection, reduced motion and the walk-cycle skeleton. The
// simulation is stepped directly at its fixed timestep; no browser needed.

const tileOf = (v: number) => Math.floor(v);
const lines = SILENT_MEETING_LINES;

/**
 * Runs the sim and checks the movement invariants on every step. Violations are
 * collected and asserted once at the end (calling expect() hundreds of thousands
 * of times in a hot loop is very slow).
 */
function runChecked(sim: Sim, seconds: number, onStep?: (s: Sim) => void) {
  const stats = { minDist: Infinity, walkFrames: 0, longestWait: 0, misaligned: 0 };
  const violations: string[] = [];
  const waiting = new Map<HqAgentId, number>();
  run(sim, seconds, (s) => {
    for (const c of s.chars) {
      const at = `${c.id} at ${c.x.toFixed(2)},${c.y.toFixed(2)} t=${s.time.toFixed(2)}`;
      if (!(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.face))) violations.push(`non-finite ${at}`);
      // Never inside a desk, table, wall or someone else's chair.
      else if (!walkableFor(c.id, tileOf(c.x), tileOf(c.y))) violations.push(`not walkable: ${at}`);
      if (c.to) {
        stats.walkFrames++;
        // Facing the direction of travel (allowing for the brief turn into a corner).
        const dir = Math.atan2(c.to.y - c.at.y, c.to.x - c.at.x);
        if (Math.abs(angleDiff(c.face, dir)) > 0.65) stats.misaligned++;
        // Moves are one tile along a grid axis.
        if (Math.abs(c.to.x - c.at.x) + Math.abs(c.to.y - c.at.y) !== 1) violations.push(`non-adjacent step: ${at}`);
      }
      const w = c.activity === "waiting" ? (waiting.get(c.id) ?? 0) + DT : 0;
      waiting.set(c.id, w);
      stats.longestWait = Math.max(stats.longestWait, w);
    }
    for (let i = 0; i < s.chars.length; i++)
      for (let j = i + 1; j < s.chars.length; j++) {
        const a = s.chars[i];
        const b = s.chars[j];
        stats.minDist = Math.min(stats.minDist, Math.hypot(a.x - b.x, a.y - b.y));
      }
    onStep?.(s);
  });
  expect(violations.slice(0, 10)).toEqual([]);
  return stats;
}

function collectEvents(sim: Sim, seconds: number) {
  const events: (SimEvent & { at: number })[] = [];
  run(sim, seconds, (s) => events.push(...drainEvents(s).map((e) => ({ ...e, at: s.time }))));
  return events;
}

test.describe("Agent HQ floor plan", () => {
  test("every seat, meeting spot and errand spot is reachable floor, and spots never overlap", () => {
    const spots = [
      ...HQ_AGENTS.map((id) => DESKS[id].seat),
      ...HQ_AGENTS.map((id) => MEETING_SPOTS[id]),
      ...ERRANDS.map((e) => e.spot),
    ];
    for (const s of spots) expect(isFloor(s.x, s.y), `${s.x},${s.y}`).toBe(true);
    expect(new Set(spots.map((s) => `${s.x},${s.y}`)).size).toBe(spots.length);
    for (const id of HQ_AGENTS) {
      const seat = DESKS[id].seat;
      for (const target of [...ERRANDS.map((e) => e.spot), MEETING_SPOTS[id]]) {
        expect(findPath(id, seat, target), `${id} → ${target.x},${target.y}`).not.toBeNull();
      }
    }
  });

  test("chairs belong to their owner; desks and the table are solid for everyone", () => {
    for (const owner of HQ_AGENTS) {
      const seat = DESKS[owner].seat;
      for (const who of HQ_AGENTS) expect(walkableFor(who, seat.x, seat.y)).toBe(who === owner);
    }
    for (const p of PROPS)
      for (let x = p.x0; x < p.x1; x++) for (let y = p.y0; y < p.y1; y++) for (const who of HQ_AGENTS) expect(walkableFor(who, x, y)).toBe(false);
  });

  test("meeting spots face the table centre", () => {
    for (const id of HQ_AGENTS) {
      const s = MEETING_SPOTS[id];
      const want = Math.atan2(TABLE_CENTER.y - (s.y + 0.5), TABLE_CENTER.x - (s.x + 0.5));
      expect(Math.abs(angleDiff(s.face, want))).toBeLessThan(1e-9);
    }
  });
});

test.describe("Agent HQ pathfinding", () => {
  test("paths are 4-connected, stay on walkable floor and end at the goal", () => {
    for (const who of HQ_AGENTS) {
      for (const goal of [MEETING_SPOTS[who], ...ERRANDS.map((e) => e.spot)]) {
        const from = DESKS[who].seat;
        const path = findPath(who, from, goal)!;
        let prev = { x: from.x, y: from.y };
        for (const t of path) {
          expect(Math.abs(t.x - prev.x) + Math.abs(t.y - prev.y)).toBe(1);
          expect(walkableFor(who, t.x, t.y)).toBe(true);
          prev = t;
        }
        expect(prev).toEqual({ x: goal.x, y: goal.y });
      }
    }
  });

  test("routes around blocked tiles, refuses solid goals, and is deterministic", () => {
    const from = { x: 0, y: 3 };
    const to = { x: 9, y: 2 };
    const direct = findPath("astra", from, to)!;
    const blocked = new Set(direct.slice(2, 4).map((t) => `${t.x},${t.y}`));
    const detour = findPath("astra", from, to, blocked)!;
    expect(detour.some((t) => blocked.has(`${t.x},${t.y}`))).toBe(false);
    expect(detour.at(-1)).toEqual(to);
    expect(findPath("astra", from, { x: 6, y: 4 })).toBeNull(); // the table
    expect(findPath("nova", from, DESKS.astra.seat)).toBeNull(); // someone else's chair
    expect(findPath("astra", from, to)).toEqual(direct);
  });

  test("prefers straight lines: no more corners than needed", () => {
    // Along the open aisle the route is a straight line.
    const path = findPath("forge", { x: 0, y: 3 }, { x: 8, y: 3 })!;
    expect(path.every((t) => t.y === 3)).toBe(true);
  });
});

test.describe("Agent HQ simulation", () => {
  test("ten minutes of office life: no one walks through furniture or into each other", () => {
    const sim = createSim({ silentLines: lines });
    const seen = new Set<string>();
    const stats = runChecked(sim, 600, (s) => {
      for (const c of s.chars) seen.add(`${c.id}:${c.activity}`);
    });
    expect(stats.minDist).toBeGreaterThanOrEqual(0.99);
    expect(stats.longestWait).toBeLessThan(4);
    // Turning into a corner happens on the spot; while moving, characters face their direction of travel.
    expect(stats.misaligned).toBe(0);
    for (const id of HQ_AGENTS) {
      for (const a of ["walking", "working", "errand", "sitting-down", "standing-up", "meeting"]) expect(seen.has(`${id}:${a}`), `${id} ${a}`).toBe(true);
    }
  });

  test("starts with everyone working at their desk, and the office comes alive within seconds", () => {
    const sim = createSim({ silentLines: lines });
    for (const c of sim.chars) expect(seatedAtDesk(c)).toBe(true);
    run(sim, 10);
    expect(sim.chars.filter((c) => !seatedAtDesk(c)).length).toBeGreaterThan(0);
  });

  test("errands go to the right place and the character comes back and sits down", () => {
    const sim = createSim({ silentLines: [] });
    const visited = new Map<HqAgentId, Set<string>>(HQ_AGENTS.map((id) => [id, new Set()]));
    const wrong: string[] = [];
    run(sim, 300, (s) => {
      for (const c of s.chars) {
        if (c.activity !== "errand" || !c.errand) continue;
        const e = ERRANDS.find((x) => x.id === c.errand)!;
        if (c.at.x !== e.spot.x || c.at.y !== e.spot.y || Math.abs(angleDiff(c.face, e.spot.face)) >= 0.05) wrong.push(`${c.id} ${e.id} t=${s.time.toFixed(1)}`);
        visited.get(c.id)!.add(e.id);
      }
    });
    expect(wrong).toEqual([]);
    for (const id of HQ_AGENTS) expect(visited.get(id)!.size, id).toBeGreaterThanOrEqual(2);
    // No meetings were configured, so everyone keeps cycling between desk and errands.
    expect(sim.meeting).toBeNull();
  });

  test("movement styles differ: FORGE walks faster than NOVA, NOVA faster than ASTRA", () => {
    expect(STYLES.forge.speed).toBeGreaterThan(STYLES.nova.speed);
    expect(STYLES.nova.speed).toBeGreaterThan(STYLES.astra.speed);
  });

  test("is deterministic", () => {
    const a = createSim({ silentLines: lines });
    const b = createSim({ silentLines: lines });
    run(a, 150);
    run(b, 150);
    expect(a.chars.map((c) => [c.x, c.y, c.face, c.activity])).toEqual(b.chars.map((c) => [c.x, c.y, c.face, c.activity]));
  });
});

test.describe("Agent HQ meetings", () => {
  test("ASTRA calls, everyone walks to the table, each speaks in turn, then all return to their desks", () => {
    // No ambient schedule here (it needs silent lines), so only the requested meeting runs.
    const sim = createSim({ silentLines: [] });
    run(sim, 3);
    drainEvents(sim);
    callMeeting(sim, { voiced: false, lines });
    const phases: string[] = [];
    const speakers: HqAgentId[] = [];
    let maxTalking = 0;
    let atTableWhileSpeaking = true;
    runChecked(sim, 60, (s) => {
      for (const e of drainEvents(s)) {
        if (e.type === "meeting-phase") phases.push(e.phase);
        if (e.type === "speaker") speakers.push(e.agent);
        if (e.type === "meeting-end") phases.push("end");
      }
      maxTalking = Math.max(maxTalking, s.chars.filter((c) => c.gesture === "talk").length);
      if (s.meeting?.phase === "speaking") {
        for (const c of s.chars) {
          const spot = MEETING_SPOTS[c.id];
          if (c.at.x !== spot.x || c.at.y !== spot.y || c.to) atTableWhileSpeaking = false;
        }
      }
    });
    expect(phases).toEqual(["calling", "gathering", "speaking", "closing", "returning", "end"]);
    expect(speakers).toEqual(["astra", "nova", "forge"]);
    expect(maxTalking).toBe(1);
    expect(atTableWhileSpeaking).toBe(true);
    expect(sim.meeting).toBeNull();
    for (const c of sim.chars) expect(seatedAtDesk(c)).toBe(true);
  });

  test("listeners turn their heads towards the speaker", () => {
    const sim = createSim({ silentLines: lines });
    callMeeting(sim, { voiced: false, lines });
    let checked = 0;
    const wrong: string[] = [];
    run(sim, 60, (s) => {
      if (s.meeting?.phase === "speaking" && s.meeting.t > 1.5) {
        const speaker = charById(s, s.meeting.lines[s.meeting.speaker].agent);
        for (const c of s.chars) {
          if (c === speaker) continue;
          const want = Math.atan2(speaker.y - c.y, speaker.x - c.x);
          const clamped = Math.max(-0.9, Math.min(0.9, angleDiff(c.face, want)));
          checked++;
          if (Math.abs(c.look - clamped) >= 0.05) wrong.push(`${c.id} t=${s.time.toFixed(1)}`);
        }
      }
    });
    expect(checked).toBeGreaterThan(100);
    expect(wrong).toEqual([]);
  });

  test("a voiced meeting waits for each recording to finish before the next speaker", () => {
    const sim = createSim({ silentLines: lines });
    callMeeting(sim, { voiced: true, lines: VOICED_MEETING_LINES });
    const events = collectEvents(sim, 60);
    expect(events.filter((e) => e.type === "speaker")).toHaveLength(1);
    expect(sim.meeting?.phase).toBe("speaking");
    advanceSpeaker(sim);
    expect(drainEvents(sim)).toEqual([{ type: "speaker", index: 1, agent: "nova", voiced: true }]);
  });

  test("jumping to a speaker starts that agent's turn directly; the others listen", () => {
    const sim = createSim({ silentLines: [] });
    callMeeting(sim, { voiced: true, lines: VOICED_MEETING_LINES });
    collectEvents(sim, 60);
    expect(sim.meeting?.speaker).toBe(0);
    jumpToSpeaker(sim, 2);
    expect(drainEvents(sim)).toEqual([{ type: "speaker", index: 2, agent: "forge", voiced: true }]);
    // Activities update on the next simulation step.
    step(sim, DT);
    expect(charById(sim, "forge").activity).toBe("speaking");
    expect(charById(sim, "astra").activity).toBe("meeting");
    expect(charById(sim, "nova").activity).toBe("meeting");
    // Jumping to the current speaker, out of range, or outside the speaking phase does nothing.
    jumpToSpeaker(sim, 2);
    jumpToSpeaker(sim, 7);
    expect(drainEvents(sim)).toEqual([]);
    advanceSpeaker(sim);
    expect(sim.meeting?.phase).toBe("closing");
    drainEvents(sim);
    jumpToSpeaker(sim, 0);
    expect(drainEvents(sim)).toEqual([]);
  });

  test("a quick captions-only meeting wraps up in under 30 seconds", () => {
    for (const warm of [0, 7, 13, 19]) {
      const sim = createSim({ silentLines: [] });
      run(sim, warm);
      drainEvents(sim);
      const t0 = sim.time;
      callMeeting(sim, { voiced: false, lines });
      const events = collectEvents(sim, 40);
      const returning = events.find((e) => e.type === "meeting-phase" && e.phase === "returning");
      expect(returning, `warm-up ${warm}s`).toBeTruthy();
      expect(returning!.at - t0, `warm-up ${warm}s`).toBeLessThan(30);
      expect(events.filter((e) => e.type === "speaker")).toHaveLength(3);
    }
  });

  test("skipping sends everyone straight back; nobody speaks after the skip", () => {
    const sim = createSim({ silentLines: [] });
    callMeeting(sim, { voiced: false, lines });
    run(sim, 3);
    expect(sim.meeting?.phase).toBe("gathering");
    skipMeeting(sim);
    drainEvents(sim);
    const events = collectEvents(sim, 30);
    expect(events.some((e) => e.type === "speaker")).toBe(false);
    expect(events.at(-1)?.type).toBe("meeting-end");
    for (const c of sim.chars) expect(seatedAtDesk(c)).toBe(true);
  });

  test("ambient meetings happen on a schedule and are captions-only", () => {
    const sim = createSim({ silentLines: lines });
    const events = collectEvents(sim, FIRST_AUTO_MEETING + AUTO_MEETING_EVERY + 5);
    const calls = events.filter((e) => e.type === "meeting-phase" && e.phase === "calling");
    expect(calls.map((e) => Math.round(e.at))).toEqual([FIRST_AUTO_MEETING, FIRST_AUTO_MEETING + AUTO_MEETING_EVERY]);
  });

  test("a requested meeting or a visitor's selection postpones the next ambient meeting", () => {
    const sim = createSim({ silentLines: lines });
    run(sim, 5);
    callMeeting(sim, { voiced: false, lines });
    expect(sim.nextAutoMeeting).toBeCloseTo(5 + AUTO_MEETING_EVERY, 5);
    const other = createSim({ silentLines: lines });
    run(other, FIRST_AUTO_MEETING - 1);
    selectAgent(other, "nova");
    const events = collectEvents(other, 10);
    expect(events.some((e) => e.type === "meeting-phase")).toBe(false);
    expect(events.filter((e) => e.type === "speaker").every((e) => e.type === "speaker" && !e.voiced)).toBe(true);
  });
});

test.describe("Agent HQ selection", () => {
  test("a seated character stands, steps out from its desk, faces the visitor, waves, then talks", () => {
    const sim = createSim({ silentLines: lines });
    const forge = charById(sim, "forge");
    selectAgent(sim, "forge");
    const order: string[] = [];
    runChecked(sim, 6, () => {
      if (order.at(-1) !== forge.activity) order.push(forge.activity);
    });
    expect(order[0]).toBe("standing-up");
    expect(order).toContain("walking");
    expect(order.indexOf("greeting")).toBeGreaterThan(order.indexOf("walking"));
    expect(order.at(-1)).toBe("speaking");
    expect(forge.at).toEqual({ x: DESKS.forge.seat.x, y: DESKS.forge.seat.y + 1 });
    expect(forge.face).toBeCloseTo(FACE.viewer, 5);
    expect(forge.gesture).toBe("talk");
  });

  test("the others carry on while one character is selected; going back returns it to its desk", () => {
    const sim = createSim({ silentLines: lines });
    selectAgent(sim, "nova");
    const start = sim.chars.filter((c) => c.id !== "nova").map((c) => [c.x, c.y]);
    run(sim, 12);
    expect(sim.chars.filter((c) => c.id !== "nova").map((c) => [c.x, c.y])).not.toEqual(start);
    narrationDone(sim, "nova");
    run(sim, 0.1);
    expect(charById(sim, "nova").activity).toBe("presenting");
    clearFocus(sim);
    run(sim, 10);
    expect(sim.focus).toBeNull();
    const nova = charById(sim, "nova");
    expect(seatedAtDesk(nova) || nova.activity === "errand" || nova.activity === "walking").toBe(true);
  });

  test("selecting during a meeting ends the meeting first", () => {
    const sim = createSim({ silentLines: lines });
    callMeeting(sim, { voiced: false, lines });
    run(sim, 10);
    selectAgent(sim, "astra");
    expect(sim.meeting?.phase).toBe("returning");
    run(sim, 20);
    expect(sim.meeting).toBeNull();
    expect(sim.mode).toBe("focus");
    expect(charById(sim, "astra").activity).toBe("speaking");
  });
});

test.describe("Agent HQ reduced motion", () => {
  test("no one wanders, there are no automatic meetings, and a requested meeting happens without walking", () => {
    const sim = createSim({ reduced: true, silentLines: lines });
    let walked = false;
    run(sim, FIRST_AUTO_MEETING + 30, (s) => {
      if (s.chars.some((c) => c.to || c.activity === "walking")) walked = true;
    });
    expect(walked).toBe(false);
    expect(sim.meeting).toBeNull();
    for (const c of sim.chars) expect(seatedAtDesk(c)).toBe(true);

    callMeeting(sim, { voiced: false, lines });
    let gathered = false;
    run(sim, 30, (s) => {
      if (s.chars.some((c) => c.to)) walked = true;
      if (s.meeting?.phase === "speaking") gathered = s.chars.every((c) => c.at.x === MEETING_SPOTS[c.id].x && c.at.y === MEETING_SPOTS[c.id].y);
    });
    expect(walked).toBe(false);
    expect(gathered).toBe(true);
  });
});

test.describe("Agent HQ walk cycle", () => {
  const base = { walkAmt: 1, sit: 0, gesture: "none" as const, t: 0, level: 0, bob: 1, armSwing: 0.4, still: false };

  test("legs swing in opposition, the stance foot stays on the floor, and the arms counter-swing", () => {
    for (let i = 0; i < 16; i++) {
      const ph = (i / 16) * Math.PI * 2;
      const p = computePose({ ...base, walkPhase: ph });
      const [l, r] = p.foot;
      // Feet lead alternately: the left foot is ahead exactly when the left thigh swings forward.
      if (Math.abs(Math.sin(ph)) > 0.3) expect(Math.sign(l.f - r.f)).toBe(Math.sign(Math.sin(ph)));
      // One foot is always planted.
      expect(Math.min(l.z, r.z)).toBeCloseTo(0, 5);
      expect(Math.max(l.z, r.z)).toBeGreaterThanOrEqual(-1e-9);
      // Arms counter-swing: when the left foot leads, the left hand trails the right hand.
      if (Math.abs(Math.sin(ph)) > 0.3) expect(Math.sign(p.hand[0].f - p.hand[1].f)).toBe(-Math.sign(l.f - r.f));
    }
  });

  test("the swing leg lifts off the floor during a stride", () => {
    let maxLift = 0;
    for (let i = 0; i < 32; i++) {
      const p = computePose({ ...base, walkPhase: (i / 32) * Math.PI * 2 });
      maxLift = Math.max(maxLift, Math.max(p.foot[0].z, p.foot[1].z));
    }
    expect(maxLift).toBeGreaterThan(1.5);
  });

  test("standing still is upright; seated puts the hips on the chair; a wave raises the hand above the head", () => {
    const stand = computePose({ ...base, walkAmt: 0, walkPhase: 0 });
    expect(stand.pelvis.z).toBeGreaterThan(BODY.thigh + BODY.shin - 0.5);
    const seated = computePose({ ...base, walkAmt: 0, walkPhase: 0, sit: 1, gesture: "type" });
    expect(seated.pelvis.z).toBeCloseTo(BODY.seatZ, 5);
    // Typing hands reach forward to the desk.
    expect(seated.hand[0].f).toBeGreaterThan(8);
    const wave = computePose({ ...base, walkAmt: 0, walkPhase: 0, gesture: "wave" });
    expect(wave.hand[1].z).toBeGreaterThan(wave.head.z);
  });

  test("facing rotates the skeleton in the floor plane", () => {
    const p = { f: 10, s: 0, z: 5 };
    expect(toWorld(p, 0)).toEqual({ dx: 10, dy: 0, z: 5 });
    const w = toWorld(p, Math.PI / 2);
    expect(w.dx).toBeCloseTo(0, 9);
    expect(w.dy).toBeCloseTo(10, 9);
  });
});

test.describe("Agent HQ content", () => {
  test("reuses the existing personas, captions and recordings without inventing lines", () => {
    for (const id of HQ_AGENTS) {
      const step = teamSteps.find((s) => s.agentId === id && s.audioFile === HQ_INTRO[id].audioFile)!;
      expect(step.caption).toBe(HQ_INTRO[id].caption);
      expect(agentById[id].name).toBe(id.toUpperCase());
    }
    for (const l of SILENT_MEETING_LINES) expect(HQ_INTRO[l.agent].caption).toContain(l.text);
    expect(VOICED_MEETING_LINES.map((l) => l.text)).toEqual(HQ_AGENTS.map((id) => HQ_INTRO[id].caption));
  });

  test("one step of the simulation is the fixed timestep", () => {
    const sim = createSim();
    step(sim);
    expect(sim.time).toBeCloseTo(DT, 12);
  });
});
