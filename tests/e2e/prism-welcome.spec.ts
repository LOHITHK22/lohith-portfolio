import { expect, test, type Locator, type Page } from "@playwright/test";

// PRISM's homepage voice welcome. Playback is observed through an init script
// that records every audio element and samples how many play at once, so the
// "never two voices" rule is measured, not assumed. "Autoplay blocked" is
// simulated the way Chrome enforces it: play() rejects with NotAllowedError
// unless a real user gesture (pointer or key) happened in the last 5 seconds.

type Probe = { calls: number; prismCalls: number; maxConcurrent: number; prism: { paused: boolean; muted: boolean; time: number } | null };
type W = { __media: HTMLMediaElement[]; __prism: HTMLMediaElement | null; __calls: number; __prismCalls: number; __max: number; __gestureAt: number };

async function instrument(page: Page, { blockAutoplay = false } = {}) {
  await page.addInitScript((block) => {
    const w = window as unknown as W;
    w.__media = [];
    w.__prism = null;
    w.__calls = 0;
    w.__prismCalls = 0;
    w.__max = 0;
    w.__gestureAt = -Infinity;
    for (const type of ["pointerdown", "keydown"]) window.addEventListener(type, () => (w.__gestureAt = Date.now()), true);
    const orig = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (!w.__media.includes(this)) w.__media.push(this);
      w.__calls++;
      // Keep a reference: unmounting PRISM clears the element's src.
      if (this.src.includes("/audio/prism/")) {
        w.__prismCalls++;
        w.__prism = this;
      }
      if (block && Date.now() - w.__gestureAt > 5000) return Promise.reject(new DOMException("play() needs a user gesture", "NotAllowedError"));
      return orig.call(this);
    };
    setInterval(() => {
      const playing = w.__media.filter((m) => !m.paused && !m.ended && m.currentTime > 0).length;
      w.__max = Math.max(w.__max, playing);
    }, 50);
  }, blockAutoplay);
}

const probe = (page: Page): Promise<Probe> =>
  page.evaluate(() => {
    const w = window as unknown as W;
    const p = w.__prism;
    return { calls: w.__calls, prismCalls: w.__prismCalls, maxConcurrent: w.__max, prism: p ? { paused: p.paused, muted: p.muted, time: p.currentTime } : null };
  });

const panel = (page: Page) => page.getByTestId("prism-welcome");

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);

async function expectClear(page: Page, targets: [string, Locator][]) {
  const box = (await panel(page).boundingBox())!;
  for (const [name, target] of targets) {
    const b = await target.boundingBox();
    if (!b) continue;
    expect(overlaps(box, b), `PRISM overlaps ${name}`).toBe(false);
  }
  return box;
}

test.describe("PRISM voice welcome · desktop", () => {
  test("first visit: appears after the hero, autoplays once with synced captions, real shortcuts", async ({ page }) => {
    await instrument(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(panel(page)).toBeVisible({ timeout: 10_000 });
    await expect(panel(page)).toHaveAttribute("data-phase", "playing", { timeout: 10_000 });
    // The caption follows the audio: the first sentence, then a later one.
    const caption = page.getByTestId("prism-caption");
    await expect(caption).toHaveText(/Welcome to Lohith's portfolio/, { timeout: 5_000 });
    await expect(caption).toHaveText(/I'm PRISM/, { timeout: 8_000 });
    expect(await page.evaluate(() => sessionStorage.getItem("prism-welcome-heard"))).toBe("1");
    expect((await probe(page)).prismCalls).toBe(1);

    // Expanded: the full transcript, with the spoken sentence highlighted.
    await panel(page).getByRole("button", { name: "Expand PRISM" }).click();
    const captions = page.getByTestId("prism-captions");
    await expect(captions.locator("[data-active]")).toHaveCount(1);
    await expect(captions).toContainText("Explore his projects, and see the engineering behind the experience.");
    await expect(panel(page)).toContainText("Prerecorded greeting.");

    // Shortcuts perform real actions.
    await panel(page).getByRole("button", { name: "Explore Projects" }).click();
    await expect(page.locator("#projects")).toBeInViewport();
    await expect(panel(page).getByRole("link", { name: "See Real Agent Activity" })).toHaveAttribute("href", "/agents");
  });

  test("autoplay blocked: shows Hear PRISM, never retries on its own, plays on click", async ({ page }) => {
    await instrument(page, { blockAutoplay: true });
    await page.goto("/");
    await expect(panel(page)).toHaveAttribute("data-phase", "blocked", { timeout: 10_000 });
    const hear = panel(page).getByRole("button", { name: "Hear PRISM" }).last();
    await expect(hear).toBeVisible();
    await page.waitForTimeout(1500);
    expect((await probe(page)).prismCalls, "exactly one autoplay attempt").toBe(1);

    await hear.click();
    await expect(panel(page)).toHaveAttribute("data-phase", "playing");
    expect((await probe(page)).prism?.paused).toBe(false);
  });

  test("mute is remembered; a visitor with sound off is never autoplayed", async ({ page, context }) => {
    await instrument(page);
    await page.goto("/");
    await expect(panel(page)).toHaveAttribute("data-phase", "playing", { timeout: 10_000 });
    await panel(page).getByRole("button", { name: "Mute PRISM" }).click();
    await expect(panel(page).getByRole("button", { name: "Unmute PRISM" })).toHaveAttribute("aria-pressed", "true");
    expect((await probe(page)).prism?.muted).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem("prism-sound"))).toBe("off");

    // New browsing session (fresh tab: empty sessionStorage), same stored preference.
    const next = await context.newPage();
    await instrument(next);
    await next.goto("/");
    await expect(panel(next)).toBeVisible({ timeout: 10_000 });
    await next.waitForTimeout(1500);
    expect((await probe(next)).prismCalls, "sound off: no autoplay").toBe(0);
    await expect(panel(next).getByRole("button", { name: "Hear PRISM" })).toBeVisible();
  });

  test("refresh and route changes in the same session do not replay the greeting", async ({ page }) => {
    await instrument(page);
    await page.goto("/");
    await expect(panel(page)).toHaveAttribute("data-phase", "playing", { timeout: 10_000 });

    // Client-side navigation away stops the audio.
    await panel(page).getByRole("link", { name: "See Real Agent Activity" }).click();
    await expect(page).toHaveURL(/\/agents$/);
    await expect.poll(async () => (await probe(page)).prism?.paused).toBe(true);
    await expect(panel(page)).toHaveCount(0);

    // Back on the homepage, and after a full refresh: compact, silent.
    await page.goBack();
    await expect(panel(page)).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(panel(page)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1500);
    expect((await probe(page)).prismCalls, "no replay after refresh").toBe(0);
    await expect(panel(page).getByRole("button", { name: "Expand PRISM" })).toBeVisible();
  });

  test("opening the seven-agent presentation stops PRISM; voices never overlap", async ({ page }) => {
    await instrument(page);
    await page.goto("/");
    await expect(panel(page)).toHaveAttribute("data-phase", "playing", { timeout: 10_000 });
    await panel(page).getByRole("button", { name: "Meet the AI Team" }).click();
    await expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 10_000 });
    await expect.poll(async () => (await probe(page)).prism?.paused).toBe(true);
    // Start the team's narration if it has a start control, then let it run.
    const start = page.getByRole("dialog").first().getByRole("button", { name: /start|begin|play/i }).first();
    if (await start.isVisible().catch(() => false)) await start.click();
    await page.waitForTimeout(4000);
    const p = await probe(page);
    expect(p.prism?.paused).toBe(true);
    expect(p.maxConcurrent, "at most one voice at any moment").toBeLessThanOrEqual(1);
  });

  test("launching AI Event Mode stops PRISM before the event narration starts", async ({ page }) => {
    await instrument(page);
    await page.goto("/");
    await expect(panel(page)).toHaveAttribute("data-phase", "playing", { timeout: 10_000 });
    await page.locator("#top").getByRole("link", { name: /Launch AI Experience/ }).click();
    await expect(page).toHaveURL(/\/event$/);
    await expect.poll(async () => (await probe(page)).prism?.paused).toBe(true);
    await expect(panel(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Start 45-Second AI Experience" }).click();
    await expect(page.getByRole("dialog", { name: "45-second AI experience" })).toHaveAttribute("data-status", "playing", { timeout: 15_000 });
    expect((await probe(page)).prism?.paused).toBe(true);
  });

  test("audio that fails to load leaves readable captions and no error loop", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/audio/prism/**", (route) => route.abort());
    await instrument(page);
    await page.goto("/");
    await expect(panel(page)).toHaveAttribute("data-phase", "failed", { timeout: 10_000 });
    await expect(panel(page)).toContainText("Audio unavailable");
    await expect(page.getByTestId("prism-captions")).toContainText("I'm PRISM, his AI portfolio guide.");
    await page.waitForTimeout(1500);
    expect((await probe(page)).prismCalls, "no retry loop").toBe(1);
    expect(errors).toEqual([]);
  });

  test("keyboard only: every control is reachable, labelled and has a visible focus ring", async ({ page }) => {
    await instrument(page, { blockAutoplay: true });
    await page.goto("/");
    await expect(panel(page)).toHaveAttribute("data-phase", "blocked", { timeout: 10_000 });
    const names = ["Hear PRISM", "Mute PRISM", "Expand PRISM", "Close PRISM", "Explore Projects", "Meet the AI Team", "See Real Agent Activity"];
    const reached = new Set<string>();
    for (let i = 0; i < 400 && reached.size < names.length; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el?.closest('[data-testid="prism-welcome"]')) return null;
        const s = getComputedStyle(el);
        return { name: el.getAttribute("aria-label") || el.textContent?.trim() || "", ring: s.boxShadow !== "none" || s.outlineStyle !== "none" };
      });
      if (info) {
        const match = names.find((n) => info.name.includes(n));
        if (match) {
          expect(info.ring, `${match} shows a focus indicator`).toBe(true);
          reached.add(match);
        }
        // Tabbing through the whole page scrolls past the hero, where the
        // compact panel shows no shortcuts; a keyboard user expands it with
        // Enter, exactly as a pointer user would click Expand.
        if (match === "Expand PRISM" && (await panel(page).getByRole("button", { name: "Explore Projects" }).count()) === 0) {
          await page.keyboard.press("Enter");
          await expect(panel(page).getByRole("button", { name: "Minimize PRISM" })).toBeFocused();
        }
      }
    }
    expect([...reached].sort()).toEqual([...names].sort());
    // Operate with the keyboard: Enter on Mute, Enter on Expand/Minimize.
    await panel(page).getByRole("button", { name: "Mute PRISM" }).focus();
    await page.keyboard.press("Enter");
    await expect(panel(page).getByRole("button", { name: "Unmute PRISM" })).toHaveAttribute("aria-pressed", "true");
    const toggle = panel(page).getByRole("button", { name: /^(Expand|Minimize) PRISM$/ });
    const before = await toggle.getAttribute("aria-expanded");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", before === "true" ? "false" : "true");
  });

  test("clear of the navigation, headline, CTAs, agent dock and the portrait's face at common desktop sizes", async ({ page }) => {
    await instrument(page, { blockAutoplay: true });
    for (const [width, height] of [
      [1024, 768],
      [1280, 720],
      [1440, 900],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await expect(panel(page)).toBeVisible({ timeout: 10_000 });
      const hero = page.locator("#top");
      const box = await expectClear(page, [
        ["the navigation", page.locator("header").first()],
        ["the headline", page.getByRole("heading", { level: 1 })],
        ["the eyebrow", hero.locator("p").filter({ hasText: /Applied AI/i }).first()],
        ["Launch AI Experience", hero.getByRole("link", { name: /Launch AI Experience/ })],
        ["the PipelineMedic CTA", hero.getByRole("link", { name: /PipelineMedic AI/ })],
        ["the agent dock", hero.locator(".absolute.right-10.z-20")],
      ]);
      // The portrait's seam line runs down the middle of the face; the face
      // spans roughly 150px either side of it.
      const seam = (await hero.locator(".hero-seam").boundingBox())!;
      expect(box.x + box.width, `${width}×${height}: PRISM reaches the face`).toBeLessThan(seam.x - 150);
      await page.screenshot({ path: `test-results/prism-welcome-desktop-${width}x${height}.png` });

      // Past the hero it floats above "Meet my AI team", never on top of it.
      await page.evaluate(() => window.scrollTo(0, innerHeight * 1.5));
      const team = page.getByRole("button", { name: /Meet my AI team/ });
      await expect(team).toBeVisible();
      await expect.poll(async () => overlaps((await panel(page).boundingBox())!, (await team.boundingBox())!)).toBe(false);
    }
  });
});

test.describe("PRISM voice welcome · mobile 390×844", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("first screen stays clear; after the hero CTA: compact strip, 40px controls, fits the screen", async ({ page }) => {
    await instrument(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(2500);
    await expect(panel(page), "nothing over the portrait, headline or CTA on the first screen").toHaveCount(0);

    await page.evaluate(() => window.scrollTo(0, document.querySelector('#top a[href="/event"]')!.getBoundingClientRect().bottom + scrollY + 40));
    await expect(panel(page)).toBeVisible({ timeout: 5_000 });
    await expect(panel(page)).toHaveAttribute("data-phase", "playing", { timeout: 10_000 });
    await expect(panel(page).getByRole("button", { name: "Expand PRISM" })).toBeVisible();
    await expect(page.getByTestId("prism-caption")).toBeVisible();
    const box = await expectClear(page, [["the navigation", page.locator("header").first()]]);
    expect(box.x).toBeGreaterThanOrEqual(15);
    expect(box.x + box.width).toBeLessThanOrEqual(390 - 15);
    expect(box.height).toBeLessThan(140);
    for (const btn of await panel(page).getByRole("button").all()) {
      const b = (await btn.boundingBox())!;
      expect(b.width >= 40 && b.height >= 40, `${await btn.getAttribute("aria-label")} is at least 40×40`).toBe(true);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "test-results/prism-welcome-mobile.png" });

    // Expanded on a phone: still inside the screen, shortcuts reachable.
    await panel(page).getByRole("button", { name: "Expand PRISM" }).click();
    const open = (await panel(page).boundingBox())!;
    expect(open.y).toBeGreaterThanOrEqual(64);
    await expect(panel(page).getByRole("button", { name: "Explore Projects" })).toBeInViewport();
    await page.screenshot({ path: "test-results/prism-welcome-mobile-expanded.png" });
  });

  test("tablet 768×1024: first screen stays clear too", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await instrument(page);
    await page.goto("/");
    await page.waitForTimeout(2500);
    await expect(panel(page)).toHaveCount(0);
  });
});
