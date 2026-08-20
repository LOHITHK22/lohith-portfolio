"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

type StackedSectionHeaderProps = {
  /** 1-based chapter number, rendered as "01", "02", etc. */
  index: number;
  eyebrow: string;
  title: string;
  description?: string;
};

/**
 * A cinematic, numbered chapter header: pins below the nav bar while its
 * section scrolls past underneath, then scales down / blurs / fades as the
 * section's content finishes scrolling over it. Pure framer-motion
 * (useScroll + useTransform tied to native scroll) — no extra smooth-scroll
 * library, so it can't fight the whileInView reveals used elsewhere on the
 * page. Falls back to a plain static header under prefers-reduced-motion.
 */
export function StackedSectionHeader({ index, eyebrow, title, description }: StackedSectionHeaderProps) {
  const reducedMotion = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end start"],
  });

  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.92]);
  const opacity = useTransform(scrollYProgress, [0, 0.7, 1], [1, 1, 0.4]);
  const blurPx = useTransform(scrollYProgress, [0, 1], [0, 8]);
  const filter = useTransform(blurPx, (b) => `blur(${b}px)`);

  if (reducedMotion) {
    return (
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-cyan">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{title}</h2>
        {description && (
          <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">{description}</p>
        )}
      </div>
    );
  }

  return (
    <div ref={trackRef} className="relative mb-10" style={{ height: "70vh" }}>
      <motion.div
        style={{ scale, opacity, filter }}
        className="glass-panel sticky top-20 overflow-hidden rounded-3xl px-6 py-8 sm:px-10 sm:py-10"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-accent-cyan">{eyebrow}</p>
            <h2 className="text-glow mt-3 text-3xl font-black leading-[0.95] tracking-tight text-white sm:text-5xl">
              {title}
            </h2>
            {description && (
              <p className="mt-4 max-w-2xl text-sm text-slate-400 sm:text-base">{description}</p>
            )}
          </div>
          <span
            aria-hidden="true"
            className="shrink-0 font-mono text-4xl font-bold text-white/10 sm:text-6xl"
          >
            {String(index).padStart(2, "0")}
          </span>
        </div>
      </motion.div>
    </div>
  );
}
