// Agent HQ office layout: a small isometric floor plan on a tile grid.
//
// Coordinates: tile (x, y) with x in [0, W) and y in [0, H). A continuous position
// (px, py) is in tile units; the centre of tile (x, y) is (x + 0.5, y + 0.5).
// The two back walls run along x = 0 and y = 0. Facing angles are in the floor
// plane: 0 faces +x, PI/2 faces +y (both towards the viewer), PI faces -x, -PI/2 faces -y.
//
// Seven workstations: four against the back wall (ASTRA, NOVA, FORGE and ECHO's studio
// corner) and three against the left wall (ATLAS beside the architecture whiteboard,
// PULSE, SENTINEL). The meeting table sits in the middle with a place for everyone,
// the coffee station and build server on the right, and a lounge at the front.

export type HqAgentId = "astra" | "nova" | "forge" | "atlas" | "pulse" | "sentinel" | "echo";

export type Tile = { x: number; y: number };

export type PropKind = "desk" | "table" | "coffee" | "plant" | "sofa" | "rack";

/** A solid prop covering tiles [x0, x1) x [y0, y1). Characters can never enter these tiles. */
export type Prop = {
  id: string;
  kind: PropKind;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Desk owner, for monitors and lighting. */
  owner?: HqAgentId;
  /** Which wall a desk stands against: "y" = back wall (faces +y), "x" = left wall (faces +x). */
  wall?: "x" | "y";
};

export type Spot = Tile & { face: number };

export type Errand = {
  id: string;
  /** What the character does while there. */
  gesture: "sip" | "write" | "inspect" | "chat" | "present";
  spot: Spot;
  label: string;
  /** Per-character wording for the same place (ATLAS draws an architecture diagram where NOVA sketches an idea). */
  labels?: Partial<Record<HqAgentId, string>>;
  /** Visiting a colleague at their desk: only happens while they are there. */
  visit?: HqAgentId;
};

/** Something a character does without leaving its desk, before an errand it leads to. */
export type DeskActivity = { id: string; gesture: "type" | "inspect"; label: string; dur: [number, number] };

export const W = 13;
export const H = 11;

export const FACE = { px: 0, py: Math.PI / 2, nx: Math.PI, ny: -Math.PI / 2, viewer: Math.PI / 4 } as const;

/** Also the order in which the team speaks at a meeting. */
export const HQ_AGENTS: HqAgentId[] = ["astra", "nova", "forge", "atlas", "pulse", "sentinel", "echo"];

/**
 * Each workstation: a 2-tile desk against a wall, the chair tile in front of it, and the
 * tile the character steps out to when it greets a visitor.
 */
export type Desk = { desk: Prop; seat: Spot; front: Tile };

const backDesk = (id: HqAgentId, x0: number): Desk => ({
  desk: { id: `desk-${id}`, kind: "desk", x0, y0: 0, x1: x0 + 2, y1: 1, owner: id, wall: "y" },
  seat: { x: x0, y: 1, face: FACE.ny },
  front: { x: x0, y: 2 },
});
const leftDesk = (id: HqAgentId, y0: number): Desk => ({
  desk: { id: `desk-${id}`, kind: "desk", x0: 0, y0, x1: 1, y1: y0 + 2, owner: id, wall: "x" },
  seat: { x: 1, y: y0, face: FACE.nx },
  front: { x: 2, y: y0 },
});

export const DESKS: Record<HqAgentId, Desk> = {
  astra: backDesk("astra", 2),
  nova: backDesk("nova", 5),
  forge: backDesk("forge", 8),
  echo: backDesk("echo", 11),
  atlas: leftDesk("atlas", 3),
  pulse: leftDesk("pulse", 7),
  sentinel: leftDesk("sentinel", 9),
};

export const TABLE: Prop = { id: "table", kind: "table", x0: 6, y0: 5, x1: 8, y1: 7 };
export const TABLE_CENTER = { x: 7, y: 6 };

export const PROPS: Prop[] = [
  ...HQ_AGENTS.map((id) => DESKS[id].desk),
  TABLE,
  { id: "coffee", kind: "coffee", x0: 12, y0: 4, x1: 13, y1: 5 },
  { id: "rack", kind: "rack", x0: 12, y0: 7, x1: 13, y1: 8 },
  { id: "plant-corner", kind: "plant", x0: 0, y0: 0, x1: 1, y1: 1 },
  { id: "plant-right", kind: "plant", x0: 12, y0: 10, x1: 13, y1: 11 },
  { id: "plant-lounge", kind: "plant", x0: 8, y0: 10, x1: 9, y1: 11 },
  { id: "sofa", kind: "sofa", x0: 5, y0: 10, x1: 7, y1: 11 },
];

/**
 * Where each character stands at the meeting table, facing its centre. Each takes the side
 * nearest its own desk, so nobody has to cross the room through the others: the back-wall
 * desks gather along the top and right of the table, the left-wall desks along the left and front.
 */
export const MEETING_SPOTS: Record<HqAgentId, Spot> = {
  astra: spotFacing(5, 5, TABLE_CENTER),
  nova: spotFacing(6, 4, TABLE_CENTER),
  forge: spotFacing(7, 4, TABLE_CENTER),
  echo: spotFacing(8, 5, TABLE_CENTER),
  atlas: spotFacing(5, 6, TABLE_CENTER),
  pulse: spotFacing(6, 7, TABLE_CENTER),
  sentinel: spotFacing(7, 7, TABLE_CENTER),
};

/** The architecture whiteboard on the left wall, between ATLAS's desk and PULSE's. */
export const WHITEBOARD = { y0: 4.9, y1: 6.95 };

export const ERRANDS: Errand[] = [
  { id: "coffee", gesture: "sip", spot: { x: 11, y: 4, face: FACE.px }, label: "Getting a coffee" },
  {
    id: "whiteboard",
    gesture: "write",
    spot: { x: 0, y: 5, face: FACE.nx },
    label: "Sketching on the whiteboard",
    labels: { atlas: "Drawing an architecture diagram", nova: "Sketching a creative idea" },
  },
  {
    id: "review-board",
    gesture: "inspect",
    spot: { x: 0, y: 6, face: FACE.nx },
    label: "Reviewing the architecture diagram",
    labels: { forge: "Checking the interface architecture" },
  },
  {
    id: "rack",
    gesture: "inspect",
    spot: { x: 11, y: 7, face: FACE.px },
    label: "Checking the build server",
    labels: { pulse: "Investigating a simulated performance warning", sentinel: "Inspecting the build server's safeguards" },
  },
  {
    id: "stage",
    gesture: "present",
    spot: { x: 4, y: 8, face: FACE.py },
    label: "Rehearsing a team update",
    labels: { echo: "Presenting a narrated team update" },
  },
  // Visiting a colleague: stand beside their chair, facing them.
  { id: "visit-astra", gesture: "chat", spot: { x: 3, y: 1, face: FACE.nx }, label: "Checking in with ASTRA", visit: "astra" },
  { id: "visit-nova", gesture: "chat", spot: { x: 6, y: 1, face: FACE.nx }, label: "Reviewing designs with NOVA", visit: "nova" },
  { id: "visit-forge", gesture: "chat", spot: { x: 9, y: 1, face: FACE.nx }, label: "Pairing with FORGE", visit: "forge" },
  {
    id: "visit-echo",
    gesture: "chat",
    spot: { x: 12, y: 1, face: FACE.nx },
    label: "Talking through a script with ECHO",
    labels: { nova: "Sharing a creative idea with ECHO" },
    visit: "echo",
  },
  {
    id: "visit-atlas",
    gesture: "chat",
    spot: { x: 1, y: 4, face: FACE.ny },
    label: "Discussing the architecture with ATLAS",
    labels: { forge: "Discussing interface architecture with ATLAS", sentinel: "Consulting ATLAS about a simulated alert" },
    visit: "atlas",
  },
  { id: "visit-pulse", gesture: "chat", spot: { x: 1, y: 6, face: FACE.py }, label: "Checking performance numbers with PULSE", visit: "pulse" },
  { id: "visit-sentinel", gesture: "chat", spot: { x: 1, y: 10, face: FACE.ny }, label: "Going over test results with SENTINEL", visit: "sentinel" },
];

export const DESK_ACTIVITIES: DeskActivity[] = [
  { id: "alert", gesture: "inspect", label: "Reviewing a simulated security alert", dur: [3.5, 5] },
  { id: "perf-warning", gesture: "inspect", label: "Spotting a simulated performance warning", dur: [3, 4.5] },
  { id: "script", gesture: "type", label: "Writing a narration script", dur: [4, 6] },
  { id: "blueprint", gesture: "type", label: "Refining a system blueprint", dur: [4, 6] },
];

/**
 * What each character does between stretches of desk work. An entry is an errand id;
 * "a>b" runs errand a then errand b before heading back; "@x>b" starts with desk
 * activity x (for example SENTINEL reviews an alert at its desk, then consults ATLAS).
 */
export const ROUTINES: Record<HqAgentId, string[]> = {
  astra: ["visit-nova", "visit-forge", "visit-atlas", "visit-pulse", "visit-sentinel", "visit-echo", "coffee"],
  nova: ["whiteboard>visit-echo", "coffee", "visit-forge", "whiteboard"],
  forge: ["visit-atlas", "rack", "coffee", "review-board", "visit-nova"],
  atlas: ["whiteboard", "@blueprint>whiteboard", "coffee", "visit-forge"],
  pulse: ["@perf-warning>rack", "coffee", "visit-forge", "rack"],
  sentinel: ["@alert>visit-atlas", "review-board", "rack", "@alert>review-board"],
  echo: ["@script>stage", "visit-nova", "coffee", "stage"],
};

/** Floor tiles drawn as a lighter walkway: the back aisle and the paths through the office. */
export const WALKWAY: Tile[] = [
  ...range(2, W).flatMap((x) => [
    { x, y: 2 },
    { x, y: 3 },
  ]),
  ...range(4, 10).map((y) => ({ x: 3, y })),
  ...range(4, 10).map((y) => ({ x: 10, y })),
  ...range(4, 10).map((x) => ({ x, y: 9 })),
];

export const errandLabel = (e: Errand, who: HqAgentId) => e.labels?.[who] ?? e.label;

function range(a: number, b: number) {
  return Array.from({ length: b - a }, (_, i) => a + i);
}

function spotFacing(x: number, y: number, target: { x: number; y: number }): Spot {
  return { x, y, face: Math.atan2(target.y - (y + 0.5), target.x - (x + 0.5)) };
}

const solid = new Set<string>();
for (const p of PROPS) for (let x = p.x0; x < p.x1; x++) for (let y = p.y0; y < p.y1; y++) solid.add(key(x, y));

export function key(x: number, y: number) {
  return `${x},${y}`;
}

export function inBounds(x: number, y: number) {
  return x >= 0 && y >= 0 && x < W && y < H;
}

/** True when the tile is floor (not a prop and inside the room). */
export function isFloor(x: number, y: number) {
  return inBounds(x, y) && !solid.has(key(x, y));
}

const seats = new Map<string, HqAgentId>(HQ_AGENTS.map((id) => [key(DESKS[id].seat.x, DESKS[id].seat.y), id]));

/** Chair tiles belong to their owner: other characters route around them. */
export function seatOwner(x: number, y: number): HqAgentId | null {
  return seats.get(key(x, y)) ?? null;
}

/** Whether `who` may stand on tile (x, y). */
export function walkableFor(who: HqAgentId, x: number, y: number) {
  if (!isFloor(x, y)) return false;
  const owner = seatOwner(x, y);
  return owner === null || owner === who;
}

export function propAt(x: number, y: number): Prop | undefined {
  return PROPS.find((p) => x >= p.x0 && x < p.x1 && y >= p.y0 && y < p.y1);
}
