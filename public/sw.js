/*
 * Offline support for the /event presentation only.
 *
 * Registered only when someone presses "Prepare for Offline Demo". It never
 * caches API responses and ignores every request outside the event's assets.
 *
 * Build safety: preparing fetches the /event HTML first, extracts every
 * /_next/static URL it references, and caches HTML + chunks together into a
 * staging cache that replaces the live cache only if every file succeeded.
 * Cached HTML is never refreshed on its own, so a later online visit after a
 * deploy can't pair new HTML with old chunks. A failed re-prepare leaves the
 * previous working copy untouched.
 */
const CACHE = "lohith-event-offline-v1";
const STAGING = CACHE + "-staging";
const NAV_TIMEOUT_MS = 3000;

const isEventPage = (url) => url.pathname === "/event";
const isManagedAsset = (url) =>
  url.pathname.startsWith("/event/") ||
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/audio/event/") ||
  url.pathname.startsWith("/images/") ||
  url.pathname.endsWith(".pdf");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "PREPARE") {
    event.waitUntil(prepare(event.data.urls || [], event.source));
  }
});

const STATIC_RE = /\/_next\/static\/[^"'\\\s)]+/g;

async function prepare(urls, client) {
  const failed = [];
  const all = new Set(urls);
  await caches.delete(STAGING);
  const staging = await caches.open(STAGING);
  try {
    // Pages first, so the chunks they reference are cached with them.
    for (const url of urls.filter((u) => u.startsWith("/event") && !u.includes("."))) {
      const res = await fetch(url, { cache: "reload", credentials: "same-origin" });
      if (!res.ok) throw new Error(url);
      const html = await res.clone().text();
      (html.match(STATIC_RE) || []).forEach((u) => all.add(u));
      await staging.put(url, res);
      all.delete(url);
    }
    await Promise.all(
      [...all].map(async (url) => {
        try {
          const res = await fetch(url, { cache: "reload", credentials: "same-origin" });
          if (!res.ok) throw new Error(String(res.status));
          await staging.put(url, res);
        } catch (err) {
          failed.push(url);
        }
      })
    );
  } catch (err) {
    failed.push(String(err && err.message ? err.message : err));
  }

  if (failed.length === 0) {
    // Swap: copy staging into a fresh live cache.
    await caches.delete(CACHE);
    const live = await caches.open(CACHE);
    for (const req of await staging.keys()) {
      const res = await staging.match(req);
      if (res) await live.put(req, res);
    }
  }
  await caches.delete(STAGING);
  if (client) client.postMessage({ type: "PREPARED", failed, urls: [...new Set([...urls, ...all])] });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never answer React Server Component requests with cached HTML.
  if (req.headers.get("RSC") || url.searchParams.has("_rsc")) return;

  if (isEventPage(url) && req.mode === "navigate") {
    event.respondWith(eventPage(req, url));
  } else if (url.pathname.endsWith(".pdf")) {
    event.respondWith(networkFirst(req));
  } else if (isManagedAsset(url)) {
    event.respondWith(cacheFirst(req));
  }
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function eventPage(req, url) {
  try {
    return await withTimeout(fetch(req), NAV_TIMEOUT_MS);
  } catch (err) {
    const cache = await caches.open(CACHE);
    const key = url.searchParams.get("kiosk") === "true" ? "/event?kiosk=true" : "/event";
    const hit = (await cache.match(key)) || (await cache.match("/event/emergency.html"));
    if (hit) return hit;
    throw err;
  }
}

async function networkFirst(req) {
  try {
    return await withTimeout(fetch(req), NAV_TIMEOUT_MS);
  } catch (err) {
    const hit = await (await caches.open(CACHE)).match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const hit = await (await caches.open(CACHE)).match(req, { ignoreSearch: req.url.includes("/_next/static/") });
  return hit || fetch(req);
}
