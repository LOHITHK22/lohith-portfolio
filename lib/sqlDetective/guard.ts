// Statement policy for the public SQL workbench. This is the first of two layers: the worker
// also runs the database with PRAGMA query_only = ON, so SQLite itself rejects any write
// that slips past these checks (for example WITH ... DELETE).

export const MAX_QUERY_LENGTH = 4000;

const FORBIDDEN = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE\s+INTO|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|SAVEPOINT|RELEASE|BEGIN|COMMIT|ROLLBACK|LOAD_EXTENSION)\b/i;

/** Removes comments and the contents of string literals and quoted identifiers, keeping their positions. */
export function maskSql(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end;
      out += " ".repeat(stop - i);
      i = stop;
    } else if (c === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      out += " ".repeat(stop - i);
      i = stop;
    } else if (c === "'" || c === '"' || c === "`" || c === "[") {
      const close = c === "[" ? "]" : c;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === close) {
          if (close !== "]" && sql[j + 1] === close) j += 2;
          else break;
        } else j++;
      }
      const stop = Math.min(j + 1, sql.length);
      out += c + " ".repeat(Math.max(0, stop - i - 2)) + (j < sql.length ? close : "");
      i = stop;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

export type GuardResult = { ok: true; sql: string } | { ok: false; error: string };

/** Accepts exactly one read-only SELECT (or WITH ... SELECT) statement. */
export function checkQuery(raw: string): GuardResult {
  const sql = raw.trim();
  if (!sql) return { ok: false, error: "Write a query first." };
  if (sql.length > MAX_QUERY_LENGTH) return { ok: false, error: `Queries are limited to ${MAX_QUERY_LENGTH} characters.` };
  const masked = maskSql(sql).trim();
  const body = masked.replace(/[;\s]+$/, "");
  if (!body) return { ok: false, error: "That query only contains comments." };
  if (body.includes(";")) return { ok: false, error: "Run one statement at a time. Multiple statements are disabled." };
  const first = body.match(/^\(*\s*([a-z]+)/i)?.[1]?.toUpperCase();
  if (first !== "SELECT" && first !== "WITH") {
    return { ok: false, error: "This workbench is read-only. Only SELECT queries (optionally starting with WITH) are allowed." };
  }
  const forbidden = body.match(FORBIDDEN)?.[1];
  if (forbidden) {
    return { ok: false, error: `This workbench is read-only: ${forbidden.split(/\s/)[0].toUpperCase()} is not allowed. Use SELECT to investigate the data.` };
  }
  return { ok: true, sql };
}
