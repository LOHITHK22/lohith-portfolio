import { test, expect } from "@playwright/test";
import { DESKS, ERRANDS, HQ_AGENTS, MEETING_SPOTS, ROUTINES, walkableFor, type HqAgentId } from "../../lib/agentHq/layout";
import { findPath } from "../../lib/agentHq/path";
import {
  DT,
  MEETING_HURRY,
  STYLES,
  callMeeting,
  charById,
  createSim,
  drainEvents,
  jumpToSpeaker,
  run,
  seatedAtDesk,
  type Character,
  type Sim,
} from "../../lib/agentHq/sim";
import { SILENT_MEETING_LINES, VOICED_MEETING_LINES } from "../../data/agentHq";

// Seven-agent office tests: a deterministic half-hour of office life with every movement
// invariant checked on every step, several other seeds, a forced head-on standoff,
// meeting reachability and the role behaviours (visits, conversations, desk activities).

const tile = (v: number) => Math.floor(v);
const key = (t: { x: number; y: number }) => `${t.x},${t.y}`;

type Report = {
  violations: string[];
  minDist: number;
  longestWait: number;
  /** Longest time anyone with somewhere to go stood on the same tile. */
  longestStuck: number;
  errands: Record<HqAgentId, number>;
  meetingsCalled: number;
  meetingsEnded: number;
  speakersPerMeeting: HqAgentId[][];
  labels: Record<HqAgentId, string[]>;
  visitsWithoutHost: string[];
  conversationTurns: number;
};

/** Runs the office and checks the movement invariants on every fixed step. */
function observe(sim: Sim, seconds: number): Report {
  const r: Report = {
    violations: [],
    minDist: Infinity,
    longestWait: 0,
    longestStuck: 0,
    errands: Object.fromEntries(HQ_AGENTS.map((id) => [id, 0])) as Record<HqAgentId, number>,
    meetingsCalled: 0,
    meetingsEnded: 0,
    speakersPerMeeting: [],
    labels: Object.fromEntries(HQ_AGENTS.map((id) => [id, []])) as unknown as Record<HqAgentId, string[]>,
    visitsWithoutHost: [],
    conversationTurns: 0,
  };
  const prev = new Map<HqAgentId, { x: number; y: number }>();
  const wait = new Map<HqAgentId, number>();
  const stuck = new Map<HqAgentId, { tile: string; t: number }>();
  const inErrand = new Map<HqAgentId, boolean>();
  const lastGesture = new Map<HqAgentId, string>();
  const push = (v: string) => r.violations.length < 20 && r.violations.push(v);

  run(sim, seconds, (s) => {
    for (const e of drainEvents(s)) {
      if (e.type === "meeting-phase" && e.phase === "calling") {
        r.meetingsCalled++;
        r.speakersPerMeeting.push([]);
      }
      if (e.type === "speaker") r.speakersPerMeeting.at(-1)?.push(e.agent);
      if (e.type === "meeting-end") r.meetingsEnded++;
    }
    const tiles = new Map<string, HqAgentId>();
    for (const c of s.chars) {
      const at = `${c.id} at ${c.x.toFixed(2)},${c.y.toFixed(2)} t=${s.time.toFixed(2)}`;
      if (!Number.isFinite(c.x + c.y + c.face)) push(`non-finite ${at}`);
      // Never in furniture, a wall, or someone else's chair.
      if (!walkableFor(c.id, tile(c.x), tile(c.y))) push(`not walkable: ${at}`);
      // No teleporting: never faster than its own walking speed (with the meeting hurry).
      const p = prev.get(c.id);
      if (p && Math.hypot(c.x - p.x, c.y - p.y) > STYLES[c.id].speed * MEETING_HURRY * DT + 1e-6) push(`jump: ${at}`);
      prev.set(c.id, { x: c.x, y: c.y });
      // Moves are one tile along a grid axis.
      if (c.to && Math.abs(c.to.x - c.at.x) + Math.abs(c.to.y - c.at.y) !== 1) push(`non-adjacent step: ${at}`);
      // No two characters ever hold the same tile (where they stand, or the tile they are stepping into).
      for (const t of c.to ? [c.at, c.to] : [c.at]) {
        const other = tiles.get(key(t));
        if (other && other !== c.id) push(`shared tile ${key(t)}: ${c.id} and ${other} t=${s.time.toFixed(2)}`);
        tiles.set(key(t), c.id);
      }
      const w = c.activity === "waiting" ? (wait.get(c.id) ?? 0) + DT : 0;
      wait.set(c.id, w);
      r.longestWait = Math.max(r.longestWait, w);
      // Stuck: has a destination but has not changed tile.
      const going = c.tasks[0]?.k === "goto" && c.sit === 0;
      const st = stuck.get(c.id);
      if (!going || !st || st.tile !== key(c.at) || c.to) stuck.set(c.id, { tile: key(c.at), t: 0 });
      else {
        st.t += DT;
        r.longestStuck = Math.max(r.longestStuck, st.t);
      }
      // Errands completed, and the wording of what each character is doing.
      const doing = c.activity === "errand";
      if (doing && !inErrand.get(c.id)) r.errands[c.id]++;
      inErrand.set(c.id, doing);
      const labels = r.labels[c.id];
      if (labels.at(-1) !== c.label) labels.push(c.label);
      // A visit is only made to a colleague who is at their desk.
      if (doing && c.errand) {
        const e = ERRANDS.find((x) => x.id === c.errand)!;
        if (e.visit && c.at.x === e.spot.x && c.at.y === e.spot.y) {
          const host = charById(s, e.visit);
          const seat = DESKS[host.id].seat;
          if (host.at.x !== seat.x || host.at.y !== seat.y) r.visitsWithoutHost.push(`${c.id} → ${host.id} t=${s.time.toFixed(1)}`);
          if (lastGesture.get(c.id) && lastGesture.get(c.id) !== c.gesture) r.conversationTurns++;
        }
      }
      lastGesture.set(c.id, c.gesture);
    }
    for (let i = 0; i < s.chars.length; i++)
      for (let j = i + 1; j < s.chars.length; j++) r.minDist = Math.min(r.minDist, Math.hypot(s.chars[i].x - s.chars[j].x, s.chars[i].y - s.chars[j].y));
  });
  return r;
}

/** Index of the first label equal to `a` that is followed (later) by `b`. */
const followedBy = (labels: string[], a: string, b: string) => labels.some((l, i) => l === a && labels.slice(i + 1, i + 4).includes(b));

test.describe("Agent HQ seven-agent office", () => {
  test("thirty minutes of office life: no collisions, no shared tiles, no teleporting, steady progress and complete meetings", () => {
    const sim = createSim({ silentLines: SILENT_MEETING_LINES });
    const r = observe(sim, 30 * 60);
    expect(r.violations).toEqual([]);
    expect(r.minDist).toBeGreaterThanOrEqual(0.99);
    // Waiting for someone to pass is fine; nobody waits long or stays stuck.
    expect(r.longestWait).toBeLessThan(4);
    expect(r.longestStuck).toBeLessThan(5);
    // Everyone keeps doing things all half hour.
    for (const id of HQ_AGENTS) expect(r.errands[id], id).toBeGreaterThanOrEqual(12);
    // Ambient meetings run on schedule, every one completes, and all seven speak in team order.
    expect(r.meetingsCalled).toBeGreaterThanOrEqual(11);
    expect(r.meetingsEnded).toBeGreaterThanOrEqual(r.meetingsCalled - 1);
    for (const speakers of r.speakersPerMeeting.slice(0, r.meetingsEnded)) expect(speakers).toEqual(HQ_AGENTS);
    expect(r.visitsWithoutHost).toEqual([]);
  });

  test("the role behaviours happen as stories with a start and an end", () => {
    const sim = createSim({ silentLines: SILENT_MEETING_LINES });
    const r = observe(sim, 30 * 60);
    const L = r.labels;
    // SENTINEL reviews a simulated alert at its desk, then consults ATLAS about it.
    expect(followedBy(L.sentinel, "Reviewing a simulated security alert", "Consulting ATLAS about a simulated alert")).toBe(true);
    // PULSE spots a simulated performance warning, then investigates it at the build server.
    expect(followedBy(L.pulse, "Spotting a simulated performance warning", "Investigating a simulated performance warning")).toBe(true);
    // ECHO writes a script, then presents.
    expect(followedBy(L.echo, "Writing a narration script", "Presenting a narrated team update")).toBe(true);
    // NOVA sketches an idea, then shares it with ECHO.
    expect(followedBy(L.nova, "Sketching a creative idea", "Sharing a creative idea with ECHO")).toBe(true);
    // ATLAS draws architecture diagrams; FORGE visits ATLAS; ASTRA checks in with everyone.
    expect(L.atlas).toContain("Drawing an architecture diagram");
    expect(L.forge).toContain("Discussing interface architecture with ATLAS");
    for (const name of ["NOVA", "FORGE", "ATLAS", "PULSE", "SENTINEL", "ECHO"]) expect(L.astra.some((l) => l.includes(name)), name).toBe(true);
    // Each errand ends with the character back at its desk.
    for (const id of HQ_AGENTS) expect(L[id].filter((l) => l === "Working at the desk").length, id).toBeGreaterThan(5);
    // Visits are conversations: the visitor and the host take turns.
    expect(r.conversationTurns).toBeGreaterThan(50);
  });

  test("other seeds: ten minutes each without collisions or deadlocks", () => {
    for (const seed of [1, 2, 3, 11, 23, 42]) {
      const r = observe(createSim({ silentLines: SILENT_MEETING_LINES, seed }), 600);
      expect(r.violations, `seed ${seed}`).toEqual([]);
      expect(r.minDist, `seed ${seed}`).toBeGreaterThanOrEqual(0.99);
      expect(r.longestWait, `seed ${seed}`).toBeLessThan(4);
      expect(r.longestStuck, `seed ${seed}`).toBeLessThan(5);
      expect(r.meetingsEnded, `seed ${seed}`).toBeGreaterThanOrEqual(3);
    }
  });

  test("a head-on standoff in the aisle resolves: one gives way and both arrive", () => {
    const sim = createSim({ silentLines: [] });
    sim.nextAutoMeeting = Infinity;
    const place = (c: Character, x: number, y: number, face: number) => {
      Object.assign(c, { x: x + 0.5, y: y + 0.5, at: { x, y }, to: null, sit: 0, face, path: [], claim: null });
    };
    const forge = charById(sim, "forge");
    const pulse = charById(sim, "pulse");
    // Everyone else stays put at their desks.
    for (const c of sim.chars) if (c !== forge && c !== pulse) c.tasks = [{ k: "hold", gesture: "type", activity: "working", label: "Working at the desk" }] as Character["tasks"];
    place(forge, 4, 3, 0);
    place(pulse, 9, 3, Math.PI);
    forge.tasks = [{ k: "goto", to: { x: 10, y: 3, face: 0 }, label: "test" }, { k: "hold", gesture: "none", activity: "idle", label: "arrived" }] as Character["tasks"];
    pulse.tasks = [{ k: "goto", to: { x: 3, y: 3, face: Math.PI }, label: "test" }, { k: "hold", gesture: "none", activity: "idle", label: "arrived" }] as Character["tasks"];
    const r = observe(sim, 15);
    expect(r.violations).toEqual([]);
    expect(r.minDist).toBeGreaterThanOrEqual(0.99);
    expect(forge.at).toEqual({ x: 10, y: 3 });
    expect(pulse.at).toEqual({ x: 3, y: 3 });
  });

  test("every meeting place is reachable from every desk even with the other six places taken", () => {
    for (const id of HQ_AGENTS) {
      const others = new Set(HQ_AGENTS.filter((o) => o !== id).map((o) => key(MEETING_SPOTS[o])));
      expect(findPath(id, DESKS[id].seat, MEETING_SPOTS[id], others), id).not.toBeNull();
      // ...and the way back to the desk afterwards.
      expect(findPath(id, MEETING_SPOTS[id], DESKS[id].seat, others), id).not.toBeNull();
    }
  });

  test("seven workstations, one each; every routine uses known errands and activities", () => {
    const desks = HQ_AGENTS.map((id) => DESKS[id].desk);
    expect(new Set(desks.map((d) => d.id)).size).toBe(7);
    for (const id of HQ_AGENTS) expect(DESKS[id].desk.owner).toBe(id);
    // Desks never overlap.
    const cells = desks.flatMap((d) => Array.from({ length: (d.x1 - d.x0) * (d.y1 - d.y0) }, (_, i) => `${d.x0 + (i % (d.x1 - d.x0))},${d.y0 + Math.floor(i / (d.x1 - d.x0))}`));
    expect(new Set(cells).size).toBe(cells.length);
    for (const id of HQ_AGENTS) {
      for (const entry of ROUTINES[id])
        for (const part of entry.split(">")) {
          if (part.startsWith("@")) continue;
          const e = ERRANDS.find((x) => x.id === part);
          expect(e, `${id}: ${part}`).toBeTruthy();
          expect(e!.visit, `${id} never visits itself`).not.toBe(id);
        }
    }
    // Seven distinct ways of walking.
    expect(new Set(HQ_AGENTS.map((id) => STYLES[id].speed)).size).toBe(7);
  });

  test("full meeting: jump to any of the eight recorded turns; only one character talks at a time", () => {
    const sim = createSim({ silentLines: [] });
    callMeeting(sim, { voiced: true, lines: VOICED_MEETING_LINES });
    run(sim, 40);
    expect(sim.meeting?.phase).toBe("speaking");
    drainEvents(sim);
    for (let i = VOICED_MEETING_LINES.length - 1; i >= 0; i--) {
      jumpToSpeaker(sim, i);
      run(sim, 0.2);
      expect(drainEvents(sim).filter((e) => e.type === "speaker")).toEqual([{ type: "speaker", index: i, agent: VOICED_MEETING_LINES[i].agent, voiced: true }]);
      expect(sim.chars.filter((c) => c.gesture === "talk").map((c) => c.id)).toEqual([VOICED_MEETING_LINES[i].agent]);
    }
  });

  test("after a meeting everyone returns to their own desk, from wherever they were", () => {
    for (const warm of [12, 47, 95]) {
      const sim = createSim({ silentLines: [] });
      run(sim, warm);
      callMeeting(sim, { voiced: false, lines: SILENT_MEETING_LINES });
      let seatedAtEnd: boolean[] = [];
      run(sim, 90, (s) => {
        for (const e of drainEvents(s)) if (e.type === "meeting-end") seatedAtEnd = s.chars.map(seatedAtDesk);
      });
      expect(seatedAtEnd, `warm-up ${warm}s`).toEqual(HQ_AGENTS.map(() => true));
    }
  });
});
