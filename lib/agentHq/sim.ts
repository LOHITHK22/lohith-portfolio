import {
  DESKS,
  DESK_ACTIVITIES,
  ERRANDS,
  FACE,
  HQ_AGENTS,
  MEETING_SPOTS,
  PRESENTATION_SPOT,
  ROUTINES,
  errandLabel,
  walkableFor,
  type HqAgentId,
  type Spot,
  type Tile,
} from "./layout";
import { findPath } from "./path";

// Agent HQ simulation: a deterministic, fixed-timestep model of the seven characters in
// the office. Each character works through a task queue (walk somewhere, sit, stand,
// do a gesture, hold). An ambient routine refills the queue (work at the desk, run an
// errand, come back), and a director overrides it for meetings and for the character
// a visitor selects. Nothing here touches the DOM, so it can be unit tested by
// stepping it directly.
//
// Collision rules: a character occupies its current tile and, while moving, the tile it
// is moving into. Nobody may enter an occupied tile. A character that is kept waiting
// re-plans around the others, and steps aside if it is still stuck. Two characters that
// block each other head-on resolve it by the lower-ranked one giving way.

export type Gesture = "none" | "type" | "sip" | "write" | "inspect" | "chat" | "wave" | "talk" | "point" | "listen" | "present";

export type Activity =
  | "working"
  | "sitting-down"
  | "standing-up"
  | "walking"
  | "waiting"
  | "turning"
  | "errand"
  | "calling"
  | "meeting"
  | "speaking"
  | "greeting"
  | "presenting"
  | "idle";

type Task =
  | { k: "goto"; to: Spot; label: string; errand?: string }
  /** Drops the rest of a visit if the colleague has left their desk in the meantime. */
  | { k: "visit-check"; host: HqAgentId }
  | { k: "sit" }
  | { k: "stand" }
  | { k: "face"; angle: number }
  | { k: "do"; gesture: Gesture; dur: number; activity: Activity; label: string }
  | { k: "hold"; gesture: Gesture; activity: Activity; label: string };

export type MovementStyle = { speed: number; stride: number; bob: number; armSwing: number };

export const STYLES: Record<HqAgentId, MovementStyle> = {
  // ASTRA walks at a calm, measured pace; NOVA is light and bouncy; FORGE is brisk with a strong arm swing.
  astra: { speed: 1.3, stride: 0.82, bob: 1.0, armSwing: 0.32 },
  nova: { speed: 1.45, stride: 0.74, bob: 1.8, armSwing: 0.4 },
  forge: { speed: 1.65, stride: 0.86, bob: 1.2, armSwing: 0.55 },
  // ATLAS takes long, deliberate strides; PULSE is the quickest, light on its feet; SENTINEL keeps a steady,
  // upright patrol pace with almost no bounce; ECHO moves with an easy, expressive swing.
  atlas: { speed: 1.2, stride: 0.92, bob: 0.7, armSwing: 0.24 },
  pulse: { speed: 1.85, stride: 0.7, bob: 1.6, armSwing: 0.5 },
  sentinel: { speed: 1.38, stride: 0.84, bob: 0.4, armSwing: 0.18 },
  echo: { speed: 1.5, stride: 0.76, bob: 1.3, armSwing: 0.46 },
};

export type Character = {
  id: HqAgentId;
  /** Continuous position in tile units (tile centres are at +0.5). */
  x: number;
  y: number;
  at: Tile;
  to: Tile | null;
  t: number;
  path: Tile[];
  face: number;
  sit: number;
  walkPhase: number;
  walkAmt: number;
  gesture: Gesture;
  gestureT: number;
  activity: Activity;
  label: string;
  tasks: Task[];
  taskT: number;
  waitT: number;
  claim: string | null;
  /** Head turn relative to the body, for looking at whoever is talking. */
  look: number;
  level: number;
  rng: () => number;
  errand: string | null;
  /** The routine entry run last time, so the same errand is not picked twice in a row. */
  lastRoutine: string | null;
};

/** One turn at a meeting. `audio` is the recording a voiced meeting plays (defaults to the agent's introduction). */
export type MeetingLine = { agent: HqAgentId; text: string; audio?: string; id?: string };

export type MeetingPhase = "calling" | "gathering" | "speaking" | "closing" | "returning";

export type Meeting = { phase: MeetingPhase; speaker: number; t: number; voiced: boolean; lines: MeetingLine[] };

/**
 * The "Meet the team" introduction: one agent at a time walks to the presentation spot,
 * faces the visitor, waves and introduces itself, then walks back to its desk while the
 * next one comes forward. A speaker only starts once the previous one is back in its chair.
 */
export type IntroStage = "approach" | "speaking";
export type Intro = { order: HqAgentId[]; index: number; stage: IntroStage; returning: HqAgentId[] };

export type SimEvent =
  | { type: "meeting-phase"; phase: MeetingPhase }
  | { type: "speaker"; index: number; agent: HqAgentId; voiced: boolean }
  | { type: "meeting-end" }
  | { type: "intro-approach"; index: number; agent: HqAgentId }
  | { type: "intro-speaker"; index: number; agent: HqAgentId }
  | { type: "intro-end" };

export type Sim = {
  time: number;
  chars: Character[];
  mode: "ambient" | "meeting" | "focus" | "intro";
  meeting: Meeting | null;
  intro: Intro | null;
  focus: HqAgentId | null;
  reduced: boolean;
  nextAutoMeeting: number;
  events: SimEvent[];
  silentLines: MeetingLine[];
};

export const DT = 1 / 60;
const TURN_SPEED = 9;
const WAIT_REPLAN = 0.7;
const WAIT_SIDESTEP = 2.5;
const WAIT_YIELD = 0.3;
export const MEETING_HURRY = 1.3;
/** The presenting agent walks to the stage (and the previous one back to its desk) at the brisk pace of a meeting call. */
export const INTRO_HURRY = 1.3;
export const FIRST_AUTO_MEETING = 30;
export const AUTO_MEETING_EVERY = 150;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function angleDiff(a: number, b: number) {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

const tileKey = (t: Tile) => `${t.x},${t.y}`;

const neighbours = (t: Tile): Tile[] => [
  { x: t.x + 1, y: t.y },
  { x: t.x, y: t.y + 1 },
  { x: t.x - 1, y: t.y },
  { x: t.x, y: t.y - 1 },
];

/** Who gives way in a head-on standoff: someone heading to a meeting outranks an errand; then team order. */
function rank(sim: Sim, c: Character) {
  return (sim.mode === "meeting" ? 0 : c.errand ? 10 : 5) + HQ_AGENTS.indexOf(c.id);
}

/** Initial state: everyone seated at their desk, working. The first errands are staggered. */
export function createSim({ reduced = false, silentLines = [] as MeetingLine[], seed = 7 } = {}): Sim {
  const chars = HQ_AGENTS.map((id, i): Character => {
    const seat = DESKS[id].seat;
    const c: Character = {
      id,
      x: seat.x + 0.5,
      y: seat.y + 0.5,
      at: { x: seat.x, y: seat.y },
      to: null,
      t: 0,
      path: [],
      face: seat.face,
      sit: 1,
      walkPhase: 0,
      walkAmt: 0,
      gesture: "type",
      gestureT: i * 0.37,
      activity: "working",
      label: "Working at the desk",
      tasks: [],
      taskT: 0,
      waitT: 0,
      claim: tileKey(seat),
      look: 0,
      level: 0,
      rng: mulberry32(seed * 131 + i * 977),
      errand: null,
      lastRoutine: null,
    };
    // Stagger the first errand so the office comes alive quickly but not all at once.
    c.tasks = [{ k: "do", gesture: "type", dur: reduced ? Infinity : 2 + i * 1.9, activity: "working", label: "Working at the desk" }];
    return c;
  });
  return {
    time: 0,
    chars,
    mode: "ambient",
    meeting: null,
    intro: null,
    focus: null,
    reduced,
    nextAutoMeeting: reduced ? Infinity : FIRST_AUTO_MEETING,
    events: [],
    silentLines,
  };
}

export function charById(sim: Sim, id: HqAgentId) {
  return sim.chars.find((c) => c.id === id)!;
}

function occupiedBy(sim: Sim, self: Character, tile: Tile) {
  return sim.chars.some(
    (o) => o !== self && ((o.at.x === tile.x && o.at.y === tile.y) || (o.to && o.to.x === tile.x && o.to.y === tile.y))
  );
}

function othersTiles(sim: Sim, self: Character, onlyStill: boolean) {
  const s = new Set<string>();
  for (const o of sim.chars) {
    if (o === self) continue;
    if (onlyStill && o.to) continue;
    s.add(tileKey(o.at));
    if (o.to) s.add(tileKey(o.to));
  }
  return s;
}

/** Also avoids the tiles others are heading for (their meeting places, errand spots), so routes don't cut through them. */
function withClaims(sim: Sim, self: Character, tiles: Set<string>, goal: Tile) {
  const s = new Set(tiles);
  for (const o of sim.chars) if (o !== self && o.claim && o.tasks[0]?.k === "goto") s.add(o.claim);
  s.delete(tileKey(goal));
  return s;
}

function setTasks(c: Character, tasks: Task[]) {
  c.tasks = tasks;
  c.errand = null;
  c.taskT = 0;
  c.path = [];
  c.waitT = 0;
}

function seatTasks(id: HqAgentId, workDur: number): Task[] {
  const seat = DESKS[id].seat;
  return [
    { k: "goto", to: seat, label: "Heading back to the desk" },
    { k: "sit" },
    { k: "do", gesture: "type", dur: workDur, activity: "working", label: "Working at the desk" },
  ];
}

/** Whether a colleague is sitting at its own desk working, so a visit makes sense. */
function hostAvailable(sim: Sim, host: HqAgentId) {
  const h = charById(sim, host);
  // Working now and not about to leave: nothing in its plan takes it away from the desk.
  return seatedAtDesk(h) && sim.focus !== host && h.activity === "working" && h.tasks.length > 0 && h.tasks[0].k === "do" && !h.tasks.some((t) => t.k === "goto");
}

/** Someone is on the way to, or standing at, `host`'s desk for a chat. */
function beingVisited(sim: Sim, host: HqAgentId) {
  const visits = (id: string | null | undefined) => !!id && ERRANDS.find((e) => e.id === id)?.visit === host;
  // Includes a visit someone has planned but not started walking to yet.
  return sim.chars.some((o) => visits(o.errand) || o.tasks.some((t) => (t.k === "visit-check" && t.host === host) || (t.k === "goto" && visits(t.errand))));
}

function errandTasks(c: Character, id: string): Task[] {
  const e = ERRANDS.find((x) => x.id === id)!;
  const label = errandLabel(e, c.id);
  return [
    ...(e.visit ? [{ k: "visit-check" as const, host: e.visit }] : []),
    { k: "goto", to: e.spot, label, errand: e.id },
    { k: "do", gesture: e.gesture, dur: 4 + c.rng() * 2.5, activity: "errand", label },
  ];
}

/** The ambient routine: from the desk, run an errand (or a short chain of them) and come back; from anywhere else, go back to the desk. */
function refill(sim: Sim, c: Character) {
  const seat = DESKS[c.id].seat;
  const atSeat = c.at.x === seat.x && c.at.y === seat.y && !c.to;
  if (sim.reduced) {
    setTasks(c, atSeat && c.sit === 1 ? [{ k: "hold", gesture: "type", activity: "working", label: "Working at the desk" }] : seatTasks(c.id, Infinity));
    return;
  }
  if (!atSeat || c.sit < 1) {
    setTasks(c, seatTasks(c.id, 9 + c.rng() * 7));
    return;
  }
  // A colleague is coming over or is here to talk: stay and keep working with them.
  if (beingVisited(sim, c.id)) {
    setTasks(c, [{ k: "do", gesture: "type", dur: 2, activity: "working", label: "Working at the desk" }]);
    return;
  }
  // A spot is taken if someone is there, heading there, or has it later in their plan (after a desk activity, or as the second errand of a chain).
  const claimed = new Set(
    sim.chars
      .filter((o) => o !== c)
      .flatMap((o) => [o.claim, tileKey(o.at), ...o.tasks.flatMap((t) => (t.k === "goto" && t.errand ? [tileKey(t.to)] : []))])
  );
  const free = (id: string) => {
    const e = ERRANDS.find((x) => x.id === id)!;
    return !claimed.has(tileKey(e.spot)) && (!e.visit || (e.visit !== c.id && hostAvailable(sim, e.visit) && !beingVisited(sim, e.visit)));
  };
  const options = ROUTINES[c.id].filter((entry) => entry.split(">").every((part) => part.startsWith("@") || free(part)));
  const fresh = options.length > 1 ? options.filter((o) => o !== c.lastRoutine) : options;
  const entry = fresh[Math.floor(c.rng() * fresh.length)];
  if (entry) c.lastRoutine = entry;
  if (!entry) {
    setTasks(c, [{ k: "do", gesture: "type", dur: 5, activity: "working", label: "Working at the desk" }]);
    return;
  }
  const tasks: Task[] = [];
  for (const part of entry.split(">")) {
    if (part.startsWith("@")) {
      const act = DESK_ACTIVITIES.find((x) => x.id === part.slice(1))!;
      tasks.push({ k: "do", gesture: act.gesture, dur: act.dur[0] + c.rng() * (act.dur[1] - act.dur[0]), activity: "working", label: act.label });
    } else tasks.push(...errandTasks(c, part));
  }
  setTasks(c, [...tasks, ...seatTasks(c.id, 10 + c.rng() * 8)]);
}

/** Moves the character one step along its path; returns true once it stands on `goal` facing the right way. */
function stepGoto(sim: Sim, c: Character, goal: Spot, dt: number): boolean {
  const style = STYLES[c.id];
  if (c.to) {
    // Called to a meeting, everyone walks a little faster (a longer, quicker stride, same gait).
    const hurry =
      sim.meeting?.phase === "gathering"
        ? MEETING_HURRY
        : sim.intro && (introPresenter(sim) === c.id || sim.intro.returning.includes(c.id))
          ? INTRO_HURRY
          : 1;
    const speed = style.speed * hurry;
    c.t += speed * dt;
    c.walkPhase += ((speed * dt) / style.stride) * Math.PI;
    const dir = Math.atan2(c.to.y - c.at.y, c.to.x - c.at.x);
    c.face += Math.sign(angleDiff(c.face, dir)) * Math.min(Math.abs(angleDiff(c.face, dir)), TURN_SPEED * dt);
    if (c.t >= 1) {
      const left = c.t - 1;
      c.at = c.to;
      c.to = null;
      c.t = 0;
      // Keep walking without a stop when the next tile is straight ahead and free.
      const next = c.path[0];
      if (next && !occupiedBy(sim, c, next) && Math.abs(angleDiff(c.face, Math.atan2(next.y - c.at.y, next.x - c.at.x))) < 0.3) {
        c.to = next;
        c.path.shift();
        c.t = left;
      }
    }
    c.activity = "walking";
    return false;
  }

  if (c.at.x === goal.x && c.at.y === goal.y) {
    const d = angleDiff(c.face, goal.face);
    if (Math.abs(d) < 0.03) {
      c.face = goal.face;
      return true;
    }
    c.face += Math.sign(d) * Math.min(Math.abs(d), TURN_SPEED * dt);
    c.activity = "turning";
    return false;
  }

  if (sim.reduced) {
    // Reduced motion: no walking. Appear at the destination if it is free.
    if (!occupiedBy(sim, c, goal)) {
      c.at = { x: goal.x, y: goal.y };
      c.face = goal.face;
      return true;
    }
    c.activity = "waiting";
    return false;
  }

  if (!c.path.length) {
    const still = othersTiles(sim, c, true);
    c.path = findPath(c.id, c.at, goal, withClaims(sim, c, still, goal)) ?? findPath(c.id, c.at, goal, still) ?? findPath(c.id, c.at, goal) ?? [];
    if (!c.path.length) {
      c.activity = "waiting";
      return false;
    }
  }

  const next = c.path[0];
  if (occupiedBy(sim, c, next)) {
    c.waitT += dt;
    c.activity = "waiting";
    const blocker = sim.chars.find((o) => o !== c && !o.to && o.at.x === next.x && o.at.y === next.y);
    const headOn = !!blocker && !!blocker.path[0] && blocker.path[0].x === c.at.x && blocker.path[0].y === c.at.y;
    if (headOn && rank(sim, c) > rank(sim, blocker!) && c.waitT > WAIT_YIELD) {
      // Two characters want each other's tiles: the lower-ranked one steps off the other's route.
      const theirRoute = new Set(blocker!.path.map(tileKey));
      const aside = neighbours(c.at).find((n) => walkableFor(c.id, n.x, n.y) && !occupiedBy(sim, c, n) && !theirRoute.has(tileKey(n)));
      if (aside) {
        c.path = [aside];
        c.waitT = 0;
        return false;
      }
    }
    if (c.waitT > WAIT_SIDESTEP) {
      // Still stuck: step onto any free neighbouring tile, then plan again from there.
      const free = neighbours(c.at).find((n) => walkableFor(c.id, n.x, n.y) && !occupiedBy(sim, c, n));
      if (free) {
        c.path = [free];
        c.waitT = 0;
      }
    } else if (c.waitT > WAIT_REPLAN) {
      const around = othersTiles(sim, c, false);
      const detour = findPath(c.id, c.at, goal, withClaims(sim, c, around, goal)) ?? findPath(c.id, c.at, goal, around);
      // Someone who is only passing through will be gone in a moment: take a detour round them
      // only if it is short. Someone standing still for a while is walked round whatever the length.
      const mover = sim.chars.find((o) => o !== c && ((o.at.x === next.x && o.at.y === next.y) || (o.to && o.to.x === next.x && o.to.y === next.y)));
      const passing = !!mover && (!!mover.to || mover.tasks[0]?.k === "goto");
      if (detour && detour.length && (!passing || detour.length <= c.path.length + 3)) {
        c.path = detour;
        c.waitT = WAIT_REPLAN * 0.5;
      }
    }
    return false;
  }

  const dir = Math.atan2(next.y - c.at.y, next.x - c.at.x);
  const d = angleDiff(c.face, dir);
  c.face += Math.sign(d) * Math.min(Math.abs(d), TURN_SPEED * dt);
  if (Math.abs(d) < 0.6) {
    c.to = next;
    c.t = 0;
    c.path.shift();
    c.waitT = 0;
    c.activity = "walking";
  } else {
    c.activity = "turning";
  }
  return false;
}

function runTasks(sim: Sim, c: Character, dt: number) {
  const task = c.tasks[0];
  if (!task) return;
  let done = false;
  if (task.k === "goto" && c.sit > 0) {
    // Stand up before walking anywhere.
    c.sit = sim.reduced ? 0 : Math.max(0, c.sit - dt / 0.45);
    c.activity = "standing-up";
    c.gesture = "none";
    return;
  }
  switch (task.k) {
    case "goto": {
      c.gesture = "none";
      c.label = task.label;
      if (task.errand) c.errand = task.errand;
      if (!c.claim || c.claim !== tileKey(task.to)) c.claim = tileKey(task.to);
      done = stepGoto(sim, c, task.to, dt);
      break;
    }
    case "visit-check": {
      done = true;
      if (!hostAvailable(sim, task.host)) {
        // The colleague has gone: skip the visit (its walk and chat) and carry on with the rest.
        const visitEnd = c.tasks.findIndex((t, i) => i > 0 && t.k === "do" && t.activity === "errand");
        if (visitEnd > 0) c.tasks.splice(1, visitEnd);
      }
      break;
    }
    case "sit":
      c.sit = sim.reduced ? 1 : Math.min(1, c.sit + dt / 0.5);
      c.activity = "sitting-down";
      c.gesture = "none";
      done = c.sit >= 1;
      break;
    case "stand":
      c.sit = sim.reduced ? 0 : Math.max(0, c.sit - dt / 0.45);
      c.activity = "standing-up";
      c.gesture = "none";
      done = c.sit <= 0;
      break;
    case "face": {
      const d = angleDiff(c.face, task.angle);
      if (sim.reduced || Math.abs(d) < 0.03) {
        c.face = task.angle;
        done = true;
      } else {
        c.face += Math.sign(d) * Math.min(Math.abs(d), TURN_SPEED * 0.6 * dt);
        c.activity = "turning";
      }
      break;
    }
    case "do":
      c.taskT += dt;
      c.gesture = task.gesture;
      c.activity = task.activity;
      c.label = task.label;
      done = c.taskT >= task.dur;
      break;
    case "hold":
      c.gesture = task.gesture;
      c.activity = task.activity;
      c.label = task.label;
      break;
  }
  if (done) {
    c.tasks.shift();
    c.taskT = 0;
    c.path = [];
    if (task.k === "do" && task.activity === "errand") c.errand = null;
  }
}

function emit(sim: Sim, e: SimEvent) {
  sim.events.push(e);
}

function setPhase(sim: Sim, phase: MeetingPhase) {
  sim.meeting!.phase = phase;
  sim.meeting!.t = 0;
  emit(sim, { type: "meeting-phase", phase });
}

export function seatedAtDesk(c: Character) {
  const seat = DESKS[c.id].seat;
  return c.sit === 1 && !c.to && c.at.x === seat.x && c.at.y === seat.y;
}

const isHolding = (c: Character) => c.tasks.length === 1 && c.tasks[0].k === "hold" && !c.to;

function startSpeaker(sim: Sim, index: number) {
  const m = sim.meeting!;
  m.speaker = index;
  m.t = 0;
  const line = m.lines[index];
  for (const c of sim.chars) {
    const speaking = c.id === line.agent;
    setTasks(c, [
      speaking
        ? { k: "hold", gesture: "talk", activity: "speaking", label: "Speaking at the meeting" }
        : { k: "hold", gesture: "listen", activity: "meeting", label: "Listening at the meeting" },
    ]);
  }
  emit(sim, { type: "speaker", index, agent: line.agent, voiced: m.voiced });
}

function lineDuration(text: string) {
  return Math.max(3.2, text.trim().split(/\s+/).length / 2.6);
}

function tickDirector(sim: Sim, dt: number) {
  if (sim.intro) tickIntro(sim);
  if (sim.mode === "ambient" && sim.time >= sim.nextAutoMeeting) {
    if (sim.silentLines.length) callMeeting(sim, { voiced: false, lines: sim.silentLines });
    sim.nextAutoMeeting = sim.time + AUTO_MEETING_EVERY;
  }
  const m = sim.meeting;
  if (!m) return;
  m.t += dt;
  const astra = charById(sim, "astra");
  switch (m.phase) {
    case "calling":
      if (astra.tasks.length === 0 || isHolding(astra)) {
        setPhase(sim, "gathering");
        for (const c of sim.chars) {
          setTasks(c, [
            { k: "goto", to: MEETING_SPOTS[c.id], label: "Walking to the meeting table" },
            { k: "hold", gesture: "listen", activity: "meeting", label: "Waiting at the meeting table" },
          ]);
        }
      }
      break;
    case "gathering":
      if (sim.chars.every(isHolding)) {
        setPhase(sim, "speaking");
        startSpeaker(sim, 0);
      }
      break;
    case "speaking":
      if (!m.voiced && m.t >= lineDuration(m.lines[m.speaker].text)) advanceSpeaker(sim);
      break;
    case "closing":
      if (m.t >= 1.2) beginReturn(sim);
      break;
    case "returning":
      if (sim.chars.every((c) => c.id === sim.focus || seatedAtDesk(c))) {
        sim.meeting = null;
        sim.mode = sim.focus ? "focus" : "ambient";
        emit(sim, { type: "meeting-end" });
      }
      break;
  }
}

function beginReturn(sim: Sim) {
  setPhase(sim, "returning");
  for (const c of sim.chars) setTasks(c, seatTasks(c.id, sim.reduced ? Infinity : 8 + c.rng() * 6));
}

/** ASTRA calls a meeting: it stands and calls the team, everyone walks to the table, each line is spoken in turn. */
export function callMeeting(sim: Sim, { voiced, lines }: { voiced: boolean; lines: MeetingLine[] }) {
  if (sim.meeting && sim.meeting.phase !== "returning") return;
  if (sim.focus) clearFocus(sim);
  // The next ambient meeting is counted from this one, so they never run back to back.
  if (!sim.reduced) sim.nextAutoMeeting = sim.time + AUTO_MEETING_EVERY;
  sim.mode = "meeting";
  sim.meeting = { phase: "calling", speaker: -1, t: 0, voiced, lines };
  emit(sim, { type: "meeting-phase", phase: "calling" });
  for (const c of sim.chars) {
    if (c.id === "astra") {
      setTasks(c, [
        { k: "stand" },
        { k: "face", angle: FACE.viewer },
        { k: "do", gesture: "point", dur: 1.4, activity: "calling", label: "Calling the team to the table" },
      ]);
    } else {
      // Finish the current step, then pause where they are until the call.
      setTasks(c, [{ k: "hold", gesture: c.sit > 0.5 ? "type" : "none", activity: c.sit > 0.5 ? "working" : "idle", label: "Hearing the call" }]);
    }
  }
}

/** Moves to the next speaker, or wraps up the meeting after the last one. */
export function advanceSpeaker(sim: Sim) {
  const m = sim.meeting;
  if (!m || m.phase !== "speaking") return;
  if (m.speaker < m.lines.length - 1) startSpeaker(sim, m.speaker + 1);
  else {
    setPhase(sim, "closing");
    for (const c of sim.chars) setTasks(c, [{ k: "hold", gesture: "none", activity: "meeting", label: "Wrapping up" }]);
  }
}

/** Jumps straight to one speaker's turn (visitors who only want to hear one agent). */
export function jumpToSpeaker(sim: Sim, index: number) {
  const m = sim.meeting;
  if (!m || m.phase !== "speaking" || index < 0 || index >= m.lines.length || index === m.speaker) return;
  startSpeaker(sim, index);
}

/**
 * Stops the recorded voices but keeps the meeting going with the quick meeting's caption
 * lines: the current speaker carries on in captions, and the rest follow at reading pace.
 */
export function switchToCaptions(sim: Sim, lines: MeetingLine[]) {
  const m = sim.meeting;
  if (!m || !m.voiced || !lines.length) return;
  const current = m.speaker >= 0 ? m.lines[m.speaker] : null;
  const wasLast = m.speaker === m.lines.length - 1;
  m.voiced = false;
  m.lines = lines;
  if (m.phase !== "speaking" || !current) return;
  if (wasLast && lines[lines.length - 1].agent !== current.agent) {
    // ASTRA's recorded closing has no caption-only line: the meeting wraps up.
    m.speaker = lines.length - 1;
    advanceSpeaker(sim);
    return;
  }
  startSpeaker(sim, Math.max(0, lines.findIndex((l) => l.agent === current.agent)));
}

/** Ends the meeting early: everyone heads straight back to their desk. */
export function skipMeeting(sim: Sim) {
  if (!sim.meeting || sim.meeting.phase === "returning") return;
  beginReturn(sim);
}

/** A visitor selected a character: it stops, turns to the visitor, waves, then introduces itself. */
export function selectAgent(sim: Sim, id: HqAgentId) {
  if (sim.meeting && sim.meeting.phase !== "returning") skipMeeting(sim);
  if (sim.focus && sim.focus !== id) releaseChar(sim, sim.focus);
  // Don't start an ambient meeting while a visitor is meeting someone.
  if (!sim.reduced) sim.nextAutoMeeting = Math.max(sim.nextAutoMeeting, sim.time + AUTO_MEETING_EVERY / 2);
  sim.focus = id;
  sim.mode = "focus";
  const c = charById(sim, id);
  const { seat, front } = DESKS[id];
  const atDesk = !c.to && c.at.x === seat.x && c.at.y === seat.y;
  c.errand = null;
  setTasks(c, [
    { k: "stand" },
    // At the desk, step out from behind the chair first so the visitor can see it.
    ...(atDesk ? [{ k: "goto" as const, to: { x: front.x, y: front.y, face: FACE.viewer }, label: "Stepping out to say hello" }] : []),
    { k: "face", angle: FACE.viewer },
    { k: "do", gesture: "wave", dur: sim.reduced ? 0.01 : 1.5, activity: "greeting", label: "Saying hello" },
    { k: "hold", gesture: "talk", activity: "speaking", label: "Introducing itself" },
  ]);
}

/** Narration finished: the selected character stays facing the visitor, listening. */
export function narrationDone(sim: Sim, id: HqAgentId) {
  if (sim.focus !== id) return;
  const c = charById(sim, id);
  const last = c.tasks[c.tasks.length - 1];
  if (last && last.k === "hold") c.tasks[c.tasks.length - 1] = { k: "hold", gesture: "none", activity: "presenting", label: "Ready for questions" };
}

/** Narration (re)started for the selected character. */
export function narrationStarted(sim: Sim, id: HqAgentId) {
  if (sim.focus !== id) return;
  const c = charById(sim, id);
  const last = c.tasks[c.tasks.length - 1];
  if (last && last.k === "hold") c.tasks[c.tasks.length - 1] = { k: "hold", gesture: "talk", activity: "speaking", label: "Introducing itself" };
}

function releaseChar(sim: Sim, id: HqAgentId) {
  const c = charById(sim, id);
  setTasks(c, []);
  c.level = 0;
}

/** Back to the full office: the selected character returns to its routine. */
export function clearFocus(sim: Sim) {
  if (!sim.focus) return;
  releaseChar(sim, sim.focus);
  sim.focus = null;
  if (sim.mode === "focus") sim.mode = "ambient";
}

export function setLevel(sim: Sim, id: HqAgentId, level: number) {
  charById(sim, id).level = level;
}

/** Turns heads: listeners look at the speaker, a seated colleague looks at a visitor or at whoever is presenting. */
function updateLooks(sim: Sim, dt: number) {
  const speakerId = sim.meeting?.phase === "speaking" ? sim.meeting.lines[sim.meeting.speaker]?.agent : null;
  const presenter = sim.intro?.stage === "speaking" ? introPresenter(sim) : null;
  for (const c of sim.chars) {
    let target = 0;
    const lookAt = (o: Character) => {
      const want = Math.atan2(o.y - c.y, o.x - c.x);
      target = Math.max(-0.9, Math.min(0.9, angleDiff(c.face, want)));
    };
    if (speakerId && speakerId !== c.id && c.activity === "meeting") lookAt(charById(sim, speakerId));
    else if (presenter && presenter !== c.id && c.sit === 1 && c.activity === "working") lookAt(charById(sim, presenter));
    else if (c.sit === 1 && c.activity === "working") {
      const visitor = sim.chars.find((o) => o.errand === `visit-${c.id}` && o.activity === "errand");
      if (visitor) lookAt(visitor);
    }
    c.look += (target - c.look) * Math.min(1, dt * 6);
  }
}

const TURN_SECONDS = 1.8;

/**
 * A visit is a conversation: the visitor speaks first, then they take turns. The host,
 * still at its desk, alternates between answering and listening while it keeps working.
 */
function updateConversations(sim: Sim) {
  if (sim.mode === "meeting") return;
  for (const v of sim.chars) {
    if (v.activity !== "errand" || !v.errand || sim.focus === v.id) continue;
    const e = ERRANDS.find((x) => x.id === v.errand);
    if (!e?.visit) continue;
    const host = charById(sim, e.visit);
    const visitorTalks = Math.floor(v.taskT / TURN_SECONDS) % 2 === 0;
    v.gesture = visitorTalks ? "chat" : "listen";
    if (seatedAtDesk(host) && host.activity === "working" && sim.focus !== host.id) host.gesture = visitorTalks ? "listen" : "chat";
  }
}

/** Advances the simulation by `dt` seconds (call with DT for deterministic results). */
export function step(sim: Sim, dt: number = DT) {
  sim.time += dt;
  tickDirector(sim, dt);
  for (const c of sim.chars) {
    const controlled = sim.mode === "meeting" || sim.mode === "intro" || sim.focus === c.id;
    if (!c.tasks.length && !c.to && !controlled) refill(sim, c);
    if (c.to || c.tasks.length) {
      if (c.to && (!c.tasks.length || c.tasks[0].k !== "goto")) {
        // Finish the step in progress before doing anything else.
        stepGoto(sim, c, { ...c.to, face: c.face }, dt);
      } else runTasks(sim, c, dt);
    }
    const moving = !!c.to;
    c.walkAmt += ((moving ? 1 : 0) - c.walkAmt) * Math.min(1, dt * 10);
    if (!moving && c.walkAmt < 0.02) c.walkAmt = 0;
    c.gestureT += dt;
    c.x = (c.to ? c.at.x + (c.to.x - c.at.x) * c.t : c.at.x) + 0.5;
    c.y = (c.to ? c.at.y + (c.to.y - c.at.y) * c.t : c.at.y) + 0.5;
  }
  updateConversations(sim);
  updateLooks(sim, dt);
}

/** Runs `seconds` of simulation in fixed steps. */
export function run(sim: Sim, seconds: number, onStep?: (sim: Sim) => void) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    step(sim, DT);
    onStep?.(sim);
  }
}

export function drainEvents(sim: Sim) {
  const e = sim.events;
  sim.events = [];
  return e;
}

/** Switches reduced motion on or off mid-session. With it on, nobody wanders and moves are instant. */
export function setReduced(sim: Sim, reduced: boolean) {
  if (sim.reduced === reduced) return;
  sim.reduced = reduced;
  sim.nextAutoMeeting = reduced ? Infinity : sim.time + FIRST_AUTO_MEETING;
  for (const c of sim.chars) {
    if (sim.mode === "meeting" || sim.mode === "intro" || sim.focus === c.id) continue;
    setTasks(c, reduced ? seatTasks(c.id, Infinity) : []);
  }
}

// ---------- "Meet the team" introduction ----------

/** The agent currently presenting (walking to the stage or speaking), if an introduction is running. */
export function introPresenter(sim: Sim): HqAgentId | null {
  const it = sim.intro;
  return it && it.index >= 0 ? it.order[it.index] : null;
}

/** Back to the desk and stay there working until the introduction is over. */
function sendToDesk(sim: Sim, id: HqAgentId) {
  const c = charById(sim, id);
  c.level = 0;
  setTasks(c, seatTasks(id, Infinity));
}

/** `index` comes forward to present; whoever was presenting goes back to its desk. */
function present(sim: Sim, index: number) {
  const it = sim.intro!;
  const prev = introPresenter(sim);
  const id = it.order[index];
  if (prev && prev !== id) {
    sendToDesk(sim, prev);
    if (!it.returning.includes(prev)) it.returning.push(prev);
  }
  it.returning = it.returning.filter((x) => x !== id);
  it.index = index;
  it.stage = "approach";
  const c = charById(sim, id);
  c.level = 0;
  setTasks(c, [
    { k: "stand" },
    { k: "goto", to: PRESENTATION_SPOT, label: "Walking to the presentation area" },
    { k: "face", angle: PRESENTATION_SPOT.face },
    { k: "do", gesture: "wave", dur: sim.reduced ? 0.01 : 1.2, activity: "greeting", label: "Saying hello" },
    { k: "hold", gesture: "none", activity: "presenting", label: "About to introduce itself" },
  ]);
  emit(sim, { type: "intro-approach", index, agent: id });
}

/**
 * Starts the introduction: everyone else settles at their desk, and the first agent in
 * `order` walks to the presentation spot. Any meeting or focused character is released.
 */
export function startIntro(sim: Sim, order: HqAgentId[] = HQ_AGENTS) {
  if (sim.focus) clearFocus(sim);
  if (sim.meeting) emit(sim, { type: "meeting-end" });
  sim.meeting = null;
  sim.mode = "intro";
  sim.intro = { order: [...order], index: -1, stage: "approach", returning: [] };
  for (const c of sim.chars) if (c.id !== order[0]) sendToDesk(sim, c.id);
  present(sim, 0);
}

/** The presenter is in place and the previous one is back in its chair: it starts speaking. */
function tickIntro(sim: Sim) {
  const it = sim.intro!;
  it.returning = it.returning.filter((id) => !seatedAtDesk(charById(sim, id)));
  if (it.stage !== "approach" || it.returning.length) return;
  const id = introPresenter(sim)!;
  const c = charById(sim, id);
  if (!isHolding(c)) return;
  it.stage = "speaking";
  c.tasks[0] = { k: "hold", gesture: "talk", activity: "speaking", label: "Introducing itself" };
  emit(sim, { type: "intro-speaker", index: it.index, agent: id });
}

/** The presenter's narration (or its captions) finished: the next agent comes forward, or the introduction ends. */
export function introNarrationDone(sim: Sim, index: number) {
  const it = sim.intro;
  if (!it || it.index !== index || it.stage !== "speaking") return;
  charById(sim, it.order[index]).level = 0;
  if (index < it.order.length - 1) present(sim, index + 1);
  else finishIntro(sim);
}

/** Next / previous / jump: the chosen agent comes forward (from wherever it is) and the current one goes back. */
export function introGoTo(sim: Sim, index: number) {
  const it = sim.intro;
  if (!it || index < 0 || index >= it.order.length) return;
  present(sim, index);
}

/**
 * Ends the introduction (after the last agent, or when skipped): whoever is away from
 * their desk walks back, and the office returns to its normal routines.
 */
export function finishIntro(sim: Sim) {
  if (!sim.intro) return;
  sim.intro = null;
  sim.mode = sim.focus ? "focus" : "ambient";
  for (const c of sim.chars) {
    c.level = 0;
    setTasks(c, seatedAtDesk(c) ? [] : seatTasks(c.id, sim.reduced ? Infinity : 6 + c.rng() * 6));
  }
  if (!sim.reduced) sim.nextAutoMeeting = sim.time + FIRST_AUTO_MEETING;
  emit(sim, { type: "intro-end" });
}
