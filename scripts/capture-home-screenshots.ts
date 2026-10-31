// Captures homepage + case-study screenshots at desktop, tablet and mobile
// from a running server. Usage: npx tsx scripts/capture-home-screenshots.ts [outDir]
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = process.argv[2] ?? "docs/home-screenshots";
const sizes = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 390, height: 844 },
];

async function main() {
  const browser = await chromium.launch({ channel: "chrome" });
  for (const s of sizes) {
    const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.name === "mobile" ? 2 : 1 });
    await page.goto(`${BASE}/`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/home-hero-${s.name}.png` });
    const projects = page.locator("#projects");
    await projects.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/home-projects-${s.name}.png` });
    if (s.name !== "tablet") {
      await page.goto(`${BASE}/projects/pipelinemedic-ai`);
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${OUT}/case-pipelinemedic-${s.name}.png` });
    }
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/`);
  await page.getByRole("button", { name: /Meet My AI Team/ }).first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/team-gate-desktop.png` });
  const startBtn = page.getByRole("button", { name: /Start with voices|Read without audio/ }).last();
  await startBtn.click();
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${OUT}/team-playing-desktop.png` });
  await browser.close();
  console.log(`Saved to ${OUT}/`);
}
main().catch((e) => { console.error(e); process.exit(1); });
