#!/usr/bin/env node
// Checks what the production build would send to browsers (run after `next build`):
//   - no credential patterns in client chunks, prerendered HTML or RSC payloads
//   - no private environment value (from the process environment or local .env files, loaded in
//     memory only) anywhere in browser-delivered output
//   - no browser source maps
// Output is redacted. Exit code 1 on any finding.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { isPrivateEnvName, redact, scanText } from "./secret-patterns.mjs";

const ROOT = process.cwd();
const BUILD = join(ROOT, ".next");
if (!existsSync(BUILD)) {
  console.error("No .next build found: run `next build` first.");
  process.exit(2);
}

/** Private values from the environment and from local .env files (never printed). */
function privateValues() {
  const values = new Map();
  const add = (name, value) => {
    const v = (value ?? "").trim().replace(/^["']|["']$/g, "");
    if (isPrivateEnvName(name) && v.length >= 12) values.set(v, name);
  };
  for (const [k, v] of Object.entries(process.env)) add(k, v);
  for (const f of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    const p = join(ROOT, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) add(m[1], m[2]);
    }
  }
  return values;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

// What browsers receive: static chunks/CSS, plus prerendered pages (HTML and RSC payloads).
const targets = [];
if (existsSync(join(BUILD, "static"))) for (const p of walk(join(BUILD, "static"))) targets.push(p);
if (existsSync(join(BUILD, "server", "app"))) for (const p of walk(join(BUILD, "server", "app"))) if (/\.(html|rsc|body|json)$/.test(p)) targets.push(p);

const secrets = privateValues();
const findings = [];
let scanned = 0;
for (const p of targets) {
  const rel = relative(ROOT, p).replace(/\\/g, "/");
  if (rel.startsWith(".next/static/") && rel.endsWith(".map")) {
    findings.push({ rule: "browser-source-map", where: rel, preview: "source maps must not be published" });
    continue;
  }
  if (/\.(woff2?|png|jpe?g|gif|webp|ico|svg|wasm|mp3)$/.test(rel)) continue;
  const text = readFileSync(p, "utf8");
  scanned++;
  findings.push(...scanText(text, rel));
  for (const [value, name] of secrets) {
    if (text.includes(value)) findings.push({ rule: "private-env-value-in-client-output", where: rel, preview: `${name} = ${redact(value)}` });
  }
}

console.log(`build output check: ${scanned} browser-delivered file(s), ${secrets.size} private value(s) compared, ${findings.length} finding(s)`);
for (const f of findings) console.log(`  ${f.rule}  ${f.where}  ${f.preview}`);
process.exit(findings.length ? 1 : 0);
