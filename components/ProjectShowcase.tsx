"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Github, ExternalLink, Sparkles } from "lucide-react";
import { flagshipProjects } from "@/data/projects";
import { track } from "@/lib/analytics";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fadeUpVariants, staggerContainer } from "@/lib/motion";
import { ProjectArchitecture } from "./ProjectArchitecture";

export function ProjectShowcase() {
  const reducedMotion = useReducedMotion();
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
        {flagshipProjects.map((project) => {
          const isOpen = openId === project.id;
          const headerId = `project-header-${project.id}`;
          const panelId = `project-panel-${project.id}`;

          return (
            <motion.article
              key={project.id}
              variants={fadeUpVariants(reducedMotion)}
              className="glass-panel overflow-hidden rounded-2xl transition-colors duration-300"
            >
              <h3 className="m-0">
                <button
                  id={headerId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggle(project.id)}
                  className="flex w-full items-start justify-between gap-4 px-5 py-5 text-left sm:px-6"
                >
                  <span className="flex flex-1 flex-col gap-1.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-white sm:text-lg">{project.name}</span>
                      {project.featured && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-cyan">
                          <Sparkles className="h-3 w-3" />
                          Flagship
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-slate-400">{project.tagline}</span>
                  </span>
                  <ChevronDown
                    className={`mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform duration-300 ${
                      isOpen ? "rotate-180 text-accent-cyan" : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>
              </h3>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="content"
                    id={panelId}
                    role="region"
                    aria-labelledby={headerId}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: reducedMotion ? 0.01 : 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-1 gap-6 border-t border-white/10 px-5 pb-6 pt-5 sm:px-6 lg:grid-cols-2">
                      <div className="flex flex-col gap-5">
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Problem
                          </h4>
                          <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{project.problem}</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Solution
                          </h4>
                          <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{project.solution}</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Engineering challenge
                          </h4>
                          <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{project.challenge}</p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-5">
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Architecture
                          </h4>
                          <ProjectArchitecture architecture={project.architecture} className="mt-2" />
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Impact
                          </h4>
                          <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{project.impact}</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tech</h4>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {project.tech.map((t) => (
                              <span key={t} className="chip !text-[11px]">
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                        {project.githubUrl ? (
                          <a
                            href={project.githubUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary self-start"
                            onClick={() => track("github_click", { source: "project", project: project.id })}
                          >
                            <Github className="h-4 w-4" />
                            View repository
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <p className="text-xs italic text-slate-500">
                            Closed source — no public repository for this project.
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.article>
          );
        })}
      </motion.div>
    </section>
  );
}
