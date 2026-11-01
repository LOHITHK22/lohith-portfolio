import { test, expect, type Page } from "@playwright/test";
import { PIPELINEMEDIC_COMMIT } from "../../lib/incidentCommander/policy";

// Browser tests for /playground/incident-commander: real clicks and keyboard input drive the
// deterministic scenario engine, and the page must stay in the browser.

const ROUTE = "/playground/incident-commander";

const consoleErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => r.status() >= 400 && !r.url().includes("/_vercel/insights/") && errors.push(`${r.status()} ${r.url()}`));
  return errors;
};
const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

const root = (page: Page) => page.getByTestId("incident-commander");
async function open(page: Page, scenario?: RegExp) {
  await page.goto(ROUTE);
  await expect(root(page)).toHaveAttribute("data-ready", "true");
  if (scenario) {
    await page.getByRole("navigation", { name: "Incident scenarios" }).getByRole("button", { name: scenario }).click();
    await expect(page.getByRole("navigation", { name: "Incident scenarios" }).getByRole("button", { name: scenario })).toHaveAttribute("aria-pressed", "true");
  }
}
const runEvidence = (page: Page, tool: string) => page.getByRole("button", { name: `Run ${tool}` }).click();
async function diagnose(page: Page, hypothesis: RegExp) {
  await page.getByRole("radio", { name: hypothesis }).check();
  await page.getByRole("button", { name: "Submit diagnosis" }).click();
  await expect(root(page)).toHaveAttribute("data-phase", "plan");
}
async function choosePlan(page: Page, id: string) {
  await page.getByTestId(`ic-plan-${id}`).getByRole("radio").check();
  await page.getByRole("button", { name: "Submit to policy engine" }).click();
}
async function validate(page: Page, checks: string[]) {
  await expect(root(page)).toHaveAttribute("data-phase", "validate");
  for (const c of checks) await page.getByRole("checkbox", { name: new RegExp(`^${c}`) }).check();
  await page.getByRole("button", { name: "Run validation" }).click();
  await expect(root(page)).toHaveAttribute("data-phase", "done");
}
const ALL_CHECKS = ["dlq_rate_ok", "validated_ratio_ok", "flink_job_running", "airflow_task_success", "postgres_ok"];
const log = (page: Page) => page.getByTestId("ic-log");
const summary = (page: Page) => page.getByTestId("ic-summary");

test.describe("Incident Commander", () => {
  test("loads as a labelled simulation with four scenarios, no console errors and no overflow", async ({ page }) => {
    const errors = consoleErrors(page);
    await open(page);
    await expect(page.getByRole("heading", { level: 1, name: "Incident Commander" })).toBeVisible();
    await expect(page.getByText(/Simulation only\. No Kafka, Flink, PostgreSQL, Airflow, Kubernetes or MCP endpoint is contacted/)).toBeVisible();
    const scenarios = page.getByRole("navigation", { name: "Incident scenarios" }).getByRole("button");
    await expect(scenarios).toHaveText([/Schema drift/, /Poison messages/, /Consumer lag/, /Airflow task failure/]);
    await expect(page.getByTestId("ic-alert")).toContainText("Breaking schema drift detected on orders.raw");
    await expect(page.getByTestId("ic-status")).toHaveText("status=DETECTED");
    await expect(log(page)).toContainText("INCIDENT_DETECTED");
    await expect(page.getByRole("list", { name: "Simulated pipeline" }).getByRole("listitem")).toHaveCount(6);
    expect(await noHorizontalOverflow(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("schema drift, correct path: evidence, diagnosis, approval, canary and validation recover the pipeline", async ({ page }) => {
    const errors = consoleErrors(page);
    await open(page);
    await expect(page.getByTestId("ic-metrics")).toContainText("140");
    await runEvidence(page, "compare_schema_versions");
    await expect(page.getByTestId("ic-finding-compare")).toContainText("amount → order_total: RENAMED, compatibility BREAKING");
    await runEvidence(page, "get_recent_pipeline_errors");
    await expect(page.getByRole("button", { name: "Done get_recent_pipeline_errors" })).toBeDisabled();
    await diagnose(page, /renamed amount to order_total/);
    await expect(page.getByTestId("ic-confidence")).toHaveText("0.93");
    await expect(page.getByTestId("ic-diagnosis")).toContainText("Simulated LLM diagnosis");

    await choosePlan(page, "quarantine-and-shim");
    await expect(root(page)).toHaveAttribute("data-phase", "approval");
    const policy = page.getByTestId("ic-policy");
    await expect(policy).toHaveAttribute("data-decision", "APPROVAL_REQUIRED");
    await expect(page.getByTestId("ic-rationale")).toHaveText("max tool risk=MEDIUM, severity floor=MEDIUM (from incident severity HIGH) => overall=MEDIUM.");
    await expect(page.getByTestId("ic-approval-notice")).toContainText("does not authorize, trigger or reach any real infrastructure operation");
    await page.getByRole("button", { name: "Approve (simulation)" }).click();

    await expect(log(page)).toContainText("CANARY_VALIDATION_PASSED");
    await expect(page.getByRole("checkbox", { name: /^consumer_lag_ok/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /^consumer_lag_ok/ })).toBeDisabled();
    await validate(page, ALL_CHECKS);

    await expect(summary(page)).toHaveAttribute("data-outcome", "recovered");
    await expect(page.getByTestId("ic-outcome")).toContainText("Simulated outcome: Recovered");
    await expect(page.getByTestId("ic-status")).toHaveText("status=RESOLVED");
    await expect(log(page)).toContainText("INCIDENT_RESOLVED");
    await expect(page.getByTestId("ic-decisions")).toContainText("good call");
    await expect(page.getByTestId("ic-policy-history")).toContainText("quarantine_message + apply_safe_config_patch → APPROVAL_REQUIRED");
    await expect(page.getByTestId("ic-validation").getByRole("listitem")).toHaveCount(6);
    // Source links point at the pinned PipelineMedic commit and open in a new tab.
    const links = page.getByTestId("ic-sources").getByRole("link");
    expect(await links.count()).toBeGreaterThanOrEqual(6);
    for (const href of await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")))) {
      expect(href).toMatch(new RegExp(`^https://github\\.com/LOHITHK22/PipelineMedic-AI/blob/${PIPELINEMEDIC_COMMIT}/`));
    }
    await expect(links.first()).toHaveAttribute("target", "_blank");
    await expect(page.getByTestId("ic-metrics")).toContainText("99.7%");

    await page.getByRole("button", { name: "Retry this incident" }).click();
    await expect(root(page)).toHaveAttribute("data-phase", "investigate");
    await expect(page.getByTestId("ic-status")).toHaveText("status=DETECTED");
    await expect(page.getByTestId("ic-metrics")).toContainText("38%");
    expect(errors).toEqual([]);
  });

  test("a hard-blocked plan explains why it was blocked, runs nothing, and a safe plan can follow", async ({ page }) => {
    await open(page, /^Consumer lag/);
    await runEvidence(page, "get_kafka_consumer_lag");
    await diagnose(page, /can't keep up/);
    await choosePlan(page, "kubectl");
    await expect(root(page)).toHaveAttribute("data-phase", "plan");
    await expect(page.getByRole("heading", { name: "Blocked by policy: choose another plan" })).toBeFocused();
    const policy = page.getByTestId("ic-policy");
    await expect(policy).toHaveAttribute("data-decision", "BLOCKED");
    await expect(policy).toContainText("run_shell_command is listed under hard_blocked_tools");
    await expect(policy).toContainText("ToolPermissionError");
    await expect(page.getByTestId("ic-rationale")).toContainText("HARD-BLOCKED actions present: ['run_shell_command']");
    await expect(log(page)).toContainText("INCIDENT_BLOCKED");
    await expect(log(page)).not.toContainText("REPAIR_STARTED");
    await expect(page.getByTestId("ic-metrics")).toContainText("7,450");

    await choosePlan(page, "scale-up");
    await expect(root(page)).toHaveAttribute("data-phase", "approval");
    await expect(page.getByTestId("ic-rationale")).toHaveText("max tool risk=MEDIUM, severity floor=HIGH (from incident severity CRITICAL) => overall=HIGH.");
    await page.getByRole("button", { name: "Approve (simulation)" }).click();
    await validate(page, []);
    await expect(summary(page)).toHaveAttribute("data-outcome", "recovered");
    await expect(page.getByTestId("ic-policy-history").getByRole("listitem")).toHaveCount(2);
    await expect(page.getByTestId("ic-policy-history")).toContainText("run_shell_command → BLOCKED");
  });

  test("validation choices decide the outcome: a lag-only check gives a false all-clear, the right check rolls back", async ({ page }) => {
    await open(page, /^Airflow task failure/);
    await expect(page.getByTestId("ic-alert")).toContainText("check_orders_schema failed");
    await diagnose(page, /transient worker failure/);
    await choosePlan(page, "rerun-only");
    await page.getByRole("button", { name: "Approve (simulation)" }).click();
    await validate(page, []);
    await expect(summary(page)).toHaveAttribute("data-outcome", "worsened");
    await expect(summary(page)).toContainText("Validation passed only because the failing check was not run");
    await expect(page.getByTestId("ic-validation")).toContainText("airflow_task_success was not run and would have failed");
    await expect(log(page)).toContainText("Incident reopened");

    await page.getByRole("button", { name: "Retry this incident" }).click();
    await runEvidence(page, "get_airflow_task_logs");
    await diagnose(page, /renamed orders\.customer_id/);
    await choosePlan(page, "rerun-only");
    await page.getByRole("button", { name: "Approve (simulation)" }).click();
    await validate(page, ["airflow_task_success"]);
    await expect(summary(page)).toHaveAttribute("data-outcome", "degraded");
    await expect(summary(page)).toHaveAttribute("data-status", "ROLLED_BACK");
    await expect(log(page)).toContainText("VALIDATION_FAILED");
    await expect(log(page)).toContainText("rerun_airflow_task cannot be rolled back");

    await page.getByRole("button", { name: "Retry this incident" }).click();
    await diagnose(page, /renamed orders\.customer_id/);
    await choosePlan(page, "escalate-then-rerun");
    await page.getByRole("button", { name: "Approve (simulation)" }).click();
    await validate(page, ALL_CHECKS);
    await expect(summary(page)).toHaveAttribute("data-outcome", "recovered");
  });

  test("a failed canary rolls back before full validation, and an irreversible restart leaves things worse", async ({ page }) => {
    await open(page, /^Consumer lag/);
    await diagnose(page, /stuck and needs a restart/);
    await choosePlan(page, "restart");
    await page.getByRole("button", { name: "Approve (simulation)" }).click();
    await expect(root(page)).toHaveAttribute("data-phase", "done");
    await expect(summary(page)).toHaveAttribute("data-outcome", "worsened");
    await expect(summary(page)).toContainText("The canary gate failed");
    await expect(summary(page)).toContainText("Full validation never ran because the canary failed.");
    await expect(log(page)).toContainText("CANARY_VALIDATION_FAILED");
    await expect(log(page)).not.toContainText("VALIDATION_STARTED");
    await expect(page.getByTestId("ic-metrics")).toContainText("9,100");

    await open(page, /^Schema drift/);
    await diagnose(page, /under-provisioned/);
    await choosePlan(page, "scale-validator");
    await page.getByRole("button", { name: "Approve (simulation)" }).click();
    await validate(page, ["dlq_rate_ok"]);
    await expect(summary(page)).toHaveAttribute("data-status", "ROLLED_BACK");
    await expect(log(page)).toContainText('change_flink_parallelism {"job_name":"order-validator","parallelism":2} (rollback of change_flink_parallelism)');
  });

  test("rejecting the simulated approval runs nothing", async ({ page }) => {
    await open(page, /^Poison messages/);
    await runEvidence(page, "get_recent_pipeline_errors");
    await diagnose(page, /One producer batch/);
    await choosePlan(page, "quarantine");
    // A LOW-risk tool still needs approval because of the HIGH severity floor.
    await expect(page.getByTestId("ic-rationale")).toHaveText("max tool risk=LOW, severity floor=MEDIUM (from incident severity HIGH) => overall=MEDIUM.");
    await page.getByRole("button", { name: "Reject" }).click();
    await expect(summary(page)).toHaveAttribute("data-status", "REJECTED");
    await expect(summary(page)).toHaveAttribute("data-outcome", "degraded");
    await expect(log(page)).toContainText("HUMAN_REJECTED");
    await expect(log(page)).not.toContainText("REPAIR_STARTED");
    await page.getByRole("button", { name: "Next incident" }).click();
    await expect(root(page)).toHaveAttribute("data-scenario", "consumer-lag");
  });

  test("works from the keyboard, with focus following each step", async ({ page }) => {
    await open(page, /^Poison messages/);
    const run = page.getByRole("button", { name: "Run get_recent_pipeline_errors" });
    await run.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("ic-finding-dlq")).toBeVisible();
    await page.getByRole("radio", { name: /One producer batch/ }).focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("radio", { name: /One producer batch/ })).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Submit diagnosis" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Choose a repair plan" })).toBeFocused();

    await page.getByTestId("ic-plan-quarantine").getByRole("radio").focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Submit to policy engine" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Approval required" })).toBeFocused();
    // Tab reaches the approve button; it has a visible focus outline.
    for (let i = 0; i < 6 && !(await page.getByRole("button", { name: "Approve (simulation)" }).evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press("Tab");
    }
    const approve = page.getByRole("button", { name: "Approve (simulation)" });
    await expect(approve).toBeFocused();
    expect(await approve.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Validate the repair" })).toBeFocused();
    await page.getByRole("checkbox", { name: /^dlq_rate_ok/ }).focus();
    await page.keyboard.press("Space");
    await page.getByRole("button", { name: "Run validation" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Incident summary" })).toBeFocused();
    await expect(summary(page)).toHaveAttribute("data-outcome", "recovered");
  });

  test("respects reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    const scenarioButton = page.getByRole("navigation", { name: "Incident scenarios" }).getByRole("button").first();
    expect(await scenarioButton.evaluate((el) => getComputedStyle(el).transitionProperty)).toBe("none");
    expect(await page.getByRole("button", { name: "Run get_schema_versions" }).evaluate((el) => getComputedStyle(el).transitionProperty)).toBe("none");
    await diagnose(page, /renamed amount/);
    await expect(page.getByRole("heading", { name: "Choose a repair plan" })).toBeVisible();
  });

  test("stays in the browser: every request goes to this site and decisions make none", async ({ page, baseURL }) => {
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await open(page);
    const origin = new URL(baseURL!).origin;
    expect(requests.filter((u) => !u.startsWith(origin) && !u.startsWith("data:"))).toEqual([]);
    // Let Next.js finish prefetching the nav routes, then count only what the decisions cause.
    await page.waitForLoadState("networkidle");
    const before = requests.length;
    await runEvidence(page, "compare_schema_versions");
    await diagnose(page, /renamed amount/);
    await choosePlan(page, "quarantine-and-shim");
    await page.getByRole("button", { name: "Approve (simulation)" }).click();
    await validate(page, ALL_CHECKS);
    const after = requests.slice(before);
    expect(after.filter((u) => !u.startsWith(origin))).toEqual([]);
    // Next.js prefetches a route when its link scrolls into view (the footer, once the summary makes the page
    // taller). Apart from those and Vercel Analytics, the decisions themselves make no requests.
    const isPrefetch = (u: string) => /[?&]_rsc=/.test(u) || u.includes("/_next/static/chunks/app/");
    expect(after.filter((u) => !isPrefetch(u) && !u.includes("/_vercel/insights/"))).toEqual([]);
  });

  test("homepage card and the PipelineMedic case study link to the simulator", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#playground");
    await expect(section.getByRole("link", { name: /Fix a Broken Pipeline/ })).toHaveAttribute("href", ROUTE);
    await page.goto("/projects/pipelinemedic-ai");
    await expect(page.getByRole("link", { name: /Command a simulated PipelineMedic incident/ })).toHaveAttribute("href", ROUTE);
  });

  test("mobile layout runs a full incident with large tap targets @mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = consoleErrors(page);
    await open(page);
    expect(await noHorizontalOverflow(page)).toBe(true);
    for (const name of ["Run get_schema_versions", "Submit diagnosis"]) {
      expect((await page.getByRole("button", { name }).boundingBox())!.height, name).toBeGreaterThanOrEqual(44);
    }
    await runEvidence(page, "compare_schema_versions");
    await diagnose(page, /renamed amount/);
    expect(await noHorizontalOverflow(page)).toBe(true);
    await choosePlan(page, "alter-table");
    await expect(page.getByTestId("ic-policy")).toHaveAttribute("data-decision", "BLOCKED");
    expect(await noHorizontalOverflow(page)).toBe(true);
    await choosePlan(page, "quarantine-and-shim");
    for (const name of ["Approve (simulation)", "Reject"]) {
      expect((await page.getByRole("button", { name }).boundingBox())!.height, name).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole("button", { name: "Approve (simulation)" }).click();
    expect(await noHorizontalOverflow(page)).toBe(true);
    await validate(page, ALL_CHECKS);
    await expect(summary(page)).toHaveAttribute("data-outcome", "recovered");
    expect(await noHorizontalOverflow(page)).toBe(true);
    expect((await page.getByRole("button", { name: "Retry this incident" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(errors).toEqual([]);
  });
});
