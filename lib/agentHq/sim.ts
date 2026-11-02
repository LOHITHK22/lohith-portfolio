import {
  DESKS,
  ERRANDS,
  FACE,
  HQ_AGENTS,
  MEETING_SPOTS,
  ROUTINES,
  walkableFor,
  type HqAgentId,
  type Spot,
  type Tile,
} from "./layout";
import { findPath } from "./path";

// Agent HQ simulation: a deterministic, fixed-timestep model of three characters in
// the office. Each character works through a task queue (walk somewhere, sit, stand,
// do a gesture, hold). An ambient routine refills the queue (work at the desk, run an
// errand, come back), and a director overrides it for meetings and for the character
// a visitor selects. Nothing here touches the DOM, so it can be unit tested by
// stepping it directly.
//
// Collision rules: a character occupies its current tile and, while moving, the tile it
// is moving into. Nobody may enter an occupied tile. A character that is kept waiting
// re-plans around the others, and steps aside if it is still stuck.

export type Gesture = "none" | "type" | "sip" | "write" | "inspect" | "chat" | "wave" | "talk" | "point" | "listen";

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
  | { k: "goto"; to: Spot; label: string }
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
};

export type MeetingLine = { agent: HqAgentId; text: string };

export type MeetingPhase = "calling" | "gathering" | "speaking" | "closing" | "returning";

export type Meeting = { phase: MeetingPhase; speaker: number; t: number; voiced: boolean; lines: MeetingLine[] };

export type SimEvent =
  | { type: "meeting-phase"; phase: MeetingPhase }
  | { type: "speaker"; index: number; agent: HqAgentId; voiced: boolean }
  | { type: "meeting-end" };

export type Sim = {
  time: number;
  chars: Character[];
  mode: "ambient" | "meeting" | "focus";
  meeting: Meeting | null;
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
export const FIRST_AUTO_MEETING = 20;
export const AUTO_MEETING_EVERY = 80;

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
    };
    // Stagger the first errand so the office comes alive quickly but not all at once.
    c.tasks = [{ k: "do", gesture: "type", dur: reduced ? Infinity : 2.5 + i * 3.5, activity: "working", label: "Working at the desk" }];
    return c;
  });
  return {
    time: 0,
    chars,
    mode: "ambient",
    meeting: null,
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

function setTasks(c: Character, tasks: Task[]) {
  c.tasks = tasks;
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

/** The ambient routine: from the desk, run an errand and come back; from anywhere else, go back to the desk. */
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
  const claimed = new Set(sim.chars.filter((o) => o !== c).flatMap((o) => [o.claim, tileKey(o.at)]));
  const options = ROUTINES[c.id]
    .map((id) => ERRANDS.find((e) => e.id === id)!)
    .filter((e) => !claimed.has(tileKey(e.spot)) && (!e.visit || e.visit !== c.id));
  const errand = options[Math.floor(c.rng() * options.length)];
  if (!errand) {
    setTasks(c, [{ k: "do", gesture: "type", dur: 5, activity: "working", label: "Working at the desk" }]);
    return;
  }
  c.errand = errand.id;
  setTasks(c, [
    { k: "goto", to: errand.spot, label: errand.label },
    { k: "do", gesture: errand.gesture, dur: 4 + c.rng() * 2.5, activity: "errand", label: errand.label },
    ...seatTasks(c.id, 10 + c.rng() * 8),
  ]);
}

/** Moves the character one step along its path; returns true once it stands on `goal` facing the right way. */
function stepGoto(sim: Sim, c: Character, goal: Spot, dt: number): boolean {
  const style = STYLES[c.id];
  if (c.to) {
    c.t += style.speed * dt;
    c.walkPhase += ((style.speed * dt) / style.stride) * Math.PI;
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
    c.path = findPath(c.id, c.at, goal, othersTiles(sim, c, true)) ?? findPath(c.id, c.at, goal) ?? [];
    if (!c.path.length) {
      c.activity = "waiting";
      return false;
    }
  }

  const next = c.path[0];
  if (occupiedBy(sim, c, next)) {
    c.waitT += dt;
    c.activity = "waiting";
    if (c.waitT > WAIT_SIDESTEP) {
      // Still stuck: step onto any free neighbouring tile, then plan again from there.
      const free = [
        { x: c.at.x + 1, y: c.at.y },
        { x: c.at.x, y: c.at.y + 1 },
        { x: c.at.x - 1, y: c.at.y },
        { x: c.at.x, y: c.at.y - 1 },
      ].find((n) => walkableFor(c.id, n.x, n.y) && !occupiedBy(sim, c, n));
      if (free) {
        c.path = [free];
        c.waitT = 0;
      }
    } else if (c.waitT > WAIT_REPLAN) {
      const detour = findPath(c.id, c.at, goal, othersTiles(sim, c, false));
      if (detour && detour.length) {
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
      if (!c.claim || c.claim !== tileKey(task.to)) c.claim = tileKey(task.to);
      done = stepGoto(sim, c, task.to, dt);
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
  const seat = DESKS[id].seat;
  const atDesk = !c.to && c.at.x === seat.x && c.at.y === seat.y;
  setTasks(c, [
    { k: "stand" },
    // At the desk, step out from behind the chair first so the visitor can see it.
    ...(atDesk ? [{ k: "goto" as const, to: { x: seat.x, y: seat.y + 1, face: FACE.viewer }, label: "Stepping out to say hello" }] : []),
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

/** Turns heads: listeners look at the speaker, a seated colleague looks at a visitor. */
function updateLooks(sim: Sim, dt: number) {
  const speakerId = sim.meeting?.phase === "speaking" ? sim.meeting.lines[sim.meeting.speaker]?.agent : null;
  for (const c of sim.chars) {
    let target = 0;
    const lookAt = (o: Character) => {
      const want = Math.atan2(o.y - c.y, o.x - c.x);
      target = Math.max(-0.9, Math.min(0.9, angleDiff(c.face, want)));
    };
    if (speakerId && speakerId !== c.id && c.activity === "meeting") lookAt(charById(sim, speakerId));
    else if (c.sit === 1 && c.activity === "working") {
      const visitor = sim.chars.find((o) => o.errand === `visit-${c.id}` && o.activity === "errand");
      if (visitor) lookAt(visitor);
    }
    c.look += (target - c.look) * Math.min(1, dt * 6);
  }
}

/** Advances the simulation by `dt` seconds (call with DT for deterministic results). */
export function step(sim: Sim, dt: number = DT) {
  sim.time += dt;
  tickDirector(sim, dt);
  for (const c of sim.chars) {
    const controlled = sim.mode === "meeting" || sim.focus === c.id;
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
    if (sim.mode === "meeting" || sim.focus === c.id) continue;
    setTasks(c, reduced ? seatTasks(c.id, Infinity) : []);
  }
}
