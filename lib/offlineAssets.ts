import { eventScenes } from "@/data/eventTour";
import { profile } from "@/data/profile";

export const OFFLINE_CACHE = "lohith-event-offline-v1";

/** Static assets the presentation needs, independent of the build hash. */
export const STATIC_EVENT_ASSETS = [
  "/event",
  "/event?kiosk=true",
  "/event/emergency.html",
  "/event/qr-event.svg",
  "/event/qr-event.png",
  "/event/lohith-kovuri.vcf",
  profile.portrait.src,
  profile.heroPortrait.src,
  profile.resumeUrl,
  ...eventScenes.map((s) => s.audioFile),
];

/**
 * Every same-origin script, stylesheet, and font this page actually loaded
 * (all live under /_next/static, with hashed names). Read from the DOM and
 * the Resource Timing buffer so lazily loaded chunks are included too.
 */
export function collectBuildAssets(): string[] {
  const urls = new Set<string>();
  const add = (raw: string | null | undefined) => {
    if (!raw) return;
    try {
      const u = new URL(raw, window.location.href);
      if (u.origin === window.location.origin && u.pathname.startsWith("/_next/static/")) urls.add(u.pathname + u.search);
    } catch {
      /* ignore malformed */
    }
  };
  document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((s) => add(s.src));
  document.querySelectorAll<HTMLLinkElement>("link[href]").forEach((l) => add(l.href));
  performance.getEntriesByType("resource").forEach((e) => add(e.name));
  return Array.from(urls);
}

export type OfflineCheck = { ok: boolean; total: number; missing: string[] };

/** Confirms every URL is really in Cache Storage (does not trust the worker's report). */
export async function verifyOfflineCache(urls: string[]): Promise<OfflineCheck> {
  if (!("caches" in window)) return { ok: false, total: urls.length, missing: urls };
  const cache = await caches.open(OFFLINE_CACHE);
  const missing: string[] = [];
  for (const url of urls) {
    const hit = await cache.match(url);
    if (!hit) missing.push(url);
  }
  return { ok: missing.length === 0, total: urls.length, missing };
}

/** Registers the worker, asks it to cache everything, then verifies the cache. */
export async function prepareOfflineDemo(): Promise<OfflineCheck> {
  if (!("serviceWorker" in navigator)) throw new Error("This browser does not support service workers.");
  const urls = Array.from(new Set([...STATIC_EVENT_ASSETS, ...collectBuildAssets()]));
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const reg = await navigator.serviceWorker.ready;
  const worker = reg.active;
  if (!worker) throw new Error("Service worker did not activate.");

  const cachedUrls = await new Promise<string[]>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      reject(new Error("Timed out while caching assets."));
    }, 60000);
    function onMessage(e: MessageEvent) {
      if (e.data?.type !== "PREPARED") return;
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("message", onMessage);
      if (e.data.failed?.length) reject(new Error(`${e.data.failed.length} files could not be cached. The previous offline copy (if any) was kept.`));
      else resolve(e.data.urls as string[]);
    }
    navigator.serviceWorker.addEventListener("message", onMessage);
    worker.postMessage({ type: "PREPARE", urls });
  });

  // Includes the chunks the worker found in the cached HTML itself.
  const check = await verifyOfflineCache(cachedUrls);
  try {
    localStorage.setItem("event-offline-urls", JSON.stringify(cachedUrls));
  } catch {
    /* storage unavailable; status just won't persist across reloads */
  }
  return check;
}

/** Re-verifies a previous preparation on page load. */
export async function checkExistingOfflineCache(): Promise<OfflineCheck | null> {
  try {
    const raw = localStorage.getItem("event-offline-urls");
    if (!raw || !("caches" in window)) return null;
    // Also require this page's own build files: after a deploy they differ,
    // and the old offline copy must be re-prepared rather than shown as ready.
    const urls = Array.from(new Set([...(JSON.parse(raw) as string[]), ...collectBuildAssets()]));
    return await verifyOfflineCache(urls);
  } catch {
    return null;
  }
}
