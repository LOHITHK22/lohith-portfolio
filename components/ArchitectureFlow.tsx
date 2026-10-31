"use client";

import { useState } from "react";
import { parseArchitectureSteps } from "@/lib/utils";

/** "Deterministic detectors (schema drift, ...)" -> label + detail. */
function splitStep(step: string) {
  const m = step.match(/^([^(]+?)\s*\((.+)\)\s*(.*)$/);
  if (!m) return { label: step, detail: "" };
  return { label: `${m[1]}${m[3] ? ` ${m[3]}` : ""}`.trim(), detail: m[2] };
}

/**
 * The project's "A → B → C" architecture as a node chain with a signal pulse
 * travelling along the connectors. Each node is a button: selecting it shows
 * the step's full description underneath. Horizontal on wide screens,
 * vertical on phones.
 */
export function ArchitectureFlow({ architecture, accent, reducedMotion }: { architecture: string; accent: string; reducedMotion: boolean }) {
  const steps = parseArchitectureSteps(architecture).map(splitStep);
  const [active, setActive] = useState(0);
  const current = steps[Math.min(active, steps.length - 1)];

  return (
    <div>
      <ol className="flex flex-col gap-0 md:flex-row md:items-stretch" aria-label="Architecture flow">
        {steps.map((s, i) => {
          const isActive = i === active;
          return (
            <li key={i} className="flex min-w-0 flex-col md:flex-1 md:flex-row md:items-center">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-pressed={isActive}
                className="group relative flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:h-full md:flex-col md:items-start md:gap-1.5"
                style={{
                  borderColor: isActive ? accent : "rgba(255,255,255,0.08)",
                  background: isActive ? `${accent}14` : "rgba(255,255,255,0.02)",
                  boxShadow: isActive ? `0 0 30px -12px ${accent}` : "none",
                }}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]"
                  style={{ borderColor: `${accent}80`, color: isActive ? "#050814" : accent, background: isActive ? accent : "transparent" }}
                >
                  {i + 1}
                </span>
                <span className={`text-xs font-medium leading-snug ${isActive ? "text-white" : "text-slate-300 group-hover:text-white"}`}>
                  {s.label}
                </span>
              </button>
              {i < steps.length - 1 && (
                <span aria-hidden="true" className="relative mx-auto h-4 w-px overflow-hidden bg-white/10 md:mx-0 md:h-px md:w-5 md:shrink-0">
                  {!reducedMotion && (
                    <span
                      className="arch-pulse absolute rounded-full"
                      style={{ background: accent, boxShadow: `0 0 8px ${accent}`, animationDelay: `${i * 0.35}s` }}
                    />
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 min-h-[2.5rem] text-sm leading-relaxed text-slate-300" aria-live="polite">
        <span className="font-mono text-[11px] uppercase tracking-wider" style={{ color: accent }}>
          Step {active + 1}
        </span>{" "}
        <span className="font-medium text-white">{current.label}</span>
        {current.detail ? <span className="text-slate-400">: {current.detail}</span> : null}
      </p>
    </div>
  );
}
