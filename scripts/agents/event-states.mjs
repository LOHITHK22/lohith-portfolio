// PRISM: the reachable states of /event, captured at four viewports.
//
// States: landing, narrated demo playing, demo paused, MCP architecture
// expanded, contact + QR section, and (phone/tablet) the header navigation.
// Each state is reached the way a visitor would (clicks, scrolling) and gets a
// screenshot plus a layout audit of what is on screen: tap targets, small
// text, overlapping controls, text contrast, horizontal overflow and (landing)
// cumulative layout shift. Screenshots are taken with animations disabled and
// are only compared region by region; nothing asserts exact pixels.
//
// A state that cannot be reached is recorded as an error, never skipped
// silently: on the live site that is a broken demo, on a PR build a regression.
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./lib.mjs";

export const STATE_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
export const EVENT_STATES = ["landing", "contact-qr", "mcp-expanded", "mobile-nav", "demo-playing", "demo-paused"];
const TOUCH_MAX_WIDTH = 1024; // tap-target and mobile-nav checks apply below this width

// ------------------------------------------------------------ pure analysis

/** "rgb(1, 2, 3)" / "rgba(1, 2, 3, 0.5)" → [r, g, b, a]; null for anything else. */
export function parseColor(s) {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(String(s ?? "").trim());
  if (!m) return null;
  const a = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return [Number(m[1]), Number(m[2]), Number(m[3]), a];
}

const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG contrast ratio of a foreground (alpha-blended) over an opaque background. */
export function contrastRatio(fg, bg) {
  const [r, g, b, a] = fg;
  const blended = [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a)];
  const [l1, l2] = [luminance(blended), luminance(bg)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
}

/** WCAG AA: 3:1 for large text (≥24px, or ≥18.66px bold), 4.5:1 otherwise. */
export const requiredContrast = (px, weight) => (px >= 24 || (px >= 18.66 && weight >= 700) ? 3 : 4.5);

/** Turns the raw on-screen data collected in the browser into audit findings. */
export function analyzeState(raw, { minTapTargetPx, minFontPx }, { touch }) {
  const controls = raw.controls ?? [];
  const smallTargets = touch
    ? controls.filter((c) => c.w < minTapTargetPx || c.h < minTapTargetPx).map(({ label, w, h }) => ({ label, w, h }))
    : [];
  const overlaps = [];
  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i];
      const b = controls[j];
      if (a.contains?.includes(j) || b.contains?.includes(i)) continue;
      // Compare line boxes, so a link that wraps onto two lines is not mistaken
      // for one wide box covering its neighbours.
      let px = 0;
      for (const p of a.boxes ?? [a])
        for (const q of b.boxes ?? [b]) {
          const w = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
          const h = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
          if (w > 4 && h > 4) px += w * h;
        }
      if (px) overlaps.push({ a: a.label, b: b.label, px: Math.round(px) });
    }
  }
  const smallText = [];
  const lowContrast = [];
  let contrastChecked = 0;
  for (const t of raw.texts ?? []) {
    if (t.px < minFontPx) smallText.push({ text: t.text, px: t.px });
    const fg = parseColor(t.fg);
    const bg = parseColor(t.bg);
    if (!fg || !bg) continue; // background is an image/gradient or unknown: not judged
    contrastChecked++;
    const ratio = contrastRatio(fg, bg);
    const need = requiredContrast(t.px, t.weight);
    if (ratio < need) lowContrast.push({ text: t.text, px: t.px, ratio, need });
  }
  return {
    overflowX: raw.overflowX ?? 0,
    cls: raw.cls ?? null,
    controls: controls.length,
    smallTargetCount: smallTargets.length,
    smallTargets: smallTargets.slice(0, 40),
    smallTextCount: smallText.length,
    smallText: smallText.slice(0, 40),
    overlapCount: overlaps.length,
    overlaps: overlaps.slice(0, 20),
    contrastChecked,
    lowContrastCount: lowContrast.length,
    lowContrast: lowContrast.slice(0, 20),
  };
}

// ------------------------------------------------------------ in-browser collection

/** Runs in the page: visible controls and text inside `scope` that are on screen. */
const COLLECT = ({ scope }) => {
  const root = (scope && document.querySelector(scope)) || document.body;
  const hidden = (el) => {
    if (el.closest('[aria-hidden="true"], [inert]')) return true;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return true;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || (r.width <= 1 && r.height <= 1)) return true;
    return r.top + scrollY + r.height <= 0 || r.left + scrollX + r.width <= 0;
  };
  const onScreen = (r) => r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  const label = (el) => (el.getAttribute("aria-label") || el.textContent || el.getAttribute("href") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 50);

  const els = [...root.querySelectorAll("a[href], button, [role=button], [role=link], [role=radio], input:not([type=hidden]), select, textarea, summary")].filter(
    (el) => !hidden(el) && onScreen(el.getBoundingClientRect())
  );
  const controls = els.map((el) => {
    const r = el.getBoundingClientRect();
    return {
      label: label(el),
      x: Math.round(r.left),
      y: Math.round(r.top),
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      boxes: [...el.getClientRects()].map((b) => ({ x: b.left, y: b.top, w: b.width, h: b.height })),
      contains: els.map((o, j) => (o !== el && el.contains(o) ? j : -1)).filter((j) => j >= 0),
    };
  });

  const background = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== "none") return null;
      const m = /rgba?\(([^)]+)\)/.exec(s.backgroundColor);
      if (m) {
        const parts = m[1].split(/[,\s/]+/).filter(Boolean);
        const a = parts[3] == null ? 1 : parseFloat(parts[3]);
        if (a >= 0.95) return s.backgroundColor;
        if (a > 0.05) return null; // translucent layer over something unknown: not judged
      }
    }
    return getComputedStyle(document.body).backgroundColor;
  };
  const texts = [];
  const seen = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement;
    const text = walker.currentNode.textContent.trim();
    if (!el || !text || seen.has(el) || hidden(el)) continue;
    seen.add(el);
    if (!onScreen(el.getBoundingClientRect())) continue;
    const s = getComputedStyle(el);
    if (parseFloat(s.opacity) === 0) continue;
    texts.push({ text: text.slice(0, 40), px: parseFloat(s.fontSize), weight: Number(s.fontWeight) || 400, fg: s.color, bg: background(el) });
  }
  return { overflowX: Math.max(0, document.documentElement.scrollWidth - innerWidth), controls, texts };
};

// ------------------------------------------------------------ capture

function loadChromium() {
  return createRequire(path.join(ROOT, "package.json"))("@playwright/test").chromium;
}

/** Captures every reachable /event state at every viewport on `site`. */
export async function captureEventStates({ site, thresholds, viewports = STATE_VIEWPORTS, channel = process.env.PW_CHANNEL || "chrome" }) {
  const chromium = loadChromium();
  const browser = await chromium.launch({ channel });
  const out = [];
  try {
    for (const vp of viewports) {
      const touch = vp.width < TOUCH_MAX_WIDTH;
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, reducedMotion: "reduce", isMobile: touch, hasTouch: touch });
      await ctx.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
        }).observe({ type: "layout-shift", buffered: true });
      });
      const page = await ctx.newPage();
      const shot = async (state, scope, extra = {}) => {
        await page.waitForTimeout(400);
        const png = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
        const raw = await page.evaluate(COLLECT, { scope });
        out.push({ id: `${state}-${vp.width}x${vp.height}`, state, path: "/event", width: vp.width, height: vp.height, ok: true, png, audit: analyzeState({ ...raw, ...extra }, thresholds, { touch }) });
      };
      const attempt = async (state, fn) => {
        try {
          await fn();
        } catch (e) {
          out.push({ id: `${state}-${vp.width}x${vp.height}`, state, path: "/event", width: vp.width, height: vp.height, ok: false, error: String(e.message ?? e).split("\n")[0].slice(0, 200) });
        }
      };
      const scrollTo = (sel) => page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "start", behavior: "instant" }), sel);

      await attempt("landing", async () => {
        await page.goto(`${site}/event`, { waitUntil: "networkidle", timeout: 60_000 });
        await page.waitForTimeout(1200);
        const cls = await page.evaluate(() => Math.round(window.__cls * 1000) / 1000);
        await shot("landing", null, { cls });
      });
      await attempt("contact-qr", async () => {
        await scrollTo("#connect");
        await page.getByAltText(/QR code/).first().waitFor({ state: "visible", timeout: 10_000 });
        await shot("contact-qr", "#connect");
      });
      await attempt("mcp-expanded", async () => {
        await scrollTo("#architecture");
        await page.getByRole("button", { name: /MCP Server/ }).first().click();
        await page.getByRole("radio", { name: "MCP_ALLOW_STATE_CHANGING_TOOLS=true" }).click();
        const detail = page.getByText(/All 17 executable tools are listed/);
        await detail.waitFor({ state: "visible", timeout: 10_000 });
        await detail.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
        await shot("mcp-expanded", "#architecture");
      });
      if (touch)
        await attempt("mobile-nav", async () => {
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
          const nav = page.getByRole("navigation", { name: "Event page" });
          await nav.waitFor({ state: "visible", timeout: 10_000 });
          // Every in-page nav link must point at a section that exists.
          const broken = await nav.evaluate((n) =>
            [...n.querySelectorAll('a[href^="#"]')].filter((a) => getComputedStyle(a).display !== "none" && !document.querySelector(a.getAttribute("href"))).map((a) => a.getAttribute("href"))
          );
          if (broken.length) throw new Error(`nav links point at missing sections: ${broken.join(", ")}`);
          await shot("mobile-nav", "header");
        });
      await attempt("demo-playing", async () => {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        await page.getByRole("button", { name: "Start 45-Second AI Experience" }).click();
        const dialog = page.getByRole("dialog", { name: "45-second AI experience" });
        await dialog.and(page.locator('[data-status="playing"]')).waitFor({ timeout: 20_000 });
        await page.waitForTimeout(1200);
        await shot("demo-playing", '[role="dialog"]');
      });
      await attempt("demo-paused", async () => {
        await page.getByRole("button", { name: "Pause" }).click();
        await page.locator('[role="dialog"][data-status="paused"]').waitFor({ timeout: 10_000 });
        await shot("demo-paused", '[role="dialog"]');
        await page.keyboard.press("Escape");
      });
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return out;
}
