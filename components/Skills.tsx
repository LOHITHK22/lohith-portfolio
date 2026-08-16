"use client";

import { motion } from "framer-motion";
import { Code2, Server, BrainCircuit, Cloud, Database, MonitorSmartphone, CheckSquare } from "lucide-react";
import { skillGroups } from "@/data/skills";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fadeUpVariants, staggerContainer } from "@/lib/motion";
import { onSpotlightMove } from "@/lib/utils";

const groupIcons: Record<string, typeof Code2> = {
  languages: Code2,
  backend: Server,
  "ai-genai": BrainCircuit,
  "cloud-devops": Cloud,
  "data-streaming": Database,
  frontend: MonitorSmartphone,
  practices: CheckSquare,
};

export function Skills() {
  const reducedMotion = useReducedMotion();

  return (
    <section id="skills" className="section-shell py-16 sm:py-24">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={fadeUpVariants(reducedMotion)}
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-cyan">Toolbox</p>
        <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Skills &amp; technologies</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
          Grouped by category. No arbitrary percentage bars — just what I actually use.
        </p>
      </motion.div>

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer(reducedMotion)}
        className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        {skillGroups.map((group) => {
          const Icon = groupIcons[group.id] ?? Code2;
          return (
            <motion.div
              key={group.id}
              variants={fadeUpVariants(reducedMotion)}
              onMouseMove={onSpotlightMove}
              whileHover={reducedMotion ? undefined : { y: -4 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="glass-panel rounded-2xl p-5 transition-colors duration-300 hover:border-white/20 sm:p-6"
            >
              <div className="mb-4 flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-accent-cyan">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <h3 className="text-sm font-semibold text-white">{group.label}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {group.skills.map((skill) => (
                  <span key={skill} className="chip">
                    {skill}
                  </span>
                ))}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
