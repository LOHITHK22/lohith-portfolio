// Judges a visitor's answer by its result set, never by its SQL text.
// A result is correct when it contains, for every expected column, a column holding the same
// values, and the rows match as a set once projected onto those columns. Column names, column
// order, row order, extra columns and duplicate rows do not matter. Numbers compare to 2 dp.

export type Cell = string | number | null;
export type ResultSet = { columns: string[]; rows: Cell[][] };

export type Verdict =
  | { correct: true; mapping: number[] }
  | { correct: false; reason: "empty" | "truncated" | "columns" | "rows"; message: string; missing?: number; extra?: number };

export const normalize = (v: Cell): string => {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "number") {
    const r = Math.round(v * 100) / 100;
    return `n:${Object.is(r, -0) ? 0 : r}`;
  }
  return `s:${String(v).trim()}`;
};

const rowKey = (row: Cell[], cols: number[]) => cols.map((c) => normalize(row[c])).join("␟");
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && Array.from(a).every((x) => b.has(x));

function columnMappings(user: ResultSet, expected: ResultSet): number[][] {
  const valueSet = (rs: ResultSet, c: number) => new Set(rs.rows.map((r) => normalize(r[c])));
  const userSets = user.columns.map((_, c) => valueSet(user, c));
  const candidates = expected.columns.map((_, e) => {
    const target = valueSet(expected, e);
    return userSets.flatMap((s, u) => (sameSet(s, target) ? [u] : []));
  });
  const out: number[][] = [];
  const walk = (e: number, used: number[]) => {
    if (out.length >= 50) return;
    if (e === candidates.length) return void out.push(used.slice());
    for (const u of candidates[e]) if (!used.includes(u)) walk(e + 1, [...used, u]);
  };
  walk(0, []);
  return out;
}

/** Compares a visitor result against one accepted reference result. */
export function compareResults(user: ResultSet & { truncated?: boolean }, expected: ResultSet): Verdict {
  if (user.truncated) return { correct: false, reason: "truncated", message: "Your query returned more rows than the workbench keeps. Narrow it down with WHERE, GROUP BY or HAVING." };
  if (!user.rows.length) return { correct: false, reason: "empty", message: "Your query ran but returned no rows." };
  const want = new Set(expected.rows.map((r) => rowKey(r, expected.columns.map((_, i) => i))));
  const mappings = columnMappings(user, expected);
  if (!mappings.length) {
    return {
      correct: false,
      reason: "columns",
      message: `No column in your result holds exactly the expected ${expected.columns.join(", ")} values. You may be returning too many or too few rows, or a required column is missing.`,
    };
  }
  let best = { missing: Infinity, extra: Infinity };
  for (const m of mappings) {
    const got = new Set(user.rows.map((r) => rowKey(r, m)));
    if (sameSet(got, want)) return { correct: true, mapping: m };
    const missing = Array.from(want).filter((k) => !got.has(k)).length;
    const extra = Array.from(got).filter((k) => !want.has(k)).length;
    if (missing + extra < best.missing + best.extra) best = { missing, extra };
  }
  return { correct: false, reason: "rows", message: "Close, but the rows don't match the expected result yet.", ...best };
}

/** Correct if the visitor result matches any accepted reference result. */
export function judge(user: ResultSet & { truncated?: boolean }, accepted: ResultSet[]): Verdict {
  let first: Verdict | undefined;
  for (const expected of accepted) {
    const v = compareResults(user, expected);
    if (v.correct) return v;
    if (!first || (!first.correct && first.reason === "columns" && v.reason === "rows")) first = v;
  }
  return first ?? { correct: false, reason: "rows", message: "No reference result is available." };
}
