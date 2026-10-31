// SYNC: reads approved repositories and reports what changed since the last
// run, with links. It reports evidence (commits, releases, CI conclusion); it
// never decides that a feature is "done".
import { result, toPlainText } from "./lib.mjs";
import { RateLimited } from "./github.mjs";

const NOTABLE = /^(feat|fix|perf|test|docs|refactor)(\(.+\))?!?:|\b(add|implement|support|release|benchmark|eval)/i;

export async function runSync({ config, gh, since, now }) {
  const repos = [];
  let rateLimited = null;
  for (const { repo, branch } of config.sync.repos) {
    const r = { repo, branch, status: "ok", commits: [], release: null, ci: null };
    try {
      const sinceParam = since ? `&since=${encodeURIComponent(since)}` : "";
      const commits = await gh.api(`/repos/${repo}/commits?sha=${branch}&per_page=${config.sync.maxCommitsPerRepo}${sinceParam}`);
      r.commits = (commits ?? []).map((c) => ({
        sha: c.sha.slice(0, 7),
        message: toPlainText(c.commit.message.split("\n")[0], 120),
        date: c.commit.author?.date ?? c.commit.committer?.date,
        url: c.html_url,
      }));
      const releases = await gh.api(`/repos/${repo}/releases?per_page=1`);
      const rel = releases?.[0];
      if (rel && (!since || rel.published_at > since)) r.release = { tag: rel.tag_name, name: toPlainText(rel.name || rel.tag_name, 100), url: rel.html_url, date: rel.published_at };
      const runs = await gh.api(`/repos/${repo}/actions/runs?branch=${branch}&per_page=1`);
      const run = runs?.workflow_runs?.[0];
      if (run) r.ci = { name: run.name, conclusion: run.conclusion ?? run.status, url: run.html_url, sha: run.head_sha.slice(0, 7) };
    } catch (e) {
      if (e instanceof RateLimited) { rateLimited = e; r.status = "rate-limited"; repos.push(r); break; }
      r.status = "error";
      r.error = e.message;
    }
    repos.push(r);
  }

  const findings = [];
  for (const r of repos) {
    const notable = r.commits.filter((c) => NOTABLE.test(c.message));
    if (r.release) findings.push({ title: `${r.repo}: release ${r.release.tag}`, url: r.release.url, detail: `Published ${r.release.date?.slice(0, 10)}. Release notes need owner review before any portfolio claim.` });
    if (notable.length)
      findings.push({
        title: `${r.repo}: ${notable.length} notable commit(s)`,
        url: notable[0].url,
        detail: notable.slice(0, 3).map((c) => `${c.sha} ${c.message}`).join(" · ") + (r.ci ? ` · latest CI: ${r.ci.conclusion}` : " · no CI runs found"),
      });
    if (r.ci && r.ci.conclusion === "failure") findings.push({ title: `${r.repo}: latest CI run failed`, url: r.ci.url, detail: `${r.ci.name} on ${r.ci.sha}. Do not cite this work as passing tests.` });
  }

  const errors = repos.filter((r) => r.error).map((r) => `${r.repo}: ${r.error}`);
  const status = rateLimited ? "partial" : errors.length === config.sync.repos.length ? "failure" : findings.length ? "success" : "no-change";
  const total = repos.reduce((n, r) => n + r.commits.length, 0);
  const summary = rateLimited
    ? `Stopped at the GitHub rate limit (resets ${rateLimited.resetAt ?? "soon"}); ${repos.length - 1} repo(s) checked.`
    : `${repos.length} repo(s) checked since ${since ? since.slice(0, 16).replace("T", " ") + " UTC" : "the beginning (first run)"}: ${total} commit(s), ${findings.length} item(s) worth review.`;
  return result("SYNC", status, summary, { repos, findings, errors, checkedAt: now });
}
