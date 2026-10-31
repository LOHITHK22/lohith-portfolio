"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ExternalLink, Github, Pause, Play, ShieldCheck } from "lucide-react";
import { DEMO_LABEL, demoStages, pmFile, PM_REPO, type DemoStage } from "@/data/eventDemo";
import { track } from "@/lib/analytics";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const TONE: Record<DemoStage["tone"], string> = {
  info: "#5eead4",
  warn: "#fbbf24",
  gate: "#a78bfa",
  ok: "#4ade80",
};

const EVIDENCE = [
  { value: "17", label: "typed MCP tools", note: "12 LOW · 5 MEDIUM risk" },
  { value: "10", label: "read-only by default", note: "state-changing tools opt-in" },
  { value: "121", label: "pytest tests", note: "63 cover the MCP server" },
  { value: "5", label: "operations never registered", note: "hard-blocked in every config" },
];

const STACK = [
  ["Agent + API", "Python · FastAPI · Pydantic · SQLAlchemy · hand-written state graph"],
  ["Pipeline", "Kafka · Flink · PostgreSQL · Airflow"],
  ["Tools", "Official MCP Python SDK (stdio) · typed Pydantic schemas"],
  ["Quality", "pytest · MCP Inspector (CLI) · live failure injection"],
];

const BOUNDARY = [
  "Detection is deterministic. No LLM decides that an incident exists.",
  "Risk is recomputed by the policy engine. The LLM's own estimate is ignored.",
  "MEDIUM and HIGH risk repairs wait for a server-verified, single-use human approval.",
  "An audit row is opened before any tool runs; if the audit log is down, nothing runs.",
  "Every repair is validated by re-measuring, with a canary first and rollback on failure.",
];

/** Renders a payload as JSON with highlighted keys and string values. */
function Json({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  const parts = text.split(/("(?:[^"\\]|\\.)*")(\s*:)?/g);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i]) out.push(parts[i]);
    const str = parts[i + 1];
    if (str === undefined) continue;
    const isKey = Boolean(parts[i + 2]);
    out.push(
      <span key={i} className={isKey ? "text-teal-soft" : "text-amber-200"}>
        {str}
      </span>,
    );
    if (parts[i + 2]) out.push(parts[i + 2]);
  }
  return <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.7] text-slate-300">{out}</pre>;
}

export function FlagshipSystem() {
  const reducedMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const stage = demoStages[active];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Walk through the incident on its own until the visitor takes over.
  useEffect(() => {
    if (!auto || !inView || reducedMotion) return;
    const id = window.setTimeout(() => setActive((i) => (i + 1) % demoStages.length), 3600);
    return () => window.clearTimeout(id);
  }, [auto, inView, reducedMotion, active]);

  const pick = (i: number) => {
    setAuto(false);
    setActive(i);
    track("project_click", { project: "pipelinemedic-ai", stage: demoStages[i].id });
  };

  return (
    <section id="pipelinemedic" className="relative scroll-mt-16 overflow-hidden bg-ink-950 py-20 sm:py-28">
      {/* Hand-off from the hero: the cinematic teal light becomes a measured grid */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-ink-950 to-transparent" />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(94,234,212,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(94,234,212,0.05)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(80%_70%_at_50%_40%,black,transparent)]"
      />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-end">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-teal">01 · Flagship system</p>
            <h2 className="mt-4 font-hero text-5xl font-black leading-[0.95] tracking-[-0.03em] text-white sm:text-7xl">
              PipelineMedic <span className="text-teal">AI</span>
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
              A repair agent for streaming data pipelines. Deterministic detectors find the failure, an LLM proposes a typed fix,
              a policy engine decides what needs a human, and every action goes through an audited MCP tool server.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10">
            {EVIDENCE.map((e) => (
              <div key={e.label} className="bg-ink-900/95 px-4 py-4">
                <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{e.label}</dt>
                <dd className="mt-1 font-mono text-3xl font-bold text-white">{e.value}</dd>
                <dd className="mt-1 text-xs text-slate-400">{e.note}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Incident console */}
        <div ref={ref} className="mt-12 overflow-hidden rounded-xl border border-white/10 bg-[#050b10]/95 shadow-[0_40px_120px_-40px_rgba(25,211,197,0.35)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-[#f87171]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#4ade80]" />
              </span>
              <span className="font-mono text-xs text-slate-300">pipelinemedic · incident 6f1c2a9e · orders.raw</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">
                {DEMO_LABEL}
              </span>
              {!reducedMotion && (
                <button
                  type="button"
                  onClick={() => setAuto((v) => !v)}
                  aria-label={auto ? "Pause walkthrough" : "Play walkthrough"}
                  className="flex h-7 w-7 items-center justify-center rounded border border-white/10 text-slate-300 hover:text-white"
                >
                  {auto ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-[17rem_minmax(0,1fr)]">
            <ol className="flex gap-1 overflow-x-auto border-b border-white/10 p-2 lg:flex-col lg:border-b-0 lg:border-r lg:p-3" aria-label="Incident stages">
              {demoStages.map((s, i) => {
                const on = i === active;
                const done = i < active;
                return (
                  <li key={s.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => pick(i)}
                      aria-current={on ? "step" : undefined}
                      className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${
                        on ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                      }`}
                    >
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-[11px] font-bold"
                        style={{
                          borderColor: on || done ? TONE[s.tone] : "rgba(255,255,255,0.12)",
                          color: on ? "#03110f" : done ? TONE[s.tone] : "#64748b",
                          background: on ? TONE[s.tone] : "transparent",
                        }}
                      >
                        {s.step}
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-sm font-semibold ${on ? "text-white" : "text-slate-300"}`}>{s.label}</span>
                        <span className="hidden truncate font-mono text-[10.5px] text-slate-400 lg:block">{s.actor}</span>
                      </span>
                      {on && auto && !reducedMotion && (
                        <span className="ml-auto hidden h-1 w-10 overflow-hidden rounded bg-white/10 lg:block" aria-hidden="true">
                          <motion.span
                            key={active}
                            className="block h-full"
                            style={{ background: TONE[s.tone] }}
                            initial={{ width: 0 }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 3.6, ease: "linear" }}
                          />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className="min-w-0 p-5 sm:p-6" aria-live="polite">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={stage.id}
                  initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: reducedMotion ? 0 : -6 }}
                  transition={{ duration: reducedMotion ? 0.01 : 0.25 }}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: TONE[stage.tone] }}>
                      Step {stage.step} · {stage.actor}
                    </p>
                    <a
                      href={pmFile(stage.source.path)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-teal-soft hover:underline"
                    >
                      {stage.source.label} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <h3 className="mt-2 text-xl font-semibold text-white sm:text-2xl">{stage.summary}</h3>
                  <div className="mt-5 max-h-[22rem] overflow-auto rounded-lg border border-white/[0.07] bg-black/40 p-4">
                    <Json value={stage.payload} />
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
          <p className="border-t border-white/10 px-4 py-2.5 font-mono text-[10.5px] text-slate-400">
            Sample payloads follow the repository&apos;s schemas and mock LLM provider. This page never connects to the MCP server
            (stdio only), and no state-changing tool is reachable from the web.
          </p>
        </div>

        {/* Stack + safety boundary */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-ink-900/60 p-5 sm:p-6">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">stack.yaml</p>
            <dl className="mt-4 divide-y divide-white/[0.07]">
              {STACK.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-3 py-2.5 text-sm">
                  <dt className="font-mono text-[12px] text-teal-soft">{k}</dt>
                  <dd className="text-slate-200">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rounded-xl border border-white/10 bg-ink-900/60 p-5 sm:p-6">
            <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5 text-teal" /> safety boundary
            </p>
            <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-slate-200">
              {BOUNDARY.map((b) => (
                <li key={b} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" aria-hidden="true" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/projects/pipelinemedic-ai" className="btn-primary" onClick={() => track("project_click", { source: "flagship_case_study", project: "pipelinemedic-ai" })}>
            Full case study <ArrowRight className="h-4 w-4" />
          </Link>
          <a href={PM_REPO} target="_blank" rel="noopener noreferrer" className="btn-secondary" onClick={() => track("github_click", { source: "flagship" })}>
            <Github className="h-4 w-4" /> Repository <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <Link href="/event#architecture" prefetch={false} className="btn-ghost text-teal-soft">
            Explore the MCP architecture <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
