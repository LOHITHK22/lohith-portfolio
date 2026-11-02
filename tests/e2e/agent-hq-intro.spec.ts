import { test, expect, type Page } from "@playwright/test";
import { HQ_INTRO, INTRO_FULL_LABEL, INTRO_QUICK_LABEL, INTRO_QUICK_LINES } from "../../data/agentHq";
import { DESKS, HQ_AGENTS, PRESENTATION_SPOT, type HqAgentId } from "../../lib/agentHq/layout";

// "Meet the team": the homepage button opens /agent-hq?intro=1 and the seven agents introduce
// themselves one by one (walk to the front, face the visitor, speak with captions, walk back).
// The next agent waits beside the stage while one speaks, and the two cross over together.
// A quick captions-only tour (/agent-hq?intro=quick) uses the same choreography without sound.
// Playback is observed through an init script that records every media element and samples
// how many play at once. Where a test needs the whole sequence, the recordings play faster
// (playbackRate) so it fits in a test run; the choreography itself runs at normal speed.

type W = { __media: HTMLMediaElement[]; __max: number; __block?: boolean; __rate?: number };

async function instrument(page: Page, opts: { rate?: number; blockAutoplay?: boolean } = {}) {
  await page.addInitScript(
    ({ rate, block }) => {
      const w = window as unknown as W;
      w.__media = [];
      w.__max = 0;
      w.__rate = rate;
      w.__block = block;
      const orig = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        if (!w.__media.includes(this)) w.__media.push(this);
        // Stand-in for a browser autoplay policy: reject like Chrome does without a user gesture.
        if (w.__block) return Promise.reject(new DOMException("play() failed because the user didn't interact with the document first.", "NotAllowedError"));
        if (w.__rate) this.playbackRate = w.__rate;
        return orig.call(this);
      };
      setInterval(() => {
        const n = w.__media.filter((m) => !m.paused && !m.ended && m.currentTime > 0).length;
        w.__max = Math.max(w.__max, n);
      }, 50);
    },
    { rate: opts.rate ?? 0, block: !!opts.blockAutoplay },
  );
}

const playing = (page: Page) =>
  page.evaluate(() => (window as unknown as W).__media.filter((m) => !m.paused && !m.ended).map((m) => new URL(m.src, location.href).pathname));
const maxConcurrent = (page: Page) => page.evaluate(() => (window as unknown as W).__max);
const root = (page: Page) => page.getByTestId("agent-hq");
const agent = (page: Page, id: HqAgentId) => page.getByTestId(`hq-agent-${id}`);
const intro = (page: Page) => page.getByTestId("hq-intro");
const ORDER: HqAgentId[] = HQ_AGENTS;

const consoleErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
};

async function startFromButton(page: Page) {
  await page.goto("/agent-hq");
  await expect(root(page)).toHaveAttribute("data-ready", "true");
  await page.getByTestId("hq-play-intro").click();
  await expect(root(page)).toHaveAttribute("data-intro-agent", "astra");
}

test.describe("Agent HQ: Meet the team introduction", () => {
  test("the homepage's Meet the team opens Agent HQ with the introduction intent, which then starts by itself", async ({ page }) => {
    const errors = consoleErrors(page);
    await instrument(page);
    await page.goto("/");
    const link = page.locator('a[href="/agent-hq?intro=1"]:visible').first();
    await expect(link).toContainText("Meet the team");
    await link.click();
    await page.waitForURL(/\/agent-hq/);
    await expect(root(page)).toHaveAttribute("data-ready", "true");
    // Starts without another click, with ASTRA first.
    await expect(root(page)).toHaveAttribute("data-intro", "0");
    await expect(root(page)).toHaveAttribute("data-intro-agent", "astra");
    await expect(page.getByTestId("hq-intro-progress")).toHaveText("Introducing 1 of 7 — ASTRA");
    // The flag is taken out of the address, so a refresh shows the normal office.
    await expect.poll(() => new URL(page.url()).search).toBe("");
    // The controls are in view and focus is on the progress line for screen readers.
    await expect(intro(page)).toBeInViewport();
    await expect(page.getByTestId("hq-intro-progress")).toBeFocused();
    // ASTRA walks out, faces the visitor and speaks its existing recording.
    await expect(root(page)).toHaveAttribute("data-intro-stage", "speaking", { timeout: 20_000 });
    await expect.poll(() => playing(page)).toEqual([HQ_INTRO.astra.audioFile]);
    expect(errors).toEqual([]);
  });

  test("the team section's Meet the team also starts the introduction", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: `Meet the team · ${INTRO_FULL_LABEL}` }).click();
    await page.waitForURL(/\/agent-hq/);
    await expect(root(page)).toHaveAttribute("data-intro-agent", "astra");
  });

  test("all seven in order, one voice at a time, each from the presentation spot facing the visitor; camera focuses and is restored", async ({ page }) => {
    test.setTimeout(240_000);
    await instrument(page, { rate: 8 });
    await startFromButton(page);
    const spoken: HqAgentId[] = [];
    for (let i = 0; i < ORDER.length; i++) {
      const id = ORDER[i];
      await expect(root(page)).toHaveAttribute("data-intro-agent", id, { timeout: 30_000 });
      await expect(page.getByTestId("hq-intro-progress")).toHaveText(`Introducing ${i + 1} of 7 — ${id.toUpperCase()}`);
      await expect(root(page)).toHaveAttribute("data-intro-stage", "speaking", { timeout: 30_000 });
      spoken.push(id);
      // The right recording, and only that one.
      await expect.poll(() => playing(page)).toEqual([HQ_INTRO[id].audioFile]);
      // Standing on the presentation spot, facing the visitor.
      const el = agent(page, id);
      await expect(el).toHaveAttribute("data-x", (PRESENTATION_SPOT.x + 0.5).toFixed(2));
      await expect(el).toHaveAttribute("data-y", (PRESENTATION_SPOT.y + 0.5).toFixed(2));
      expect(Math.abs(Number(await el.getAttribute("data-face")) - PRESENTATION_SPOT.face)).toBeLessThan(0.05);
      // The camera is zoomed in on the speaker.
      expect(Number(await root(page).getAttribute("data-zoom"))).toBeGreaterThan(1.4);
      // The previous presenter has left the stage (two tiles or more away) on its way back to its desk.
      if (i > 0) {
        const prev = agent(page, ORDER[i - 1]);
        const px = Number(await prev.getAttribute("data-x"));
        const py = Number(await prev.getAttribute("data-y"));
        expect(Math.hypot(px - (PRESENTATION_SPOT.x + 0.5), py - (PRESENTATION_SPOT.y + 0.5)), `${ORDER[i - 1]} is clear of the stage`).toBeGreaterThanOrEqual(2);
        // ...and gets there: back in its chair at its own desk.
        await expect(prev).toHaveAttribute("data-sit", "1.00", { timeout: 15_000 });
        await expect(prev).toHaveAttribute("data-x", (DESKS[ORDER[i - 1]].seat.x + 0.5).toFixed(2));
        await expect(prev).toHaveAttribute("data-y", (DESKS[ORDER[i - 1]].seat.y + 0.5).toFixed(2));
      }
      // Captions show this agent's own caption text.
      await expect(page.getByTestId("hq-captions")).toContainText(HQ_INTRO[id].caption.split(".")[0]);
    }
    expect(spoken).toEqual(ORDER);
    // After ECHO: the office is back, at the full view, and ambient life resumes.
    await expect(root(page)).toHaveAttribute("data-intro", "", { timeout: 30_000 });
    await expect(root(page)).toHaveAttribute("data-mode", "ambient");
    await expect.poll(async () => Number(await root(page).getAttribute("data-zoom")), { timeout: 10_000 }).toBeLessThan(1.05);
    await expect(page.getByTestId("hq-play-intro")).toBeFocused();
    expect(await maxConcurrent(page)).toBeLessThanOrEqual(1);
  });

  test("captions follow the recording: the highlighted sentence moves forward as the clip plays", async ({ page }) => {
    await instrument(page);
    await startFromButton(page);
    await expect(root(page)).toHaveAttribute("data-intro-stage", "speaking", { timeout: 20_000 });
    const caption = page.getByTestId("hq-captions");
    const bright = () =>
      caption.evaluate((el) => {
        const spans = Array.from(el.querySelectorAll("p > span")).slice(1);
        return spans.findIndex((s) => getComputedStyle(s).color === "rgb(248, 250, 252)");
      });
    // Jump the clip near its end: the highlighted sentence follows the audio position.
    const first = await bright();
    await page.evaluate(() => {
      const m = (window as unknown as W).__media.find((x) => !x.paused);
      if (m) m.currentTime = m.duration * 0.9;
    });
    await expect.poll(bright).toBeGreaterThan(first);
  });

  test("autoplay blocked: captions carry on, Enable sound appears, and a click turns the voice on", async ({ page }) => {
    await instrument(page, { blockAutoplay: true });
    await page.goto("/agent-hq?intro=1");
    await expect(root(page)).toHaveAttribute("data-intro-stage", "speaking", { timeout: 20_000 });
    await expect(root(page)).toHaveAttribute("data-sound-blocked", "true");
    await expect(root(page)).toHaveAttribute("data-audio", "captions");
    // Never claims to be speaking aloud when playback was refused.
    await expect(page.getByTestId("hq-intro-panel")).toContainText("Captions (sound blocked by the browser)");
    await expect(page.getByTestId("hq-captions")).toContainText("ASTRA");
    expect(await playing(page)).toEqual([]);
    const enable = page.getByTestId("hq-enable-sound");
    await expect(enable).toBeVisible();
    // The visitor clicks: the browser now allows playback.
    await page.evaluate(() => ((window as unknown as W).__block = false));
    await enable.click();
    await expect(root(page)).toHaveAttribute("data-audio", "playing");
    await expect(root(page)).toHaveAttribute("data-sound-blocked", "false");
    await expect.poll(() => playing(page)).toEqual([HQ_INTRO.astra.audioFile]);
    await expect(page.getByTestId("hq-intro-panel")).toContainText("Speaking");
  });

  test("Next, Previous, Pause, Resume and Skip", async ({ page }) => {
    await instrument(page);
    await startFromButton(page);
    await expect(root(page)).toHaveAttribute("data-intro-stage", "speaking", { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Previous agent" })).toBeDisabled();

    await page.getByRole("button", { name: "Next agent" }).click();
    await expect(root(page)).toHaveAttribute("data-intro-agent", "nova");
    await expect(root(page)).toHaveAttribute("data-intro-stage", "approach");
    expect(await playing(page)).toEqual([]);
    await expect(root(page)).toHaveAttribute("data-intro-stage", "speaking", { timeout: 20_000 });
    await expect.poll(() => playing(page)).toEqual([HQ_INTRO.nova.audioFile]);

    await page.getByRole("button", { name: "Previous agent" }).click();
    await expect(root(page)).toHaveAttribute("data-intro-agent", "astra");
    await expect(root(page)).toHaveAttribute("data-intro-stage", "speaking", { timeout: 20_000 });
    await expect.poll(() => playing(page)).toEqual([HQ_INTRO.astra.audioFile]);

    // Pause: voice and motion stop.
    await page.getByTestId("hq-intro-pause").click();
    await expect(root(page)).toHaveAttribute("data-intro-paused", "true");
    await expect.poll(() => playing(page)).toEqual([]);
    // data-time is written every 150 ms: let the last write land before reading it.
    await page.waitForTimeout(400);
    const t1 = await root(page).getAttribute("data-time");
    await page.waitForTimeout(800);
    expect(await root(page).getAttribute("data-time")).toBe(t1);
    // Resume: the same clip carries on.
    await page.getByTestId("hq-intro-pause").click();
    await expect(root(page)).toHaveAttribute("data-intro-paused", "false");
    await expect.poll(() => playing(page)).toEqual([HQ_INTRO.astra.audioFile]);

    // Skip: back to the office at once; focus returns to "Meet the team".
    await page.getByTestId("hq-intro-skip").click();
    await expect(root(page)).toHaveAttribute("data-intro", "");
    await expect.poll(() => playing(page)).toEqual([]);
    await expect(page.getByTestId("hq-play-intro")).toBeFocused();
    await expect(intro(page)).toHaveCount(0);
    expect(await maxConcurrent(page)).toBeLessThanOrEqual(1);
  });

  test("two quick presses of Next move two agents on, and only the last one speaks", async ({ page }) => {
    await instrument(page);
    await startFromButton(page);
    await expect(root(page)).toHaveAttribute("data-intro-stage", "speaking", { timeout: 20_000 });
    // Both clicks land before React re-renders.
    await page.evaluate(() => {
      const next = Array.from(document.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === "Next agent")!;
      next.click();
      next.click();
    });
    await expect(root(page)).toHaveAttribute("data-intro-agent", "forge");
    await expect(page.getByTestId("hq-intro-progress")).toHaveText("Introducing 3 of 7 — FORGE");
    await expect(root(page)).toHaveAttribute("data-intro-stage", "speaking", { timeout: 20_000 });
    await expect.poll(() => playing(page)).toEqual([HQ_INTRO.forge.audioFile]);
    expect(await maxConcurrent(page)).toBeLessThanOrEqual(1);
  });

  test("Replay starts again from ASTRA", async ({ page }) => {
    await instrument(page);
    await startFromButton(page);
    await page.getByRole("button", { name: "Next agent" }).click();
    await page.getByRole("button", { name: "Next agent" }).click();
    await expect(root(page)).toHaveAttribute("data-intro-agent", "forge");
    await page.getByRole("button", { name: "Replay introduction from the start" }).click();
    await expect(root(page)).toHaveAttribute("data-intro-agent", "astra");
    await expect(page.getByTestId("hq-intro-progress")).toHaveText("Introducing 1 of 7 — ASTRA");
  });

  test("mute keeps the introduction going silently with captions; captions can be hidden", async ({ page }) => {
    await instrument(page);
    await startFromButton(page);
    await expect(root(page)).toHaveAttribute("data-intro-stage", "speaking", { timeout: 20_000 });
    await page.getByRole("button", { name: "Mute voices" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as W).__media.filter((m) => !m.paused).every((m) => m.muted))).toBe(true);
    await expect(page.getByTestId("hq-intro-panel")).toContainText("Speaking (muted)");
    await expect(page.getByTestId("hq-captions")).toContainText("ASTRA");
    await page.getByRole("button", { name: "Hide captions" }).click();
    await expect(page.getByTestId("hq-captions")).not.toContainText("ASTRA");
    await page.getByRole("button", { name: "Show captions" }).click();
    await expect(page.getByTestId("hq-captions")).toContainText("ASTRA");
  });

  test("leaving the page during narration stops the voice", async ({ page }) => {
    await instrument(page);
    await startFromButton(page);
    await expect(root(page)).toHaveAttribute("data-intro-stage", "speaking", { timeout: 20_000 });
    await expect.poll(() => playing(page)).toEqual([HQ_INTRO.astra.audioFile]);
    // A client-side navigation keeps the same window, so a voice left playing would be audible.
    await page.getByRole("navigation").getByRole("link", { name: /agents/i }).first().click();
    await page.waitForURL(/\/agents/);
    await expect.poll(() => playing(page)).toEqual([]);
  });

  test("a direct visit shows the normal office, with Meet the team on offer, and a refresh never replays", async ({ page }) => {
    await instrument(page);
    await page.goto("/agent-hq");
    await expect(root(page)).toHaveAttribute("data-ready", "true");
    await page.waitForTimeout(2500);
    await expect(root(page)).toHaveAttribute("data-intro", "");
    await expect(intro(page)).toHaveCount(0);
    expect(await playing(page)).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as W).__media.length)).toBe(0);
    // Both versions on offer, each labelled with how long it takes.
    await expect(page.getByTestId("hq-play-intro")).toBeVisible();
    await expect(page.getByTestId("hq-play-intro")).toContainText(`narrated, ${INTRO_FULL_LABEL}`);
    await expect(page.getByTestId("hq-play-quick-intro")).toContainText(`captions only, ${INTRO_QUICK_LABEL}`);
    // After an introduction from the homepage link, a refresh is a normal visit.
    await page.goto("/agent-hq?intro=1");
    await expect(root(page)).toHaveAttribute("data-intro-agent", "astra");
    await page.reload();
    await expect(root(page)).toHaveAttribute("data-ready", "true");
    await page.waitForTimeout(1500);
    await expect(root(page)).toHaveAttribute("data-intro", "");
  });

  test("quick tour: captions only, all seven in order, no audio is ever played, then back to the office", async ({ page }) => {
    test.setTimeout(150_000);
    // Even with autoplay blocked there is nothing to block: no clip is started at all.
    await instrument(page, { blockAutoplay: true });
    const errors = consoleErrors(page);
    await page.goto("/");
    await page.getByRole("link", { name: `Quick tour · captions only, ${INTRO_QUICK_LABEL}` }).click();
    await page.waitForURL(/\/agent-hq/);
    await expect(root(page)).toHaveAttribute("data-intro-agent", "astra");
    await expect.poll(() => new URL(page.url()).search).toBe("");
    await expect(page.getByTestId("hq-intro-role")).toContainText("Quick tour · captions only");
    await expect(page.getByTestId("hq-phase")).toHaveText("Quick tour");
    const t0 = Date.now();
    for (let i = 0; i < ORDER.length; i++) {
      const id = ORDER[i];
      await expect(root(page)).toHaveAttribute("data-intro-agent", id, { timeout: 20_000 });
      await expect(root(page)).toHaveAttribute("data-intro-stage", "speaking", { timeout: 20_000 });
      await expect(page.getByTestId("hq-captions")).toContainText(INTRO_QUICK_LINES[id]);
      await expect(page.getByTestId("hq-intro-panel")).toContainText("Captions only (quick tour)");
      await expect(page.getByTestId("hq-enable-sound")).toHaveCount(0);
    }
    await expect(root(page)).toHaveAttribute("data-intro", "", { timeout: 20_000 });
    const seconds = (Date.now() - t0) / 1000;
    test.info().annotations.push({ type: "timing", description: `quick tour ASTRA start to end: ${seconds.toFixed(1)} s` });
    expect(seconds).toBeLessThan(90);
    await expect(root(page)).toHaveAttribute("data-mode", "ambient");
    expect(await page.evaluate(() => (window as unknown as W).__media.length)).toBe(0);
    expect(errors).toEqual([]);
  });

  test("quick tour: captions stay visible even with captions switched off, and Pause, Next and Replay keep the quick version", async ({ page }) => {
    await instrument(page);
    await page.goto("/agent-hq");
    await expect(root(page)).toHaveAttribute("data-ready", "true");
    await page.getByRole("button", { name: "Hide captions" }).click();
    await page.getByTestId("hq-play-quick-intro").click();
    await expect(root(page)).toHaveAttribute("data-intro-stage", "speaking", { timeout: 20_000 });
    await expect(page.getByTestId("hq-captions")).toContainText(INTRO_QUICK_LINES.astra);
    // Pause freezes the caption timer: still ASTRA well after its reading time.
    await page.getByTestId("hq-intro-pause").click();
    await expect(root(page)).toHaveAttribute("data-intro-paused", "true");
    await page.waitForTimeout(5500);
    await expect(root(page)).toHaveAttribute("data-intro-agent", "astra");
    await page.getByTestId("hq-intro-pause").click();
    await page.getByRole("button", { name: "Next agent" }).click();
    await expect(root(page)).toHaveAttribute("data-intro-agent", "nova");
    await expect(root(page)).toHaveAttribute("data-intro-stage", "speaking", { timeout: 20_000 });
    await expect(page.getByTestId("hq-captions")).toContainText(INTRO_QUICK_LINES.nova);
    await page.getByRole("button", { name: "Replay introduction from the start" }).click();
    await expect(root(page)).toHaveAttribute("data-intro-agent", "astra");
    await expect(page.getByTestId("hq-intro-role")).toContainText("Quick tour");
    expect(await page.evaluate(() => (window as unknown as W).__media.length)).toBe(0);
  });

  test("PRISM starting to talk pauses the introduction instead of overlapping it", async ({ page }) => {
    await instrument(page);
    await startFromButton(page);
    await expect(root(page)).toHaveAttribute("data-intro-stage", "speaking", { timeout: 20_000 });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("site-audio-start", { detail: { owner: "prism" } })));
    await expect(root(page)).toHaveAttribute("data-intro-paused", "true");
    await expect.poll(() => playing(page)).toEqual([]);
  });

  test("keyboard: start with Enter, focus moves to the progress line, Escape exits to the office and restores focus", async ({ page }) => {
    await page.goto("/agent-hq");
    await expect(root(page)).toHaveAttribute("data-ready", "true");
    await page.getByTestId("hq-play-intro").focus();
    await page.keyboard.press("Enter");
    await expect(root(page)).toHaveAttribute("data-intro-agent", "astra");
    await expect(page.getByTestId("hq-intro-progress")).toBeFocused();
    // Every control is reachable with Tab.
    for (const name of ["Previous agent", "Next agent", "Replay introduction from the start", "Skip intro and exit to the office"]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("hq-intro-pause")).toBeFocused(); // Previous is disabled on the first agent
    await page.keyboard.press("Escape");
    await expect(root(page)).toHaveAttribute("data-intro", "");
    await expect(page.getByTestId("hq-play-intro")).toBeFocused();
    // The speaker change is announced politely.
    await page.getByTestId("hq-play-intro").click();
    await expect(page.locator('[role="status"]')).toContainText("Introducing 1 of 7: ASTRA");
  });

  test.describe("reduced motion", () => {
    test.use({ reducedMotion: "reduce" });
    test("no walking: each agent appears at the front and speaks, then is back at its desk", async ({ page }) => {
      await instrument(page);
      await startFromButton(page);
      await expect(root(page)).toHaveAttribute("data-intro-stage", "speaking", { timeout: 5_000 });
      await expect(agent(page, "astra")).toHaveAttribute("data-x", (PRESENTATION_SPOT.x + 0.5).toFixed(2));
      await page.getByRole("button", { name: "Next agent" }).click();
      await expect(root(page)).toHaveAttribute("data-intro-agent", "nova");
      await expect(root(page)).toHaveAttribute("data-intro-stage", "speaking", { timeout: 5_000 });
      await expect(agent(page, "astra")).toHaveAttribute("data-x", (DESKS.astra.seat.x + 0.5).toFixed(2));
      await expect(agent(page, "astra")).toHaveAttribute("data-y", (DESKS.astra.seat.y + 0.5).toFixed(2));
      // Never mid-step.
      for (const id of ORDER) {
        const x = Number(await agent(page, id).getAttribute("data-x"));
        expect(Math.abs(x - Math.floor(x) - 0.5)).toBeLessThan(0.01);
      }
    });
  });

  test("@mobile phone: controls are large enough to tap, nothing overflows, and Next works by touch", async ({ page }) => {
    const vp = page.viewportSize()!;
    test.skip(vp.width >= 1024, "phone layout only");
    await instrument(page);
    await page.goto("/agent-hq?intro=1");
    await expect(root(page)).toHaveAttribute("data-intro-agent", "astra");
    await expect(intro(page)).toBeInViewport();
    for (const b of await intro(page).getByRole("button").all()) {
      if (!(await b.isVisible())) continue;
      const box = (await b.boundingBox())!;
      expect(box.height, await b.innerText()).toBeGreaterThanOrEqual(44);
      expect(box.width, await b.innerText()).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Next agent" }).tap();
    await expect(root(page)).toHaveAttribute("data-intro-agent", "nova");
    await expect(page.getByTestId("hq-intro-progress")).toHaveText("Introducing 2 of 7 — NOVA");
  });
});
