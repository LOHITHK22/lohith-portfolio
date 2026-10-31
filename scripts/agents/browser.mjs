// Real-browser checks against the live site, shared by SENTINEL (interaction
// smoke test) and PULSE (measured timings + basic accessibility audit).
// Uses the Playwright already in devDependencies; nothing is installed at run time.
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./lib.mjs";

function loadChromium() {
  const require = createRequire(path.join(ROOT, "package.json"));
  return require("@playwright/test").chromium;
}

const A11Y_AUDIT = () => {
  const issues = [];
  const name = (el) => (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim();
  if (!document.documentElement.lang) issues.push("html element has no lang attribute");
  document.querySelectorAll("img").forEach((img) => {
    if (!img.hasAttribute("alt")) issues.push(`img without alt: ${img.getAttribute("src")?.slice(0, 60)}`);
  });
  document.querySelectorAll("button, a[href]").forEach((el) => {
    if (!name(el) && !el.querySelector("img[alt]:not([alt=''])") && el.getAttribute("aria-hidden") !== "true")
      issues.push(`${el.tagName.toLowerCase()} without an accessible name: ${el.outerHTML.slice(0, 80)}`);
  });
  if (document.querySelectorAll("h1").length !== 1) issues.push(`expected exactly one h1, found ${document.querySelectorAll("h1").length}`);
  const ids = {};
  document.querySelectorAll("[id]").forEach((el) => (ids[el.id] = (ids[el.id] ?? 0) + 1));
  Object.entries(ids).filter(([, n]) => n > 1).forEach(([id]) => issues.push(`duplicate id: ${id}`));
  return [...new Set(issues)].slice(0, 25);
};

export async function measurePages({ site, pages, samples, channel = process.env.PW_CHANNEL || "chrome" }) {
  const chromium = loadChromium();
  const browser = await chromium.launch({ channel });
  const out = [];
  try {
    for (const p of pages) {
      const runs = [];
      let audit = [];
      for (let i = 0; i < samples; i++) {
        const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
        const page = await ctx.newPage();
        await page.addInitScript(() => {
          window.__lcp = 0;
          window.__cls = 0;
          new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: "layout-shift", buffered: true });
        });
        await page.goto(`${site}${p}?pulse=${Date.now()}`, { waitUntil: "load", timeout: 60_000 });
        await page.waitForTimeout(2500);
        const m = await page.evaluate(() => {
          const nav = performance.getEntriesByType("navigation")[0];
          const fcp = performance.getEntriesByName("first-contentful-paint")[0];
          const bytes = performance.getEntriesByType("resource").reduce((n, r) => n + (r.transferSize || 0), nav?.transferSize || 0);
          return { ttfb: nav ? nav.responseStart : null, fcp: fcp ? fcp.startTime : null, lcp: window.__lcp || null, cls: window.__cls, load: nav ? nav.loadEventEnd : null, transferKB: Math.round(bytes / 1024) };
        });
        if (i === 0) audit = await page.evaluate(A11Y_AUDIT);
        runs.push(m);
        await ctx.close();
      }
      const med = (k) => {
        const v = runs.map((r) => r[k]).filter((x) => typeof x === "number").sort((a, b) => a - b);
        return v.length ? Math.round(v[Math.floor(v.length / 2)] * (k === "cls" ? 1000 : 1)) / (k === "cls" ? 1000 : 1) : null;
      };
      out.push({ page: p, samples: runs.length, ttfb: med("ttfb"), fcp: med("fcp"), lcp: med("lcp"), cls: med("cls"), load: med("load"), transferKB: med("transferKB"), a11y: audit });
    }
  } finally {
    await browser.close();
  }
  return out;
}

export async function smokeTest({ site, channel = process.env.PW_CHANNEL || "chrome" }) {
  const chromium = loadChromium();
  const browser = await chromium.launch({ channel });
  const checks = [];
  const check = async (name, fn) => {
    try {
      await fn();
      checks.push({ name, ok: true });
    } catch (e) {
      checks.push({ name, ok: false, reason: String(e.message ?? e).split("\n")[0].slice(0, 300) });
    }
  };
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await check("homepage renders headline and Launch CTA", async () => {
      await page.goto(site + "/", { waitUntil: "load", timeout: 60_000 });
      await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 15_000 });
      await page.getByRole("link", { name: /Launch AI Experience/ }).first().waitFor({ timeout: 15_000 });
    });
    await check("AI team overlay opens", async () => {
      await page.locator("header").getByRole("button", { name: /ai team/i }).first().click();
      await page.getByRole("dialog").first().waitFor({ timeout: 10_000 });
      await page.keyboard.press("Escape");
    });
    await check("Event Mode landing shows start button", async () => {
      await page.goto(site + "/event", { waitUntil: "load", timeout: 60_000 });
      await page.getByRole("button", { name: /Start 45-Second AI Experience/ }).waitFor({ timeout: 15_000 });
    });
    await check("no uncaught page errors", async () => {
      if (errors.length) throw new Error(errors.slice(0, 2).join(" | "));
    });
  } finally {
    await browser.close();
  }
  return { checks };
}

// ---------- PRISM: screenshots + layout/readability audit ----------

const LAYOUT_AUDIT = ({ minTap, minFont }) => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && r.bottom > 0 && r.top < innerHeight * 3;
  };
  const label = (el) => (el.getAttribute("aria-label") || el.textContent || el.getAttribute("href") || "").trim().replace(/\s+/g, " ").slice(0, 50);
  const smallTargets = [];
  document.querySelectorAll("a[href], button, [role=button], input, select").forEach((el) => {
    if (!visible(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < minTap || r.height < minTap) smallTargets.push({ label: label(el), w: Math.round(r.width), h: Math.round(r.height) });
  });
  const smallText = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement;
    if (!el || seen.has(el) || !walker.currentNode.textContent.trim() || !visible(el)) continue;
    seen.add(el);
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < minFont) smallText.push({ text: walker.currentNode.textContent.trim().slice(0, 40), px: size });
  }
  const upscaled = [...document.images]
    .filter((img) => visible(img) && img.naturalWidth)
    .map((img) => ({ src: (img.currentSrc || img.src).replace(location.origin, ""), natural: img.naturalWidth, rendered: Math.round(img.getBoundingClientRect().width * devicePixelRatio) }))
    .filter((i) => i.rendered > i.natural * 1.15);
  return {
    overflowX: document.documentElement.scrollWidth - innerWidth,
    smallTargets: smallTargets.slice(0, 40),
    smallTargetCount: smallTargets.length,
    smallText: smallText.slice(0, 40),
    smallTextCount: smallText.length,
    upscaled,
  };
};

/** Capture each configured screen and audit its layout. Returns PNG buffers + audit data. */
export async function captureScreens({ site, screens, thresholds, channel = process.env.PW_CHANNEL || "chrome" }) {
  const chromium = loadChromium();
  const browser = await chromium.launch({ channel });
  const out = [];
  try {
    for (const s of screens) {
      const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      await page.goto(`${site}${s.path}`, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(1500);
      const png = await page.screenshot({ type: "png" });
      const audit = await page.evaluate(LAYOUT_AUDIT, { minTap: thresholds.minTapTargetPx, minFont: thresholds.minFontPx });
      out.push({ ...s, png, audit });
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return out;
}
