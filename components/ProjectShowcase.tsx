"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { flagshipProjects } from "@/data/projects";
import { track } from "@/lib/analytics";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useCanHover } from "@/hooks/useCanHover";
import { fadeUpVariants, staggerContainer } from "@/lib/motion";
import { ProjectCard } from "./ProjectCard";

export function ProjectShowcase() {
  const reducedMotion = useReducedMotion();
  const canHover = useCanHover();
  const [openId, setOpenId] = useState<string | null>(flagshipProjects[0]?.id ?? null);

  const toggle = (id: string) => {
    const next = openId === id ? null : id;
    setOpenId(next);
    if (next) track("project_click", { project: id });
  };

  return (
    <section id="projects" className="section-shell py-16 sm:py-24">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={fadeUpVariants(reducedMotion)}
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-cyan">Project showcase</p>
        <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Engineering case studies</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
          Six systems I designed and built. Tap any card for the full problem → architecture → impact
          breakdown.
        </p>
      </motion.div>

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer(reducedMotion, 0.06)}
        className="mt-10 flex flex-col gap-4"
      >
        {flagshipProjects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            isOpen={openId === project.id}
            onToggle={() => toggle(project.id)}
            reducedMotion={reducedMotion}
            canHover={canHover}
          />
        ))}
      </motion.div>
    </section>
  );
}
