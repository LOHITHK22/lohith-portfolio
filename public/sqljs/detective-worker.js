/* SQL Detective worker: runs visitor queries against a disposable, in-memory SQLite database
   (sql.js, MIT licence, see LICENSE.txt). Nothing leaves the browser. The page terminates this
   worker if a query runs too long, which also throws the database away. */
/* global initSqlJs */
self.importScripts("sql-wasm.js");

const ready = initSqlJs({ locateFile: (file) => file });
let db = null;

// True when the text after the first statement is only whitespace, semicolons or comments.
function isBlank(rest) {
  return !rest.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?(\*\/|$)/g, "").replace(/[;\s]/g, "");
}

function cell(value) {
  if (value instanceof Uint8Array) return "[blob]";
  return value === undefined ? null : value;
}

self.onmessage = async (event) => {
  const { id, type, sql, maxRows } = event.data;
  try {
    const SQL = await ready;
    if (type === "init") {
      if (db) db.close();
      db = new SQL.Database();
      db.run(sql);
      // Second safety layer: SQLite rejects every write from here on.
      db.run("PRAGMA query_only = ON;");
      self.postMessage({ id, ok: true });
      return;
    }
    if (!db) throw new Error("The database is not loaded yet.");
    const started = performance.now();
    const statements = db.iterateStatements(sql);
    const first = statements.next();
    if (first.done) throw new Error("Write a query first.");
    const stmt = first.value;
    try {
      if (!isBlank(statements.getRemainingSQL())) throw new Error("Run one statement at a time. Multiple statements are disabled.");
      const columns = stmt.getColumnNames();
      const rows = [];
      let truncated = false;
      while (stmt.step()) {
        if (rows.length >= maxRows) {
          truncated = true;
          break;
        }
        rows.push(stmt.get().map(cell));
      }
      self.postMessage({ id, ok: true, columns, rows, truncated, ms: performance.now() - started });
    } finally {
      stmt.free();
      statements.finalize();
    }
  } catch (error) {
    self.postMessage({ id, ok: false, error: String((error && error.message) || error) });
  }
};
