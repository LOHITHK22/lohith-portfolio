// Thin GitHub REST client for the agents. Uses the workflow's GITHUB_TOKEN;
// stops cleanly when the rate limit runs low instead of erroring mid-run.
export class RateLimited extends Error {
  constructor(resetAt) {
    super(`GitHub rate limit reached; resets ${resetAt}`);
    this.name = "RateLimited";
    this.resetAt = resetAt;
  }
}

export function makeGitHub({ fetcher, token, minRemaining = 5 }) {
  const headers = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
  if (token) headers.authorization = `Bearer ${token}`;
  const state = { remaining: null, resetAt: null };

  async function api(pathname, { method = "GET", body } = {}) {
    if (state.remaining !== null && state.remaining < minRemaining) throw new RateLimited(state.resetAt);
    const res = await fetcher(`https://api.github.com${pathname}`, {
      method,
      headers: { ...headers, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const rem = res.headers.get("x-ratelimit-remaining");
    if (rem !== null) {
      state.remaining = Number(rem);
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      state.resetAt = reset ? new Date(reset * 1000).toISOString() : null;
    }
    if ((res.status === 403 || res.status === 429) && (state.remaining === 0 || /rate limit/i.test(res.text))) {
      throw new RateLimited(state.resetAt);
    }
    let data = null;
    try {
      data = res.text ? JSON.parse(res.text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const err = new Error(`GitHub ${method} ${pathname} → ${res.status}${data?.message ? `: ${data.message}` : ""}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    state,
    api,
    async findOpenIssue(repo, title, label) {
      const issues = await api(`/repos/${repo}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=100`);
      return (issues ?? []).find((i) => !i.pull_request && i.title === title) ?? null;
    },
    /** Create an issue, or comment on the open one with the same title (no duplicates). */
    async upsertIssue(repo, { title, body, labels }) {
      const existing = await this.findOpenIssue(repo, title, labels[0]);
      if (existing) {
        await api(`/repos/${repo}/issues/${existing.number}/comments`, { method: "POST", body: { body } });
        return { action: "commented", number: existing.number, url: existing.html_url };
      }
      const created = await api(`/repos/${repo}/issues`, { method: "POST", body: { title, body, labels } });
      return { action: "created", number: created.number, url: created.html_url };
    },
    async findOpenPr(repo, headBranch) {
      const owner = repo.split("/")[0];
      const prs = await api(`/repos/${repo}/pulls?state=open&head=${owner}:${encodeURIComponent(headBranch)}`);
      return prs?.[0] ?? null;
    },
    /**
     * Open a PR for an already-pushed branch. If the repository does not allow
     * Actions to create PRs, return a compare link instead of failing the run.
     */
    async openPr(repo, { head, base, title, body }) {
      const existing = await this.findOpenPr(repo, head);
      if (existing) return { action: "exists", number: existing.number, url: existing.html_url };
      try {
        const pr = await api(`/repos/${repo}/pulls`, { method: "POST", body: { head, base, title, body, draft: false } });
        return { action: "created", number: pr.number, url: pr.html_url };
      } catch (e) {
        if (e.status === 403 || e.status === 422) {
          return { action: "blocked", reason: e.message, url: `https://github.com/${repo}/compare/${base}...${head}?expand=1` };
        }
        throw e;
      }
    },
  };
}
