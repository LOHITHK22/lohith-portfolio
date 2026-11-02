// Security check tests. Every "secret" here is synthetic and assembled at runtime from pieces, so
// no secret-shaped literal exists in the repository.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isPrivateEnvName, looksLikeSecretPublicVar, redact, scanText } from "../secret-patterns.mjs";

const filler = (n, alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") =>
  Array.from({ length: n }, (_, i) => alphabet[(i * 7 + 3) % alphabet.length]).join("");
const FAKE = {
  openai: ["sk", "proj", filler(48)].join("-"),
  elevenlabs: ["sk", filler(48, "0123456789abcdef")].join("_"),
  github: ["ghp", filler(36)].join("_"),
  aws: ["AKIA", "Z".repeat(16)].join(""),
  pem: ["-----BEGIN", "RSA PRIVATE KEY-----"].join(" "),
  db: ["postgres", "//admin:" + filler(12) + "@db.example.invalid:5432/app"].join(":"),
};

test("each kind of credential is detected", () => {
  const text = Object.values(FAKE).join("\n");
  const rules = new Set(scanText(text, "fixture").map((f) => f.rule));
  for (const r of ["openai-api-key", "elevenlabs-api-key", "github-token", "aws-access-key-id", "private-key-block", "database-url-with-password"]) {
    assert.ok(rules.has(r), `missing ${r}`);
  }
});

test("findings never contain the secret itself", () => {
  const findings = scanText(`const k = "${FAKE.openai}";`, "fixture");
  assert.equal(findings.length >= 1, true);
  for (const f of findings) {
    assert.ok(!JSON.stringify(f).includes(FAKE.openai.slice(8)), "a finding leaked the value");
    assert.match(f.preview, /^.{4}… \(len \d+\)$/);
  }
  assert.equal(redact("abcdefghij"), "abcd… (len 10)");
});

test("ordinary code does not trip the rules", () => {
  const benign = [
    'const OPENAI_API_KEY = process.env.OPENAI_API_KEY;',
    'fetch("/api/ask", { method: "POST" })',
    'const sk = "sk-learn is a library";',
    'audioFile: "/audio/team/astra-intro.mp3"',
    'const password = "";',
    'className="sk_button"',
  ].join("\n");
  assert.deepEqual(scanText(benign, "fixture"), []);
});

test("private vs public environment variable names", () => {
  for (const n of ["OPENAI_API_KEY", "ELEVENLABS_API_KEY", "GITHUB_TOKEN", "SESSION_SECRET", "DATABASE_URL", "VERCEL_TOKEN"]) assert.ok(isPrivateEnvName(n), n);
  // Public CI metadata and ordinary settings are not secrets (they legitimately appear in pages).
  for (const n of ["NEXT_PUBLIC_SITE_URL", "BASE_URL", "PW_CHANNEL", "RUN_URL", "GITHUB_SERVER_URL", "GITHUB_REPOSITORY", "GITHUB_RUN_ID", "OPENAI_MODEL", "ELEVENLABS_VOICE_ID"]) assert.ok(!isPrivateEnvName(n), n);
  for (const n of ["AWS_SECRET_ACCESS_KEY", "AWS_ACCESS_KEY_ID", "MONGODB_URI", "SENTRY_DSN", "CLAUDE_CODE_OAUTH_TOKEN", "GOOGLE_APPLICATION_CREDENTIALS"]) assert.ok(isPrivateEnvName(n), n);
  assert.ok(looksLikeSecretPublicVar("NEXT_PUBLIC_OPENAI_API_KEY"));
  assert.ok(!looksLikeSecretPublicVar("NEXT_PUBLIC_SITE_URL"));
});

const SCRIPTS = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function scratchRepo(files) {
  const dir = mkdtempSync(join(tmpdir(), "sec-scan-"));
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), body);
  }
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  return dir;
}

test("scan-secrets fails on a committed key, a tracked env file and a secret-named public variable, without printing values", () => {
  const dir = scratchRepo({
    "lib/client.ts": `export const k = "${FAKE.openai}";\nconst x = process.env.NEXT_PUBLIC_OPENAI_API_KEY;\n`,
    ".env.production": `OPENAI_API_KEY=${FAKE.openai}\n`,
  });
  try {
    const r = spawnSync(process.execPath, [join(SCRIPTS, "scan-secrets.mjs")], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /openai-api-key/);
    assert.match(r.stdout, /tracked-env-file/);
    assert.match(r.stdout, /secret-named-public-env/);
    assert.ok(!r.stdout.includes(FAKE.openai.slice(8)), "the scanner printed the secret");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scan-secrets passes on a clean repository", () => {
  const dir = scratchRepo({ "lib/ok.ts": "export const site = process.env.NEXT_PUBLIC_SITE_URL;\n", ".env.example": "OPENAI_API_KEY=\n" });
  try {
    const r = spawnSync(process.execPath, [join(SCRIPTS, "scan-secrets.mjs")], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("check-build-output catches a private env value and a source map in client output, without printing the value", () => {
  const secret = "zz" + filler(30);
  const dir = mkdtempSync(join(tmpdir(), "sec-build-"));
  try {
    mkdirSync(join(dir, ".next", "static", "chunks"), { recursive: true });
    mkdirSync(join(dir, ".next", "server", "app"), { recursive: true });
    writeFileSync(join(dir, ".next", "static", "chunks", "page.js"), `var a="${secret}";`);
    writeFileSync(join(dir, ".next", "static", "chunks", "page.js.map"), "{}");
    writeFileSync(join(dir, ".next", "server", "app", "index.html"), "<html></html>");
    const r = spawnSync(process.execPath, [join(SCRIPTS, "check-build-output.mjs")], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, SYNTHETIC_TEST_API_KEY: secret },
    });
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /private-env-value-in-client-output/);
    assert.match(r.stdout, /SYNTHETIC_TEST_API_KEY/);
    assert.match(r.stdout, /browser-source-map/);
    assert.ok(!r.stdout.includes(secret.slice(6)), "the checker printed the secret");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
