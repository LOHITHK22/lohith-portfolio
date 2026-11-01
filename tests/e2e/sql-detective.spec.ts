import { test, expect, type Page } from "@playwright/test";
import { CHALLENGES } from "../../lib/sqlDetective/challenges";

// Browser tests for /playground/sql-detective: the real worker, WebAssembly SQLite build and UI.

const ROUTE = "/playground/sql-detective";

// Console errors and failed requests, except Vercel Analytics, which only exists on Vercel.
const consoleErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => r.status() >= 400 && !r.url().includes("/_vercel/insights/") && errors.push(`${r.status()} ${r.url()}`));
  return errors;
};

async function open(page: Page) {
  await page.goto(ROUTE);
  await expect(page.getByTestId("engine-state")).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
}

const editor = (page: Page) => page.getByTestId("sql-editor");
async function runSql(page: Page, sql: string) {
  await editor(page).fill(sql);
  await page.getByRole("button", { name: "Run query" }).click();
}
async function checkSql(page: Page, sql: string) {
  await editor(page).fill(sql);
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByTestId("sql-verdict")).toBeVisible();
}
const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe("Data Quality Detective", () => {
  test.beforeEach(async ({ page }) => {
    // Start each test with no saved progress, unless a test seeds storage and marks it to keep.
    await page.addInitScript(() => {
      if (sessionStorage.getItem("keep-progress")) return;
      localStorage.removeItem("sql-detective-progress-v1");
      localStorage.removeItem("sql-detective-progress-v2");
    });
  });

  test("loads the engine and schema, labels the data as synthetic, no console errors", async ({ page }) => {
    const errors = consoleErrors(page);
    await open(page);
    await expect(page.getByRole("heading", { level: 1, name: "Data Quality Detective" })).toBeVisible();
    await expect(page.getByText("Synthetic demonstration data. Not real company, customer or payment records.")).toBeVisible();
    for (const t of ["warehouses", "orders", "shipments", "merchants", "transactions", "settlements"]) {
      await expect(page.locator("summary", { hasText: t }).first()).toBeVisible();
    }
    await expect(page.getByTestId("sql-progress")).toHaveText("0 of 4 cases solved");
    expect(await noHorizontalOverflow(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("runs real queries and shows results, errors and the read-only policy", async ({ page }) => {
    await open(page);
    await runSql(page, "SELECT COUNT(*) AS n, COUNT(DISTINCT txn_id) AS unique_ids FROM transactions");
    const results = page.getByTestId("sql-results");
    await expect(results.locator("tbody td").first()).toHaveText("45");
    await expect(results.locator("tbody td").nth(1)).toHaveText("40");

    await runSql(page, "SELECT * FROM shipments WHERE status IS NULL");
    await expect(page.getByTestId("sql-row-count")).toContainText("3 rows");
    await expect(results.getByText("NULL").first()).toBeVisible();

    await runSql(page, "SELECT * FRM orders");
    await expect(page.getByTestId("sql-error")).toContainText("syntax error");

    await runSql(page, "SELECT * FROM refunds");
    await expect(page.getByTestId("sql-error")).toContainText("no such table: refunds");

    for (const sql of ["DELETE FROM orders", "DROP TABLE settlements", "WITH x AS (SELECT 1) UPDATE orders SET total_amount = 0", "PRAGMA query_only = OFF"]) {
      await runSql(page, sql);
      await expect(page.getByTestId("sql-error"), sql).toContainText("read-only");
    }
    await runSql(page, "SELECT 1; DROP TABLE orders");
    await expect(page.getByTestId("sql-error")).toContainText("one statement at a time");

    // The data is untouched.
    await runSql(page, "SELECT COUNT(*) FROM orders");
    await expect(results.locator("tbody td").first()).toHaveText("36");
  });

  test("stops a runaway query, rebuilds the database, recovers without a refresh, and cleans up workers", async ({ page }) => {
    // Track the real Web Workers: the timed-out one must close and exactly one fresh one replace it.
    const workers: { url: string; closed: boolean }[] = [];
    page.on("worker", (w) => {
      const entry = { url: w.url(), closed: false };
      workers.push(entry);
      w.on("close", () => (entry.closed = true));
    });
    await open(page);
    await expect.poll(() => workers.length).toBe(1);

    await runSql(page, "WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT COUNT(*) FROM c");
    await expect(page.getByTestId("sql-error")).toContainText("database was discarded", { timeout: 10_000 });
    await expect(page.getByTestId("sql-error")).toContainText("has been rebuilt. You can run another query.", { timeout: 20_000 });
    await expect(page.getByTestId("engine-state")).toHaveAttribute("data-state", "ready");
    await expect.poll(() => workers.map((w) => w.closed)).toEqual([true, false]);
    expect(workers.every((w) => w.url.endsWith("/sqljs/detective-worker.js"))).toBe(true);
    // A valid query works straight away, with no page refresh.
    await runSql(page, "SELECT COUNT(*) FROM settlements");
    await expect(page.getByTestId("sql-results").locator("tbody td").first()).toHaveText("36");
    await expect(page.getByTestId("sql-error")).toHaveCount(0);

    await page.getByRole("button", { name: "Reset database" }).click();
    await expect(page.getByTestId("engine-state")).toHaveAttribute("data-state", "ready");
    await expect(page.getByTestId("sql-status")).toContainText("Database reset");
    await runSql(page, "SELECT COUNT(*) FROM merchants");
    await expect(page.getByTestId("sql-results").locator("tbody td").first()).toHaveText("6");
    await expect.poll(() => workers.filter((w) => !w.closed).length).toBe(1);

    // Leaving the page terminates the worker.
    await page.getByRole("link", { name: "Projects" }).click();
    await page.waitForURL(/#pipelinemedic$/);
    await expect.poll(() => workers.filter((w) => !w.closed).length).toBe(0);
  });

  test("caps large results at 500 rows and refuses to judge a truncated result", async ({ page }) => {
    await open(page);
    await runSql(page, "WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c LIMIT 5000) SELECT x FROM c");
    await expect(page.getByTestId("sql-row-count")).toContainText("500+ rows");
    await expect(page.getByTestId("sql-results")).toContainText("Stopped at 500 rows");
    await checkSql(page, "SELECT a.txn_id FROM transactions a, transactions b, transactions c");
    await expect(page.getByTestId("sql-verdict")).toContainText("more rows than the workbench keeps");
    await runSql(page, `SELECT '${"x".repeat(4001)}'`);
    await expect(page.getByTestId("sql-error")).toContainText("limited to 4000 characters");
  });

  test("stays in the browser: every request goes to this site and queries make none", async ({ page, baseURL }) => {
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await open(page);
    await runSql(page, "SELECT * FROM settlements");
    await checkSql(page, "SELECT txn_id FROM transactions GROUP BY txn_id HAVING COUNT(*) > 1");
    const origin = new URL(baseURL!).origin;
    expect(requests.filter((u) => !u.startsWith(origin) && !u.startsWith("data:"))).toEqual([]);
    // The engine is fetched on this route only (the homepage test below checks it isn't loaded there).
    expect(requests.some((u) => u.endsWith("/sqljs/sql-wasm.wasm"))).toBe(true);
    const before = requests.length;
    await runSql(page, "SELECT COUNT(*) FROM orders");
    await expect(page.getByTestId("sql-results").locator("tbody td").first()).toHaveText("36");
    expect(requests.slice(before)).toEqual([]);
  });

  test("judges answers by result set and tracks progress through all four cases", async ({ page }) => {
    await open(page);
    // Wrong: every transaction, not only the duplicates.
    await checkSql(page, "SELECT txn_id FROM transactions");
    await expect(page.getByTestId("sql-verdict")).toHaveAttribute("data-correct", "false");
    await expect(page.getByTestId("sql-verdict")).toContainText("expected result has 4 distinct rows");
    await expect(page.getByTestId("sql-progress")).toHaveText("0 of 4 cases solved");

    // Equivalent but different from the reference SQL: self-join, different column name.
    const answers = [
      "select distinct a.txn_id as dup from transactions a join transactions b on a.txn_id = b.txn_id and a.rowid < b.rowid",
      "SELECT order_id FROM orders EXCEPT SELECT order_id FROM shipments",
      "SELECT s.txn_id, s.settled_amount - t.amount AS diff FROM settlements s, transactions t WHERE s.txn_id = t.txn_id AND s.settled_amount != t.amount",
      "SELECT s.merchant_id, COUNT(*), SUM(s.settled_amount), COUNT(CASE WHEN julianday(s.settlement_date) - julianday((SELECT MIN(txn_date) FROM transactions t WHERE t.txn_id = s.txn_id)) > 2 THEN 1 END) FROM settlements s GROUP BY s.merchant_id",
    ];
    for (const [i, sql] of answers.entries()) {
      await expect(page.getByTestId("case-file")).toContainText(`Case ${i + 1}`);
      await checkSql(page, sql);
      const verdict = page.getByTestId("sql-verdict");
      await expect(verdict).toHaveAttribute("data-correct", "true");
      await expect(verdict).toContainText("Business outcome");
      await expect(page.getByTestId("sql-progress")).toHaveText(`${i + 1} of 4 cases solved`);
      await verdict.getByRole("button").click();
    }
    const summary = page.getByTestId("sql-summary");
    await expect(summary).toContainText("All four cases closed");
    await expect(page.getByTestId("sql-tally").getByRole("listitem").first()).toContainText("4Solved independently");

    // Progress is kept in this browser only.
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("sql-detective-progress-v2") ?? "{}"));
    expect(Object.values(stored).every((p) => (p as { completion: string }).completion === "independent")).toBe(true);
    await summary.getByRole("button", { name: "Start over" }).click();
    await expect(page.getByTestId("sql-progress")).toHaveText("0 of 4 cases solved");
  });

  test("hints reveal one at a time and the solution loads into the editor", async ({ page }) => {
    await open(page);
    const c = CHALLENGES[0];
    await page.getByRole("button", { name: `Show hint 1 of ${c.hints.length}` }).click();
    await expect(page.getByRole("list", { name: "Hints" }).getByRole("listitem")).toHaveCount(1);
    await page.getByRole("button", { name: `Show hint 2 of ${c.hints.length}` }).click();
    await expect(page.getByRole("list", { name: "Hints" }).getByRole("listitem")).toHaveCount(2);
    await page.getByRole("button", { name: "Show a solution" }).click();
    await expect(editor(page)).toHaveValue(c.solution);
    await page.getByRole("button", { name: "Check answer" }).click();
    await expect(page.getByTestId("sql-verdict")).toHaveAttribute("data-correct", "true");
    // A revealed solution is recorded as an assisted completion, not an independent solve.
    await expect(page.getByTestId("sql-completion")).toHaveText("Completed after viewing the solution");
    await expect(page.getByTestId("sql-verdict")).toContainText("Case 1 completed");
  });

  test("the summary distinguishes independent, hinted and solution-assisted completions", async ({ page }) => {
    await open(page);
    const next = () => page.getByTestId("sql-verdict").getByRole("button").click();

    // Case 1: independently. Opening a hint and the solution afterwards doesn't change that.
    await checkSql(page, "SELECT txn_id FROM transactions GROUP BY txn_id HAVING COUNT(*) > 1");
    await expect(page.getByTestId("sql-completion")).toHaveText("Solved independently");
    await page.getByRole("button", { name: "Show hint 1 of 2" }).click();
    await page.getByRole("button", { name: "Show a solution" }).click();
    await page.getByRole("button", { name: "Check answer" }).click();
    await expect(page.getByTestId("sql-completion")).toHaveText("Solved independently");
    await next();

    // Case 2: one hint, then the visitor's own query.
    await page.getByRole("button", { name: "Show hint 1 of 2" }).click();
    await checkSql(page, "SELECT order_id FROM orders WHERE order_id NOT IN (SELECT order_id FROM shipments)");
    await expect(page.getByTestId("sql-completion")).toHaveText("Solved using hints");
    await next();

    // Case 3: solution viewed, then rewritten. Still assisted.
    await page.getByRole("button", { name: "Show a solution" }).click();
    await checkSql(page, "SELECT t.txn_id FROM transactions t JOIN settlements s ON s.txn_id = t.txn_id WHERE t.amount <> s.settled_amount");
    await expect(page.getByTestId("sql-completion")).toHaveText("Completed after viewing the solution");
    await next();

    // Case 4: a naive (duplicate-inflated) answer first, then two hints, then a correct one.
    await checkSql(
      page,
      "SELECT s.merchant_id, COUNT(*), SUM(s.settled_amount), SUM(julianday(s.settlement_date) - julianday(t.txn_date) > 2) FROM settlements s JOIN transactions t ON t.txn_id = s.txn_id GROUP BY 1",
    );
    await expect(page.getByTestId("sql-verdict")).toHaveAttribute("data-correct", "false");
    await page.getByRole("button", { name: "Show hint 1 of 3" }).click();
    await page.getByRole("button", { name: "Show hint 2 of 3" }).click();
    await checkSql(page, CHALLENGES[3].accepted[1]);
    await expect(page.getByTestId("sql-completion")).toHaveText("Solved using hints");
    await next();

    const tally = page.getByTestId("sql-tally").getByRole("listitem");
    await expect(tally.nth(0)).toContainText("1Solved independently");
    await expect(tally.nth(1)).toContainText("2Solved using hints");
    await expect(tally.nth(2)).toContainText("1Completed after viewing the solution");
    await expect(page.getByTestId("summary-duplicates")).toContainText("Solved independently");
    await expect(page.getByTestId("summary-missing-shipments")).toContainText("Solved using 1 hint");
    await expect(page.getByTestId("summary-reconcile")).toContainText("Completed after viewing the solution");
    await expect(page.getByTestId("summary-report")).toContainText("Solved using 2 hints");
    await expect(page.getByTestId("sql-progress")).toHaveText("4 of 4 cases solved");
  });

  test("migrates progress saved by the earlier version, and survives corrupt storage", async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem("keep-progress")) return;
      sessionStorage.setItem("keep-progress", "1");
      localStorage.setItem(
        "sql-detective-progress-v1",
        JSON.stringify({
          duplicates: { solved: true, attempts: 1, hints: 0, solutionViewed: false },
          reconcile: { solved: true, attempts: 2, hints: 1, solutionViewed: true },
        }),
      );
    });
    await open(page);
    await expect(page.getByTestId("sql-progress")).toHaveText("2 of 4 cases solved");
    await expect(page.getByTestId("case-completion")).toContainText("Solved independently");
    const [v1, v2] = await page.evaluate(() => [localStorage.getItem("sql-detective-progress-v1"), JSON.parse(localStorage.getItem("sql-detective-progress-v2") ?? "{}")]);
    expect(v1).toBeNull();
    expect(v2.reconcile.completion).toBe("solution");

    await page.evaluate(() => localStorage.setItem("sql-detective-progress-v2", "{broken"));
    await page.reload();
    await expect(page.getByTestId("engine-state")).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
    await expect(page.getByTestId("sql-progress")).toHaveText("0 of 4 cases solved");
  });

  test("schema preview runs a real query", async ({ page }) => {
    await open(page);
    await page.locator("summary", { hasText: "warehouses" }).click();
    await page.getByRole("button", { name: "Preview warehouses" }).click();
    await expect(page.getByTestId("sql-row-count")).toContainText("5 rows");
    await expect(page.getByTestId("sql-results")).toContainText("North Hub");
  });

  test("works from the keyboard", async ({ page }) => {
    await open(page);
    await editor(page).focus();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("SELECT name FROM merchants ORDER BY name");
    await page.keyboard.press("Control+Enter");
    await expect(page.getByTestId("sql-results")).toContainText("Atlas Auto Parts");
    // Tab leaves the editor (no focus trap) and reaches the run button.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Run query" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Check answer" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("sql-verdict")).toBeVisible();
    // Case navigation buttons announce the current step.
    await expect(page.getByRole("navigation", { name: "Cases" }).locator('[aria-current="step"]')).toContainText("Case 1");
    await expect(page.getByLabel("SQL query for case 1")).toBeVisible();
  });

  test("respects reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    const bar = page.getByRole("navigation", { name: "Cases" }).locator(".bg-teal.rounded-full").first();
    expect(await bar.evaluate((el) => getComputedStyle(el).transitionProperty)).toBe("none");
    await runSql(page, "SELECT 1 AS ok");
    await expect(page.getByTestId("sql-results").locator("tbody td").first()).toHaveText("1");
  });

  test("homepage links to the playground without crowding the hero", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#playground");
    await expect(section.getByRole("heading", { level: 2 })).toBeVisible();
    await expect(section.getByRole("link", { name: /Solve a SQL Mystery/ })).toHaveAttribute("href", ROUTE);
    await expect(section.getByText("Coming next")).toHaveCount(2);
    expect(await noHorizontalOverflow(page)).toBe(true);
    // The SQL engine is not loaded on the homepage.
    const wasm = await page.evaluate(() => performance.getEntriesByType("resource").some((r) => r.name.includes("/sqljs/")));
    expect(wasm).toBe(false);
  });

  test("data case studies link to the challenge", async ({ page }) => {
    await page.goto("/projects/aws-streaming-platform");
    await expect(page.getByRole("link", { name: /solve a SQL mystery/i })).toHaveAttribute("href", ROUTE);
  });

  test("mobile layout runs and checks queries @mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = consoleErrors(page);
    await open(page);
    expect(await noHorizontalOverflow(page)).toBe(true);
    await checkSql(page, "SELECT txn_id FROM transactions GROUP BY txn_id HAVING COUNT(*) > 1");
    await expect(page.getByTestId("sql-verdict")).toHaveAttribute("data-correct", "true");
    expect(await noHorizontalOverflow(page)).toBe(true);
    for (const name of ["Run query", "Check answer", "Reset database"]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      expect(box!.height, name).toBeGreaterThanOrEqual(44);
    }
    expect(errors).toEqual([]);
  });
});
