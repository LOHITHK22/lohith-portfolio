// Credential patterns shared by the security checks. Findings are always reported redacted:
// rule name, location, the first four characters and the length. Never the value.
//
// Tests build their fake secrets at runtime from pieces, so no secret-shaped literal ever sits in
// the repository for these rules (or any other scanner) to trip over.

export const RULES = [
  { id: "openai-api-key", re: /sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/g },
  { id: "anthropic-api-key", re: /sk-ant-[A-Za-z0-9_-]{32,}/g },
  { id: "elevenlabs-api-key", re: /\bsk_[a-f0-9]{40,}\b/g },
  { id: "github-token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}/g },
  { id: "aws-access-key-id", re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { id: "private-key-block", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY-----/g },
  { id: "database-url-with-password", re: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss):\/\/[^\s:/@"'`]+:[^\s@"'`]{3,}@[^\s"'`]+/g },
  { id: "slack-token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { id: "stripe-secret-key", re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}/g },
  { id: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: "vercel-token", re: /\b(?:vercel_|vc[a-z]?_)[A-Za-z0-9]{24,}\b/g },
  { id: "hardcoded-bearer-token", re: /\b[Bb]earer\s+[A-Za-z0-9_\-.=]{32,}/g },
  { id: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  {
    id: "hardcoded-credential-assignment",
    re: /\b(?:api[_-]?key|secret|client[_-]?secret|access[_-]?token|auth[_-]?token|password|passwd)["']?\s*[:=]\s*["'][A-Za-z0-9_\-/+=]{24,}["']/gi,
  },
];

/** "sk-p… (len 56)": enough to find and identify a finding, useless to an attacker. */
export function redact(value) {
  return `${value.slice(0, 4)}… (len ${value.length})`;
}

/** Scans one text; returns redacted findings. */
export function scanText(text, where) {
  const findings = [];
  for (const { id, re } of RULES) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const line = text.slice(0, m.index).split("\n").length;
      findings.push({ rule: id, where: `${where}:${line}`, preview: redact(m[0]) });
    }
  }
  return findings;
}

/**
 * Variable names that hold private values: not NEXT_PUBLIC_, and named like a credential. Judged by
 * the name's ending only, so public CI metadata (GITHUB_SERVER_URL, GITHUB_REPOSITORY, ...) is not
 * mistaken for a secret, while GITHUB_TOKEN, OPENAI_API_KEY and AWS_SECRET_ACCESS_KEY are caught.
 */
export function isPrivateEnvName(name) {
  return !name.startsWith("NEXT_PUBLIC_") && /(?:KEY|KEY_ID|TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE|CREDENTIALS?|DATABASE_URL|_DSN|_URI)$/.test(name);
}

/** Every NEXT_PUBLIC_ variable is shipped to browsers. Only these may exist. */
export const PUBLIC_ENV_ALLOWLIST = ["NEXT_PUBLIC_SITE_URL"];

/** A public variable whose name says it holds a credential is a mistake by definition. */
export function looksLikeSecretPublicVar(name) {
  return name.startsWith("NEXT_PUBLIC_") && /(KEY|TOKEN|SECRET|PASSWORD|PRIVATE|CREDENTIAL)/.test(name.slice("NEXT_PUBLIC_".length));
}

/** Files that are binary, vendored or generated and never hold source-level secrets. */
export const SKIP_FILE = /\.(?:mp3|wav|png|jpe?g|gif|webp|ico|svg|woff2?|ttf|otf|wasm|pdf|zip|gz)$|(?:^|\/)package-lock\.json$|^public\/sqljs\//i;
