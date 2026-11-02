import { test, expect, type Page } from "@playwright/test";
import { CLIP_SECONDS, HQ_INTRO, SILENT_MEETING_LINES } from "../../data/agentHq";
import { MEETING_SPOTS, walkableFor, type HqAgentId } from "../../lib/agentHq/layout";

// Browser tests for /agent-hq: the canvas office, overlay buttons that follow the
// characters, meetings, selection with narration and captions, audio coordination
// with PRISM, keyboard use, reduced motion, cleanup on leaving, and phones.
// Playback is observed through an init script that records every media element
// and samples how many play at once.

const ROUTE = "/agent-hq";
const AGENTS: HqAgentId[] = ["astra", "nova", "forge"];

type W = { __media: HTMLMediaElement[]; __max: number; __agentHqLoops?: number };

async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as W;
    w.__media = [];
    w.__max = 0;
    const orig = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (!w.__media.includes(this)) w.__media.push(this);
      return orig.call(this);
    };
    setInterval(() => {
      const playing = w.__media.filter((m) => !m.paused && !m.ended && m.currentTime > 0).length;
      w.__max = Math.max(w.__max, playing);
    }, 50);
  });
}

const playing = (page: Page) =>
  page.evaluate(() => (window as unknown as W).__media.filter((m) => !m.paused && !m.ended).map((m) => new URL(m.src, location.href).pathname));
const maxConcurrent = (page: Page) => page.evaluate(() => (window as unknown as W).__max);

const consoleErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => r.status() >= 400 && !r.url().includes("/_vercel/insights/") && errors.push(`${r.status()} ${r.url()}`));
  return errors;
};
const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

const root = (page: Page) => page.getByTestId("agent-hq");
const agent = (page: Page, id: HqAgentId) => page.getByTestId(`hq-agent-${id}`);

async function open(page: Page) {
  await page.goto(ROUTE);
  await expect(root(page)).toHaveAttribute("data-ready", "true");
  await page.getByTestId("hq-phase").scrollIntoViewIfNeeded();
}

async function positions(page: Page) {
  const out: Record<string, { x: number; y: number; activity: string }> = {};
  for (const id of AGENTS) {
    const el = agent(page, id);
    out[id] = {
      x: Number(await el.getAttribute("data-x")),
      y: Number(await el.getAttribute("data-y")),
      activity: (await el.getAttribute("data-activity")) ?? "",
    };
  }
  return out;
}

async function atMeetingSpots(page: Page) {
  const at = await positions(page);
  return AGENTS.every((id) => at[id].x === MEETING_SPOTS[id].x + 0.5 && at[id].y === MEETING_SPOTS[id].y + 0.5);
}

/** Furthest playback position of any unpaused element: proves audio is really advancing, not just started. */
const playedSeconds = (page: Page) =>
  page.evaluate(() => Math.max(0, ...(window as unknown as W).__media.filter((m) => !m.paused).map((m) => m.currentTime)));

test.describe("Agent HQ", () => {
  test.beforeEach(async ({ page }) => instrument(page));

  test("draws the office with three characters and an honest description, without errors", async ({ page }) => {
    const errors = consoleErrors(page);
    await open(page);
    for (const id of AGENTS) await expect(agent(page, id)).toBeVisible();
    await expect(page.getByText("No live autonomous agents are running behind it.")).toBeVisible();
    await expect(page.getByText("Prototype · 3 of 7 agents")).toBeVisible();
    // The canvas has real pixels drawn: many distinct colours, not a blank fill.
    const colours = await page.locator("canvas").evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext("2d")!;
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const set = new Set<number>();
      for (let i = 0; i < d.length; i += 4 * 97) set.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      return set.size;
    });
    expect(colours).toBeGreaterThan(200);
    expect(await noHorizontalOverflow(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("characters really move through the office, only on walkable floor", async ({ page }) => {
    await open(page);
    const start = await positions(page);
    const seen = new Set<string>();
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      const now = await positions(page);
      for (const id of AGENTS) {
        seen.add(`${id}:${now[id].activity}`);
        expect(walkableFor(id, Math.floor(now[id].x), Math.floor(now[id].y)), `${id} at ${now[id].x},${now[id].y}`).toBe(true);
      }
      await page.waitForTimeout(250);
    }
    const end = await positions(page);
    expect(AGENTS.some((id) => start[id].x !== end[id].x || start[id].y !== end[id].y)).toBe(true);
    expect([...seen].some((s) => s.endsWith(":walking"))).toBe(true);
    expect([...seen].some((s) => s.endsWith(":working"))).toBe(true);
  });

  test("a quick meeting is captions-only: the team gathers, speaks in turn with quoted lines, and can be skipped", async ({ page }) => {
    await open(page);
    // Voices stay on: the quick meeting never plays audio.
    await page.getByRole("button", { name: /^Quick meeting/ }).click();
    await expect(root(page)).toHaveAttribute("data-meeting", "calling");
    await expect(agent(page, "astra")).toHaveAttribute("data-activity", "calling");
    await expect(root(page)).toHaveAttribute("data-meeting", "gathering", { timeout: 5000 });
    await expect(root(page)).toHaveAttribute("data-speaker", "astra", { timeout: 20_000 });
    // Everyone is at their spot around the table (position attributes refresh every 150 ms).
    await expect.poll(() => atMeetingSpots(page)).toBe(true);
    await expect(page.getByTestId("hq-bubble-astra")).toContainText(SILENT_MEETING_LINES[0].text);
    await expect(page.getByTestId("hq-captions")).toContainText(SILENT_MEETING_LINES[0].text);
    await expect(root(page)).toHaveAttribute("data-speaker", "nova", { timeout: 8000 });
    await expect(page.getByTestId("hq-bubble-nova")).toContainText(SILENT_MEETING_LINES[1].text);
    expect(await playing(page)).toEqual([]);
    await page.getByRole("button", { name: "Skip meeting" }).click();
    await expect(root(page)).toHaveAttribute("data-meeting", "returning");
    await expect(root(page)).toHaveAttribute("data-meeting", "none", { timeout: 20_000 });
    for (const id of AGENTS) await expect(agent(page, id)).toHaveAttribute("data-sit", "1.00");
  });

  test("a voiced meeting plays the recorded introductions one at a time", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: /^Full meeting with voices/ }).click();
    await expect(root(page)).toHaveAttribute("data-speaker", "astra", { timeout: 20_000 });
    await expect.poll(() => playing(page), { timeout: 5000 }).toEqual([HQ_INTRO.astra.audioFile]);
    await expect.poll(() => playedSeconds(page), { timeout: 8000 }).toBeGreaterThan(0.5);
    await expect(page.getByTestId("hq-captions")).toContainText("I'm Astra, the orchestration agent.");
    await page.getByRole("button", { name: "Next speaker" }).click();
    await expect(root(page)).toHaveAttribute("data-speaker", "nova");
    await expect.poll(() => playing(page), { timeout: 5000 }).toEqual([HQ_INTRO.nova.audioFile]);
    await page.getByRole("button", { name: "Skip meeting" }).click();
    await expect.poll(() => playing(page)).toEqual([]);
    expect(await maxConcurrent(page)).toBe(1);
  });

  test("the full meeting shows its length, and Jump to goes straight to FORGE's clip with the ATLAS handover note", async ({ page }) => {
    await open(page);
    await expect(page.getByRole("button", { name: /^Full meeting with voices/ })).toContainText("about 1½ min");
    await expect(page.getByRole("button", { name: /^Quick meeting/ })).toContainText("about 25 s");
    await expect(page.getByText(/The full meeting plays 1:21 of recorded audio/)).toBeVisible();
    await page.getByRole("button", { name: /^Full meeting with voices/ }).click();
    await expect(root(page)).toHaveAttribute("data-speaker", "astra", { timeout: 20_000 });
    const jump = page.getByTestId("hq-jump");
    await expect(jump.getByRole("button", { name: /ASTRA/ })).toHaveAttribute("aria-pressed", "true");
    await expect(jump.getByRole("button", { name: /FORGE/ })).toContainText("0:27");
    await expect.poll(() => playing(page), { timeout: 5000 }).toEqual([HQ_INTRO.astra.audioFile]);
    await expect(page.getByTestId("hq-atlas-note")).toHaveCount(0);
    await jump.getByRole("button", { name: /FORGE/ }).click();
    await expect(root(page)).toHaveAttribute("data-speaker", "forge");
    await expect(jump.getByRole("button", { name: /FORGE/ })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => playing(page), { timeout: 5000 }).toEqual([HQ_INTRO.forge.audioFile]);
    await expect.poll(() => playedSeconds(page), { timeout: 8000 }).toBeGreaterThan(0.5);
    await expect(page.getByTestId("hq-captions")).toContainText("Atlas, our systems architect");
    const note = page.getByTestId("hq-atlas-note");
    await expect(note).toContainText("ATLAS isn't part of this three-agent prototype");
    await expect(note.getByRole("link", { name: "full AI Team tour" })).toHaveAttribute("href", "/#ai-team");
    await page.getByRole("button", { name: "Skip meeting" }).click();
    await expect.poll(() => playing(page)).toEqual([]);
    expect(await maxConcurrent(page)).toBe(1);
  });

  test("the clip lengths shown match the recordings the browser decodes", async ({ page }) => {
    await open(page);
    const decoded = await page.evaluate(
      (files) =>
        Promise.all(
          files.map(
            (f) =>
              new Promise<number>((res, rej) => {
                const a = new Audio();
                a.preload = "metadata";
                a.onloadedmetadata = () => res(a.duration);
                a.onerror = () => rej(new Error(f));
                a.src = f;
              })
          )
        ),
      AGENTS.map((id) => HQ_INTRO[id].audioFile)
    );
    AGENTS.forEach((id, i) => expect(Math.abs(decoded[i] - CLIP_SECONDS[id]), id).toBeLessThan(0.3));
  });

  test("clicking a character focuses it: greeting, its own narration, captions and role panel; back returns", async ({ page }) => {
    const errors = consoleErrors(page);
    await open(page);
    await agent(page, "nova").click();
    await expect(root(page)).toHaveAttribute("data-selected", "nova");
    await expect(agent(page, "nova")).toHaveAttribute("aria-pressed", "true");
    const panel = page.getByTestId("hq-panel");
    await expect(panel.getByRole("heading", { name: "NOVA" })).toBeVisible();
    await expect(panel).toContainText("Creative Director & UI/UX");
    await expect(panel).toContainText("Visual identity, typography, and color system");
    await expect.poll(() => playing(page), { timeout: 5000 }).toEqual([HQ_INTRO.nova.audioFile]);
    await expect.poll(() => playedSeconds(page), { timeout: 8000 }).toBeGreaterThan(0.5);
    await expect(page.getByTestId("hq-captions")).toContainText("Thanks, Astra. Hello, I'm Nova, the design agent.");
    await expect(agent(page, "nova")).toHaveAttribute("data-activity", "greeting", { timeout: 5000 });
    await expect(agent(page, "nova")).toHaveAttribute("data-activity", "speaking", { timeout: 5000 });
    // The camera zoomed in: the character's hit area is larger than in the office view.
    const box = (await agent(page, "nova").boundingBox())!;
    expect(box.height).toBeGreaterThan(100);

    await panel.getByRole("button", { name: "Stop" }).click();
    await expect.poll(() => playing(page)).toEqual([]);
    await expect(agent(page, "nova")).toHaveAttribute("data-activity", "presenting");
    await panel.getByRole("button", { name: "Replay" }).click();
    await expect.poll(() => playing(page), { timeout: 5000 }).toEqual([HQ_INTRO.nova.audioFile]);

    await page.getByTestId("hq-back").click();
    await expect(root(page)).toHaveAttribute("data-selected", "");
    await expect.poll(() => playing(page)).toEqual([]);
    await expect(agent(page, "nova")).toBeFocused();
    expect(errors).toEqual([]);
  });

  test("mute silences the narration without stopping the captions", async ({ page }) => {
    await open(page);
    await agent(page, "forge").click();
    await expect.poll(() => playing(page), { timeout: 5000 }).toEqual([HQ_INTRO.forge.audioFile]);
    await page.getByRole("button", { name: "Mute voices" }).click();
    expect(await page.evaluate(() => (window as unknown as W).__media.every((m) => m.muted))).toBe(true);
    await expect(page.getByTestId("hq-captions")).toContainText("I'm Forge, the frontend engineering agent.");
    await page.getByRole("button", { name: "Hide captions" }).click();
    await expect(page.getByTestId("hq-captions")).toBeEmpty();
  });

  test("PRISM starting stops Agent HQ narration", async ({ page }) => {
    await open(page);
    await agent(page, "astra").click();
    await expect.poll(() => playing(page), { timeout: 5000 }).toEqual([HQ_INTRO.astra.audioFile]);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("site-audio-start", { detail: { owner: "prism" } })));
    await expect.poll(() => playing(page)).toEqual([]);
    await expect(root(page)).toHaveAttribute("data-audio", "stopped");
  });

  test("works from the keyboard: Tab to a character, Enter to meet it, Escape to go back", async ({ page }) => {
    await open(page);
    await agent(page, "astra").focus();
    await page.keyboard.press("Tab");
    await expect(agent(page, "nova")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(root(page)).toHaveAttribute("data-selected", "nova");
    await page.keyboard.press("Escape");
    await expect(root(page)).toHaveAttribute("data-selected", "");
    await expect(agent(page, "nova")).toBeFocused();
    // The roster is a second way to reach each character.
    await page.getByTestId("hq-roster-forge").click();
    await expect(root(page)).toHaveAttribute("data-selected", "forge");
  });

  test("pause motion freezes the scene", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Pause motion" }).click();
    await expect(root(page)).toHaveAttribute("data-paused", "true");
    await page.waitForTimeout(300);
    const t1 = await root(page).getAttribute("data-time");
    await page.waitForTimeout(1200);
    expect(await root(page).getAttribute("data-time")).toBe(t1);
    await page.getByRole("button", { name: "Resume motion" }).click();
    await expect.poll(async () => Number(await root(page).getAttribute("data-time"))).toBeGreaterThan(Number(t1));
  });

  test("leaving stops the animation loop and the audio; coming back starts fresh", async ({ page }) => {
    await open(page);
    await agent(page, "forge").click();
    await expect.poll(() => playing(page), { timeout: 5000 }).toEqual([HQ_INTRO.forge.audioFile]);
    await expect.poll(() => page.evaluate(() => (window as unknown as W).__agentHqLoops)).toBe(1);
    await page.getByRole("link", { name: "Agents", exact: true }).first().click();
    await expect(page).toHaveURL(/\/agents$/);
    await expect.poll(() => page.evaluate(() => (window as unknown as W).__agentHqLoops)).toBe(0);
    await expect.poll(() => playing(page)).toEqual([]);
    await page.goBack();
    await expect(root(page)).toHaveAttribute("data-ready", "true");
    await expect.poll(() => page.evaluate(() => (window as unknown as W).__agentHqLoops)).toBe(1);
    await expect(root(page)).toHaveAttribute("data-selected", "");
  });
});

test.describe("Agent HQ with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nobody walks; a meeting still gathers the team, instantly", async ({ page }) => {
    await open(page);
    await expect(root(page)).toHaveAttribute("data-reduced", "true");
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      for (const id of AGENTS) seen.add((await agent(page, id).getAttribute("data-activity")) ?? "");
      await page.waitForTimeout(250);
    }
    expect(seen.has("walking")).toBe(false);
    await page.getByRole("button", { name: /^Quick meeting/ }).click();
    await expect(root(page)).toHaveAttribute("data-speaker", "astra", { timeout: 10_000 });
    await expect.poll(() => atMeetingSpots(page)).toBe(true);
  });
});

test.describe("Agent HQ and PRISM on the homepage", () => {
  test.beforeEach(async ({ page }) => instrument(page));

  test("PRISM stops when Agent HQ announces narration", async ({ page }) => {
    // PRISM's one autoplay attempt is allowed in this test browser.
    await page.goto("/");
    await expect.poll(() => playing(page), { timeout: 8000 }).toEqual(["/audio/prism/welcome.mp3"]);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("site-audio-start", { detail: { owner: "agent-hq" } })));
    await expect.poll(() => playing(page)).toEqual([]);
  });

  test("the AI team section links to Agent HQ", async ({ page }) => {
    await page.goto("/");
    await page.locator("#ai-team").getByRole("link", { name: /Agent HQ/ }).click();
    await expect(page).toHaveURL(/\/agent-hq$/);
    await expect(root(page)).toHaveAttribute("data-ready", "true");
  });
});

test.describe("Agent HQ on a phone", () => {
  test.beforeEach(async ({ page }) => instrument(page));

  test("characters are tappable with large targets, and narration and captions work @mobile", async ({ page }) => {
    const errors = consoleErrors(page);
    await open(page);
    expect(await noHorizontalOverflow(page)).toBe(true);
    for (const id of AGENTS) {
      const b = (await agent(page, id).boundingBox())!;
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    await agent(page, "astra").click();
    await expect(root(page)).toHaveAttribute("data-selected", "astra");
    await expect(page.getByTestId("hq-captions")).toContainText("I'm Astra, the orchestration agent.");
    await expect.poll(() => playing(page), { timeout: 5000 }).toEqual([HQ_INTRO.astra.audioFile]);
    await expect(page.getByTestId("hq-panel")).toContainText("Chief Orchestrator");
    await page.getByTestId("hq-back").click();
    await expect(root(page)).toHaveAttribute("data-selected", "");
    expect(await noHorizontalOverflow(page)).toBe(true);
    expect(errors).toEqual([]);
  });
});
