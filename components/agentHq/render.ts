import { DESKS, H, HQ_AGENTS, PROPS, TABLE, TABLE_CENTER, W, WALKWAY, WHITEBOARD, type HqAgentId, type Prop } from "@/lib/agentHq/layout";
import { computePose, toWorld, type IdleStyle, type V3 } from "@/lib/agentHq/pose";
import { STYLES, angleDiff, type Character, type Sim } from "@/lib/agentHq/sim";

// Canvas 2D renderer for Agent HQ. Everything is drawn procedurally in base pixels
// (a floor tile is a 64x32 diamond) and scaled by the view transform, so the scene
// is crisp at any size and device pixel ratio without image assets or a 3D engine.

export const TILE_W = 64;
export const TILE_H = 32;
const WALL_H = 96;
/** Characters are drawn 1.2x their skeleton units so they read clearly at miniature scale. */
const CH = 1.2;

export type View = { scale: number; ox: number; oy: number; dpr: number };

export type DrawOptions = {
  time: number;
  still: boolean;
  selected: HqAgentId | null;
  highlighted: HqAgentId | null;
  /** Optional cache for the static scenery (background, floor, walls). */
  layer?: StaticLayer;
  /** Refresh rate of the cached background animation; lowered while the page runs at 30 fps. */
  ambientFps?: number;
};

/**
 * The background, floor, walls and the desks never move, so they are drawn once into an
 * offscreen canvas for the current view and copied each frame; only the monitor screens,
 * chairs, characters and other moving parts are drawn on top. While the camera is moving
 * the scenery is drawn directly; the cache is rebuilt once the view holds still.
 */
export type StaticLayer = {
  canvas: HTMLCanvasElement | null;
  key: string;
  lastViewKey: string;
  hits: number;
  builds: number;
  /**
   * The slow background animation (skyline lights, wall panels, whiteboard, monitor screens,
   * floor guide lines) on top of the static scenery, refreshed AMBIENT_FPS times a second or
   * when what it shows changes. Characters and everything they interact with draw every frame.
   */
  ambient: HTMLCanvasElement | null;
  ambientKey: string;
  ambientBuilds: number;
};

export function createStaticLayer(): StaticLayer {
  return { canvas: null, key: "", lastViewKey: "", hits: 0, builds: 0, ambient: null, ambientKey: "", ambientBuilds: 0 };
}

/** Refresh rate of the background animation: its motion is slow, so 15 updates a second look the same as 60. */
export const AMBIENT_FPS = 15;

export type Look = {
  body: string;
  shade: string;
  trim: string;
  accent: string;
  legs: string;
  name: string;
  /** Overall size relative to the default build. */
  scale: number;
  /** Shoulder width relative to the default build. */
  shoulder: number;
  /** How the character stands when it has nothing in hand. */
  idle: IdleStyle;
  /** What the character's station is about, shown on its wall panel. */
  station: string;
};

// Colours are the AI team's canonical accents (data/agentTeam.ts).
export const LOOK: Record<HqAgentId, Look> = {
  astra: { body: "#dbe7ec", shade: "#9fb4be", trim: "#5f7a86", accent: "#22d3ee", legs: "#2b3c46", name: "ASTRA", scale: 1, shoulder: 1, idle: "default", station: "ORCHESTRATION" },
  nova: { body: "#3a3160", shade: "#2a2347", trim: "#6d5ba8", accent: "#a78bfa", legs: "#1e1a33", name: "NOVA", scale: 0.97, shoulder: 0.94, idle: "default", station: "CREATIVE DESIGN" },
  forge: { body: "#4a4038", shade: "#352d27", trim: "#8a6a3a", accent: "#f59e0b", legs: "#26211d", name: "FORGE", scale: 1.02, shoulder: 1.08, idle: "default", station: "FRONTEND" },
  atlas: { body: "#24413a", shade: "#1a2f2a", trim: "#4f8f7a", accent: "#34d399", legs: "#15241f", name: "ATLAS", scale: 1.08, shoulder: 1.16, idle: "fold", station: "ARCHITECTURE" },
  pulse: { body: "#2a2430", shade: "#1d1922", trim: "#8a4a6e", accent: "#f472b6", legs: "#18141c", name: "PULSE", scale: 0.93, shoulder: 0.9, idle: "ready", station: "PERFORMANCE · SIM" },
  sentinel: { body: "#2b3a52", shade: "#1e293b", trim: "#4b6aa0", accent: "#60a5fa", legs: "#17202e", name: "SENTINEL", scale: 1.04, shoulder: 1.26, idle: "guard", station: "SECURITY · QA" },
  echo: { body: "#eadbd3", shade: "#c4b0a6", trim: "#9a6d6a", accent: "#fb7185", legs: "#3a2a2e", name: "ECHO", scale: 0.98, shoulder: 0.96, idle: "open", station: "VOICE STUDIO" },
};

/** Isometric projection: tile coordinates plus height (base px) to screen base px. */
export function P(x: number, y: number, z = 0) {
  return { X: (x - y) * (TILE_W / 2), Y: (x + y) * (TILE_H / 2) - z };
}

/** Screen-space bounds of the room, used to fit the view. */
export const WORLD_BOUNDS = (() => {
  const left = P(0, H).X - 8;
  const right = P(W, 0).X + 8;
  const top = P(0, 0, WALL_H).Y - 8;
  const bottom = P(W, H).Y + 14;
  return { left, right, top, bottom, width: right - left, height: bottom - top };
})();

/** Where a character's feet are (render position, nudged towards the desk when seated). */
export function renderPos(c: Character) {
  const k = 0.2 * c.sit;
  return { x: c.x + Math.cos(c.face) * k, y: c.y + Math.sin(c.face) * k };
}

/** Background, floor tiles, rugs, walls and everything on them that does not animate. */
function drawStatic(ctx: CanvasRenderingContext2D, view: View) {
  const { dpr } = view;
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const bg = ctx.createRadialGradient(cw * 0.5, ch * 0.45, 0, cw * 0.5, ch * 0.45, Math.max(cw, ch) * 0.75);
  bg.addColorStop(0, "#06161a");
  bg.addColorStop(1, "#020608");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cw, ch);
  ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.ox, dpr * view.oy);
  drawFloorStatic(ctx);
  drawWallsStatic(ctx);
  // Seat glows, then the desks against the walls. Characters are always in front of a desk,
  // except right beside its outer end; then the desk is drawn again in depth order (drawScene).
  HQ_AGENTS.forEach((id) => {
    const { x, y } = chairCenter(id);
    const p = P(x, y);
    glow(ctx, p.X, p.Y, 46, LOOK[id].accent, 0.12);
  });
  for (const id of HQ_AGENTS) drawDeskBody(ctx, DESKS[id].desk);
}

const viewKeyOf = (ctx: CanvasRenderingContext2D, view: View) =>
  `${ctx.canvas.width}x${ctx.canvas.height}|${view.dpr}|${view.scale.toFixed(4)}|${view.ox.toFixed(2)}|${view.oy.toFixed(2)}`;

/** Paints the static scenery; returns true when it came from (or was just stored in) the cache. */
function paintStatic(ctx: CanvasRenderingContext2D, view: View, layer: StaticLayer | undefined, blit = true): boolean {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  if (!layer || typeof document === "undefined") {
    drawStatic(ctx, view);
    return false;
  }
  const viewKey = viewKeyOf(ctx, view);
  const settled = viewKey === layer.lastViewKey;
  layer.lastViewKey = viewKey;
  if (layer.canvas && layer.key === viewKey) {
    if (blit) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(layer.canvas, 0, 0);
    }
    layer.hits++;
    return true;
  }
  // The camera is still moving: draw directly rather than rebuilding the cache every frame.
  if (!settled) {
    drawStatic(ctx, view);
    return false;
  }
  if (!layer.canvas) layer.canvas = document.createElement("canvas");
  const c = layer.canvas;
  if (c.width !== cw || c.height !== ch) {
    c.width = cw;
    c.height = ch;
  }
  const lctx = c.getContext("2d");
  if (!lctx) {
    drawStatic(ctx, view);
    return false;
  }
  drawStatic(lctx, view);
  layer.key = viewKey;
  layer.builds++;
  if (blit) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(c, 0, 0);
  }
  return true;
}

/** The background animation, drawn over the static scenery in the view transform. */
function drawAmbient(ctx: CanvasRenderingContext2D, view: View, sim: Sim, who: StationState, t: number) {
  const { dpr } = view;
  ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.ox, dpr * view.oy);
  drawFloorDynamic(ctx, t);
  drawWallsDynamic(ctx, sim, who, t);
  drawFloorLights(ctx, sim, t);
  // Monitor screens and desk gadgets on the (cached) desks.
  for (const id of HQ_AGENTS) drawDeskLive(ctx, DESKS[id].desk, who, t);
}

function paintAmbient(ctx: CanvasRenderingContext2D, view: View, sim: Sim, who: StationState, t: number, layer: StaticLayer | undefined, fps: number) {
  // Rebuilt on the next animation step, or at once if anything it shows has changed.
  let state = `|${Math.floor(t * fps)}|${sim.meeting?.phase ?? ""}`;
  for (const c of sim.chars) state += `|${c.gesture}${c.errand ?? ""}${c.label}`;
  if (layer?.canvas && layer.ambient && typeof document !== "undefined") {
    const viewKey = viewKeyOf(ctx, view);
    if (layer.key === viewKey && layer.ambientKey === viewKey + state) {
      // The common case: one copy of the cached background per frame.
      layer.lastViewKey = viewKey;
      layer.hits++;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(layer.ambient, 0, 0);
      return;
    }
  }
  // The static scenery is copied straight into the ambient layer, so the frame gets one copy, not two.
  const cached = paintStatic(ctx, view, layer, false);
  if (!cached || !layer || !layer.canvas) return drawAmbient(ctx, view, sim, who, t);
  const key = layer.key + state;
  if (!layer.ambient) layer.ambient = document.createElement("canvas");
  const a = layer.ambient;
  if (a.width !== ctx.canvas.width || a.height !== ctx.canvas.height) {
    a.width = ctx.canvas.width;
    a.height = ctx.canvas.height;
  }
  const actx = a.getContext("2d");
  if (!actx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer.canvas, 0, 0);
    return drawAmbient(ctx, view, sim, who, t);
  }
  actx.setTransform(1, 0, 0, 1, 0, 0);
  actx.drawImage(layer.canvas, 0, 0);
  drawAmbient(actx, view, sim, who, t);
  layer.ambientKey = key;
  layer.ambientBuilds++;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(a, 0, 0);
}

/** What each character is doing that its station shows (an alert on SENTINEL's screens, ECHO on air...). */
type StationState = Record<HqAgentId, Character | undefined>;

export function drawScene(ctx: CanvasRenderingContext2D, sim: Sim, view: View, o: DrawOptions) {
  const { dpr } = view;
  const t = o.still ? 0 : o.time;
  const who = {} as StationState;
  for (const c of sim.chars) who[c.id] = c;
  paintAmbient(ctx, view, sim, who, t, o.layer, o.ambientFps ?? AMBIENT_FPS);
  ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.ox, dpr * view.oy);

  type Item = { key: number; draw: () => void };
  const items: Item[] = [];
  for (const p of PROPS) {
    // Boxes sort by their front-most tile; characters by their position.
    const k = p.x1 - 0.5 + (p.y1 - 0.5) - 0.02;
    if (p.kind === "desk") {
      // Only redrawn when someone stands just past the desk's outer end, where the desk is in front of them.
      if (sim.chars.some((c) => behindDesk(p, c))) items.push({ key: k, draw: () => drawDesk(ctx, p, who, t) });
      continue;
    }
    items.push({ key: k, draw: () => drawProp(ctx, p, sim, who, t) });
  }
  for (const id of HQ_AGENTS) {
    const seat = DESKS[id].seat;
    const k = seat.x + 0.5 + seat.y + 0.5;
    items.push({ key: k - 0.01, draw: () => drawChairSeat(ctx, id) });
    items.push({ key: k + 0.01, draw: () => drawChairBack(ctx, id) });
  }
  for (const c of sim.chars) {
    items.push({ key: c.x + c.y, draw: () => drawCharacter(ctx, c, o, sim) });
  }
  items.sort((a, b) => a.key - b.key);
  for (const it of items) it.draw();

  drawHologram(ctx, sim, t);
}

// ---------- primitives ----------

function poly(ctx: CanvasRenderingContext2D, pts: { X: number; Y: number }[], fill: string | CanvasGradient, stroke?: string, lw = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0].X, pts[0].Y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].X, pts[i].Y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

type BoxColors = { top: string; left: string; right: string; edge?: string };

/** An axis-aligned box; only the three faces the camera can see are drawn. */
function box(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, c: BoxColors) {
  // +y face (front-left)
  poly(ctx, [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], c.left, c.edge, 0.6);
  // +x face (front-right)
  poly(ctx, [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], c.right, c.edge, 0.6);
  // top
  poly(ctx, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], c.top, c.edge, 0.6);
}

/** Draws in the plane of a +y-facing surface: local x runs along +x (32 px per tile), local y runs down the screen. */
function onFaceY(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, fn: () => void) {
  const o = P(x, y, z);
  ctx.save();
  ctx.transform(1, 0.5, 0, 1, o.X, o.Y);
  fn();
  ctx.restore();
}

/**
 * Draws in the plane of a +x-facing surface (the left wall, or the screen of a desk against it).
 * Local x runs towards -y, which reads left to right for the viewer; start at the surface's larger y.
 */
function onFaceX(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, fn: () => void) {
  const o = P(x, y, z);
  ctx.save();
  ctx.transform(1, -0.5, 0, 1, o.X, o.Y);
  fn();
  ctx.restore();
}

/** Radial glows are drawn from one cached sprite per colour instead of building a gradient every frame. */
const glowSprites = new Map<string, HTMLCanvasElement>();
function glowSprite(color: string) {
  let s = glowSprites.get(color);
  if (s || typeof document === "undefined") return s ?? null;
  s = document.createElement("canvas");
  s.width = s.height = 64;
  const g = s.getContext("2d");
  if (!g) return null;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, hexA(color, 1));
  grad.addColorStop(1, hexA(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowSprites.set(color, s);
  return s;
}

function glow(ctx: CanvasRenderingContext2D, X: number, Y: number, r: number, color: string, alpha: number, sy = 0.5) {
  if (alpha <= 0) return;
  const sprite = glowSprite(color);
  ctx.save();
  ctx.translate(X, Y);
  ctx.scale(1, sy);
  if (sprite) {
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(sprite, -r, -r, r * 2, r * 2);
  } else {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, hexA(color, alpha));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}

function line(ctx: CanvasRenderingContext2D, a: { X: number; Y: number }, b: { X: number; Y: number }) {
  ctx.moveTo(a.X, a.Y);
  ctx.lineTo(b.X, b.Y);
}

// ---------- room ----------

const walkway = new Set(WALKWAY.map((t) => `${t.x},${t.y}`));

function drawFloorStatic(ctx: CanvasRenderingContext2D) {
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const path = walkway.has(`${x},${y}`);
      const shade = (x + y) % 2 === 0 ? "#0a1c21" : "#0b1f25";
      poly(ctx, [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], path ? "#0f282e" : shade, "rgba(25,211,197,0.07)", 0.6);
    }
  }
  // Rug under the meeting table, with room around it for all seven.
  poly(ctx, [P(4.9, 3.9), P(9.1, 3.9), P(9.1, 8.1), P(4.9, 8.1)], "rgba(25,211,197,0.06)", "rgba(25,211,197,0.32)", 0.9);
  poly(ctx, [P(5.1, 4.1), P(8.9, 4.1), P(8.9, 7.9), P(5.1, 7.9)], "rgba(0,0,0,0)", "rgba(25,211,197,0.14)", 0.6);
  // Lounge rug in front of the sofa.
  poly(ctx, [P(4.6, 9.15), P(7.4, 9.15), P(7.4, 9.95), P(4.6, 9.95)], "rgba(167,139,250,0.05)", "rgba(167,139,250,0.22)", 0.8);
  // ECHO's studio corner: an acoustic floor mat.
  poly(ctx, [P(10.7, 1.05), P(12.95, 1.05), P(12.95, 1.95), P(10.7, 1.95)], "rgba(251,113,133,0.06)", "rgba(251,113,133,0.3)", 0.8);
  // ECHO's stage mark, where it presents.
  poly(ctx, [P(4.12, 8.12), P(4.88, 8.12), P(4.88, 8.88), P(4.12, 8.88)], "rgba(251,113,133,0.05)", "rgba(251,113,133,0.35)", 0.8);
  // SENTINEL's and PULSE's corner of the left wall, and ATLAS's planning area in front of the whiteboard.
  poly(ctx, [P(0.05, WHITEBOARD.y0), P(0.95, WHITEBOARD.y0), P(0.95, WHITEBOARD.y1), P(0.05, WHITEBOARD.y1)], "rgba(52,211,153,0.05)", "rgba(52,211,153,0.28)", 0.7);
}

/** Walkway guide lines: a faint inlaid strip down the middle of the aisles, drifting slowly. */
function drawFloorDynamic(ctx: CanvasRenderingContext2D, t: number) {
  ctx.strokeStyle = "rgba(94,234,212,0.16)";
  ctx.lineWidth = 0.8;
  ctx.setLineDash([5, 7]);
  ctx.lineDashOffset = -t * 6;
  ctx.beginPath();
  line(ctx, P(1.2, 3), P(W - 0.2, 3));
  line(ctx, P(3.5, 4), P(3.5, 9.5));
  line(ctx, P(10.5, 4), P(10.5, 9.5));
  line(ctx, P(3.5, 9.5), P(10.5, 9.5));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

// Deterministic "city lights" seen through the windows.
const CITY = Array.from({ length: 46 }, (_, i) => {
  const r = Math.sin(i * 91.7) * 43758.5453;
  const f = r - Math.floor(r);
  const r2 = Math.sin(i * 12.9) * 9631.1;
  return { u: f, v: r2 - Math.floor(r2), c: i % 5 === 0 ? "#f59e0b" : i % 3 === 0 ? "#a78bfa" : "#5eead4" };
});

/** Windows in the back wall, in the gaps between the desks. */
const WINDOWS: [number, number][] = [
  [1.12, 1.88],
  [4.12, 4.88],
  [7.12, 7.88],
  [10.12, 10.88],
];

type CityLight = (typeof CITY)[number];

/** City lights flicker by opacity; drawn with globalAlpha so no colour strings are built per frame. */
function cityLights(ctx: CanvasRenderingContext2D, alphaAt: (c: CityLight) => number, rect: (c: CityLight) => void, skip?: (c: CityLight) => boolean) {
  for (const c of CITY) {
    if (skip?.(c)) continue;
    ctx.globalAlpha = alphaAt(c);
    ctx.fillStyle = c.c;
    rect(c);
  }
  ctx.globalAlpha = 1;
}

/** The wall panel above a desk: on the back wall for back desks, the left wall for left desks. */
function onPanel(ctx: CanvasRenderingContext2D, id: HqAgentId, fn: (w: number) => void) {
  const d = DESKS[id].desk;
  if (d.wall === "x") {
    const w = (d.y1 - d.y0 - 0.36) * 32;
    onFaceX(ctx, 0, d.y1 - 0.18, 92, () => fn(w));
  } else {
    const w = (d.x1 - d.x0 - 0.36) * 32;
    onFaceY(ctx, d.x0 + 0.18, 0, 92, () => fn(w));
  }
}

/** The whiteboard ATLAS draws its architecture diagrams on (left wall). */
const BOARD = { y: WHITEBOARD.y1, w: (WHITEBOARD.y1 - WHITEBOARD.y0) * 32, z: 78, h: 44 };
/** Diagram nodes on the board (local px): interface → orchestrator → agents → tools / data. */
const BOARD_NODES = [
  { x: 8, y: 9, label: "UI" },
  { x: 28, y: 9, label: "API" },
  { x: 50, y: 9, label: "AGENTS" },
  { x: 28, y: 30, label: "TOOLS" },
  { x: 50, y: 30, label: "DATA" },
];
const BOARD_EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [2, 4],
  [3, 4],
];

/** Walls and the parts of the windows, displays, whiteboard and sign that never change. */
function drawWallsStatic(ctx: CanvasRenderingContext2D) {
  // Left wall (x = 0) and back wall (y = 0).
  const lg = ctx.createLinearGradient(0, P(0, 0, WALL_H).Y, 0, P(0, H, 0).Y);
  lg.addColorStop(0, "#0c2329");
  lg.addColorStop(1, "#08171b");
  poly(ctx, [P(0, 0, 0), P(0, H, 0), P(0, H, WALL_H), P(0, 0, WALL_H)], lg);
  const rg = ctx.createLinearGradient(0, P(0, 0, WALL_H).Y, 0, P(W, 0, 0).Y);
  rg.addColorStop(0, "#0f2a31");
  rg.addColorStop(1, "#0a1d22");
  poly(ctx, [P(0, 0, 0), P(W, 0, 0), P(W, 0, WALL_H), P(0, 0, WALL_H)], rg);

  // Window glass on the back wall (the skyline lights and frames are drawn on top each frame).
  for (const [xa, xb] of WINDOWS) {
    onFaceY(ctx, xa, 0, 92, () => {
      const w = (xb - xa) * 32;
      const g = ctx.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, "#071827");
      g.addColorStop(1, "#0b2a33");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, 64);
    });
  }

  // A status panel above every desk (the live parts are drawn each frame).
  for (const id of HQ_AGENTS) {
    const look = LOOK[id];
    onPanel(ctx, id, (w) => {
      ctx.fillStyle = "#06121a";
      ctx.fillRect(0, 0, w, 30);
      ctx.strokeStyle = hexA(look.accent, 0.55);
      ctx.lineWidth = 0.8;
      ctx.strokeRect(0, 0, w, 30);
      ctx.fillStyle = look.accent;
      ctx.font = "bold 6px ui-monospace, monospace";
      ctx.fillText(look.name, 4, 8);
      ctx.fillStyle = "rgba(148,163,184,0.7)";
      ctx.font = "3.4px ui-monospace, monospace";
      ctx.fillText(look.station, 4, 13);
      if (id === "sentinel") shieldPath(ctx, w - 9, 6, 5, look.accent);
    });
  }

  // ECHO's studio: acoustic foam on the back wall under its panel.
  onFaceY(ctx, DESKS.echo.desk.x0 + 0.12, 0, 60, () => {
    const w = (DESKS.echo.desk.x1 - DESKS.echo.desk.x0 - 0.24) * 32;
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? "#2a1b20" : "#22161a";
        ctx.fillRect(i * (w / 8) + 0.5, j * 7, w / 8 - 1, 6.4);
      }
  });

  // ATLAS's architecture whiteboard on the left wall.
  onFaceX(ctx, 0, BOARD.y, BOARD.z, () => {
    ctx.fillStyle = "#dfeef0";
    ctx.fillRect(0, 0, BOARD.w, BOARD.h);
    ctx.strokeStyle = "#5f7a86";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(0, 0, BOARD.w, BOARD.h);
    ctx.strokeStyle = "#0f766e";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (const [a, b] of BOARD_EDGES) {
      ctx.moveTo(BOARD_NODES[a].x + 5, BOARD_NODES[a].y + 3);
      ctx.lineTo(BOARD_NODES[b].x + 5, BOARD_NODES[b].y + 3);
    }
    ctx.stroke();
    for (const n of BOARD_NODES) {
      ctx.fillStyle = "#ecfdf5";
      ctx.fillRect(n.x - 1, n.y - 1, 12, 8);
      ctx.strokeStyle = "#059669";
      ctx.strokeRect(n.x - 1, n.y - 1, 12, 8);
      ctx.fillStyle = "#065f46";
      ctx.font = "bold 2.6px ui-monospace, monospace";
      ctx.fillText(n.label, n.x, n.y + 4);
    }
    ctx.fillStyle = "#475569";
    ctx.font = "bold 3px ui-monospace, monospace";
    ctx.fillText("SYSTEM ARCHITECTURE", 3, BOARD.h - 3);
  });

  // The office sign on the left wall, by the door end.
  onFaceX(ctx, 0, 2.85, 88, () => {
    ctx.fillStyle = "rgba(25,211,197,0.9)";
    ctx.font = "900 11px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("AGENT HQ", 0, 0);
    ctx.fillStyle = "rgba(148,163,184,0.75)";
    ctx.font = "5px ui-monospace, monospace";
    ctx.fillText("7 SIMULATED AGENTS", 0, 9);
  });

  // Trim along the top and the skirting.
  ctx.strokeStyle = "rgba(25,211,197,0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const a = P(0, H, WALL_H), b = P(0, 0, WALL_H), c = P(W, 0, WALL_H);
  ctx.moveTo(a.X, a.Y);
  ctx.lineTo(b.X, b.Y);
  ctx.lineTo(c.X, c.Y);
  ctx.stroke();
  ctx.strokeStyle = "rgba(25,211,197,0.18)";
  ctx.beginPath();
  const d = P(0, H, 3), e = P(0, 0, 3), f = P(W, 0, 3);
  ctx.moveTo(d.X, d.Y);
  ctx.lineTo(e.X, e.Y);
  ctx.lineTo(f.X, f.Y);
  ctx.stroke();
}

function shieldPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x + s * 0.85, y - s * 0.6);
  ctx.lineTo(x + s * 0.7, y + s * 0.4);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x - s * 0.7, y + s * 0.4);
  ctx.lineTo(x - s * 0.85, y - s * 0.6);
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = hexA(color, 0.25);
  ctx.fill();
}

const isOnAir = (c: Character | undefined) => !!c && (c.gesture === "talk" || c.gesture === "present");

/** The animated wall details: skyline lights, status bars, the whiteboard and ECHO's on-air light. */
function drawWallsDynamic(ctx: CanvasRenderingContext2D, sim: Sim, who: StationState, t: number) {
  for (const [xa, xb] of WINDOWS) {
    onFaceY(ctx, xa, 0, 92, () => {
      const w = (xb - xa) * 32;
      const h = 64;
      cityLights(
        ctx,
        (c) => 0.45 + 0.4 * Math.sin(t * 0.7 + c.u * 40),
        (c) => ctx.fillRect(c.u * w, 26 + c.v * 34, 1.3, 1.3),
        (c) => c.u > 0.92
      );
      ctx.strokeStyle = "rgba(160,255,240,0.28)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, w, h);
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();
    });
  }
  HQ_AGENTS.forEach((id, n) => {
    const look = LOOK[id];
    onPanel(ctx, id, (w) => {
      ctx.fillStyle = look.accent;
      for (let i = 0; i < 8; i++) {
        const hgt = 3 + 8 * (0.5 + 0.5 * Math.sin(t * 1.6 + i * 0.9 + n * 1.3));
        ctx.globalAlpha = 0.35 + 0.05 * i;
        ctx.fillRect(4 + i * ((w - 8) / 8), 27 - hgt, (w - 8) / 8 - 1.5, hgt);
      }
      ctx.globalAlpha = 1;
      if (id === "echo") {
        // ON AIR: lit while ECHO is talking or presenting.
        const on = isOnAir(who.echo);
        ctx.fillStyle = on ? "#fb7185" : "#3a2328";
        ctx.fillRect(w - 17, 3, 14, 6);
        ctx.fillStyle = on ? "#1a0b0e" : "#6b4a50";
        ctx.font = "bold 3.4px ui-monospace, monospace";
        ctx.fillText("ON AIR", w - 16, 7.4);
      }
    });
  });
  // The whiteboard: data moving through the architecture, and a marker when someone is drawing on it.
  onFaceX(ctx, 0, BOARD.y, BOARD.z, () => {
    BOARD_EDGES.forEach(([a, b], i) => {
      const k = (t * 0.35 + i * 0.27) % 1;
      const A = BOARD_NODES[a], B = BOARD_NODES[b];
      ctx.fillStyle = "#10b981";
      ctx.beginPath();
      ctx.arc(A.x + 5 + (B.x - A.x) * k, A.y + 3 + (B.y - A.y) * k, 0.9, 0, Math.PI * 2);
      ctx.fill();
    });
    const writer = sim.chars.find((c) => c.errand === "whiteboard" && c.gesture === "write");
    if (writer) {
      // A new sketch grows while the character writes: ATLAS adds to the diagram, NOVA sketches an idea.
      const k = Math.min(1, writer.taskT / 4);
      ctx.strokeStyle = LOOK[writer.id].accent;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      const n = Math.max(2, Math.floor(k * 24));
      for (let i = 0; i < n; i++) {
        const u = i / 23;
        const x = 6 + u * (BOARD.w - 14);
        const y = writer.id === "atlas" ? 20 + (i % 6 < 3 ? 0 : 3) : 21 + Math.sin(u * 9) * 3;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

function drawFloorLights(ctx: CanvasRenderingContext2D, sim: Sim, t: number) {
  void t;
  const tc = P(TABLE_CENTER.x, TABLE_CENTER.y);
  const meeting = sim.meeting && sim.meeting.phase !== "returning";
  glow(ctx, tc.X, tc.Y, 110, "#19d3c5", meeting ? 0.16 : 0.07);
}

// ---------- props ----------

const DESK_C: BoxColors = { top: "#1d3138", left: "#11222a", right: "#0c1a20", edge: "rgba(160,255,240,0.12)" };
const DARK_C: BoxColors = { top: "#14232a", left: "#0b161b", right: "#081115" };

function drawProp(ctx: CanvasRenderingContext2D, p: Prop, sim: Sim, who: StationState, t: number) {
  switch (p.kind) {
    case "desk":
      return drawDesk(ctx, p, who, t);
    case "table":
      return drawTable(ctx);
    case "coffee": {
      const { x0, y0 } = p;
      box(ctx, x0 + 0.08, y0 + 0.1, x0 + 0.92, y0 + 0.9, 0, 18, DARK_C);
      box(ctx, x0 + 0.25, y0 + 0.25, x0 + 0.8, y0 + 0.75, 18, 34, { top: "#26363d", left: "#18262c", right: "#121e23", edge: "rgba(255,255,255,0.08)" });
      onFaceY(ctx, x0 + 0.33, y0 + 0.75, 32, () => {
        ctx.fillStyle = "rgba(245,158,11,0.85)";
        ctx.fillRect(2, 2, 6, 3);
        ctx.fillStyle = "rgba(94,234,212,0.7)";
        ctx.fillRect(10, 2, 3, 3);
      });
      const sipping = sim.chars.some((c) => c.activity === "errand" && c.gesture === "sip");
      if (sipping) {
        for (let i = 0; i < 3; i++) {
          const k = (t * 0.8 + i / 3) % 1;
          const q = P(x0 + 0.5, y0 + 0.5, 36 + k * 18);
          ctx.fillStyle = `rgba(226,240,243,${(0.35 * (1 - k)).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(q.X + Math.sin(k * 6 + i) * 2, q.Y, 1.5 + k * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return;
    }
    case "plant": {
      const cx = (p.x0 + p.x1) / 2;
      const cy = (p.y0 + p.y1) / 2;
      box(ctx, cx - 0.22, cy - 0.22, cx + 0.22, cy + 0.22, 0, 12, { top: "#2a3a40", left: "#1b272c", right: "#152024" });
      const base = P(cx, cy, 12);
      const leaves = [
        [0, -14, 7],
        [-6, -9, 6],
        [6, -9, 6],
        [-3, -20, 5],
        [4, -18, 5],
      ];
      for (const [dx, dy, r] of leaves) {
        const sway = Math.sin(t * 0.8 + dx + cx) * 0.6;
        ctx.fillStyle = dy < -15 ? "#2f9e74" : "#21795a";
        ctx.beginPath();
        ctx.ellipse(base.X + dx + sway, base.Y + dy, r, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    case "sofa": {
      const { x0, x1, y0 } = p;
      const C1 = { top: "#253f4a", left: "#1a2f38", right: "#14262d" };
      const C2 = { top: "#2c4955", left: "#1d3540", right: "#172b33" };
      box(ctx, x0 + 0.06, y0 + 0.12, x1 - 0.06, y0 + 0.92, 0, 9, C1);
      box(ctx, x0 + 0.06, y0 + 0.62, x1 - 0.06, y0 + 0.92, 9, 20, C2);
      box(ctx, x0 + 0.06, y0 + 0.12, x0 + 0.26, y0 + 0.62, 9, 15, C2);
      box(ctx, x1 - 0.26, y0 + 0.12, x1 - 0.06, y0 + 0.62, 9, 15, C2);
      return;
    }
    case "rack": {
      // The build server PULSE and SENTINEL inspect. A simulated warning shows in amber while PULSE investigates.
      const { x0, y0 } = p;
      const pulse = who.pulse;
      const warning = !!pulse && pulse.errand === "rack" && pulse.activity === "errand";
      box(ctx, x0 + 0.1, y0 + 0.1, x0 + 0.9, y0 + 0.9, 0, 56, { top: "#17252b", left: "#0d171c", right: "#0a1317", edge: "rgba(160,255,240,0.14)" });
      onFaceY(ctx, x0 + 0.16, y0 + 0.9, 52, () => {
        for (let r = 0; r < 9; r++) {
          ctx.fillStyle = "#0f1d23";
          ctx.fillRect(2, r * 5.4 + 1, 21, 4);
          const on = Math.sin(t * (2 + r * 0.7) + r * 1.3) > -0.2;
          const warn = warning && r === 3;
          ctx.fillStyle = warn ? (Math.sin(t * 8) > 0 ? "#f59e0b" : "#3a2a10") : on ? (r % 3 === 0 ? "#22d3ee" : "#34d399") : "#123";
          ctx.fillRect(18, r * 5.4 + 2.2, 1.6, 1.6);
          ctx.fillStyle = "rgba(94,234,212,0.5)";
          ctx.fillRect(4, r * 5.4 + 2.6, 8 + ((r * 7) % 5), 0.8);
        }
      });
      if (warning) {
        const q = P(x0 + 0.5, y0 + 0.5, 70 + Math.sin(t * 3) * 1.5);
        ctx.fillStyle = "rgba(245,158,11,0.92)";
        ctx.font = "bold 7px ui-monospace, monospace";
        ctx.fillText("SIM", q.X - 6, q.Y);
      }
      return;
    }
  }
}

/** Desks are drawn in local coordinates: u along the wall, v out from it (0 at the wall, 1 at the front edge). */
type DeskFrame = { u0: number; u1: number; box: (u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, c: BoxColors) => void; at: (u: number, v: number, z?: number) => { X: number; Y: number } };

function deskFrame(d: Prop): DeskFrame {
  if (d.wall === "x") {
    return {
      u0: d.y0,
      u1: d.y1,
      box: (u0, v0, u1, v1, z0, z1, c) => box(ctx2(), v0, u0, v1, u1, z0, z1, c),
      at: (u, v, z = 0) => P(v, u, z),
    };
  }
  return { u0: d.x0, u1: d.x1, box: (u0, v0, u1, v1, z0, z1, c) => box(ctx2(), u0, v0, u1, v1, z0, z1, c), at: (u, v, z = 0) => P(u, v, z) };
}

// The desk helpers draw into whichever context drawDesk is using.
let currentCtx: CanvasRenderingContext2D | null = null;
const ctx2 = () => currentCtx!;

/** A character standing on the floor tile just past a desk's outer end (u0 side), where the desk overlaps it. */
function behindDesk(d: Prop, c: Character) {
  const tx = Math.floor(c.x);
  const ty = Math.floor(c.y);
  return d.wall === "x" ? tx === 0 && ty === d.y0 - 1 : ty === 0 && tx === d.x0 - 1;
}

/** The whole desk, for drawing in depth order. */
function drawDesk(ctx: CanvasRenderingContext2D, d: Prop, who: StationState, t: number) {
  drawDeskBody(ctx, d);
  drawDeskLive(ctx, d, who, t);
}

/** Everything on a desk that changes: the two screens and the station gadgets. */
function drawDeskLive(ctx: CanvasRenderingContext2D, d: Prop, who: StationState, t: number) {
  const id = d.owner!;
  currentCtx = ctx;
  const f = deskFrame(d);
  const { u0 } = f;
  const c = who[id];
  screen(ctx, d, u0 + 0.1, u0 + 0.9, 0.3, 24, 44, (w, h) => screenMain(ctx, id, w, h, t, c));
  screen(ctx, d, u0 + 1.08, u0 + 1.72, 0.36, 23, 38, (w, h) => screenSide(ctx, id, w, h, t));
  deskExtras(ctx, id, f, t, c);
}

/** The parts of a desk that never change (cached with the static scenery). */
function drawDeskBody(ctx: CanvasRenderingContext2D, d: Prop) {
  const id = d.owner!;
  const look = LOOK[id];
  currentCtx = ctx;
  const f = deskFrame(d);
  const { u0, u1 } = f;
  // Legs and modesty panel, then the desktop.
  f.box(u0 + 0.06, 0.12, u0 + 0.14, 0.86, 0, 18, DARK_C);
  f.box(u1 - 0.14, 0.12, u1 - 0.06, 0.86, 0, 18, DARK_C);
  f.box(u0 + 0.14, 0.2, u1 - 0.14, 0.26, 4, 18, DARK_C);
  f.box(u0 + 0.02, 0.06, u1 - 0.02, 0.92, 18, 20.5, DESK_C);
  // Accent strip along the front edge.
  ctx.strokeStyle = hexA(look.accent, 0.55);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  line(ctx, f.at(u0 + 0.02, 0.92, 19.2), f.at(u1 - 0.02, 0.92, 19.2));
  ctx.stroke();

  // Main monitor (in front of the chair) and a side monitor.
  monitorFrame(f, u0 + 0.1, u0 + 0.9, 0.3, 24, 44);
  monitorFrame(f, u0 + 1.08, u0 + 1.72, 0.36, 23, 38);
  // Keyboard, mug and lamp.
  f.box(u0 + 0.22, 0.56, u0 + 0.78, 0.74, 20.5, 21.6, { top: "#2a3d45", left: "#1a2a31", right: "#15232a" });
  f.box(u0 + 1.62, 0.66, u0 + 1.76, 0.8, 20.5, 25, { top: hexA(look.accent, 0.9), left: "#cfdadf", right: "#a9b8bf" });
  if (id === "atlas") blueprint(ctx, f);
  const lampBase = f.at(u1 - 0.18, 0.2, 20.5);
  ctx.strokeStyle = "#3b4f58";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(lampBase.X, lampBase.Y);
  ctx.lineTo(lampBase.X - 2, lampBase.Y - 16);
  ctx.lineTo(lampBase.X - 7, lampBase.Y - 18);
  ctx.stroke();
  glow(ctx, lampBase.X - 7, lampBase.Y - 14, 16, "#fde68a", 0.18, 1);
}

/** Each station's own desk detail. */
function deskExtras(ctx: CanvasRenderingContext2D, id: HqAgentId, f: DeskFrame, t: number, c: Character | undefined) {
  const { u0 } = f;
  const acc = LOOK[id].accent;
  if (id === "echo") {
    // A studio microphone on a stand, with a pop filter.
    const base = f.at(u0 + 1.2, 0.62, 20.5);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(base.X, base.Y);
    ctx.lineTo(base.X, base.Y - 13);
    ctx.stroke();
    ctx.fillStyle = "#1f2937";
    ctx.beginPath();
    ctx.ellipse(base.X, base.Y - 15, 2.2, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hexA(acc, isOnAir(c) ? 0.95 : 0.5);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(base.X - 3.5, base.Y - 15, 1.2, 3, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (id === "sentinel") {
    // A small shield beacon that pulses while an alert is being reviewed.
    const alert = !!c && c.label.includes("alert");
    const q = f.at(u0 + 1.25, 0.7, 26);
    f.box(u0 + 1.2, 0.65, u0 + 1.3, 0.75, 20.5, 23, DARK_C);
    shieldPath(ctx, q.X, q.Y, 3.2, alert && Math.sin(t * 6) > 0 ? "#f87171" : acc);
  } else if (id === "pulse") {
    // A little gauge whose needle swings with the (simulated) load.
    const q = f.at(u0 + 1.25, 0.7, 24);
    ctx.strokeStyle = hexA(acc, 0.8);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(q.X, q.Y, 3.2, Math.PI, Math.PI * 2);
    ctx.stroke();
    const a = Math.PI + (0.5 + 0.4 * Math.sin(t * 1.7)) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(q.X, q.Y);
    ctx.lineTo(q.X + Math.cos(a) * 3, q.Y + Math.sin(a) * 3);
    ctx.stroke();
  }
}

/** ATLAS's blueprint sheet on its desk. */
function blueprint(ctx: CanvasRenderingContext2D, f: DeskFrame) {
  const { u0 } = f;
  poly(ctx, [f.at(u0 + 1.0, 0.45, 20.6), f.at(u0 + 1.5, 0.45, 20.6), f.at(u0 + 1.5, 0.85, 20.6), f.at(u0 + 1.0, 0.85, 20.6)], "rgba(30,64,120,0.85)", "rgba(52,211,153,0.6)", 0.6);
  ctx.strokeStyle = "rgba(186,230,253,0.55)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  line(ctx, f.at(u0 + 1.08, 0.55, 20.7), f.at(u0 + 1.42, 0.55, 20.7));
  line(ctx, f.at(u0 + 1.08, 0.7, 20.7), f.at(u0 + 1.3, 0.7, 20.7));
  line(ctx, f.at(u0 + 1.25, 0.5, 20.7), f.at(u0 + 1.25, 0.8, 20.7));
  ctx.stroke();
}

function monitorFrame(f: DeskFrame, ua: number, ub: number, v: number, z0: number, z1: number) {
  const mid = (ua + ub) / 2;
  f.box(mid - 0.08, v - 0.02, mid + 0.08, v + 0.08, 20.5, z0 + 2, DARK_C);
  f.box(ua, v - 0.05, ub, v, z0, z1, { top: "#1a262c", left: "#0a1216", right: "#0d161b", edge: "rgba(160,255,240,0.18)" });
}

/** A monitor's screen, drawn in the plane of its front face. */
function screen(ctx: CanvasRenderingContext2D, d: Prop, ua: number, ub: number, v: number, z0: number, z1: number, content: (w: number, h: number) => void) {
  const w = (ub - ua - 0.06) * 32;
  const h = z1 - z0 - 3;
  const paint = () => {
    ctx.fillStyle = "#04101a";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    content(w, h);
    ctx.restore();
  };
  if (d.wall === "x") onFaceX(ctx, v, ub - 0.03, z1 - 1.5, paint);
  else onFaceY(ctx, ua + 0.03, v, z1 - 1.5, paint);
}

function screenMain(ctx: CanvasRenderingContext2D, id: HqAgentId, w: number, h: number, t: number, c: Character | undefined) {
  const acc = LOOK[id].accent;
  if (id === "astra") {
    // A task board: three columns, cards moving from left to right.
    for (let col = 0; col < 3; col++) {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(1.5 + col * (w / 3), 1.5, w / 3 - 2, h - 3);
      for (let r = 0; r < 3; r++) {
        const on = (Math.floor(t / 2.5) + r + col) % 4 !== 0;
        if (!on) continue;
        ctx.fillStyle = hexA(col === 2 ? "#34d399" : acc, 0.75 - r * 0.15);
        ctx.fillRect(3 + col * (w / 3), 3 + r * 5, w / 3 - 5, 3.4);
      }
    }
  } else if (id === "nova") {
    // A design canvas: swatches and a layout being arranged.
    const sw = ["#a78bfa", "#22d3ee", "#f472b6", "#f8fafc"];
    sw.forEach((s, i) => {
      ctx.fillStyle = s;
      ctx.fillRect(2, 2 + i * 4, 3, 3);
    });
    ctx.strokeStyle = hexA(acc, 0.8);
    ctx.lineWidth = 0.7;
    ctx.strokeRect(8, 2, w - 10, h - 4);
    const k = 0.5 + 0.5 * Math.sin(t * 0.9);
    ctx.fillStyle = hexA("#a78bfa", 0.55);
    ctx.fillRect(10, 4, (w - 14) * (0.4 + 0.3 * k), 4);
    ctx.fillStyle = hexA("#22d3ee", 0.4);
    ctx.fillRect(10, 10, (w - 14) * 0.45, h - 14);
    ctx.fillStyle = hexA("#f472b6", 0.45);
    ctx.beginPath();
    ctx.arc(10 + (w - 14) * 0.75, 12 + k * 2, 3.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (id === "forge") {
    // Code scrolling past.
    const lineH = 2.6;
    const off = (t * 5) % lineH;
    for (let i = 0; i < Math.ceil(h / lineH) + 1; i++) {
      const n = Math.floor((t * 5) / lineH) + i;
      const indent = ((n * 7) % 4) * 2;
      const len = 6 + ((n * 13) % 15);
      ctx.fillStyle = n % 5 === 0 ? hexA("#f59e0b", 0.85) : n % 3 === 0 ? hexA("#22d3ee", 0.7) : "rgba(226,232,240,0.55)";
      ctx.fillRect(2 + indent, 1.5 + i * lineH - off, Math.min(len, w - 4 - indent), 1.2);
    }
  } else if (id === "atlas") {
    // A system diagram: services as nodes, requests travelling between them.
    const nodes = [
      [0.15, 0.3],
      [0.45, 0.2],
      [0.78, 0.3],
      [0.3, 0.75],
      [0.65, 0.75],
    ];
    const edges = [
      [0, 1],
      [1, 2],
      [1, 3],
      [1, 4],
      [3, 4],
      [2, 4],
    ];
    ctx.strokeStyle = hexA(acc, 0.45);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (const [a, b] of edges) {
      ctx.moveTo(nodes[a][0] * w, nodes[a][1] * h);
      ctx.lineTo(nodes[b][0] * w, nodes[b][1] * h);
    }
    ctx.stroke();
    edges.forEach(([a, b], i) => {
      const k = (t * 0.5 + i * 0.31) % 1;
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(nodes[a][0] * w + (nodes[b][0] - nodes[a][0]) * w * k - 0.6, nodes[a][1] * h + (nodes[b][1] - nodes[a][1]) * h * k - 0.6, 1.2, 1.2);
    });
    for (const [x, y] of nodes) {
      ctx.fillStyle = hexA(acc, 0.85);
      ctx.fillRect(x * w - 2, y * h - 1.5, 4, 3);
    }
  } else if (id === "pulse") {
    // A frame-time chart. The numbers are illustrative and labelled as simulated.
    const warn = !!c && c.label.includes("performance warning");
    ctx.strokeStyle = "rgba(148,163,184,0.25)";
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(1, h * 0.35);
    ctx.lineTo(w - 1, h * 0.35);
    ctx.stroke();
    ctx.strokeStyle = acc;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const x = (i / 24) * w;
      const n = i + Math.floor(t * 6);
      const spike = warn && n % 24 === 18 ? 0.35 : 0;
      const y = h * (0.62 - spike) + Math.sin(n * 1.7) * h * 0.06;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = warn ? "#f59e0b" : "rgba(226,232,240,0.6)";
    ctx.font = "bold 3.2px ui-monospace, monospace";
    ctx.fillText(warn ? "SIM WARNING" : "SIM 60 FPS", 2, 4.5);
  } else if (id === "sentinel") {
    // A scanner sweep; a reviewed (simulated) alert flashes in red.
    const alert = !!c && c.label.includes("alert");
    const cx = w * 0.32;
    const cy = h * 0.55;
    const r = Math.min(w, h) * 0.38;
    ctx.strokeStyle = hexA(acc, 0.45);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.moveTo(cx + r * 0.55, cy);
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    const a = t * 1.8;
    ctx.strokeStyle = acc;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = hexA(acc, 0.6);
      ctx.fillRect(w * 0.62, 3 + i * 4, w * (0.2 + ((i * 7) % 3) * 0.05), 1.4);
    }
    if (alert && Math.sin(t * 6) > -0.3) {
      ctx.strokeStyle = "#f87171";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
      ctx.fillStyle = "#f87171";
      ctx.font = "bold 3.2px ui-monospace, monospace";
      ctx.fillText("SIM ALERT", w * 0.58, h - 3);
    }
  } else {
    // ECHO: a waveform that comes alive on air, over the lines of a script.
    const live = isOnAir(c) || (!!c && c.label.includes("script"));
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = "rgba(226,232,240,0.35)";
      ctx.fillRect(2, h * 0.62 + i * 2.4, w * (0.5 + ((i * 5) % 4) * 0.1), 1);
    }
    ctx.fillStyle = acc;
    const bars = 16;
    for (let i = 0; i < bars; i++) {
      const amp = (live ? 0.5 : 0.15) * (0.4 + 0.6 * Math.abs(Math.sin(t * 5 + i * 0.9) * Math.sin(i * 0.5 + t)));
      const bh = Math.max(0.6, amp * h * 0.9);
      ctx.fillRect(2 + i * ((w - 4) / bars), h * 0.32 - bh / 2, (w - 4) / bars - 0.8, bh);
    }
  }
}

function screenSide(ctx: CanvasRenderingContext2D, id: HqAgentId, w: number, h: number, t: number) {
  const acc = LOOK[id].accent;
  ctx.strokeStyle = hexA(acc, 0.85);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const x = (i / 20) * w;
    const y = h * 0.55 + Math.sin(i * 0.8 + t * 2 + w + id.length) * h * 0.22 + Math.sin(i * 2.3 + t) * h * 0.08;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = "rgba(226,232,240,0.4)";
  ctx.fillRect(2, 2, w * 0.4, 1.4);
}

function drawTable(ctx: CanvasRenderingContext2D) {
  const { x0, y0, x1, y1 } = TABLE;
  box(ctx, (x0 + x1) / 2 - 0.2, (y0 + y1) / 2 - 0.2, (x0 + x1) / 2 + 0.2, (y0 + y1) / 2 + 0.2, 0, 16, DARK_C);
  box(ctx, x0 + 0.1, y0 + 0.1, x1 - 0.1, y1 - 0.1, 16, 19, {
    top: "rgba(30,58,66,0.96)",
    left: "#10262d",
    right: "#0c1f25",
    edge: "rgba(94,234,212,0.35)",
  });
}

function drawHologram(ctx: CanvasRenderingContext2D, sim: Sim, t: number) {
  const meeting = !!sim.meeting && sim.meeting.phase !== "returning";
  const c = P(TABLE_CENTER.x, TABLE_CENTER.y, 30 + Math.sin(t * 1.4) * 1.5);
  const a = meeting ? 0.85 : 0.35;
  ctx.save();
  ctx.translate(c.X, c.Y);
  ctx.strokeStyle = `rgba(94,234,212,${a})`;
  ctx.lineWidth = 0.8;
  const r = meeting ? 12 : 8;
  const rot = t * 0.8;
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const ang = rot + (i * Math.PI) / 2;
    const x = Math.cos(ang) * r;
    const y = Math.sin(ang) * r * 0.5;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.9);
  ctx.lineTo(0, r * 0.9 + 8);
  ctx.strokeStyle = `rgba(94,234,212,${a * 0.35})`;
  ctx.stroke();
  // During a meeting, one small light per member circles the hologram in their colour.
  if (meeting) {
    HQ_AGENTS.forEach((id, i) => {
      const ang = rot * 0.6 + (i / HQ_AGENTS.length) * Math.PI * 2;
      ctx.fillStyle = LOOK[id].accent;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * (r + 5), Math.sin(ang) * (r + 5) * 0.5, 1.1, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.restore();
  glow(ctx, c.X, c.Y + 10, 26, "#19d3c5", meeting ? 0.22 : 0.08, 0.6);
}

// ---------- chairs ----------

/** The chair sits on the seat tile, pulled in a little towards the desk. */
function chairCenter(id: HqAgentId) {
  const s = DESKS[id].seat;
  return { x: s.x + 0.5 + Math.cos(s.face) * 0.2, y: s.y + 0.5 + Math.sin(s.face) * 0.2 };
}

function drawChairSeat(ctx: CanvasRenderingContext2D, id: HqAgentId) {
  const { x, y } = chairCenter(id);
  const base = P(x, y, 1);
  ctx.strokeStyle = "#1c2a30";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.moveTo(base.X, base.Y);
    ctx.lineTo(base.X + Math.cos(a) * 8, base.Y + Math.sin(a) * 4);
  }
  ctx.stroke();
  box(ctx, x - 0.04, y - 0.04, x + 0.04, y + 0.04, 1, 10, DARK_C);
  box(ctx, x - 0.24, y - 0.22, x + 0.24, y + 0.24, 10, 13, { top: hexA(LOOK[id].accent, 0.45), left: "#13242b", right: "#0f1d23" });
}

/** The backrest is on the side away from the desk (towards the viewer). */
function drawChairBack(ctx: CanvasRenderingContext2D, id: HqAgentId) {
  const { x, y } = chairCenter(id);
  const c = { top: "#20343c", left: "#172a31", right: "#12232a", edge: hexA(LOOK[id].accent, 0.35) };
  if (DESKS[id].desk.wall === "x") box(ctx, x + 0.22, y - 0.22, x + 0.3, y + 0.22, 13, 30, c);
  else box(ctx, x - 0.22, y + 0.22, x + 0.22, y + 0.3, 13, 30, c);
}

// ---------- characters ----------

type Pt = { X: number; Y: number; d: number };

export function characterTop(c: Character) {
  const r = renderPos(c);
  const feet = P(r.x, r.y);
  const height = (c.sit > 0.5 ? 46 : 58) * CH * LOOK[c.id].scale;
  return { feet, height };
}

function drawCharacter(ctx: CanvasRenderingContext2D, c: Character, o: DrawOptions, sim: Sim) {
  const look = LOOK[c.id];
  const style = STYLES[c.id];
  const S = CH * look.scale;
  const pose = computePose({
    walkPhase: c.walkPhase,
    walkAmt: c.walkAmt,
    sit: c.sit,
    gesture: c.gesture,
    t: c.gestureT,
    level: c.level,
    bob: style.bob,
    armSwing: style.armSwing,
    still: o.still,
    shoulder: look.shoulder,
    idle: look.idle,
  });
  const r = renderPos(c);
  const base = P(r.x, r.y);
  const proj = (v: V3): Pt => {
    const w = toWorld(v, c.face);
    return { X: base.X + (w.dx - w.dy) * S, Y: base.Y + ((w.dx + w.dy) * 0.5 - w.z) * S, d: w.dx + w.dy };
  };

  // Selection ring and contact shadow.
  if (o.selected === c.id || o.highlighted === c.id) {
    const pulse = o.still ? 0 : Math.sin(o.time * 4) * 1.5;
    ctx.save();
    ctx.translate(base.X, base.Y);
    ctx.scale(1, 0.5);
    ctx.strokeStyle = hexA(look.accent, o.selected === c.id ? 0.95 : 0.6);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 17 + pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.beginPath();
  ctx.ellipse(base.X, base.Y, 10.5 * look.scale, 5 * look.scale, 0, 0, Math.PI * 2);
  ctx.fill();

  const J = {
    hip: pose.hip.map(proj),
    knee: pose.knee.map(proj),
    foot: pose.foot.map(proj),
    sh: pose.shoulder.map(proj),
    el: pose.elbow.map(proj),
    hand: pose.hand.map(proj),
    pelvis: proj(pose.pelvis),
    chest: proj(pose.chest),
    head: proj(pose.head),
  };

  const limb = (pts: Pt[], width: number, color: string) => {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].X, pts[0].Y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].X, pts[i].Y);
    ctx.strokeStyle = "#04070a";
    ctx.lineWidth = width + 1.6;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };

  const leg = (i: number) => () => {
    limb([J.hip[i], J.knee[i], J.foot[i]], 4.4 * S, look.legs);
    // Shoe: a short stroke pointing forward.
    const fw = toWorld({ f: 2.6 * S, s: 0, z: 0 }, c.face);
    ctx.strokeStyle = c.id === "pulse" ? look.accent : "#0b0f12";
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(J.foot[i].X, J.foot[i].Y);
    ctx.lineTo(J.foot[i].X + (fw.dx - fw.dy), J.foot[i].Y + (fw.dx + fw.dy) * 0.5);
    ctx.stroke();
  };
  const arm = (i: number) => () => {
    limb([J.sh[i], J.el[i], J.hand[i]], 3.3 * S, look.body);
    ctx.fillStyle = look.shade;
    ctx.beginPath();
    ctx.arc(J.hand[i].X, J.hand[i].Y, 1.9, 0, Math.PI * 2);
    ctx.fill();
  };
  const front = Math.cos(angleDiff(c.face, Math.PI / 4));
  const torso = () => {
    const [sl, sr] = J.sh;
    const [hl, hr] = J.hip;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(sl.X, sl.Y);
    ctx.lineTo(sr.X, sr.Y);
    ctx.lineTo(hr.X, hr.Y);
    ctx.lineTo(hl.X, hl.Y);
    ctx.closePath();
    ctx.strokeStyle = "#04070a";
    ctx.lineWidth = 6.6 * S;
    ctx.stroke();
    ctx.strokeStyle = look.body;
    ctx.lineWidth = 5 * S;
    ctx.stroke();
    ctx.fillStyle = look.body;
    ctx.fill();
    // Belt and the glowing core.
    ctx.strokeStyle = look.trim;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(hl.X, hl.Y - 1);
    ctx.lineTo(hr.X, hr.Y - 1);
    ctx.stroke();
    const core = { X: J.chest.X * 0.65 + J.pelvis.X * 0.35, Y: J.chest.Y * 0.65 + J.pelvis.Y * 0.35 };
    torsoDetail(ctx, c, look, J.sh, J.hip, J.chest, core, front);
    if (front > -0.3 && c.id !== "sentinel") {
      glow(ctx, core.X, core.Y, 5, look.accent, 0.7, 1);
      ctx.fillStyle = look.accent;
      ctx.beginPath();
      ctx.arc(core.X, core.Y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const head = () => drawHead(ctx, c, J.head, o, S);

  const parts: { d: number; fn: () => void }[] = [
    { d: J.hip[0].d - 0.01, fn: leg(0) },
    { d: J.hip[1].d - 0.01, fn: leg(1) },
    { d: J.sh[0].d + (J.hand[0].d - J.sh[0].d) * 0.5, fn: arm(0) },
    { d: J.sh[1].d + (J.hand[1].d - J.sh[1].d) * 0.5, fn: arm(1) },
  ];
  const far = parts.filter((p) => p.d < 0).sort((a, b) => a.d - b.d);
  const near = parts.filter((p) => p.d >= 0).sort((a, b) => a.d - b.d);
  for (const p of far) p.fn();
  torso();
  // Near legs go under the head; near arms can pass in front of it.
  for (const p of near) if (parts.indexOf(p) < 2) p.fn();
  head();
  for (const p of near) if (parts.indexOf(p) >= 2) p.fn();

  if (c.gesture === "present" && !o.still) drawSlide(ctx, c, base, look, o.time);
  void sim;
}

/** Body details that make each silhouette recognisable at a glance. */
function torsoDetail(ctx: CanvasRenderingContext2D, c: Character, look: Look, sh: Pt[], hip: Pt[], chest: Pt, core: { X: number; Y: number }, front: number) {
  switch (c.id) {
    case "forge":
      // Shoulder plates.
      for (const s of sh) {
        ctx.fillStyle = look.accent;
        ctx.beginPath();
        ctx.ellipse(s.X, s.Y + 0.5, 2.8, 1.8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    case "sentinel":
      // Heavy pauldrons and a shield crest on the chest.
      for (const s of sh) {
        ctx.fillStyle = look.trim;
        ctx.strokeStyle = "#04070a";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(s.X, s.Y, 3.8, 2.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = look.accent;
        ctx.fillRect(s.X - 2.4, s.Y - 0.4, 4.8, 0.9);
      }
      if (front > -0.3) shieldPath(ctx, core.X, core.Y - 1, 3.4, look.accent);
      return;
    case "atlas": {
      // A satchel strap across the body (for the blueprints).
      ctx.strokeStyle = look.trim;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sh[0].X, sh[0].Y);
      ctx.lineTo(hip[1].X, hip[1].Y - 1);
      ctx.stroke();
      return;
    }
    case "pulse": {
      // A speed stripe down the front.
      ctx.strokeStyle = look.accent;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(chest.X - 1.5, chest.Y - 1);
      ctx.lineTo((hip[0].X + hip[1].X) / 2 + 1.5, (hip[0].Y + hip[1].Y) / 2 - 2);
      ctx.stroke();
      return;
    }
    case "echo": {
      // A soft collar.
      ctx.strokeStyle = look.accent;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(chest.X, chest.Y - 2.5, 3.4, 1.4, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
  }
}

/** ECHO's presentation: a small floating slide in front of it. */
function drawSlide(ctx: CanvasRenderingContext2D, c: Character, base: { X: number; Y: number }, look: Look, time: number) {
  const fx = Math.cos(c.face) - Math.sin(c.face);
  const fy = (Math.cos(c.face) + Math.sin(c.face)) * 0.5;
  const X = base.X + fx * 26;
  const Y = base.Y + fy * 26 - 58 + Math.sin(time * 1.5) * 1.2;
  ctx.fillStyle = hexA(look.accent, 0.12);
  ctx.strokeStyle = hexA(look.accent, 0.7);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.rect(X - 11, Y - 7, 22, 14);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hexA(look.accent, 0.8);
  const k = Math.floor(time / 2) % 3;
  for (let i = 0; i < 3; i++) ctx.fillRect(X - 8, Y - 4 + i * 3.4, i === k ? 16 : 10, 1.3);
}

function drawHead(ctx: CanvasRenderingContext2D, c: Character, h: Pt, o: DrawOptions, S: number) {
  const look = LOOK[c.id];
  const yaw = c.face + c.look;
  const front = Math.cos(angleDiff(yaw, Math.PI / 4));
  // Screen direction the face points to.
  const fx = Math.cos(yaw) - Math.sin(yaw);
  const fy = (Math.cos(yaw) + Math.sin(yaw)) * 0.5;
  const R = 6.6 * S;
  const t = o.still ? 0 : o.time;
  const idx = HQ_AGENTS.indexOf(c.id);
  const boxy = c.id === "forge" || c.id === "sentinel";

  // Head shell.
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = "#04070a";
  ctx.fillStyle = look.body;
  ctx.beginPath();
  if (boxy) roundRect(ctx, h.X - R, h.Y - R * 0.95, R * 2, R * 1.9, c.id === "sentinel" ? 4.5 : 3.2);
  else ctx.ellipse(h.X, h.Y, R * (c.id === "pulse" ? 0.94 : 1), R * (c.id === "atlas" ? 1.05 : 0.98), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Shading on the side away from the light.
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.beginPath();
  ctx.ellipse(h.X + R * 0.35, h.Y + R * 0.2, R * 0.65, R * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  if (front > -0.15) {
    // Visor: a glowing band on the side of the head the character faces.
    const k = Math.max(0.25, front);
    const vx = h.X + fx * R * 0.38;
    const vy = h.Y + fy * R * 0.38 - 0.6;
    const vw = R * (boxy ? 0.9 : c.id === "atlas" ? 0.9 : 0.82) * (0.45 + 0.55 * k);
    const vh = c.id === "forge" ? 1.9 : c.id === "sentinel" ? 1.6 : 2.7;
    ctx.fillStyle = "#061016";
    ctx.beginPath();
    ctx.ellipse(vx, vy, vw, vh, 0, 0, Math.PI * 2);
    if (c.id === "sentinel") ctx.rect(vx - 1, vy, 2, 4.2); // T-visor
    ctx.fill();
    glow(ctx, vx, vy, vw + 3, look.accent, 0.45, 0.5);
    // Two light points read as eyes without drawing a human face. They blink.
    const blink = !o.still && Math.sin(t * 0.9 + idx * 1.7) > 0.985;
    if (front > 0.25 && !blink) {
      ctx.fillStyle = look.accent;
      if (c.id === "pulse") {
        // PULSE's visor shows a heartbeat trace instead of eyes.
        ctx.strokeStyle = look.accent;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        const span = vw * 1.6;
        const phase = (t * 1.5) % 1;
        for (let i = 0; i <= 12; i++) {
          const u = i / 12;
          const bump = Math.abs(u - phase) < 0.08 ? (u < phase ? -1.8 : 1.4) : 0;
          const px = vx - span / 2 + u * span;
          if (i === 0) ctx.moveTo(px, vy + bump);
          else ctx.lineTo(px, vy + bump);
        }
        ctx.stroke();
      } else {
        const sep = vw * 0.42;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(vx + s * sep * (0.6 + 0.4 * Math.abs(fx)), vy, 0.95, boxy ? 0.7 : 1.05, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  } else {
    ctx.strokeStyle = look.trim;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(h.X, h.Y - R * 0.8);
    ctx.lineTo(h.X, h.Y + R * 0.6);
    ctx.stroke();
  }

  // Signature details.
  switch (c.id) {
    case "astra": {
      // Headset band, ear cup and antenna.
      ctx.strokeStyle = "#1e2c33";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(h.X, h.Y - 1, R + 0.6, R + 0.2, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      const side = -fy >= 0 ? 1 : -1;
      const ex = h.X + side * R * 0.9 * Math.max(0.3, Math.abs(fy * 2));
      ctx.fillStyle = look.accent;
      ctx.beginPath();
      ctx.arc(ex, h.Y + 0.5, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#5f7a86";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(h.X - 2, h.Y - R);
      ctx.lineTo(h.X - 3, h.Y - R - 5);
      ctx.stroke();
      ctx.fillStyle = look.accent;
      ctx.beginPath();
      ctx.arc(h.X - 3, h.Y - R - 5.5, 1.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "nova": {
      // A floating halo ring.
      const float = Math.sin(t * 2) * 0.8;
      ctx.strokeStyle = hexA(look.accent, 0.95);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(h.X, h.Y - R - 3.2 + float, R * 0.85, R * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
      glow(ctx, h.X, h.Y - R - 3 + float, R + 2, look.accent, 0.3, 0.4);
      break;
    }
    case "forge": {
      // A brow ridge and side bolts.
      ctx.fillStyle = look.accent;
      ctx.fillRect(h.X - R * 0.9, h.Y - R * 0.95, R * 1.8, 1.6);
      ctx.fillStyle = look.trim;
      ctx.beginPath();
      ctx.arc(h.X - R - 0.3, h.Y + 0.5, 1.2, 0, Math.PI * 2);
      ctx.arc(h.X + R + 0.3, h.Y + 0.5, 1.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "atlas": {
      // A crest of three connected nodes: a little system diagram.
      const n = [
        { X: h.X - 4, Y: h.Y - R - 2 },
        { X: h.X, Y: h.Y - R - 6 },
        { X: h.X + 4, Y: h.Y - R - 2 },
      ];
      ctx.strokeStyle = hexA(look.accent, 0.9);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(n[0].X, n[0].Y);
      ctx.lineTo(n[1].X, n[1].Y);
      ctx.lineTo(n[2].X, n[2].Y);
      ctx.moveTo(n[0].X, n[0].Y);
      ctx.lineTo(n[2].X, n[2].Y);
      ctx.stroke();
      n.forEach((p, i) => {
        ctx.fillStyle = i === Math.floor(t * 1.2) % 3 ? "#ecfdf5" : look.accent;
        ctx.beginPath();
        ctx.arc(p.X, p.Y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    }
    case "pulse": {
      // Twin antennas whose tips blink in turn.
      for (const s of [-1, 1]) {
        ctx.strokeStyle = look.trim;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(h.X + s * 2.4, h.Y - R + 0.5);
        ctx.lineTo(h.X + s * 4, h.Y - R - 4.5);
        ctx.stroke();
        const on = Math.sin(t * 6 + (s > 0 ? Math.PI : 0)) > 0;
        ctx.fillStyle = on ? look.accent : look.trim;
        ctx.beginPath();
        ctx.arc(h.X + s * 4, h.Y - R - 5, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "sentinel": {
      // A helmet crest running front to back.
      ctx.fillStyle = look.trim;
      ctx.strokeStyle = "#04070a";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(h.X - 1.6, h.Y - R * 0.9);
      ctx.lineTo(h.X - 0.8, h.Y - R - 4);
      ctx.lineTo(h.X + 0.8, h.Y - R - 4);
      ctx.lineTo(h.X + 1.6, h.Y - R * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = look.accent;
      ctx.fillRect(h.X - 0.5, h.Y - R - 3.6, 1, 2.8);
      break;
    }
    case "echo": {
      // Studio headphones with a boom microphone in front of the face.
      ctx.strokeStyle = "#3a2a2e";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(h.X, h.Y - 0.5, R + 0.8, R + 0.4, 0, Math.PI * 1.02, Math.PI * 1.98);
      ctx.stroke();
      for (const s of [-1, 1]) {
        ctx.fillStyle = look.accent;
        ctx.beginPath();
        ctx.ellipse(h.X + s * (R + 0.4), h.Y + 0.8, 1.6, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (front > -0.15) {
        const side = fx >= 0 ? -1 : 1;
        ctx.strokeStyle = "#3a2a2e";
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(h.X + side * (R + 0.4), h.Y + 2);
        ctx.quadraticCurveTo(h.X + side * R * 0.6, h.Y + R * 0.9, h.X + fx * R * 0.5, h.Y + R * 0.7);
        ctx.stroke();
        ctx.fillStyle = look.accent;
        ctx.beginPath();
        ctx.arc(h.X + fx * R * 0.5, h.Y + R * 0.7, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      // Sound rings while speaking or presenting.
      if (isOnAir(c) && !o.still) {
        for (let i = 0; i < 2; i++) {
          const k = (t * 1.2 + i * 0.5) % 1;
          ctx.strokeStyle = hexA(look.accent, 0.6 * (1 - k));
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(h.X + fx * R, h.Y + fy * R, R * (0.6 + k * 1.2), -0.7, 0.7);
          ctx.stroke();
        }
      }
      break;
    }
  }

  // Speaking: a small level meter beside the head.
  if (c.gesture === "talk" && !o.still) {
    const lv = Math.max(0.15, c.level);
    ctx.fillStyle = look.accent;
    for (let i = 0; i < 3; i++) {
      const bh = 2 + lv * 6 * (0.6 + 0.4 * Math.sin(t * 12 + i * 1.7));
      ctx.fillRect(h.X + R + 3 + i * 2.2, h.Y - bh / 2, 1.4, bh);
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
