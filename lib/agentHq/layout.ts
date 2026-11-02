// Agent HQ office layout: a small isometric floor plan on a tile grid.
//
// Coordinates: tile (x, y) with x in [0, W) and y in [0, H). A continuous position
// (px, py) is in tile units; the centre of tile (x, y) is (x + 0.5, y + 0.5).
// The two back walls run along x = 0 and y = 0. Facing angles are in the floor
// plane: 0 faces +x, PI/2 faces +y (both towards the viewer), PI faces -x, -PI/2 faces -y.

export type HqAgentId = "astra" | "nova" | "forge";

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
};

export type Spot = Tile & { face: number };

export type Errand = {
  id: string;
  /** What the character does while there. */
  gesture: "sip" | "write" | "inspect" | "chat";
  spot: Spot;
  label: string;
  /** Only this character runs the errand (e.g. visiting a colleague). */
  visit?: HqAgentId;
};

export const W = 10;
export const H = 8;

export const FACE = { px: 0, py: Math.PI / 2, nx: Math.PI, ny: -Math.PI / 2, viewer: Math.PI / 4 } as const;

export const HQ_AGENTS: HqAgentId[] = ["astra", "nova", "forge"];

/** Each workstation: a 2x1 desk against the back wall, and the chair tile in front of it. */
export const DESKS: Record<HqAgentId, { desk: Prop; seat: Spot }> = {
  astra: { desk: { id: "desk-astra", kind: "desk", x0: 1, y0: 0, x1: 3, y1: 1, owner: "astra" }, seat: { x: 1, y: 1, face: FACE.ny } },
  nova: { desk: { id: "desk-nova", kind: "desk", x0: 4, y0: 0, x1: 6, y1: 1, owner: "nova" }, seat: { x: 4, y: 1, face: FACE.ny } },
  forge: { desk: { id: "desk-forge", kind: "desk", x0: 7, y0: 0, x1: 9, y1: 1, owner: "forge" }, seat: { x: 7, y: 1, face: FACE.ny } },
};

export const TABLE: Prop = { id: "table", kind: "table", x0: 6, y0: 4, x1: 8, y1: 6 };
export const TABLE_CENTER = { x: 7, y: 5 };

export const PROPS: Prop[] = [
  ...HQ_AGENTS.map((id) => DESKS[id].desk),
  TABLE,
  { id: "coffee", kind: "coffee", x0: 0, y0: 4, x1: 1, y1: 5 },
  { id: "plant-corner", kind: "plant", x0: 9, y0: 0, x1: 10, y1: 1 },
  { id: "plant-front", kind: "plant", x0: 0, y0: 7, x1: 1, y1: 8 },
  { id: "plant-right", kind: "plant", x0: 9, y0: 7, x1: 10, y1: 8 },
  { id: "sofa", kind: "sofa", x0: 2, y0: 7, x1: 4, y1: 8 },
  { id: "rack", kind: "rack", x0: 9, y0: 3, x1: 10, y1: 4 },
];

/** Where each character stands at the meeting table, facing its centre. */
export const MEETING_SPOTS: Record<HqAgentId, Spot> = {
  astra: spotFacing(7, 3, TABLE_CENTER),
  nova: spotFacing(5, 4, TABLE_CENTER),
  forge: spotFacing(5, 5, TABLE_CENTER),
};

export const ERRANDS: Errand[] = [
  { id: "coffee", gesture: "sip", spot: { x: 1, y: 4, face: FACE.nx }, label: "Getting a coffee" },
  { id: "whiteboard", gesture: "write", spot: { x: 0, y: 2, face: FACE.nx }, label: "Sketching on the whiteboard" },
  { id: "rack", gesture: "inspect", spot: { x: 8, y: 3, face: FACE.px }, label: "Checking the build server" },
  // Visiting a colleague: stand beside their chair, facing them.
  { id: "visit-nova", gesture: "chat", spot: { x: 5, y: 1, face: FACE.nx }, label: "Reviewing designs with NOVA", visit: "nova" },
  { id: "visit-forge", gesture: "chat", spot: { x: 8, y: 1, face: FACE.nx }, label: "Pairing with FORGE", visit: "forge" },
  { id: "visit-astra", gesture: "chat", spot: { x: 2, y: 1, face: FACE.nx }, label: "Checking in with ASTRA", visit: "astra" },
];

/** Errands each character picks from during the ambient routine. */
export const ROUTINES: Record<HqAgentId, string[]> = {
  astra: ["visit-nova", "visit-forge", "coffee", "whiteboard"],
  nova: ["whiteboard", "coffee", "visit-forge", "whiteboard"],
  forge: ["rack", "coffee", "visit-nova", "rack"],
};

/** Floor tiles drawn as a lighter walkway: the main aisle and the path to the meeting area. */
export const WALKWAY: Tile[] = [
  ...range(0, W).map((x) => ({ x, y: 2 })),
  ...range(0, W).map((x) => ({ x, y: 3 })),
  { x: 4, y: 4 },
  { x: 4, y: 5 },
  { x: 4, y: 6 },
];

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

/** Chair tiles belong to their owner: other characters route around them. */
export function seatOwner(x: number, y: number): HqAgentId | null {
  for (const id of HQ_AGENTS) {
    const s = DESKS[id].seat;
    if (s.x === x && s.y === y) return id;
  }
  return null;
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
