import { test, expect } from "@playwright/test";

// /agents and /resources read live data from the agent-data branch. Whatever
// that data is (none yet, or real runs), the pages must render, never show
// local test runs, and never break the rest of the site.
test.describe("agent activity center", () => {
  test("renders with real data or an honest empty state", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/agents");
    await expect(page.getByRole("heading", { level: 1, name: /Agent Activity Center/ })).toBeVisible();
    for (const name of ["ASTRA", "SCOUT", "SYNC", "SENTINEL", "PULSE", "FORGE", "PRISM", "SCRIBE"]) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole("heading", { level: 2, name: /Improvement prompts · PRISM/ })).toBeVisible();
    const hasHistory = await page.getByRole("table").count();
    if (!hasHistory) await expect(page.getByText(/No cloud runs have been recorded yet|could not be loaded/)).toBeVisible();
    await expect(page.locator("body")).not.toContainText("local-20");
    expect(errors).toEqual([]);
  });

  test("resources page lists categories and links back to the agents", async ({ page }) => {
    await page.goto("/resources");
    await expect(page.getByRole("heading", { level: 1, name: /AI Resources/ })).toBeVisible();
    for (const c of ["LLMs", "Agents", "MCP", "RAG", "Evaluation", "Data engineering"]) {
      await expect(page.getByRole("heading", { level: 2, name: c })).toBeVisible();
    }
    await page.getByRole("link", { name: "SCOUT agent" }).click();
    await expect(page).toHaveURL(/\/agents$/);
  });
});
