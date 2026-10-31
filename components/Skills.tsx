"use client";

import { motion } from "framer-motion";
import { Code2, Workflow, BrainCircuit, Database, BarChart3 } from "lucide-react";
import { skillGroups } from "@/data/skills";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fadeUpVariants, staggerContainer } from "@/lib/motion";

const groupIcons: Record<string, typeof Code2> = {
  languages: Code2,
  "data-streaming": Workflow,
  databases: Database,
  "ai-genai": BrainCircuit,
  visualization: BarChart3,
};

export function Skills() {
  const reducedMotion = useReducedMotion();

  return (
    <section id="skills" className="section-shell py-16 sm:py-24">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-teal">Toolbox</p>
      <h2 className="mt-3 font-hero text-3xl font-black leading-tight tracking-[-0.02em] text-white sm:text-4xl">What I can do with it</h2>
      <p className="mt-3 max-w-2xl text-sm text-slate-400 sm:text-base">
        Organized by capability, not a wall of logos: what I actually use and what it lets me build.
      </p>

      {/* A spec sheet, not another card grid. */}
      <motion.dl
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer(reducedMotion)}
        className="mt-10 divide-y divide-white/[0.07] border-y border-white/[0.07]"
      >
        {skillGroups.map((group) => {
          const Icon = groupIcons[group.id] ?? Code2;
          return (
            <motion.div
              key={group.id}
              variants={fadeUpVariants(reducedMotion)}
              className="grid gap-3 py-5 sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-center sm:gap-8"
            >
              <dt className="flex items-center gap-3">
                <Icon className="h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
                <span className="font-hero text-lg font-extrabold text-white">{group.verb}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{group.label}</span>
              </dt>
              <dd className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-300">
                {group.skills.map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </dd>
            </motion.div>
          );
        })}
      </motion.dl>
    </section>
  );
}
