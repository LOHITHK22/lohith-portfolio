// Captures the /event screenshots in docs/event-screenshots/ from a running
// production server: `npm run build && npx next start -p 3100`, then
// `npx tsx scripts/capture-event-screenshots.ts`.
import { chromium, devices, type Page } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = "docs/event-screenshots";

async function waitScene(page: Page, scene: string, phase?: "handoff") {
  await page.waitForSelector(`[role="dialog"][data-scene="${scene}"][data-status="playing"]`, { timeout: 60000 });
  if (phase) await page.waitForFunction(() => !!document.querySelector('[role="dialog"] svg circle[r="5"]'), null, { timeout: 15000 });
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome" });
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await desktop.goto(`${BASE}/event`);
  await desktop.waitForTimeout(800);
  await desktop.screenshot({ path: `${OUT}/01-landing-desktop.png` });

  await desktop.getByRole("button", { name: "Watch Without Sound" }).click();
  await waitScene(desktop, "welcome");
  await desktop.waitForTimeout(3500);
  await desktop.screenshot({ path: `${OUT}/02-agent-intro-astra.png` });
  await waitScene(desktop, "welcome", "handoff");
  await desktop.waitForTimeout(250);
  await desktop.screenshot({ path: `${OUT}/03-handoff-astra-to-nova.png` });
  await waitScene(desktop, "pipelinemedic");
  await desktop.waitForTimeout(7500);
  await desktop.screenshot({ path: `${OUT}/04-pipelinemedic-mcp-demo.png` });
  await desktop.waitForSelector('[role="dialog"][data-status="completed"]', { timeout: 60000 });
  await desktop.waitForTimeout(600);
  await desktop.screenshot({ path: `${OUT}/05-closing-qr.png` });
  await desktop.keyboard.press("Escape");
  await desktop.goto(`${BASE}/event#architecture`);
  await desktop.getByRole("button", { name: /MCP Server/ }).click();
  await desktop.waitForTimeout(400);
  await desktop.locator("#architecture").screenshot({ path: `${OUT}/06-architecture-explorer.png` });

  const mobile = await browser.newPage({ ...devices["Pixel 7"] });
  await mobile.goto(`${BASE}/event?source=ai-event`);
  await mobile.waitForTimeout(800);
  await mobile.screenshot({ path: `${OUT}/07-mobile-landing.png` });
  await mobile.getByRole("button", { name: "Watch Without Sound" }).click();
  await waitScene(mobile, "pipelinemedic");
  await mobile.waitForTimeout(6000);
  await mobile.screenshot({ path: `${OUT}/08-mobile-pipelinemedic.png` });

  const kiosk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await kiosk.goto(`${BASE}/event?kiosk=true`);
  await kiosk.waitForTimeout(800);
  await kiosk.screenshot({ path: `${OUT}/09-kiosk.png` });

  await browser.close();
  console.log(`Saved screenshots to ${OUT}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
