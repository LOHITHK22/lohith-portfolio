// Region-by-region visual difference between two screenshots of the same
// viewport. Used by PRISM for live-vs-Design-A drift and before/after checks.
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./lib.mjs";

const { PNG } = createRequire(path.join(ROOT, "package.json"))("pngjs");

export const decodePng = (buf) => PNG.sync.read(buf);

/** Mean absolute luminance difference (0..1) per grid cell, plus the overall mean. */
export function regionDiff(bufA, bufB, { cols = 4, rows = 3 } = {}) {
  const a = decodePng(bufA);
  const b = decodePng(bufB);
  if (a.width !== b.width || a.height !== b.height) throw new Error(`size mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  const cw = Math.floor(a.width / cols);
  const ch = Math.floor(a.height / rows);
  const cells = [];
  let total = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      let n = 0;
      // Sample every 2nd pixel: plenty for a coarse drift signal, 4x faster.
      for (let y = r * ch; y < (r + 1) * ch; y += 2) {
        for (let x = c * cw; x < (c + 1) * cw; x += 2) {
          const i = (y * a.width + x) * 4;
          const la = 0.2126 * a.data[i] + 0.7152 * a.data[i + 1] + 0.0722 * a.data[i + 2];
          const lb = 0.2126 * b.data[i] + 0.7152 * b.data[i + 1] + 0.0722 * b.data[i + 2];
          sum += Math.abs(la - lb) / 255;
          n++;
        }
      }
      const v = Math.round((sum / n) * 1000) / 1000;
      cells.push({ row: r, col: c, diff: v });
      total += v;
    }
  }
  return { cols, rows, overall: Math.round((total / cells.length) * 1000) / 1000, cells };
}

const ROW_NAMES = ["top", "middle", "bottom"];
const COL_NAMES = ["left", "centre-left", "centre-right", "right"];
export const cellName = (c, cols = 4, rows = 3) =>
  `${rows === 3 ? ROW_NAMES[c.row] : `row ${c.row + 1}`} ${cols === 4 ? COL_NAMES[c.col] : `col ${c.col + 1}`}`;
