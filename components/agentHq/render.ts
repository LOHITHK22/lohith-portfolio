import { DESKS, H, HQ_AGENTS, PROPS, TABLE, W, WALKWAY, type HqAgentId, type Prop } from "@/lib/agentHq/layout";
import { computePose, toWorld, type V3 } from "@/lib/agentHq/pose";
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
};

export const LOOK: Record<HqAgentId, { body: string; shade: string; trim: string; accent: string; legs: string; name: string }> = {
  astra: { body: "#dbe7ec", shade: "#9fb4be", trim: "#5f7a86", accent: "#22d3ee", legs: "#2b3c46", name: "ASTRA" },
  nova: { body: "#3a3160", shade: "#2a2347", trim: "#6d5ba8", accent: "#a78bfa", legs: "#1e1a33", name: "NOVA" },
  forge: { body: "#4a4038", shade: "#352d27", trim: "#8a6a3a", accent: "#f59e0b", legs: "#26211d", name: "FORGE" },
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

export function drawScene(ctx: CanvasRenderingContext2D, sim: Sim, view: View, o: DrawOptions) {
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

  const t = o.still ? 0 : o.time;
  drawFloor(ctx, t);
  drawWalls(ctx, t);
  drawFloorLights(ctx, sim, t);

  type Item = { key: number; draw: () => void };
  const items: Item[] = [];
  for (const p of PROPS) {
    // Boxes sort by their front-most tile; characters by their position.
    const k = p.x1 - 0.5 + (p.y1 - 0.5) - 0.02;
    items.push({ key: k, draw: () => drawProp(ctx, p, sim, t) });
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

/** Draws in the plane of the left wall (x = 0), reading left to right towards the back corner. */
function onWallX(ctx: CanvasRenderingContext2D, y: number, z: number, fn: () => void) {
  const o = P(0, y, z);
  ctx.save();
  ctx.transform(1, -0.5, 0, 1, o.X, o.Y);
  fn();
  ctx.restore();
}

function glow(ctx: CanvasRenderingContext2D, X: number, Y: number, r: number, color: string, alpha: number, sy = 0.5) {
  ctx.save();
  ctx.translate(X, Y);
  ctx.scale(1, sy);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, hexA(color, alpha));
  g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}

// ---------- room ----------

const walkway = new Set(WALKWAY.map((t) => `${t.x},${t.y}`));

function drawFloor(ctx: CanvasRenderingContext2D, t: number) {
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const path = walkway.has(`${x},${y}`);
      const shade = (x + y) % 2 === 0 ? "#0a1c21" : "#0b1f25";
      poly(ctx, [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], path ? "#0f282e" : shade, "rgba(25,211,197,0.07)", 0.6);
    }
  }
  // Walkway guide lines: a faint inlaid strip down the middle of the aisle.
  ctx.strokeStyle = "rgba(94,234,212,0.16)";
  ctx.lineWidth = 0.8;
  ctx.setLineDash([5, 7]);
  ctx.lineDashOffset = -t * 6;
  ctx.beginPath();
  let a = P(0.2, 3), b = P(W - 0.2, 3);
  ctx.moveTo(a.X, a.Y);
  ctx.lineTo(b.X, b.Y);
  a = P(4.5, 3.2);
  b = P(4.5, 6.8);
  ctx.moveTo(a.X, a.Y);
  ctx.lineTo(b.X, b.Y);
  ctx.stroke();
  ctx.setLineDash([]);
  // Lounge rug in front of the sofa.
  poly(ctx, [P(1.4, 5.7), P(4.6, 5.7), P(4.6, 6.95), P(1.4, 6.95)], "rgba(167,139,250,0.05)", "rgba(167,139,250,0.22)", 0.8);
  // Rug under the meeting table.
  poly(ctx, [P(5.35, 3.35), P(8.65, 3.35), P(8.65, 6.65), P(5.35, 6.65)], "rgba(25,211,197,0.06)", "rgba(25,211,197,0.32)", 0.9);
  poly(ctx, [P(5.55, 3.55), P(8.45, 3.55), P(8.45, 6.45), P(5.55, 6.45)], "rgba(0,0,0,0)", "rgba(25,211,197,0.14)", 0.6);
}

// Deterministic "city lights" seen through the windows.
const CITY = Array.from({ length: 46 }, (_, i) => {
  const r = Math.sin(i * 91.7) * 43758.5453;
  const f = r - Math.floor(r);
  const r2 = Math.sin(i * 12.9) * 9631.1;
  return { u: f, v: r2 - Math.floor(r2), c: i % 5 === 0 ? "#f59e0b" : i % 3 === 0 ? "#a78bfa" : "#5eead4" };
});

function drawWalls(ctx: CanvasRenderingContext2D, t: number) {
  // Left wall (x = 0) and back wall (y = 0).
  const lg = ctx.createLinearGradient(0, P(0, 0, WALL_H).Y, 0, P(0, H, 0).Y);
  lg.addColorStop(0, "#0c2329");
  lg.addColorStop(1, "#08171b");
  poly(ctx, [P(0, 0, 0), P(0, H, 0), P(0, H, WALL_H), P(0, 0, WALL_H)], lg);
  const rg = ctx.createLinearGradient(0, P(0, 0, WALL_H).Y, 0, P(W, 0, 0).Y);
  rg.addColorStop(0, "#0f2a31");
  rg.addColorStop(1, "#0a1d22");
  poly(ctx, [P(0, 0, 0), P(W, 0, 0), P(W, 0, WALL_H), P(0, 0, WALL_H)], rg);

  // Windows on the back wall between the desks, with a night skyline.
  for (const [xa, xb] of [
    [3.12, 3.88],
    [6.12, 6.88],
    [9.12, 9.88],
  ]) {
    onFaceY(ctx, xa, 0, 92, () => {
      const w = (xb - xa) * 32;
      const h = 64;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#071827");
      g.addColorStop(1, "#0b2a33");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (const c of CITY) {
        if (c.u > 0.92) continue;
        const flick = 0.45 + 0.4 * Math.sin(t * 0.7 + c.u * 40);
        ctx.fillStyle = hexA(c.c, flick);
        ctx.fillRect(c.u * w, 26 + c.v * 34, 1.3, 1.3);
      }
      ctx.strokeStyle = "rgba(160,255,240,0.28)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, w, h);
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();
    });
  }

  // A status display above each desk.
  for (const id of HQ_AGENTS) {
    const d = DESKS[id].desk;
    const look = LOOK[id];
    onFaceY(ctx, d.x0 + 0.18, 0, 92, () => {
      const w = (d.x1 - d.x0 - 0.36) * 32;
      ctx.fillStyle = "#06121a";
      ctx.fillRect(0, 0, w, 30);
      ctx.strokeStyle = hexA(look.accent, 0.55);
      ctx.lineWidth = 0.8;
      ctx.strokeRect(0, 0, w, 30);
      ctx.fillStyle = look.accent;
      ctx.font = "bold 6px ui-monospace, monospace";
      ctx.fillText(look.name, 4, 8);
      for (let i = 0; i < 8; i++) {
        const hgt = 4 + 10 * (0.5 + 0.5 * Math.sin(t * 1.6 + i * 0.9 + d.x0));
        ctx.fillStyle = hexA(look.accent, 0.35 + 0.05 * i);
        ctx.fillRect(4 + i * ((w - 8) / 8), 27 - hgt, (w - 8) / 8 - 1.5, hgt);
      }
    });
  }

  // Whiteboard and a sign on the left wall.
  onWallX(ctx, 3.15, 70, () => {
    const w = 1.85 * 32;
    ctx.fillStyle = "#dfeef0";
    ctx.fillRect(0, 0, w, 40);
    ctx.strokeStyle = "#5f7a86";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(0, 0, w, 40);
    ctx.strokeStyle = "#0e7490";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(6, 7, 12, 8);
    ctx.rect(26, 7, 12, 8);
    ctx.rect(46, 7, 10, 8);
    ctx.moveTo(18, 11);
    ctx.lineTo(26, 11);
    ctx.moveTo(38, 11);
    ctx.lineTo(46, 11);
    ctx.stroke();
    ctx.strokeStyle = "#7c3aed";
    ctx.beginPath();
    ctx.moveTo(6, 30);
    ctx.bezierCurveTo(16, 20, 26, 36, 36, 26);
    ctx.lineTo(54, 28);
    ctx.stroke();
  });
  onWallX(ctx, 7.4, 90, () => {
    ctx.fillStyle = "rgba(25,211,197,0.9)";
    ctx.font = "900 11px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("AGENT HQ", 0, 0);
    ctx.fillStyle = "rgba(148,163,184,0.75)";
    ctx.font = "5px ui-monospace, monospace";
    ctx.fillText("ORCHESTRATION · DESIGN · FRONTEND", 0, 9);
  });
  onWallX(ctx, 6.9, 66, () => {
    const w = 2.2 * 32;
    const g = ctx.createLinearGradient(0, 0, 0, 40);
    g.addColorStop(0, "#071827");
    g.addColorStop(1, "#0b2a33");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, 40);
    for (const c of CITY) {
      ctx.fillStyle = hexA(c.c, 0.35 + 0.35 * Math.sin(t * 0.5 + c.v * 30));
      ctx.fillRect(c.u * w, 14 + c.v * 24, 1.2, 1.2);
    }
    ctx.strokeStyle = "rgba(160,255,240,0.25)";
    ctx.strokeRect(0, 0, w, 40);
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

function drawFloorLights(ctx: CanvasRenderingContext2D, sim: Sim, t: number) {
  for (const id of HQ_AGENTS) {
    const s = DESKS[id].seat;
    const p = P(s.x + 0.5, s.y + 0.1);
    glow(ctx, p.X, p.Y, 46, LOOK[id].accent, 0.11 + 0.03 * Math.sin(t * 1.3 + s.x));
  }
  const tc = P(7, 5);
  const meeting = sim.meeting && sim.meeting.phase !== "returning";
  glow(ctx, tc.X, tc.Y, 90, "#19d3c5", meeting ? 0.16 : 0.07);
}

// ---------- props ----------

const DESK_C: BoxColors = { top: "#1d3138", left: "#11222a", right: "#0c1a20", edge: "rgba(160,255,240,0.12)" };
const DARK_C: BoxColors = { top: "#14232a", left: "#0b161b", right: "#081115" };

function drawProp(ctx: CanvasRenderingContext2D, p: Prop, sim: Sim, t: number) {
  switch (p.kind) {
    case "desk":
      return drawDesk(ctx, p, t);
    case "table":
      return drawTable(ctx);
    case "coffee": {
      box(ctx, 0.08, 4.1, 0.92, 4.9, 0, 18, DARK_C);
      box(ctx, 0.2, 4.25, 0.75, 4.75, 18, 34, { top: "#26363d", left: "#18262c", right: "#121e23", edge: "rgba(255,255,255,0.08)" });
      onFaceY(ctx, 0.28, 4.75, 32, () => {
        ctx.fillStyle = "rgba(245,158,11,0.85)";
        ctx.fillRect(2, 2, 6, 3);
        ctx.fillStyle = "rgba(94,234,212,0.7)";
        ctx.fillRect(10, 2, 3, 3);
      });
      const sipping = sim.chars.some((c) => c.activity === "errand" && c.gesture === "sip");
      if (sipping) {
        for (let i = 0; i < 3; i++) {
          const k = (t * 0.8 + i / 3) % 1;
          const q = P(0.5, 4.5, 36 + k * 18);
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
        const sway = Math.sin(t * 0.8 + dx) * 0.6;
        ctx.fillStyle = dy < -15 ? "#2f9e74" : "#21795a";
        ctx.beginPath();
        ctx.ellipse(base.X + dx + sway, base.Y + dy, r, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    case "sofa": {
      box(ctx, 2.06, 7.12, 3.94, 7.92, 0, 9, { top: "#253f4a", left: "#1a2f38", right: "#14262d" });
      box(ctx, 2.06, 7.62, 3.94, 7.92, 9, 20, { top: "#2c4955", left: "#1d3540", right: "#172b33" });
      box(ctx, 2.06, 7.12, 2.26, 7.62, 9, 15, { top: "#2c4955", left: "#1d3540", right: "#172b33" });
      box(ctx, 3.74, 7.12, 3.94, 7.62, 9, 15, { top: "#2c4955", left: "#1d3540", right: "#172b33" });
      return;
    }
    case "rack": {
      box(ctx, 9.1, 3.1, 9.9, 3.9, 0, 56, { top: "#17252b", left: "#0d171c", right: "#0a1317", edge: "rgba(160,255,240,0.14)" });
      onFaceY(ctx, 9.16, 3.9, 52, () => {
        for (let r = 0; r < 9; r++) {
          ctx.fillStyle = "#0f1d23";
          ctx.fillRect(2, r * 5.4 + 1, 21, 4);
          const on = Math.sin(t * (2 + r * 0.7) + r * 1.3) > -0.2;
          ctx.fillStyle = on ? (r % 3 === 0 ? "#f59e0b" : "#34d399") : "#123";
          ctx.fillRect(18, r * 5.4 + 2.2, 1.6, 1.6);
          ctx.fillStyle = "rgba(94,234,212,0.5)";
          ctx.fillRect(4, r * 5.4 + 2.6, 8 + ((r * 7) % 5), 0.8);
        }
      });
      return;
    }
  }
}

function drawDesk(ctx: CanvasRenderingContext2D, d: Prop, t: number) {
  const id = d.owner!;
  const look = LOOK[id];
  const { x0, x1 } = d;
  // Legs and modesty panel, then the desktop.
  box(ctx, x0 + 0.06, 0.12, x0 + 0.14, 0.86, 0, 18, DARK_C);
  box(ctx, x1 - 0.14, 0.12, x1 - 0.06, 0.86, 0, 18, DARK_C);
  box(ctx, x0 + 0.14, 0.2, x1 - 0.14, 0.26, 4, 18, DARK_C);
  box(ctx, x0 + 0.02, 0.06, x1 - 0.02, 0.92, 18, 20.5, DESK_C);
  // Accent strip along the front edge.
  const a = P(x0 + 0.02, 0.92, 19.2), b = P(x1 - 0.02, 0.92, 19.2);
  ctx.strokeStyle = hexA(look.accent, 0.55);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(a.X, a.Y);
  ctx.lineTo(b.X, b.Y);
  ctx.stroke();

  // Main monitor (in front of the chair) and a side monitor.
  monitor(ctx, x0 + 0.1, x0 + 0.9, 0.3, 24, 44, (w, h) => screenMain(ctx, id, w, h, t));
  monitor(ctx, x0 + 1.08, x0 + 1.72, 0.36, 23, 38, (w, h) => screenSide(ctx, id, w, h, t));
  // Keyboard, mug and lamp.
  box(ctx, x0 + 0.22, 0.56, x0 + 0.78, 0.74, 20.5, 21.6, { top: "#2a3d45", left: "#1a2a31", right: "#15232a" });
  box(ctx, x0 + 1.62, 0.66, x0 + 1.76, 0.8, 20.5, 25, { top: hexA(look.accent, 0.9), left: "#cfdadf", right: "#a9b8bf" });
  const lampBase = P(x1 - 0.18, 0.2, 20.5);
  ctx.strokeStyle = "#3b4f58";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(lampBase.X, lampBase.Y);
  ctx.lineTo(lampBase.X - 2, lampBase.Y - 16);
  ctx.lineTo(lampBase.X - 7, lampBase.Y - 18);
  ctx.stroke();
  glow(ctx, lampBase.X - 7, lampBase.Y - 14, 16, "#fde68a", 0.18, 1);
}

function monitor(ctx: CanvasRenderingContext2D, xa: number, xb: number, y: number, z0: number, z1: number, content: (w: number, h: number) => void) {
  const mid = (xa + xb) / 2;
  box(ctx, mid - 0.08, y - 0.02, mid + 0.08, y + 0.08, 20.5, z0 + 2, DARK_C);
  box(ctx, xa, y - 0.05, xb, y, z0, z1, { top: "#1a262c", left: "#0a1216", right: "#0d161b", edge: "rgba(160,255,240,0.18)" });
  onFaceY(ctx, xa + 0.03, y, z1 - 1.5, () => {
    const w = (xb - xa - 0.06) * 32;
    const h = z1 - z0 - 3;
    ctx.fillStyle = "#04101a";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    content(w, h);
    ctx.restore();
  });
}

function screenMain(ctx: CanvasRenderingContext2D, id: HqAgentId, w: number, h: number, t: number) {
  const acc = LOOK[id].accent;
  if (id === "astra") {
    // A task board: three columns, cards moving from left to right.
    for (let c = 0; c < 3; c++) {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(1.5 + c * (w / 3), 1.5, w / 3 - 2, h - 3);
      for (let r = 0; r < 3; r++) {
        const on = (Math.floor(t / 2.5) + r + c) % 4 !== 0;
        if (!on) continue;
        ctx.fillStyle = hexA(c === 2 ? "#34d399" : acc, 0.75 - r * 0.15);
        ctx.fillRect(3 + c * (w / 3), 3 + r * 5, w / 3 - 5, 3.4);
      }
    }
  } else if (id === "nova") {
    // A design canvas: swatches and a layout being arranged.
    const sw = ["#a78bfa", "#22d3ee", "#f472b6", "#f8fafc"];
    sw.forEach((c, i) => {
      ctx.fillStyle = c;
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
  } else {
    // Code scrolling past.
    const lineH = 2.6;
    const off = (t * 5) % lineH;
    for (let i = 0; i < Math.ceil(h / lineH) + 1; i++) {
      const n = Math.floor(t * 5 / lineH) + i;
      const indent = ((n * 7) % 4) * 2;
      const len = 6 + ((n * 13) % 15);
      ctx.fillStyle = n % 5 === 0 ? hexA("#f59e0b", 0.85) : n % 3 === 0 ? hexA("#22d3ee", 0.7) : "rgba(226,232,240,0.55)";
      ctx.fillRect(2 + indent, 1.5 + i * lineH - off, Math.min(len, w - 4 - indent), 1.2);
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
    const y = h * 0.55 + Math.sin(i * 0.8 + t * 2 + w) * h * 0.22 + Math.sin(i * 2.3 + t) * h * 0.08;
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
  const c = P(7, 5, 30 + Math.sin(t * 1.4) * 1.5);
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
  ctx.restore();
  glow(ctx, c.X, c.Y + 10, 26, "#19d3c5", meeting ? 0.22 : 0.08, 0.6);
}

// ---------- chairs ----------

function chairCenter(id: HqAgentId) {
  const s = DESKS[id].seat;
  return { x: s.x + 0.5, y: s.y + 0.5 - 0.2 };
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

function drawChairBack(ctx: CanvasRenderingContext2D, id: HqAgentId) {
  const { x, y } = chairCenter(id);
  box(ctx, x - 0.22, y + 0.22, x + 0.22, y + 0.3, 13, 30, { top: "#20343c", left: "#172a31", right: "#12232a", edge: hexA(LOOK[id].accent, 0.35) });
}

// ---------- characters ----------

type Pt = { X: number; Y: number; d: number };

export function characterTop(c: Character) {
  const r = renderPos(c);
  const feet = P(r.x, r.y);
  const height = (c.sit > 0.5 ? 46 : 58) * CH;
  return { feet, height };
}

function drawCharacter(ctx: CanvasRenderingContext2D, c: Character, o: DrawOptions, sim: Sim) {
  const look = LOOK[c.id];
  const style = STYLES[c.id];
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
  });
  const r = renderPos(c);
  const base = P(r.x, r.y);
  const proj = (v: V3): Pt => {
    const w = toWorld(v, c.face);
    return { X: base.X + (w.dx - w.dy) * CH, Y: base.Y + ((w.dx + w.dy) * 0.5 - w.z) * CH, d: w.dx + w.dy };
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
  ctx.ellipse(base.X, base.Y, 10.5, 5, 0, 0, Math.PI * 2);
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
    limb([J.hip[i], J.knee[i], J.foot[i]], 4.4 * CH, look.legs);
    // Shoe: a short stroke pointing forward.
    const fw = toWorld({ f: 2.6 * CH, s: 0, z: 0 }, c.face);
    ctx.strokeStyle = "#0b0f12";
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(J.foot[i].X, J.foot[i].Y);
    ctx.lineTo(J.foot[i].X + (fw.dx - fw.dy), J.foot[i].Y + (fw.dx + fw.dy) * 0.5);
    ctx.stroke();
  };
  const arm = (i: number) => () => {
    limb([J.sh[i], J.el[i], J.hand[i]], 3.3 * CH, look.body);
    ctx.fillStyle = look.shade;
    ctx.beginPath();
    ctx.arc(J.hand[i].X, J.hand[i].Y, 1.9, 0, Math.PI * 2);
    ctx.fill();
  };
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
    ctx.lineWidth = 6.6 * CH;
    ctx.stroke();
    ctx.strokeStyle = look.body;
    ctx.lineWidth = 5 * CH;
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
    const core = { X: (J.chest.X * 0.65 + J.pelvis.X * 0.35), Y: J.chest.Y * 0.65 + J.pelvis.Y * 0.35 };
    const front = Math.cos(angleDiff(c.face, Math.PI / 4));
    if (front > -0.3) {
      glow(ctx, core.X, core.Y, 5, look.accent, 0.7, 1);
      ctx.fillStyle = look.accent;
      ctx.beginPath();
      ctx.arc(core.X, core.Y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (c.id === "forge") {
      // Shoulder plates.
      for (const s of J.sh) {
        ctx.fillStyle = look.accent;
        ctx.beginPath();
        ctx.ellipse(s.X, s.Y + 0.5, 2.8, 1.8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  const head = () => drawHead(ctx, c, J.head, o, sim);

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
}

function drawHead(ctx: CanvasRenderingContext2D, c: Character, h: Pt, o: DrawOptions, sim: Sim) {
  const look = LOOK[c.id];
  const yaw = c.face + c.look;
  const front = Math.cos(angleDiff(yaw, Math.PI / 4));
  // Screen direction the face points to.
  const fx = Math.cos(yaw) - Math.sin(yaw);
  const fy = (Math.cos(yaw) + Math.sin(yaw)) * 0.5;
  const R = 6.6 * CH;
  const t = o.still ? 0 : o.time;

  // Head shell.
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = "#04070a";
  ctx.fillStyle = look.body;
  ctx.beginPath();
  if (c.id === "forge") roundRect(ctx, h.X - R, h.Y - R * 0.95, R * 2, R * 1.9, 3.2);
  else ctx.ellipse(h.X, h.Y, R, R * 0.98, 0, 0, Math.PI * 2);
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
    const vw = R * (c.id === "forge" ? 0.9 : 0.82) * (0.45 + 0.55 * k);
    const vh = c.id === "forge" ? 1.9 : 2.7;
    ctx.fillStyle = "#061016";
    ctx.beginPath();
    ctx.ellipse(vx, vy, vw, vh, 0, 0, Math.PI * 2);
    ctx.fill();
    glow(ctx, vx, vy, vw + 3, look.accent, 0.45, 0.5);
    // Two light points read as eyes without drawing a human face. They blink.
    const blink = !o.still && Math.sin(t * 0.9 + c.walkPhase * 0.01 + (c.id === "nova" ? 2 : c.id === "forge" ? 4 : 0)) > 0.985;
    if (front > 0.25 && !blink) {
      ctx.fillStyle = look.accent;
      const sep = vw * 0.42;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(vx + s * sep * (0.6 + 0.4 * Math.abs(fx)), vy, 0.95, c.id === "forge" ? 0.7 : 1.05, 0, 0, Math.PI * 2);
        ctx.fill();
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
  if (c.id === "astra") {
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
  } else if (c.id === "nova") {
    // A floating halo ring.
    const float = Math.sin(t * 2) * 0.8;
    ctx.strokeStyle = hexA(look.accent, 0.95);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(h.X, h.Y - R - 3.2 + float, R * 0.85, R * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
    glow(ctx, h.X, h.Y - R - 3 + float, R + 2, look.accent, 0.3, 0.4);
  } else {
    // FORGE: a brow ridge and side bolts.
    ctx.fillStyle = look.accent;
    ctx.fillRect(h.X - R * 0.9, h.Y - R * 0.95, R * 1.8, 1.6);
    ctx.fillStyle = look.trim;
    ctx.beginPath();
    ctx.arc(h.X - R - 0.3, h.Y + 0.5, 1.2, 0, Math.PI * 2);
    ctx.arc(h.X + R + 0.3, h.Y + 0.5, 1.2, 0, Math.PI * 2);
    ctx.fill();
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
  void sim;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
