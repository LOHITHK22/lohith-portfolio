import { H, W, walkableFor, type HqAgentId, type Tile } from "./layout";

// Grid pathfinding for Agent HQ: A* over 4-connected floor tiles. Moves follow the
// grid axes, which read as the two isometric diagonals on screen. A small turn
// penalty prefers paths with fewer corners, so characters walk in straight
// lines like people do instead of zig-zagging. Fully deterministic.

const DIRS = [
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: -1 },
];
const TURN_PENALTY = 0.35;

/**
 * Returns the tiles from `from` (exclusive) to `to` (inclusive), or null when no path exists.
 * `blocked` holds extra tiles to avoid (e.g. tiles other characters occupy), as "x,y" keys.
 */
export function findPath(who: HqAgentId, from: Tile, to: Tile, blocked: Set<string> = new Set()): Tile[] | null {
  if (from.x === to.x && from.y === to.y) return [];
  const ok = (x: number, y: number) => walkableFor(who, x, y) && !blocked.has(`${x},${y}`);
  if (!ok(to.x, to.y)) return null;

  // State = tile + arrival direction (4 = start, no direction yet).
  const S = (x: number, y: number, d: number) => (y * W + x) * 5 + d;
  const size = W * H * 5;
  const g = new Float64Array(size).fill(Infinity);
  const prev = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const h = (x: number, y: number) => Math.abs(x - to.x) + Math.abs(y - to.y);

  // A tiny binary heap keyed on f, with insertion order as a deterministic tie-break.
  const heap: { f: number; n: number; s: number }[] = [];
  let counter = 0;
  const push = (f: number, s: number) => {
    heap.push({ f, n: counter++, s });
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (less(heap[p], heap[i])) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  const start = S(from.x, from.y, 4);
  g[start] = 0;
  push(h(from.x, from.y), start);

  while (heap.length) {
    const { s } = pop();
    if (closed[s]) continue;
    closed[s] = 1;
    const d = s % 5;
    const t = (s - d) / 5;
    const x = t % W;
    const y = (t - x) / W;
    if (x === to.x && y === to.y) return rebuild(s, prev);
    for (let nd = 0; nd < 4; nd++) {
      const nx = x + DIRS[nd].dx;
      const ny = y + DIRS[nd].dy;
      if (!ok(nx, ny)) continue;
      const ns = S(nx, ny, nd);
      const cost = g[s] + 1 + (d !== 4 && d !== nd ? TURN_PENALTY : 0);
      if (cost < g[ns]) {
        g[ns] = cost;
        prev[ns] = s;
        push(cost + h(nx, ny), ns);
      }
    }
  }
  return null;
}

function less(a: { f: number; n: number }, b: { f: number; n: number }) {
  return a.f < b.f || (a.f === b.f && a.n < b.n);
}

function rebuild(end: number, prev: Int32Array): Tile[] {
  const out: Tile[] = [];
  let s = end;
  while (prev[s] !== -1) {
    const t = (s - (s % 5)) / 5;
    out.push({ x: t % W, y: Math.floor(t / W) });
    s = prev[s];
  }
  return out.reverse();
}
