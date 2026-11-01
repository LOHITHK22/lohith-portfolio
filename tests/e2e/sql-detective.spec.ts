import { test, expect, type Page } from "@playwright/test";
import { CHALLENGES } from "../../lib/sqlDetective/challenges";

// Browser tests for /playground/sql-detective: the real worker, WebAssembly SQLite build and UI.

const URL = "/playground/sql-detective";

// Console errors and failed requests, except Vercel Analytics, which only exists on Vercel.
const consoleErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => r.status() >= 400 && !r.url().includes("/_vercel/insights/") && errors.push(`${r.status()} ${r.url()}`));
  return errors;
};

async function open(page: Page) {
  await page.goto(URL);
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
    await page.addInitScript(() => window.localStorage.removeItem("sql-detective-progress-v1"));
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

  test("stops a runaway query, then recovers; reset rebuilds the database", async ({ page }) => {
    await open(page);
    await runSql(page, "WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT COUNT(*) FROM c");
    await expect(page.getByTestId("sql-error")).toContainText("stopped after 3 seconds", { timeout: 10_000 });
    await runSql(page, "SELECT COUNT(*) FROM settlements");
    await expect(page.getByTestId("sql-results").locator("tbody td").first()).toHaveText("36");

    await page.getByRole("button", { name: "Reset database" }).click();
    await expect(page.getByTestId("engine-state")).toHaveAttribute("data-state", "ready");
    await expect(page.getByTestId("sql-status")).toContainText("Database reset");
    await runSql(page, "SELECT COUNT(*) FROM merchants");
    await expect(page.getByTestId("sql-results").locator("tbody td").first()).toHaveText("6");
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
    await expect(summary).toContainText("4 of 4 were solved without opening the solution");

    // Progress is kept in this browser only.
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("sql-detective-progress-v1") ?? "{}"));
    expect(Object.values(stored).every((p) => (p as { solved: boolean }).solved)).toBe(true);
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
    await expect(section.getByRole("link", { name: /Solve a SQL Mystery/ })).toHaveAttribute("href", URL);
    await expect(section.getByText("Coming next")).toHaveCount(2);
    expect(await noHorizontalOverflow(page)).toBe(true);
    // The SQL engine is not loaded on the homepage.
    const wasm = await page.evaluate(() => performance.getEntriesByType("resource").some((r) => r.name.includes("/sqljs/")));
    expect(wasm).toBe(false);
  });

  test("data case studies link to the challenge", async ({ page }) => {
    await page.goto("/projects/aws-streaming-platform");
    await expect(page.getByRole("link", { name: /solve a SQL mystery/i })).toHaveAttribute("href", URL);
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
