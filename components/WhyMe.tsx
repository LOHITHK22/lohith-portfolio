"use client";

import { motion } from "framer-motion";
import { Shield, Layers, Gauge, FileCheck2, Award } from "lucide-react";
import { whyMeSignals } from "@/data/profile";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fadeUpVariants, staggerContainer } from "@/lib/motion";
import { onSpotlightMove } from "@/lib/utils";
import { StackedSectionHeader } from "./StackedSectionHeader";

const icons = [Shield, Layers, Gauge, FileCheck2, Award];

export function WhyMe() {
  const reducedMotion = useReducedMotion();

  return (
    <section id="why-me" className="section-shell py-16 sm:py-24">
      <StackedSectionHeader
        index={1}
        eyebrow="Why me"
        title="Evidence, not adjectives."
        description="Six things I actually shipped, with the numbers that prove it."
      />

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer(reducedMotion)}
        className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        {whyMeSignals.map((item, i) => {
          const Icon = icons[i % icons.length];
          return (
            <motion.div
              key={item.id}
              variants={fadeUpVariants(reducedMotion)}
              onMouseMove={onSpotlightMove}
              whileHover={reducedMotion ? undefined : { y: -4 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="glass-panel group rounded-2xl p-6 transition-colors duration-300 hover:border-white/20"
            >
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-accent/10 blur-2xl transition-opacity duration-300 group-hover:opacity-80" />
              <div className="relative flex items-start justify-between gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-accent-cyan">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="text-right">
                  <div className="font-mono text-xl font-bold text-white sm:text-2xl">{item.stat}</div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">{item.statLabel}</div>
                </div>
              </div>
              <p className="relative mt-5 text-sm leading-relaxed text-slate-300 sm:text-[15px]">
                {item.signal}
              </p>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
