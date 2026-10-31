// The real maintenance agents (scripts/agents/*.mjs, run by GitHub Actions).
// Not to be confused with the narrated presentation characters in agentTeam.ts.
export type MaintenanceAgent = {
  id: string;
  name: string;
  role: string;
  does: string;
  never: string;
  file: string;
};

export const maintenanceAgents: MaintenanceAgent[] = [
  {
    id: "astra",
    name: "ASTRA",
    role: "Orchestrator",
    does: "Starts each run, executes the agents in order with failure isolation, enforces the request budget, and skips duplicate scheduled runs.",
    never: "Push to main. Its git helper only accepts the agent-data branch and agent/* proposal branches.",
    file: "scripts/agents/astra.mjs",
  },
  {
    id: "scout",
    name: "SCOUT",
    role: "Research",
    does: "Reads allowlisted feeds (MCP releases, arXiv, Hugging Face, OpenAI, selected repos), keeps fresh, relevant, non-duplicate items, and verifies each link resolves.",
    never: "Rewrite or embellish claims. Descriptions are the source's own summary, trimmed to plain text.",
    file: "scripts/agents/scout.mjs",
  },
  {
    id: "sync",
    name: "SYNC",
    role: "GitHub projects",
    does: "Checks approved repositories for new commits, releases and the latest CI conclusion since the previous run.",
    never: "Declare a feature finished because a commit exists. It reports evidence for review.",
    file: "scripts/agents/sync.mjs",
  },
  {
    id: "sentinel",
    name: "SENTINEL",
    role: "Testing",
    does: "Checks live pages, links and key interactions in a real browser, reads lint/typecheck/build/e2e results, and files one issue per confirmed failure.",
    never: "Change code to make a test pass. A failure must reproduce on a second attempt before an issue is filed.",
    file: "scripts/agents/sentinel.mjs",
  },
  {
    id: "pulse",
    name: "PULSE",
    role: "Performance",
    does: "Measures TTFB, FCP, LCP, CLS and transfer size (median of 3 loads) plus an automated DOM accessibility check, and compares with the previous run.",
    never: "Report scores it did not measure. These are runner timings, not Lighthouse scores.",
    file: "scripts/agents/pulse.mjs",
  },
  {
    id: "forge",
    name: "FORGE",
    role: "Improvement",
    does: "Packages verified resource proposals and dead-link removals into one pull request, and escalates checks that fail three runs in a row.",
    never: "Edit the production branch or application code. Every change waits for the owner to merge it.",
    file: "scripts/agents/forge.mjs",
  },
  {
    id: "prism",
    name: "PRISM",
    role: "Prompt engineer",
    does: "Weekly, compares live screenshots with the approved design, audits mobile layout, code and the other agents' results, and writes ranked implementation prompts for Claude Code as GitHub issues.",
    never: "Change code itself. Claude Code implements a prompt only after I approve it, on a separate branch, and the pull request still needs my review.",
    file: "scripts/agents/prism.mjs",
  },
  {
    id: "scribe",
    name: "SCRIBE",
    role: "Activity reporter",
    does: "Writes the sanitized run record shown on this page and the summary on the GitHub Actions run, with links to logs, issues and pull requests.",
    never: "Add claims of its own. It records exactly what the other agents returned.",
    file: "scripts/agents/scribe.mjs",
  },
];
