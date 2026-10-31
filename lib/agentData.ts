// Reads the maintenance agents' output. Run history lives on the data-only
// `agent-data` branch (written by GitHub Actions), so the dashboard updates
// without a redeploy. The curated resource library is committed to main and
// only changes through reviewed pull requests.
import curated from "@/data/agents/resources.json";

const DATA_BASE = process.env.AGENT_DATA_URL ?? "https://raw.githubusercontent.com/LOHITHK22/lohith-portfolio/agent-data";
export const REVALIDATE_SECONDS = 600;

export type AgentStatus = "success" | "no-change" | "partial" | "failure" | "skipped";
export type Finding = { title: string; url?: string; detail?: string };
export type AgentRun = {
  agent: string;
  status: AgentStatus;
  summary: string;
  startedAt?: string;
  finishedAt?: string;
  findings: Finding[];
  errors: string[];
  checks?: { path: string; ok: boolean; reason?: string; ms?: number }[];
  ci?: { steps: Record<string, string>; runUrl?: string } | null;
  smoke?: { name: string; ok: boolean; reason?: string }[] | null;
  issues?: { action: string; number?: number; url: string; title?: string }[];
  measurements?: { page: string; samples: number; ttfb: number | null; fcp: number | null; lcp: number | null; cls: number | null; load: number | null; transferKB: number | null; a11y?: string[]; a11yCount?: number }[];
  sources?: { id: string; status: string; items: number; kept: number; error?: string }[];
  repos?: { repo: string; status: string; commits: number; ci?: { conclusion: string; url: string } | null; error?: string }[];
};
export type RunRecord = {
  id: string;
  startedAt: string;
  finishedAt: string;
  trigger: string;
  runUrl: string | null;
  commit: string | null;
  mode: string;
  dryRun: boolean;
  status: AgentStatus;
  pr: { action: string; number?: number; url: string } | null;
  budget?: { used: number; max: number };
  agents: AgentRun[];
};
export type Resource = {
  id: string;
  title: string;
  url: string;
  source: string;
  category: string;
  kind: string;
  published: string;
  summary: string;
  addedAt?: string;
  autoPublishedAt?: string;
};

async function fetchData<T>(file: string): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${DATA_BASE}/${file}`, { next: { revalidate: REVALIDATE_SECONDS } });
    if (res.status === 404) return { data: null, error: null }; // no runs published yet
    if (!res.ok) return { data: null, error: `HTTP ${res.status}` };
    return { data: (await res.json()) as T, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function getActivity() {
  const { data, error } = await fetchData<{ runs: RunRecord[]; updatedAt?: string }>("activity.json");
  // Local test runs never appear on the public dashboard.
  const runs = (data?.runs ?? []).filter((r) => r.trigger !== "local");
  return { runs, error, source: `${DATA_BASE}/activity.json` };
}

export async function getResources() {
  const { data } = await fetchData<{ items: Resource[] }>("resources-live.json");
  return {
    curated: (curated as { items: Resource[] }).items,
    autoPublished: data?.items ?? [],
  };
}

export const RESOURCE_CATEGORIES = [
  { id: "llms", label: "LLMs" },
  { id: "agents", label: "Agents" },
  { id: "mcp", label: "MCP" },
  { id: "rag", label: "RAG" },
  { id: "evaluation", label: "Evaluation" },
  { id: "data-engineering", label: "Data engineering" },
] as const;
