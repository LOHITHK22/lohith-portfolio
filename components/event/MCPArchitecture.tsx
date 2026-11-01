"use client";

import { useState } from "react";
import { ArrowDown, ExternalLink, ShieldAlert } from "lucide-react";
import {
  architectureNodes,
  blockedTools,
  pmFile,
  PM_REPO,
  readOnlyTools,
  stateChangingTools,
  type ArchNode,
} from "@/data/eventDemo";

const GROUP_COLOR: Record<ArchNode["group"], string> = {
  agent: "#22d3ee",
  control: "#60a5fa",
  safety: "#a78bfa",
  mcp: "#34d399",
  infra: "#f59e0b",
};

function Json({ value }: { value: ArchNode["input"] }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-base-950/80 p-2.5 font-mono text-[11px] leading-relaxed text-slate-300">
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

/**
 * Clickable PipelineMedic architecture: pick a node to see what it does, a
 * sample structured input/output, its security boundary, the design reason,
 * how it is tested, and the source file. Content is in data/eventDemo.ts and
 * mirrors the repository.
 */
export function MCPArchitecture() {
  const [activeId, setActiveId] = useState(architectureNodes[0].id);
  const [fullTools, setFullTools] = useState(false);
  const node = architectureNodes.find((n) => n.id === activeId) ?? architectureNodes[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,17rem)_1fr]">
      <ol className="flex flex-col items-stretch" aria-label="Architecture components">
        {architectureNodes.map((n, i) => {
          const isActive = n.id === activeId;
          const color = GROUP_COLOR[n.group];
          return (
            <li key={n.id} className="flex flex-col items-stretch">
              <button
                type="button"
                onClick={() => setActiveId(n.id)}
                aria-pressed={isActive}
                className="rounded-xl border px-3 py-2.5 text-left text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                style={{
                  borderColor: isActive ? color : "rgba(255,255,255,0.1)",
                  background: isActive ? `${color}1a` : "rgba(255,255,255,0.02)",
                  color: isActive ? "#fff" : "#cbd5e1",
                  boxShadow: isActive ? `0 0 24px -8px ${color}` : "none",
                }}
              >
                <span className="mr-2 font-mono text-[10px] sm:text-[11px]" style={{ color }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                {n.label}
              </button>
              {i < architectureNodes.length - 1 && (
                <ArrowDown className="mx-auto my-0.5 h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>

      <div className="min-w-0 space-y-4">
        <div className="rounded-2xl border border-white/10 bg-base-900/70 p-4 sm:p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: GROUP_COLOR[node.group] }}>
            {node.group === "mcp" ? "MCP" : node.group}
          </p>
          <h3 className="mt-1 font-display text-xl font-semibold text-white" aria-live="polite">{node.label}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{node.what}</p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Example input</p>
              <Json value={node.input} />
            </div>
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Example output</p>
              <Json value={node.output} />
            </div>
          </div>

          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
            <div>
              <dt className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-violet-300">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> Security boundary
              </dt>
              <dd className="mt-1 leading-relaxed text-slate-300">{node.boundary}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-cyan-300">Why it&apos;s built this way</dt>
              <dd className="mt-1 leading-relaxed text-slate-300">{node.why}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-emerald-300">Testing</dt>
              <dd className="mt-1 leading-relaxed text-slate-300">{node.testing}</dd>
            </div>
          </dl>

          <a
            href={pmFile(node.source.path)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 font-mono text-xs text-cyan-300 hover:underline"
          >
            {node.source.label} <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>

        <div className="rounded-2xl border border-white/10 bg-base-900/70 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-base font-semibold text-white">MCP tool exposure</h3>
            <div role="radiogroup" aria-label="MCP server configuration" className="flex rounded-full border border-white/10 p-0.5 text-xs">
              {[
                { full: false, label: "Default" },
                { full: true, label: "MCP_ALLOW_STATE_CHANGING_TOOLS=true" },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  role="radio"
                  aria-checked={fullTools === opt.full}
                  onClick={() => setFullTools(opt.full)}
                  className={`rounded-full px-3 py-1.5 font-mono transition-colors ${fullTools === opt.full ? "bg-white text-base-950" : "text-slate-300 hover:text-white"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-sm text-slate-300">
            {fullTools
              ? "All 17 executable tools are listed. MEDIUM-risk calls still require a server-verified, single-use human approval."
              : "Only the 10 read-only diagnostics are listed. State-changing tools are hidden and refused (STATE_CHANGING_DISABLED)."}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {readOnlyTools.map((t) => (
              <span key={t} className="rounded border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-200 sm:text-[11px]">
                {t}
              </span>
            ))}
            {stateChangingTools.map((t) => (
              <span
                key={t.name}
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] sm:text-[11px] ${
                  fullTools
                    ? t.risk === "MEDIUM"
                      ? "border-violet-300/40 bg-violet-400/10 text-violet-200"
                      : "border-cyan-300/40 bg-cyan-400/10 text-cyan-200"
                    : "border-white/10 text-slate-400 line-through"
                }`}
              >
                {t.name}
                {fullTools && t.risk === "MEDIUM" ? " · approval" : ""}
              </span>
            ))}
            {blockedTools.map((t) => (
              <span key={t} className="rounded border border-rose-400/30 px-1.5 py-0.5 font-mono text-[10px] text-rose-300/80 sm:text-[11px] line-through">
                {t}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-400">
            Red: never registered in any configuration. Verified: MCP Inspector 2.10.1 (CLI) and live Kafka/Postgres/Flink/Airflow for
            schema drift, poison message, and Airflow failure scenarios. Not verified: Claude Desktop, Cursor, Claude Code clients, and
            non-mock LLM providers. This browser never connects to the MCP server (stdio only).{" "}
            <a href={PM_REPO} target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:underline">
              View the repository
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
