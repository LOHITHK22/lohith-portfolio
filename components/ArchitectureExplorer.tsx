"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * Clickable architecture diagram: each "→" step is a node. Select a node to
 * read what happens there, or play the flow to walk through it in order.
 */
export function ArchitectureExplorer({ architecture, details }: { architecture: string; details: string[] }) {
  const reducedMotion = useReducedMotion();
  const steps = architecture.split("→").map((s) => s.trim());
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    timerRef.current = window.setTimeout(
      () => {
        if (active >= steps.length - 1) setPlaying(false);
        else setActive((a) => a + 1);
      },
      reducedMotion ? 1800 : 2600
    );
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [playing, active, steps.length, reducedMotion]);

  const togglePlay = () => {
    if (!playing && active >= steps.length - 1) setActive(0);
    setPlaying((p) => !p);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">Select a component, or play the flow.</p>
        <button type="button" onClick={togglePlay} className="btn-ghost !px-3 text-xs" aria-pressed={playing}>
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {playing ? "Pause flow" : "Play flow"}
        </button>
      </div>

      <ol className="mt-4 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-stretch">
        {steps.map((step, i) => {
          const isActive = i === active;
          const done = i < active;
          return (
            <li key={i} className="flex flex-col items-stretch md:flex-row md:items-center">
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setActive(i);
                }}
                aria-current={isActive ? "step" : undefined}
                className={`relative rounded-xl border px-3 py-2.5 text-left text-xs transition-all md:max-w-[15rem] ${
                  isActive
                    ? "border-accent-cyan/60 bg-accent-cyan/10 text-white shadow-[0_0_24px_-6px_rgba(34,211,238,0.6)]"
                    : done
                      ? "border-white/15 bg-white/[0.04] text-slate-300"
                      : "border-white/10 text-slate-400 hover:border-white/25 hover:text-slate-200"
                }`}
              >
                <span className="mb-0.5 block font-mono text-[10px] text-slate-400">{String(i + 1).padStart(2, "0")}</span>
                {step}
              </button>
              {i < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`mx-auto my-1 h-4 w-px transition-colors duration-500 md:mx-1.5 md:my-0 md:h-px md:w-5 ${
                    i < active ? "bg-accent-cyan" : "bg-white/15"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 min-h-[6rem] rounded-xl border border-white/10 bg-base-950/60 p-4" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: reducedMotion ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0.01 : 0.2 }}
          >
            <p className="font-mono text-[11px] uppercase tracking-wider text-accent-cyan">
              Step {active + 1} of {steps.length}
            </p>
            <p className="mt-1 text-sm font-semibold text-white">{steps[active]}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{details[active]}</p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
