// Shared helpers for the portfolio maintenance agents.
// Everything fetched from the internet is treated as untrusted data: it is
// size-capped, host-allowlisted, stripped to plain text, and never executed or
// passed to a model. No third-party dependencies.
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../..");

export function loadConfig(file = path.join(ROOT, "agents/config.json")) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

export class BudgetExceeded extends Error {
  constructor(msg) {
    super(msg);
    this.name = "BudgetExceeded";
  }
}
export class HostNotAllowed extends Error {
  constructor(msg) {
    super(msg);
    this.name = "HostNotAllowed";
  }
}

/** Per-run request budget: a hard cap on total and per-host requests. */
export class Budget {
  constructor({ maxRequestsPerRun, maxRequestsPerHost }) {
    this.max = maxRequestsPerRun;
    this.maxHost = maxRequestsPerHost;
    this.used = 0;
    this.perHost = {};
  }
  take(host) {
    if (this.used >= this.max) throw new BudgetExceeded(`request budget exhausted (${this.max} per run)`);
    if ((this.perHost[host] ?? 0) >= this.maxHost) throw new BudgetExceeded(`per-host budget exhausted for ${host} (${this.maxHost})`);
    this.used++;
    this.perHost[host] = (this.perHost[host] ?? 0) + 1;
  }
}

export function hostAllowed(url, allowedHosts) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  return allowedHosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
}

/**
 * fetch with: https + host allowlist (checked again on every redirect hop),
 * timeout, response size cap and the run budget. `fetchImpl` is injectable
 * for tests.
 */
export function makeFetcher({ allowedHosts, limits, budget, fetchImpl = globalThis.fetch, headers = {} }) {
  return async function safeFetch(url, opts = {}) {
    let current = url;
    for (let hop = 0; hop <= 4; hop++) {
      if (!hostAllowed(current, allowedHosts)) throw new HostNotAllowed(`host not on allowlist: ${safeHost(current)}`);
      budget.take(new URL(current).hostname);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), limits.requestTimeoutMs);
      let res;
      try {
        res = await fetchImpl(current, {
          method: opts.method ?? "GET",
          redirect: "manual",
          signal: ctrl.signal,
          headers: { "user-agent": "lohith-portfolio-agents/1.0 (+https://lohithkovuri.store/agents)", ...headers, ...(opts.headers ?? {}) },
          body: opts.body,
        });
      } catch (e) {
        clearTimeout(timer);
        throw new Error(e?.name === "AbortError" ? `timeout after ${limits.requestTimeoutMs} ms` : `network error: ${e?.message ?? e}`);
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        clearTimeout(timer);
        current = new URL(res.headers.get("location"), current).toString();
        continue;
      }
      const text = opts.method === "HEAD" ? "" : await readCapped(res, limits.maxResponseBytes).finally(() => clearTimeout(timer));
      clearTimeout(timer);
      return { status: res.status, ok: res.status >= 200 && res.status < 300, url: current, headers: res.headers, text };
    }
    throw new Error("too many redirects");
  };
}

async function readCapped(res, max) {
  if (!res.body?.getReader) {
    const t = await res.text();
    if (t.length > max) throw new Error(`response exceeds ${max} bytes`);
    return t;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Error(`response exceeds ${max} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "(invalid url)";
  }
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Untrusted markup → short plain text. Drops tags, scripts, control chars. */
export function toPlainText(input, max = 280) {
  if (!input) return "";
  let s = String(input)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 31 ? String.fromCodePoint(code) : " ";
      }
      return ENTITIES[e.toLowerCase()] ?? " ";
    })
    // Feeds often entity-escape their HTML (&lt;p&gt;), so strip tags again after decoding.
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, " ")
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > max) s = s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
  return s;
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
}

/** Minimal RSS 2.0 / Atom parser. Returns [{title, link, published, summary}]. */
export function parseFeed(xml) {
  const items = [];
  const isAtom = /<feed[\s>]/i.test(xml);
  const re = isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi;
  for (const block of xml.match(re) ?? []) {
    let link = "";
    if (isAtom) {
      const alt = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) ?? block.match(/<link[^>]*href=["']([^"']+)["']/i);
      link = alt ? alt[1] : tag(block, "id");
    } else {
      link = toPlainText(tag(block, "link"), 2000) || toPlainText(tag(block, "guid"), 2000);
    }
    const published = tag(block, isAtom ? "published" : "pubDate") || tag(block, "updated") || tag(block, "dc:date");
    items.push({
      title: toPlainText(tag(block, "title"), 160),
      link: link.replace(/&amp;/g, "&").trim(),
      published: toIsoDate(toPlainText(published, 64)),
      summary: toPlainText(tag(block, isAtom ? "summary" : "description") || tag(block, "content") || tag(block, "content:encoded"), 280),
    });
  }
  return items;
}

export function toIsoDate(s) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Canonical URL for duplicate detection. */
export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref$|source$)/i.test(k)) u.searchParams.delete(k);
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    u.protocol = "https:";
    if (u.hostname === "arxiv.org") u.pathname = u.pathname.replace(/v\d+$/, "");
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

export function normalizeTitle(t) {
  return String(t).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isDuplicate(candidate, existing) {
  const u = normalizeUrl(candidate.url);
  const t = normalizeTitle(candidate.title);
  return existing.some((e) => normalizeUrl(e.url) === u || (t.length > 12 && normalizeTitle(e.title) === t));
}

/** Release tags worth surfacing: stable major/minor only (x.y.0), no pre-releases. */
export function isNotableRelease(title) {
  const t = title.toLowerCase();
  if (/(alpha|beta|rc\d*|preview|dev|nightly|snapshot)/.test(t)) return false;
  const m = t.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return /\d{4}-\d{2}-\d{2}/.test(t); // date-versioned specs
  return !m[3] || m[3] === "0";
}

export function scoreItem(item, categories, keywords) {
  const hay = `${item.title} ${item.summary}`.toLowerCase();
  let score = 0;
  const matched = new Set();
  for (const [cat, words] of Object.entries(keywords)) {
    for (const w of words) {
      if (hay.includes(w)) {
        score += categories.includes(cat) ? 2 : 1;
        matched.add(cat);
      }
    }
  }
  return { score, matched: [...matched] };
}

export function daysBetween(a, b) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Agent result shape shared by every agent and the dashboard. */
export function result(agent, status, summary, extra = {}) {
  return { agent, status, summary, findings: [], ...extra };
}
