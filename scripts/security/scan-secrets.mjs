#!/usr/bin/env node
// Secret scan of the repository's tracked files (or of the files changed against a base ref).
//
//   node scripts/security/scan-secrets.mjs                 every tracked file
//   node scripts/security/scan-secrets.mjs --diff origin/main   only files changed since main
//
// Also fails if a NEXT_PUBLIC_ variable outside the allowlist is referenced, if a public variable's
// name suggests a credential, or if an env file other than .env.example is tracked.
// Output is redacted. Exit code 1 on any finding.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { PUBLIC_ENV_ALLOWLIST, SKIP_FILE, looksLikeSecretPublicVar, scanText } from "./secret-patterns.mjs";

const args = process.argv.slice(2);
const diffBase = args.includes("--diff") ? args[args.indexOf("--diff") + 1] : null;

const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const files = (diffBase ? git("diff", "--name-only", "--diff-filter=ACMR", `${diffBase}...HEAD`) : git("ls-files"))
  .split("\n")
  .map((f) => f.trim())
  .filter(Boolean);

const findings = [];
const publicVars = new Set();
for (const file of files) {
  if (/(?:^|\/)\.env(?:\..+)?$/.test(file) && !file.endsWith(".env.example")) {
    findings.push({ rule: "tracked-env-file", where: file, preview: "env files must never be committed" });
    continue;
  }
  if (SKIP_FILE.test(file) || !existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  findings.push(...scanText(text, file));
  if (!file.startsWith("scripts/security/")) {
    for (const m of text.matchAll(/\bNEXT_PUBLIC_[A-Z0-9_]+/g)) publicVars.add(`${m[0]}@${file}`);
  }
}
for (const entry of publicVars) {
  const [name, file] = entry.split("@");
  if (looksLikeSecretPublicVar(name)) findings.push({ rule: "secret-named-public-env", where: file, preview: name });
  else if (!PUBLIC_ENV_ALLOWLIST.includes(name)) findings.push({ rule: "unreviewed-public-env", where: file, preview: `${name} (add to PUBLIC_ENV_ALLOWLIST after review)` });
}

console.log(`secret scan: ${files.length} file(s)${diffBase ? ` changed since ${diffBase}` : " tracked"}, ${findings.length} finding(s)`);
for (const f of findings) console.log(`  ${f.rule}  ${f.where}  ${f.preview}`);
process.exit(findings.length ? 1 : 0);
