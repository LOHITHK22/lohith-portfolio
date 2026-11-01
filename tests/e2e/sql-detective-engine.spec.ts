import { test, expect } from "@playwright/test";
import initSqlJs, { type Database } from "sql.js";
import { DATABASE_SQL, PLANTED, ROW_COUNTS } from "../../lib/sqlDetective/dataset";
import { CHALLENGES } from "../../lib/sqlDetective/challenges";
import { checkQuery, MAX_QUERY_LENGTH } from "../../lib/sqlDetective/guard";
import { compareResults, judge, type ResultSet } from "../../lib/sqlDetective/compare";
import { emptyCase, parseProgress, recordCheck, describeCompletion } from "../../lib/sqlDetective/progress";

// Engine-level tests: the real SQLite build (sql.js) running in Node against the same synthetic
// dataset, reference queries and result checker that the browser workbench uses. No browser needed.

let db: Database;

test.beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(DATABASE_SQL);
  db.run("PRAGMA query_only = ON;");
});

const run = (sql: string): ResultSet => {
  const [r] = db.exec(sql);
  return r ? { columns: r.columns, rows: r.values as ResultSet["rows"] } : { columns: [], rows: [] };
};
const verdictFor = (id: string, sql: string) => {
  const challenge = CHALLENGES.find((c) => c.id === id)!;
  return judge(run(sql), challenge.accepted.map(run));
};

test.describe("SQL Detective dataset", () => {
  test("builds the six synthetic tables with the planted issues", () => {
    for (const [table, count] of Object.entries(ROW_COUNTS)) {
      expect(run(`SELECT COUNT(*) FROM ${table}`).rows[0][0], table).toBe(count);
    }
    expect(run("SELECT order_id FROM shipments WHERE status IS NULL ORDER BY 1").rows.flat()).toEqual(PLANTED.nullShipmentStatus);
    expect(run("SELECT COUNT(*) FROM shipments WHERE order_id = 'O-1018'").rows[0][0]).toBe(2);
    expect(DATABASE_SQL).toContain("Synthetic demonstration data");
  });

  test("is deterministic", async () => {
    const again = await import("../../lib/sqlDetective/dataset");
    expect(again.DATABASE_SQL).toBe(DATABASE_SQL);
  });

  test("reference solutions find exactly the planted problems", () => {
    const ids = (sql: string) => run(sql).rows.map((r) => r[0]).sort();
    const byId = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));
    expect(ids(byId.duplicates.solution)).toEqual(Object.keys(PLANTED.duplicateTxns).sort());
    expect(ids(byId["missing-shipments"].solution)).toEqual(PLANTED.missingShipments);
    expect(ids(byId.reconcile.solution)).toEqual(PLANTED.amountMismatches.slice().sort());
    const report = run(byId.report.solution);
    expect(report.rows).toHaveLength(6);
    expect(report.rows.reduce((sum, r) => sum + Number(r[1]), 0)).toBe(ROW_COUNTS.settlements);
    expect(report.rows.reduce((sum, r) => sum + Number(r[3]), 0)).toBe(Object.keys(PLANTED.delayedSettlements).length);
    // Every shown solution passes its own check.
    for (const c of CHALLENGES) expect(verdictFor(c.id, c.solution).correct, c.id).toBe(true);
  });

  test("outcome copy matches the data", () => {
    // Case 4 says the naive join inflates three merchants and makes two look later.
    const naive = run(
      "SELECT s.merchant_id, COUNT(*), SUM(julianday(s.settlement_date) - julianday(t.txn_date) > 2) FROM settlements s JOIN transactions t ON t.txn_id = s.txn_id GROUP BY 1 ORDER BY 1",
    ).rows;
    const clean = run(
      "WITH t AS (SELECT DISTINCT txn_id, txn_date FROM transactions) SELECT s.merchant_id, COUNT(*), SUM(julianday(s.settlement_date) - julianday(t.txn_date) > 2) FROM settlements s JOIN t USING (txn_id) GROUP BY 1 ORDER BY 1",
    ).rows;
    expect(naive.filter((r, i) => r[1] !== clean[i][1])).toHaveLength(3);
    expect(naive.filter((r, i) => r[2] !== clean[i][2])).toHaveLength(2);
  });
});

test.describe("SQL Detective answer checking", () => {
  const cases: Record<string, { pass: string[]; fail: string[] }> = {
    duplicates: {
      pass: [
        "SELECT txn_id, COUNT(*) AS n FROM transactions GROUP BY txn_id HAVING n > 1",
        "select distinct a.txn_id from transactions a join transactions b on a.txn_id = b.txn_id and a.rowid < b.rowid",
        "SELECT * FROM (SELECT txn_id, COUNT(*) c FROM transactions GROUP BY 1) WHERE c >= 2 ORDER BY txn_id DESC",
        "SELECT * FROM transactions WHERE txn_id IN (SELECT txn_id FROM transactions GROUP BY txn_id HAVING COUNT(*) > 1)",
      ],
      fail: [
        "SELECT txn_id FROM transactions",
        "SELECT txn_id FROM transactions GROUP BY txn_id HAVING COUNT(*) > 2",
        "SELECT merchant_id FROM transactions GROUP BY merchant_id HAVING COUNT(*) > 1",
        "SELECT txn_id FROM transactions WHERE 0",
        // Wrong aggregation: counts distinct merchants instead of rows per transaction.
        "SELECT txn_id FROM transactions GROUP BY txn_id HAVING COUNT(DISTINCT merchant_id) > 1",
      ],
    },
    "missing-shipments": {
      pass: [
        "SELECT o.order_id FROM orders o LEFT JOIN shipments s ON s.order_id = o.order_id WHERE s.shipment_id IS NULL",
        "SELECT order_id FROM orders WHERE order_id NOT IN (SELECT order_id FROM shipments)",
        "SELECT order_id FROM orders EXCEPT SELECT order_id FROM shipments",
      ],
      fail: [
        // Filtering on status also catches real shipments whose status is missing.
        "SELECT o.order_id FROM orders o LEFT JOIN shipments s ON s.order_id = o.order_id WHERE s.status IS NULL",
        "SELECT o.order_id FROM orders o JOIN shipments s ON s.order_id = o.order_id",
      ],
    },
    reconcile: {
      pass: [
        "SELECT t.txn_id FROM transactions t JOIN settlements s USING (txn_id) WHERE ABS(t.amount - s.settled_amount) > 0.001",
        "SELECT s.settled_amount - t.amount AS diff, s.txn_id FROM settlements s, transactions t WHERE s.txn_id = t.txn_id AND s.settled_amount != t.amount",
      ],
      fail: [
        "SELECT t.txn_id FROM transactions t JOIN settlements s USING (txn_id) WHERE s.settled_amount < t.amount",
        "SELECT t.txn_id FROM transactions t LEFT JOIN settlements s USING (txn_id) WHERE s.settled_amount IS NULL OR t.amount <> s.settled_amount",
      ],
    },
    report: {
      pass: [
        "SELECT s.merchant_id, COUNT(*), SUM(s.settled_amount), COUNT(CASE WHEN julianday(s.settlement_date) - julianday((SELECT MIN(txn_date) FROM transactions t WHERE t.txn_id = s.txn_id)) > 2 THEN 1 END) FROM settlements s GROUP BY s.merchant_id",
        "WITH d AS (SELECT DISTINCT * FROM transactions) SELECT ROUND(SUM(settled_amount), 2) AS paid, SUM(julianday(settlement_date) - julianday(txn_date) > 2) AS late, m.name, COUNT(settlement_id) AS n FROM settlements JOIN d USING (txn_id) JOIN merchants m ON m.merchant_id = settlements.merchant_id GROUP BY m.name ORDER BY m.name",
      ],
      fail: [
        // The duplicated transaction rows from case 1 inflate a naive join.
        "SELECT s.merchant_id, COUNT(*), SUM(s.settled_amount), SUM(julianday(s.settlement_date) - julianday(t.txn_date) > 2) FROM settlements s JOIN transactions t ON t.txn_id = s.txn_id GROUP BY 1",
        // Filtering delayed rows in WHERE drops merchants with no delays.
        "WITH d AS (SELECT DISTINCT txn_id, txn_date FROM transactions) SELECT s.merchant_id, COUNT(*), SUM(s.settled_amount), COUNT(*) FROM settlements s JOIN d USING (txn_id) WHERE julianday(s.settlement_date) - julianday(d.txn_date) > 2 GROUP BY 1",
        "SELECT merchant_id, COUNT(*), SUM(settled_amount) FROM settlements GROUP BY merchant_id",
        // Wrong aggregations: average instead of total, and the expected amount instead of what was settled.
        "WITH d AS (SELECT DISTINCT txn_id, txn_date FROM transactions) SELECT s.merchant_id, COUNT(*), AVG(s.settled_amount), SUM(julianday(s.settlement_date) - julianday(d.txn_date) > 2) FROM settlements s JOIN d USING (txn_id) GROUP BY 1",
        "WITH d AS (SELECT DISTINCT txn_id, txn_date, amount FROM transactions) SELECT s.merchant_id, COUNT(*), SUM(d.amount), SUM(julianday(s.settlement_date) - julianday(d.txn_date) > 2) FROM settlements s JOIN d USING (txn_id) GROUP BY 1",
        // Off-by-one on the delay rule (>= 2 instead of > 2).
        "WITH d AS (SELECT DISTINCT txn_id, txn_date FROM transactions) SELECT s.merchant_id, COUNT(*), SUM(s.settled_amount), SUM(julianday(s.settlement_date) - julianday(d.txn_date) >= 2) FROM settlements s JOIN d USING (txn_id) GROUP BY 1",
      ],
    },
  };

  for (const [id, { pass, fail }] of Object.entries(cases)) {
    test(`case ${id}: accepts equivalent queries and rejects wrong ones`, () => {
      for (const sql of pass) expect(verdictFor(id, sql).correct, sql).toBe(true);
      for (const sql of fail) expect(verdictFor(id, sql).correct, sql).toBe(false);
    });
  }

  test("missing statuses are not missing shipments, and duplicates don't inflate the report", () => {
    const byId = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));
    const missing = run(byId["missing-shipments"].solution).rows.map((r) => r[0]);
    for (const id of PLANTED.nullShipmentStatus) expect(missing, id).not.toContain(id);
    // Orders with a NULL-status shipment still have a shipment row.
    expect(run(`SELECT COUNT(DISTINCT order_id) FROM shipments WHERE order_id IN ('${PLANTED.nullShipmentStatus.join("','")}')`).rows[0][0]).toBe(3);

    const report = run(byId.report.solution).rows;
    const settled = run("SELECT merchant_id, COUNT(*), ROUND(SUM(settled_amount), 2) FROM settlements GROUP BY 1").rows;
    const names = Object.fromEntries(run("SELECT name, merchant_id FROM merchants").rows.map((r) => [r[0], r[1]]));
    for (const [merchant, n, total] of report) {
      const truth = settled.find((r) => r[0] === names[String(merchant)])!;
      expect([n, total], String(merchant)).toEqual([truth[1], truth[2]]);
    }
  });

  test("compares result sets, not column names, order or formatting", () => {
    const expected: ResultSet = { columns: ["id", "total"], rows: [["a", 1.5], ["b", 2]] };
    expect(compareResults({ columns: ["sum", "key", "extra"], rows: [[2.0, "b", "x"], [1.499999, "a", "y"]] }, expected).correct).toBe(true);
    expect(compareResults({ columns: ["id", "total"], rows: [["a", 1.5], ["b", 2], ["a", 1.5]] }, expected).correct).toBe(true);
    expect(compareResults({ columns: ["id", "total"], rows: [["a", 1.5], ["b", 2.5]] }, expected)).toMatchObject({ correct: false, reason: "columns" });
    expect(compareResults({ columns: ["id"], rows: [] }, expected)).toMatchObject({ correct: false, reason: "empty" });
    expect(compareResults({ columns: ["id", "total"], rows: [["a", 1.5], ["b", 2]], truncated: true }, expected)).toMatchObject({ correct: false, reason: "truncated" });
    // Values match column by column but are paired differently across rows.
    expect(compareResults({ columns: ["id", "total"], rows: [["a", 2], ["b", 1.5]] }, expected)).toMatchObject({ correct: false, reason: "rows" });
    expect(compareResults({ columns: ["x"], rows: [[null], ["b"]] }, { columns: ["x"], rows: [["b"], [null]] }).correct).toBe(true);
  });
});

test.describe("SQL Detective read-only policy", () => {
  test("allows single SELECT and WITH queries", () => {
    for (const sql of [
      "SELECT 1",
      "select * from orders;",
      "  -- look at orders\nSELECT * FROM orders ;  ",
      "WITH x AS (SELECT 1 AS n) SELECT n FROM x",
      "(SELECT 1)",
      "SELECT 'drop table orders; delete' AS note",
      "SELECT replace(name, 'a', 'b') FROM merchants",
      'SELECT "order_id" FROM orders /* update later */',
    ]) {
      expect(checkQuery(sql).ok, sql).toBe(true);
    }
  });

  test("rejects writes, schema changes, pragmas and multiple statements", () => {
    for (const sql of [
      "INSERT INTO orders VALUES ('x', 'y', 'W01', '2026-01-01', 1)",
      "UPDATE settlements SET settled_amount = 0",
      "DELETE FROM transactions",
      "DROP TABLE orders",
      "CREATE TABLE t (x)",
      "ALTER TABLE orders ADD COLUMN x",
      "PRAGMA query_only = OFF",
      "ATTACH DATABASE 'x.db' AS x",
      "SELECT 1; DROP TABLE orders",
      "SELECT 1; SELECT 2",
      "WITH x AS (SELECT 1) DELETE FROM orders",
      "REPLACE INTO merchants VALUES ('M09', 'x', 'y', 'US')",
      "VACUUM",
      "",
      "-- only a comment",
      `SELECT '${"x".repeat(MAX_QUERY_LENGTH)}'`,
    ]) {
      expect(checkQuery(sql).ok, sql).toBe(false);
    }
  });

  test("the database itself refuses writes even if the statement check were bypassed", () => {
    for (const sql of ["WITH x AS (SELECT 1) DELETE FROM orders", "UPDATE settlements SET settled_amount = 0", "DROP TABLE orders"]) {
      expect(() => db.exec(sql), sql).toThrow(/readonly|query_only/i);
    }
    expect(run("SELECT COUNT(*) FROM orders").rows[0][0]).toBe(ROW_COUNTS.orders);
  });
});

test.describe("SQL Detective completion tracking", () => {
  test("the first correct check decides how a case was completed", () => {
    expect(recordCheck(emptyCase(), true).completion).toBe("independent");
    expect(recordCheck({ ...emptyCase(), hints: 2 }, true)).toMatchObject({ completion: "hints", hintsAtCompletion: 2 });
    expect(recordCheck({ ...emptyCase(), hints: 1, solutionViewed: true }, true).completion).toBe("solution");
    const wrong = recordCheck(emptyCase(), false);
    expect(wrong).toMatchObject({ attempts: 1, completion: null });
    // Learning afterwards does not rewrite history.
    const solved = recordCheck(emptyCase(), true);
    const later = recordCheck({ ...solved, hints: 3, solutionViewed: true }, true);
    expect(later).toMatchObject({ completion: "independent", attempts: 2, hintsAtCompletion: 0 });
    expect(describeCompletion({ ...emptyCase(), completion: "hints", hintsAtCompletion: 1 })).toBe("Solved using 1 hint");
  });

  test("migrates v1 progress conservatively and survives corrupt storage", () => {
    const v1 = JSON.stringify({
      duplicates: { solved: true, attempts: 2, hints: 0, solutionViewed: false },
      "missing-shipments": { solved: true, attempts: 1, hints: 1, solutionViewed: false },
      reconcile: { solved: true, attempts: 1, hints: 2, solutionViewed: true },
      report: { solved: false, attempts: 4, hints: 99, solutionViewed: false },
    });
    const { progress, migrated } = parseProgress(null, v1);
    expect(migrated).toBe(true);
    expect(progress.duplicates.completion).toBe("independent");
    expect(progress["missing-shipments"]).toMatchObject({ completion: "hints", hintsAtCompletion: 1 });
    expect(progress.reconcile.completion).toBe("solution");
    expect(progress.report).toMatchObject({ completion: null, attempts: 4, hints: 3 });

    for (const bad of ["{not json", "[]", "null", '"text"']) {
      const r = parseProgress(bad, null);
      expect(r.migrated).toBe(false);
      expect(Object.values(r.progress).every((p) => p.completion === null && p.attempts === 0)).toBe(true);
    }
    // v2 wins over v1, and malformed v2 fields are dropped.
    const v2 = JSON.stringify({ duplicates: { attempts: -3, hints: "x", solutionViewed: "yes", completion: "genius", hintsAtCompletion: 5 } });
    const r = parseProgress(v2, v1);
    expect(r.migrated).toBe(false);
    expect(r.progress.duplicates).toEqual(emptyCase());
  });
});
