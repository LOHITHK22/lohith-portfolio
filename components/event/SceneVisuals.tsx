"use client";

import { motion } from "framer-motion";
import { Check, Gauge, Layers, LockKeyhole, Monitor, ShieldCheck, Smartphone, WifiOff } from "lucide-react";
import { agentById } from "@/data/agentTeam";
import { demoStages, DEMO_LABEL, pmFile } from "@/data/eventDemo";
import { eventScenes, plannedRuntimeMs, type EventSceneId } from "@/data/eventTour";
import manifest from "@/data/eventAudioManifest.json";

/** Show item `i` of `n` once the scene has progressed far enough. */
const shown = (progress: number, i: number, n: number, lead = 0.08) => progress >= lead + (i / n) * (1 - lead * 2);

function Panel({ children, label, color }: { children: React.ReactNode; label: string; color: string }) {
  return (
    <div className="relative rounded-2xl border border-white/10 bg-base-900/70 p-4 backdrop-blur sm:p-5">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] sm:text-[11px]" style={{ color }}>
        {label}
      </p>
      {children}
    </div>
  );
}

function Reveal({ on, children, className = "", reduced }: { on: boolean; children: React.ReactNode; className?: string; reduced: boolean }) {
  return (
    <motion.div
      className={className}
      initial={false}
      animate={{ opacity: on ? 1 : 0.12, y: on || reduced ? 0 : 8 }}
      transition={{ duration: reduced ? 0.01 : 0.35 }}
    >
      {children}
    </motion.div>
  );
}

function WelcomeVisual({ progress, reduced }: VisualProps) {
  return (
    <Panel label="Mission brief" color={agentById.astra.color}>
      <p className="font-display text-2xl font-semibold text-white sm:text-3xl">Lohith&apos;s AI Lab</p>
      <p className="mt-2 text-sm text-slate-300">Seven roles, one handoff chain:</p>
      <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {eventScenes.map((s, i) => {
          const a = agentById[s.agentId];
          return (
            <Reveal key={s.id} on={shown(progress, i, eventScenes.length)} reduced={reduced}>
              <li className="rounded-lg border border-white/10 px-2.5 py-2 text-xs" style={{ borderColor: `${a.color}40` }}>
                <span className="font-mono font-semibold" style={{ color: a.color }}>
                  {a.name}
                </span>
                <span className="block text-slate-400">{a.short}</span>
              </li>
            </Reveal>
          );
        })}
      </ol>
    </Panel>
  );
}

function DesignVisual({ progress, reduced }: VisualProps) {
  const swatches = ["#050814", "#10172d", "#22d3ee", "#8b5cf6", "#f8fafc"];
  return (
    <Panel label="Design layers" color={agentById.nova.color}>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
        <Reveal on={shown(progress, 0, 3)} reduced={reduced} className="rounded-xl border border-dashed border-white/20 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" /> Layout
          </p>
          <div className="space-y-1.5">
            <div className="h-2.5 w-3/4 rounded bg-white/15" />
            <div className="h-2 w-full rounded bg-white/10" />
            <div className="h-2 w-5/6 rounded bg-white/10" />
            <div className="mt-2 flex gap-1.5">
              <div className="h-5 w-16 rounded-full bg-white/20" />
              <div className="h-5 w-12 rounded-full border border-white/20" />
            </div>
          </div>
        </Reveal>
        <Reveal on={shown(progress, 1, 3)} reduced={reduced} className="rounded-xl border border-white/10 p-3">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Type</p>
          <p className="font-display text-xl font-bold leading-tight text-white">Clear interfaces</p>
          <p className="text-xs text-slate-400">Space Grotesk · Inter · JetBrains Mono</p>
        </Reveal>
      </div>
      <Reveal on={shown(progress, 2, 3)} reduced={reduced} className="mt-3 flex items-center gap-2">
        {swatches.map((c) => (
          <span key={c} className="h-7 flex-1 rounded-md border border-white/10" style={{ background: c }} title={c} />
        ))}
      </Reveal>
    </Panel>
  );
}

function EngineeringVisual({ progress, reduced }: VisualProps) {
  const files = ["app/event/page.tsx", "components/event/EventExperience.tsx", "hooks/useEventPlayback.ts", "components/event/MCPArchitecture.tsx"];
  return (
    <Panel label="From design to components" color={agentById.forge.color}>
      <Reveal on={shown(progress, 0, 3)} reduced={reduced}>
        <pre className="overflow-x-auto rounded-xl border border-white/10 bg-base-950/80 p-3 font-mono text-[11px] leading-relaxed text-slate-300 sm:text-xs">
          <span className="text-violet-300">const</span> {"{ state, pause, next }"} = <span className="text-cyan-300">useEventPlayback</span>();{"\n"}
          {"<"}<span className="text-amber-300">AgentAvatar</span> agent={"{forge}"} speaking={"{true}"} {"/>"}
        </pre>
      </Reveal>
      <ul className="mt-3 space-y-1.5">
        {files.map((f, i) => (
          <Reveal key={f} on={shown(progress, i + 1, files.length + 1)} reduced={reduced}>
            <li className="flex items-center gap-2 font-mono text-[11px] text-slate-300 sm:text-xs">
              <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
              {f}
            </li>
          </Reveal>
        ))}
      </ul>
    </Panel>
  );
}

function compactPayload(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, null, 1).replace(/\n\s*/g, " ").slice(0, 260);
}

export function PipelineMedicVisual({ progress, reduced }: VisualProps) {
  const n = demoStages.length;
  const active = Math.min(n - 1, Math.floor(Math.max(0, progress - 0.04) * n * 1.05));
  const stage = demoStages[active];
  const toneColor = { info: "#22d3ee", warn: "#f59e0b", gate: "#a78bfa", ok: "#34d399" }[stage.tone];
  return (
    <Panel label={DEMO_LABEL} color={agentById.atlas.color}>
      <ol className="grid grid-cols-7 gap-1" aria-label="PipelineMedic stages">
        {demoStages.map((s, i) => (
          <li key={s.id} className="flex flex-col items-center text-center">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-semibold transition-all duration-300 sm:h-8 sm:w-8 sm:text-[11px]"
              style={{
                borderColor: i <= active ? toneColorOf(s.tone) : "rgba(255,255,255,0.15)",
                background: i === active ? `${toneColorOf(s.tone)}30` : "transparent",
                color: i <= active ? "#fff" : "#94a3b8",
              }}
              aria-current={i === active ? "step" : undefined}
            >
              {s.step}
            </span>
            <span className={`mt-1 text-[9px] leading-tight sm:text-[11px] ${i === active ? "text-white" : "text-slate-300"}`}>{s.label}</span>
          </li>
        ))}
      </ol>
      <motion.div
        key={stage.id}
        initial={{ opacity: 0, y: reduced ? 0 : 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0.01 : 0.25 }}
        className="mt-3 rounded-xl border p-3"
        style={{ borderColor: `${toneColor}55`, background: `${toneColor}0d` }}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-white">
            {stage.step} · {stage.label} <span className="font-normal text-slate-400">· {stage.actor}</span>
          </p>
          {(stage.id === "approval" || stage.id === "policy") && (
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-300/40 bg-violet-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200 sm:text-[11px]">
              <LockKeyhole className="h-3 w-3" aria-hidden="true" /> Human approval required
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-300 sm:text-sm">{stage.summary}</p>
        <pre className="mt-2 max-h-24 overflow-hidden whitespace-pre-wrap break-words font-mono text-[10px] leading-snug text-slate-400 sm:text-[11px]">
          {compactPayload(stage.payload)}
        </pre>
        <a
          href={pmFile(stage.source.path)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block font-mono text-[10px] text-cyan-300 sm:text-[11px] underline-offset-2 hover:underline"
        >
          source: {stage.source.label}
        </a>
      </motion.div>
      <p className="mt-2 text-[10px] leading-snug text-slate-400 sm:text-[11px]">
        Sample values. The Kafka-lag path is implemented and unit/DB-tested in the repo; the live-stack runs covered schema drift,
        poison messages, and Airflow failures.
      </p>
    </Panel>
  );
}

function toneColorOf(tone: "info" | "warn" | "gate" | "ok") {
  return { info: "#22d3ee", warn: "#f59e0b", gate: "#a78bfa", ok: "#34d399" }[tone];
}

const clips = Object.values(manifest.clips as Record<string, { bytes: number }>);
const audioKb = Math.round(clips.reduce((s, c) => s + c.bytes, 0) / 1024);

function PerformanceVisual({ progress, reduced }: VisualProps) {
  const items = [
    { icon: Gauge, label: "Narration preloaded", value: `${clips.length} clips · ${audioKb} KB` },
    { icon: WifiOff, label: "Network during playback", value: "none (clips decoded in memory first)" },
    { icon: Gauge, label: "Measured clip timing", value: `${(plannedRuntimeMs() / 1000).toFixed(1)} s planned` },
    { icon: Layers, label: "Reduced motion", value: reduced ? "on: motion minimized" : "respected when requested" },
  ];
  return (
    <Panel label="Performance budget" color={agentById.pulse.color}>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((it, i) => (
          <Reveal key={it.label} on={shown(progress, i, items.length + 1)} reduced={reduced}>
            <li className="flex items-start gap-2 rounded-lg border border-white/10 p-2.5">
              <it.icon className="mt-0.5 h-4 w-4 shrink-0 text-pink-300" aria-hidden="true" />
              <span>
                <span className="block text-[11px] uppercase tracking-wide text-slate-400">{it.label}</span>
                <span className="text-sm text-white">{it.value}</span>
              </span>
            </li>
          </Reveal>
        ))}
      </ul>
      <Reveal on={shown(progress, items.length, items.length + 1)} reduced={reduced} className="mt-3 flex items-end justify-center gap-4 text-slate-400">
        <Monitor className="h-10 w-10" aria-hidden="true" />
        <Smartphone className="h-7 w-7" aria-hidden="true" />
        <span className="text-xs">Same experience, desktop to phone</span>
      </Reveal>
    </Panel>
  );
}

function TestingVisual({ progress, reduced }: VisualProps) {
  const checks = [
    "121 pytest tests in PipelineMedic (63 for the MCP server)",
    "5 destructive tools are never registered",
    "State-changing MCP tools hidden by default",
    "Approvals single-use, bound to SHA-256 of the arguments",
  ];
  const audit = ["APPROVAL_REQUESTED", "HUMAN_APPROVED", "CANARY_VALIDATION_PASSED", "REPAIR_COMPLETED", "VALIDATION_PASSED", "INCIDENT_RESOLVED"];
  return (
    <Panel label="Verification" color={agentById.sentinel.color}>
      <ul className="space-y-1.5">
        {checks.map((c, i) => (
          <Reveal key={c} on={shown(progress, i, checks.length + 1)} reduced={reduced}>
            <li className="flex items-start gap-2 text-xs text-slate-200 sm:text-sm">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" aria-hidden="true" />
              {c}
            </li>
          </Reveal>
        ))}
      </ul>
      <Reveal on={shown(progress, checks.length, checks.length + 1)} reduced={reduced} className="mt-3">
        <p className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-400">incident events (sample sequence)</p>
        <div className="flex flex-wrap gap-1.5">
          {audit.map((e) => (
            <span key={e} className="rounded border border-white/10 bg-base-950/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-300 sm:text-[11px]">
              {e}
            </span>
          ))}
        </div>
      </Reveal>
    </Panel>
  );
}

type VisualProps = { progress: number; reduced: boolean };

export function SceneVisual({ sceneId, progress, reduced }: { sceneId: EventSceneId } & VisualProps) {
  switch (sceneId) {
    case "welcome":
      return <WelcomeVisual progress={progress} reduced={reduced} />;
    case "design":
      return <DesignVisual progress={progress} reduced={reduced} />;
    case "engineering":
      return <EngineeringVisual progress={progress} reduced={reduced} />;
    case "pipelinemedic":
      return <PipelineMedicVisual progress={progress} reduced={reduced} />;
    case "performance":
      return <PerformanceVisual progress={progress} reduced={reduced} />;
    case "testing":
      return <TestingVisual progress={progress} reduced={reduced} />;
    default:
      return null;
  }
}
