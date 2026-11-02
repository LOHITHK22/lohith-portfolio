import { test, expect, type Page } from "@playwright/test";
import { FULL_MEETING_AUDIO_SECONDS, HQ_INTRO, SILENT_MEETING_LINES, VOICED_MEETING_LINES, formatClip, lineSeconds } from "../../data/agentHq";
import { HQ_AGENTS, MEETING_SPOTS, walkableFor, type HqAgentId } from "../../lib/agentHq/layout";

// Browser tests for /agent-hq: the canvas office, overlay buttons that follow the
// characters, meetings, selection with narration and captions, audio coordination
// with PRISM, keyboard use, reduced motion, cleanup on leaving, and phones.
// Playback is observed through an init script that records every media element
// and samples how many play at once.

const ROUTE = "/agent-hq";
const AGENTS: HqAgentId[] = HQ_AGENTS;

type W = { __media: HTMLMediaElement[]; __max: number; __agentHqLoops?: number; __agentHqDraws?: number };

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

/**
 * Canvas redraws during the next `frames` display frames. Waits in animation frames,
 * not wall-clock time, so the result does not depend on how fast the machine is.
 */
const drawsOver = (page: Page, frames: number) =>
  page.evaluate(
    (n) =>
      new Promise<number>((resolve) => {
        const w = window as unknown as W;
        const start = w.__agentHqDraws ?? 0;
        let k = 0;
        const tick = () => (++k >= n ? resolve((w.__agentHqDraws ?? 0) - start) : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    frames,
  );
/** Waits until the canvas stops redrawing (a whole window of frames with no draw). */
const settled = (page: Page) => expect.poll(() => drawsOver(page, 30), { timeout: 10_000 }).toBe(0);

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

  test("draws the office with all seven characters and an honest description, without errors", async ({ page }) => {
    const errors = consoleErrors(page);
    await open(page);
    for (const id of AGENTS) await expect(agent(page, id)).toBeVisible();
    await expect(page.getByText(/No live autonomous agents are running behind it/)).toBeVisible();
    await expect(page.getByText(/alerts, warnings and performance figures in the office are simulated/)).toBeVisible();
    await expect(page.getByText("Simulation · all 7 agents")).toBeVisible();
    await expect(page.getByRole("link", { name: "See the real projects" })).toHaveAttribute("href", "/#projects");
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

  test("the full meeting is optional and shows its length; Jump to plays any of the eight recorded turns", async ({ page }) => {
    await open(page);
    const full = formatClip(FULL_MEETING_AUDIO_SECONDS);
    expect(full).toBe("3:19");
    await expect(page.getByRole("button", { name: /^Full meeting with voices/ })).toContainText(`${full} of audio`);
    await expect(page.getByRole("button", { name: /^Quick meeting/ })).toContainText("about 40 s");
    await expect(page.getByText(/The full meeting plays 3:19 of recorded audio/)).toBeVisible();
    await page.getByRole("button", { name: /^Full meeting with voices/ }).click();
    await expect(root(page)).toHaveAttribute("data-speaker", "astra", { timeout: 20_000 });
    const jump = page.getByTestId("hq-jump");
    await expect(jump.getByRole("button")).toHaveCount(VOICED_MEETING_LINES.length);
    await expect(jump.getByRole("button", { name: /^ASTRA,/ })).toHaveAttribute("aria-pressed", "true");
    await expect(jump.getByRole("button", { name: /^FORGE/ })).toContainText("0:27");
    await expect.poll(() => playing(page), { timeout: 5000 }).toEqual([HQ_INTRO.astra.audioFile]);
    // The three-agent prototype's ATLAS note is gone: ATLAS is in the office now.
    await expect(page.getByTestId("hq-atlas-note")).toHaveCount(0);
    await jump.getByRole("button", { name: /^FORGE/ }).click();
    await expect(root(page)).toHaveAttribute("data-speaker", "forge");
    await expect.poll(() => playing(page), { timeout: 5000 }).toEqual([HQ_INTRO.forge.audioFile]);
    await expect(page.getByTestId("hq-captions")).toContainText("Atlas, our systems architect");
    // FORGE hands over to ATLAS, whose own recording plays next.
    await jump.getByRole("button", { name: /^ATLAS/ }).click();
    await expect(root(page)).toHaveAttribute("data-speaker", "atlas");
    await expect.poll(() => playing(page), { timeout: 5000 }).toEqual(["/audio/team/atlas.mp3"]);
    await expect.poll(() => playedSeconds(page), { timeout: 8000 }).toBeGreaterThan(0.5);
    // ASTRA's recorded closing is the last turn.
    await jump.getByRole("button", { name: /^ASTRA closing/ }).click();
    await expect.poll(() => playing(page), { timeout: 5000 }).toEqual([VOICED_MEETING_LINES.at(-1)!.audio!]);
    await page.getByRole("button", { name: "Skip meeting" }).click();
    await expect.poll(() => playing(page)).toEqual([]);
    expect(await maxConcurrent(page)).toBe(1);
  });

  test("Stop narration turns a full meeting into captions; Escape leaves the meeting", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: /^Full meeting with voices/ }).click();
    await expect(root(page)).toHaveAttribute("data-speaker", "astra", { timeout: 20_000 });
    await expect.poll(() => playing(page), { timeout: 5000 }).toEqual([HQ_INTRO.astra.audioFile]);
    await page.getByRole("button", { name: "Next speaker" }).click();
    await expect(root(page)).toHaveAttribute("data-speaker", "nova");
    await page.getByRole("button", { name: "Stop narration" }).click();
    await expect.poll(() => playing(page)).toEqual([]);
    // The meeting carries on with NOVA's quoted line in a speech bubble, then the next speaker, silently.
    await expect(page.getByTestId("hq-bubble-nova")).toContainText(SILENT_MEETING_LINES[1].text);
    await expect(page.getByRole("button", { name: "Stop narration" })).toHaveCount(0);
    await expect(root(page)).toHaveAttribute("data-speaker", "forge", { timeout: 10_000 });
    expect(await playing(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(root(page)).toHaveAttribute("data-meeting", "returning");
    // Never two voices at once.
    expect(await maxConcurrent(page)).toBeLessThanOrEqual(1);
  });

  test("a quick meeting can jump to any of the seven", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: /^Quick meeting/ }).click();
    await expect(root(page)).toHaveAttribute("data-speaker", "astra", { timeout: 20_000 });
    const jump = page.getByTestId("hq-jump");
    await expect(jump.getByRole("button")).toHaveCount(7);
    await jump.getByRole("button", { name: "SENTINEL" }).click();
    await expect(root(page)).toHaveAttribute("data-speaker", "sentinel");
    await expect(page.getByTestId("hq-bubble-sentinel")).toContainText(SILENT_MEETING_LINES[5].text);
    await expect(root(page)).toHaveAttribute("data-speaker", "echo", { timeout: 10_000 });
    await expect(page.getByTestId("hq-bubble-echo")).toContainText("Together, our team represents");
    expect(await playing(page)).toEqual([]);
  });

  test("zoom in, drag to look around, and reset the view", async ({ page }) => {
    await open(page);
    await expect.poll(async () => Number(await root(page).getAttribute("data-zoom"))).toBeCloseTo(1, 1);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect.poll(async () => Number(await root(page).getAttribute("data-zoom"))).toBeGreaterThan(1.9);
    const before = (await agent(page, "echo").boundingBox())!;
    const c = (await page.locator('[data-testid="agent-hq"] canvas').boundingBox())!;
    await page.mouse.move(c.x + c.width * 0.3, c.y + c.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(c.x + c.width * 0.6, c.y + c.height * 0.55, { steps: 6 });
    await page.mouse.up();
    // The scene moved with the drag (overlays follow the characters).
    await expect.poll(async () => (await agent(page, "echo").boundingBox())!.x - before.x).toBeGreaterThan(40);
    await page.getByRole("button", { name: "Reset view" }).click();
    await expect.poll(async () => Number(await root(page).getAttribute("data-zoom"))).toBeCloseTo(1, 1);
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
      VOICED_MEETING_LINES.map((l) => l.audio!)
    );
    VOICED_MEETING_LINES.forEach((l, i) => expect(Math.abs(decoded[i] - lineSeconds(l)), l.id).toBeLessThan(0.3));
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

  test("every one of the seven can be met from the keyboard, with its own role panel and recording", async ({ page }) => {
    await open(page);
    for (const id of AGENTS) {
      await agent(page, id).focus();
      await page.keyboard.press("Enter");
      await expect(root(page)).toHaveAttribute("data-selected", id);
      await expect(page.getByTestId("hq-panel").getByRole("heading", { name: id.toUpperCase() })).toBeVisible();
      await expect.poll(() => playing(page), { timeout: 5000 }).toEqual([HQ_INTRO[id].audioFile]);
      await page.keyboard.press("Escape");
      await expect(root(page)).toHaveAttribute("data-selected", "");
      await expect(agent(page, id)).toBeFocused();
    }
    expect(await maxConcurrent(page)).toBe(1);
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

  test("the scene redraws continuously while animating, in one of the two frame-rate modes", async ({ page }) => {
    await open(page);
    await expect(root(page)).toHaveAttribute("data-fps", /^(60|30)$/);
    // 60 fps mode draws every display frame; 30 fps mode every other one.
    expect(await drawsOver(page, 120)).toBeGreaterThanOrEqual(55);
    test.info().annotations.push({ type: "frame-rate mode", description: String(await root(page).getAttribute("data-fps")) });
  });

  test("paused, the canvas stops redrawing; selection, the camera and going back redraw it, then it rests again", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Pause motion" }).click();
    await expect(root(page)).toHaveAttribute("data-paused", "true");
    await settled(page);
    expect(await drawsOver(page, 120)).toBe(0);

    // Selecting while paused: the highlight, camera zoom and the talking character are drawn.
    await agent(page, "nova").click();
    await expect(root(page)).toHaveAttribute("data-selected", "nova");
    expect(await drawsOver(page, 60)).toBeGreaterThan(0);
    await page.getByTestId("hq-back").click();
    await expect(root(page)).toHaveAttribute("data-selected", "");
    expect(await drawsOver(page, 30)).toBeGreaterThan(0); // camera returning
    await settled(page);
    expect(await drawsOver(page, 120)).toBe(0);

    await page.getByRole("button", { name: "Resume motion" }).click();
    expect(await drawsOver(page, 120)).toBeGreaterThanOrEqual(55);
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

  test("repeated visits leave nothing behind: DOM nodes and event listeners stay flat", async ({ page }) => {
    // Measured with the DevTools protocol after a forced garbage collection. Only locators are used
    // (no element handles), because a held handle would itself keep an old page alive.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const sample = async () => {
      await cdp.send("HeapProfiler.collectGarbage");
      const { metrics } = await cdp.send("Performance.getMetrics");
      const m = Object.fromEntries(metrics.map((x: { name: string; value: number }) => [x.name, x.value]));
      return { nodes: m.Nodes as number, listeners: m.JSEventListeners as number };
    };
    await open(page);
    const counts: { nodes: number; listeners: number }[] = [];
    for (let i = 0; i < 6; i++) {
      // Use the page as a visitor would: a meeting call and a selection, then leave and come back.
      await page.getByRole("button", { name: /^Quick meeting/ }).click();
      await agent(page, "sentinel").click();
      await expect(root(page)).toHaveAttribute("data-selected", "sentinel");
      await page.getByRole("link", { name: "Agents", exact: true }).first().click();
      await expect(page).toHaveURL(/\/agents$/);
      await page.goBack();
      await expect(root(page)).toHaveAttribute("data-ready", "true");
      await expect.poll(() => page.evaluate(() => (window as unknown as W).__agentHqLoops)).toBe(1);
      counts.push(await sample());
    }
    test.info().annotations.push({ type: "nodes/listeners per visit", description: JSON.stringify(counts) });
    // After the first visits warm the caches, further visits add nothing.
    const [a, b] = [counts[1], counts.at(-1)!];
    expect(b.listeners - a.listeners).toBeLessThanOrEqual(2);
    expect(b.nodes - a.nodes).toBeLessThanOrEqual(40);
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

  test("the still office is not redrawn every frame; a character who starts talking is", async ({ page }) => {
    await open(page);
    await settled(page);
    expect(await drawsOver(page, 120)).toBe(0);
    await agent(page, "nova").click();
    await expect(root(page)).toHaveAttribute("data-selected", "nova");
    await expect.poll(() => drawsOver(page, 60), { timeout: 10_000 }).toBeGreaterThan(0);
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

  test("the seven-agent roster and the camera controls are large enough to tap @mobile", async ({ page }) => {
    // The chip roster is the phone and tablet layout; wide screens list the agents in the side panel.
    test.skip((page.viewportSize()?.width ?? 0) >= 1024, "phone and tablet layout only");
    await open(page);
    for (const id of AGENTS) {
      const chip = page.getByTestId(`hq-chip-${id}`);
      const b = (await chip.boundingBox())!;
      expect(b.width, id).toBeGreaterThanOrEqual(44);
      expect(b.height, id).toBeGreaterThanOrEqual(44);
    }
    for (const name of ["Zoom in", "Zoom out", "Reset view"]) {
      const b = (await page.getByRole("button", { name }).boundingBox())!;
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByTestId("hq-chip-echo").tap();
    await expect(root(page)).toHaveAttribute("data-selected", "echo");
    await expect(page.getByTestId("hq-panel")).toContainText("ECHO");
    await page.getByRole("button", { name: "Reset view" }).tap();
    await expect(root(page)).toHaveAttribute("data-selected", "");
    await page.getByRole("button", { name: "Zoom in" }).tap();
    await expect.poll(async () => Number(await root(page).getAttribute("data-zoom"))).toBeGreaterThan(1.4);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
});
