import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";

const EVENT_QR_URL = "https://lohithkovuri.store/event?source=ai-event";
const SCENES = ["welcome", "design", "engineering", "pipelinemedic", "performance", "testing", "closing"];
// Errors that only happen off Vercel (the analytics script is served by the platform).
const IGNORED_CONSOLE = [/_vercel\/insights/, /Failed to load resource.*404/];

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !IGNORED_CONSOLE.some((re) => re.test(msg.text()))) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

const dialog = (page: Page) => page.getByRole("dialog", { name: "45-second AI experience" });

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

/** Records every scene the dialog shows, in order, until the run completes. */
async function watchRun(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __scenes: string[]; __sceneTimes: number[] };
    w.__scenes = [];
    w.__sceneTimes = [];
    const tick = () => {
      const el = document.querySelector('[role="dialog"][data-scene]');
      const scene = el?.getAttribute("data-scene");
      const status = el?.getAttribute("data-status");
      if (scene && status !== "preparing" && w.__scenes[w.__scenes.length - 1] !== scene) {
        w.__scenes.push(scene);
        w.__sceneTimes.push(Math.round(performance.now()));
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
  await expect(dialog(page)).toHaveAttribute("data-status", "completed", { timeout: 75_000 });
  const { scenes, times } = await page.evaluate(() => {
    const w = window as unknown as { __scenes: string[]; __sceneTimes: number[] };
    return { scenes: w.__scenes, times: w.__sceneTimes };
  });
  console.log(`scene starts (ms from first): ${times.map((t) => t - times[0]).join(", ")}`);
  const runtime = Number(await dialog(page).getAttribute("data-runtime-ms"));
  return { scenes, runtime };
}

test.describe("event landing", () => {
  test("shows identity, CTAs and working contact links without starting audio @mobile", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const audioRequests: string[] = [];
    page.on("request", (r) => r.url().includes("/audio/") && audioRequests.push(r.url()));
    await page.goto("/event?source=ai-event");

    await expect(page.getByRole("heading", { level: 1, name: "Lohith Kovuri" })).toBeVisible();
    await expect(page.getByText("Applied AI & Data Engineering").first()).toBeVisible();
    const start = page.getByRole("button", { name: "Start 45-Second AI Experience" });
    await expect(start).toBeVisible();
    await expect(start).toBeInViewport();
    await expect(page.getByRole("button", { name: "Watch Without Sound" })).toBeVisible();

    await expect(page.getByRole("link", { name: "View Resume" }).first()).toHaveAttribute("href", "/Lohith_Kovuri_Resume.pdf");
    await expect(page.getByRole("link", { name: "GitHub" }).first()).toHaveAttribute("href", "https://github.com/LOHITHK22");
    await expect(page.getByRole("link", { name: "LinkedIn" }).first()).toHaveAttribute("href", "https://linkedin.com/in/contact-lohithkovuri");
    await expect(page.getByRole("link", { name: "Contact" }).first()).toHaveAttribute("href", "mailto:lohithkovuri321@gmail.com");

    for (const path of ["/Lohith_Kovuri_Resume.pdf", "/event/lohith-kovuri.vcf", "/event/qr-event.svg", "/event/emergency.html"]) {
      const res = await page.request.get(path);
      expect(res.status(), path).toBe(200);
    }

    await noHorizontalOverflow(page);
    await page.waitForTimeout(500);
    expect(audioRequests, "no audio before the visitor opts in").toEqual([]);
    expect(errors).toEqual([]);
  });

  test("tablet layout has no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto("/event");
    await noHorizontalOverflow(page);
  });

  test("kiosk mode shows the QR code and full-screen control", async ({ page }) => {
    await page.goto("/event?kiosk=true");
    await expect(page.getByAltText("QR code linking to lohithkovuri.store/event").first()).toBeInViewport();
    await expect(page.getByRole("button", { name: "Full screen" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Projects" })).toHaveCount(0);
  });
});

test.describe("presentation", () => {
  test("silent run plays all seven scenes in order in about 43-47 s with no audio requests", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const audioRequests: string[] = [];
    page.on("request", (r) => r.url().includes("/audio/") && audioRequests.push(r.url()));
    await page.goto("/event");
    await page.getByRole("button", { name: "Watch Without Sound" }).click();
    const { scenes, runtime } = await watchRun(page);
    console.log(`silent runtime: ${runtime} ms`);
    expect(scenes).toEqual(SCENES);
    expect(runtime).toBeGreaterThanOrEqual(43_000);
    expect(runtime).toBeLessThanOrEqual(47_500);
    expect(audioRequests).toEqual([]);
    // Closing screen stays up with its actions.
    await page.waitForTimeout(1500);
    await expect(dialog(page)).toHaveAttribute("data-status", "completed");
    await expect(page.getByRole("button", { name: "Explore Projects" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Connect on LinkedIn" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("narrated run plays each clip once, never overlaps, and makes no requests mid-show", async ({ page }) => {
    await page.addInitScript(() => {
      // Narration runs through Web Audio: count concurrently playing sources.
      const w = window as unknown as { __audio: { playing: number; max: number; clips: number[]; ended: number } };
      w.__audio = { playing: 0, max: 0, clips: [], ended: 0 };
      const origStart = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args: Parameters<AudioBufferSourceNode["start"]>) {
        w.__audio.playing++;
        w.__audio.max = Math.max(w.__audio.max, w.__audio.playing);
        w.__audio.clips.push(Math.round((this.buffer?.duration ?? 0) * 1000));
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          w.__audio.playing--;
        };
        this.addEventListener("ended", () => {
          w.__audio.ended++;
          finish();
        });
        const origStop = this.stop.bind(this);
        this.stop = (...a: Parameters<AudioBufferSourceNode["stop"]>) => {
          finish();
          return origStop(...a);
        };
        return origStart.apply(this, args);
      };
    });
    const errors = collectConsoleErrors(page);
    await page.goto("/event");
    const lateRequests: string[] = [];
    await page.getByRole("button", { name: "Start 45-Second AI Experience" }).click();
    await expect(dialog(page)).toHaveAttribute("data-status", "playing", { timeout: 15_000 });
    page.on("request", (r) => lateRequests.push(r.url()));
    const { scenes, runtime } = await watchRun(page);
    console.log(`narrated runtime: ${runtime} ms`);
    const audio = await page.evaluate(() => (window as unknown as { __audio: { max: number; clips: number[]; ended: number } }).__audio);
    console.log(`clips played: ${audio.clips.join(", ")} ms, ended: ${audio.ended}, max concurrent: ${audio.max}`);

    expect(scenes).toEqual(SCENES);
    expect(runtime).toBeGreaterThanOrEqual(43_000);
    expect(runtime).toBeLessThanOrEqual(47_500);
    expect(audio.max).toBe(1);
    expect(audio.clips).toHaveLength(7);
    expect(new Set(audio.clips).size).toBe(7);
    expect(audio.ended).toBeGreaterThanOrEqual(7);
    // The browser may fetch the tab icon (favicon / Next.js app/icon.svg) at any time; that is not app traffic.
    expect(lateRequests.filter((u) => !/_vercel|favicon|\/icon\.svg/.test(u))).toEqual([]);
    await expect(page.getByText(/Audio unavailable/)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("controls: pause holds time, rapid skipping is safe, restart, captions, mute, escape", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/event");
    const start = page.getByRole("button", { name: "Start 45-Second AI Experience" });
    await start.focus();
    await start.click();
    await expect(dialog(page)).toHaveAttribute("data-status", "playing", { timeout: 15_000 });
    await page.waitForTimeout(1200);

    await page.getByRole("button", { name: "Pause" }).click();
    await expect(dialog(page)).toHaveAttribute("data-status", "paused");
    const caption1 = await page.getByTestId("caption").innerText();
    await page.waitForTimeout(1500);
    await expect(dialog(page)).toHaveAttribute("data-scene", "welcome");
    expect(await page.getByTestId("caption").innerText()).toBe(caption1);
    await page.getByRole("button", { name: "Resume" }).click();
    await expect(dialog(page)).toHaveAttribute("data-status", "playing");

    const next = page.getByRole("button", { name: "Next scene" });
    for (let i = 0; i < 4; i++) await next.click({ delay: 0 });
    await expect(dialog(page)).toHaveAttribute("data-scene", "performance");
    await page.getByRole("button", { name: "Previous scene" }).click();
    await expect(dialog(page)).toHaveAttribute("data-scene", "pipelinemedic");
    await expect(page.getByText("Recorded Architecture Walkthrough · Simulated Incident")).toBeVisible();

    // Hammer Next/Prev; the show must land on a valid scene and keep playing.
    for (let i = 0; i < 8; i++) await page.getByRole("button", { name: i % 2 ? "Previous scene" : "Next scene" }).click({ delay: 0 });
    await expect(dialog(page)).toHaveAttribute("data-scene", "pipelinemedic");
    await expect(dialog(page)).toHaveAttribute("data-status", "playing");

    await page.getByRole("button", { name: "Restart" }).click();
    await expect(dialog(page)).toHaveAttribute("data-scene", "welcome", { timeout: 15_000 });
    await expect(dialog(page)).toHaveAttribute("data-status", "playing");

    const mute = page.getByRole("button", { name: "Mute" });
    await mute.click();
    await expect(page.getByRole("button", { name: "Unmute" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Hide captions" }).click();
    await expect(page.getByTestId("caption")).toHaveCount(0);
    await page.keyboard.press("c");
    await expect(page.getByTestId("caption")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(start).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    expect(errors).toEqual([]);
  });

  test("falls back to captions when audio files fail to load", async ({ page }) => {
    await page.route("**/audio/event/**", (route) => route.abort());
    await page.goto("/event");
    await page.getByRole("button", { name: "Start 45-Second AI Experience" }).click();
    await expect(dialog(page)).toHaveAttribute("data-status", "playing", { timeout: 15_000 });
    await expect(page.getByText("Silent mode · captions")).toBeVisible();
    await expect(dialog(page)).toHaveAttribute("data-scene", "design", { timeout: 12_000 });
  });

  test("escape while audio is still loading cancels the run for good", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __starts: number }).__starts = 0;
      const orig = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof orig>) {
        (window as unknown as { __starts: number }).__starts++;
        return orig.apply(this, args);
      };
    });
    // Hold every clip for 2 s so the show is guaranteed to be "preparing".
    await page.route("**/audio/event/**", async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });
    await page.goto("/event");
    const start = page.getByRole("button", { name: "Start 45-Second AI Experience" });
    await start.click();
    await expect(dialog(page)).toHaveAttribute("data-status", "preparing");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await page.waitForTimeout(4000);
    await expect(dialog(page)).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __starts: number }).__starts)).toBe(0);
  });

  test("partial audio failure keeps the show moving with a notice", async ({ page }) => {
    await page.route("**/audio/event/02-nova.mp3", (route) => route.abort());
    await page.goto("/event");
    await page.getByRole("button", { name: "Start 45-Second AI Experience" }).click();
    await expect(page.getByText(/Audio unavailable for 1 scene/)).toBeVisible({ timeout: 15_000 });
    await expect(dialog(page)).toHaveAttribute("data-scene", "engineering", { timeout: 20_000 });
  });

  test("reduced motion: still completes, with short handoffs", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/event");
    await page.getByRole("button", { name: "Watch Without Sound" }).click();
    const { scenes, runtime } = await watchRun(page);
    console.log(`reduced-motion runtime: ${runtime} ms`);
    expect(scenes).toEqual(SCENES);
    expect(runtime).toBeLessThanOrEqual(47_500);
  });
});

test.describe("no external dependencies", () => {
  test("landing and a narrated scene make no requests to other hosts", async ({ page, baseURL }) => {
    const external: string[] = [];
    const origin = new URL(baseURL!).origin;
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (!["blob:", "data:"].includes(u.protocol) && u.origin !== origin) external.push(r.url());
    });
    await page.goto("/event");
    await page.getByRole("button", { name: "Start 45-Second AI Experience" }).click();
    await expect(dialog(page)).toHaveAttribute("data-scene", "design", { timeout: 15_000 });
    expect(external).toEqual([]);
  });
});

test.describe("architecture", () => {
  test("nodes are clickable and tool exposure toggles between 10 and 17", async ({ page }) => {
    await page.goto("/event#architecture");
    await page.getByRole("button", { name: /Policy Gateway/ }).click();
    await expect(page.getByRole("heading", { name: "Policy Gateway" })).toBeVisible();
    await expect(page.getByText("APPROVAL_REQUIRED").first()).toBeVisible();
    await page.getByRole("button", { name: /MCP Server/ }).click();
    await expect(page.getByText(/SHA-256 of the exact arguments/)).toBeVisible();
    await expect(page.getByText(/Only the 10 read-only diagnostics are listed/)).toBeVisible();
    await page.getByRole("radio", { name: "MCP_ALLOW_STATE_CHANGING_TOOLS=true" }).click();
    await expect(page.getByText(/All 17 executable tools are listed/)).toBeVisible();
  });
});

test.describe("networking assets", () => {
  test("QR PNGs decode to the event URL and the vCard is valid", async ({ request }) => {
    for (const file of ["qr-event.png", "qr-event-print.png"]) {
      const png = PNG.sync.read(readFileSync(join(process.cwd(), "public", "event", file)));
      const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
      expect(decoded?.data, file).toBe(EVENT_QR_URL);
    }
    const vcf = await (await request.get("/event/lohith-kovuri.vcf")).text();
    expect(vcf).toContain("BEGIN:VCARD");
    expect(vcf).toContain("FN:Lohith Kovuri");
    expect(vcf).toContain("EMAIL;TYPE=INTERNET:lohithkovuri321@gmail.com");
  });

  test("emergency fallback works with JavaScript disabled", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("/event/emergency.html");
    await expect(page.getByRole("heading", { level: 1, name: "Lohith Kovuri" })).toBeVisible();
    await expect(page.getByRole("img", { name: /PipelineMedic flow/ })).toBeVisible();
    const imgOk = await page.evaluate(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0));
    expect(imgOk).toBe(true);
    await ctx.close();
  });
});

test.describe("offline", () => {
  test("Prepare for Offline Demo caches the show and it plays with the network off", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto("/event");
    await page.getByRole("button", { name: "Prepare for Offline Demo" }).click();
    await expect(page.getByText(/Offline Demo Ready · \d+ files verified/)).toBeVisible({ timeout: 60_000 });

    await ctx.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Lohith Kovuri" })).toBeVisible();
    const portraitOk = await page.evaluate(() => {
      const img = document.querySelector<HTMLImageElement>('img[alt="Portrait of Lohith Kovuri"]');
      return !!img && img.complete && img.naturalWidth > 0;
    });
    expect(portraitOk).toBe(true);
    const styled = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(styled).not.toBe("rgba(0, 0, 0, 0)");

    await page.getByRole("button", { name: "Start 45-Second AI Experience" }).click();
    await expect(dialog(page)).toHaveAttribute("data-status", "playing", { timeout: 15_000 });
    await expect(page.getByText(/Audio unavailable|Silent mode/)).toHaveCount(0);
    await expect(dialog(page)).toHaveAttribute("data-scene", "design", { timeout: 12_000 });

    // Kiosk page and emergency fallback were cached too.
    await page.goto("/event?kiosk=true");
    await expect(page.getByRole("button", { name: "Full screen" })).toBeVisible();
    await page.goto("/event/emergency.html");
    await expect(page.getByRole("heading", { level: 1, name: "Lohith Kovuri" })).toBeVisible();

    // Next.js link prefetches fail while offline; that is expected and harmless.
    expect(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch RSC payload/.test(e))).toEqual([]);
    await ctx.close();
  });
});

test.describe("existing pages still work", () => {
  test("home, career fair mode, recruiter page and a case study render", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto("/?careerfair=true");
    await expect(page.getByText("Career Fair Mode")).toBeVisible();
    await page.goto("/recruiter");
    await expect(page.locator("main, body").first()).toContainText("Lohith");
    await page.goto("/projects/pipelinemedic-ai");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("PipelineMedic");
    expect(errors).toEqual([]);
  });
});
