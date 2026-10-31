"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ExternalLink, Github } from "lucide-react";
import { flagshipProjects as allProjects } from "@/data/projects";
import { track } from "@/lib/analytics";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fadeUpVariants } from "@/lib/motion";
import { ArchitectureFlow } from "./ArchitectureFlow";

// PipelineMedic has its own chapter (FlagshipSystem); this shows the rest.
const flagshipProjects = allProjects.filter((p) => p.id !== "pipelinemedic-ai");

export function ProjectShowcase() {
  const reducedMotion = useReducedMotion();
  const [activeId, setActiveId] = useState(flagshipProjects[0].id);
  const stageRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = flagshipProjects.findIndex((p) => p.id === activeId);
  const project = flagshipProjects[activeIndex];

  const select = (id: string) => {
    if (id === activeId) return;
    setActiveId(id);
    track("project_click", { project: id });
  };

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const keys: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    let next: number | null = null;
    if (e.key in keys) next = (activeIndex + keys[e.key] + flagshipProjects.length) % flagshipProjects.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = flagshipProjects.length - 1;
    if (next === null) return;
    e.preventDefault();
    select(flagshipProjects[next].id);
    tabRefs.current[next]?.focus();
  };

  // Bridge for "Ask about me": lets the Q&A feature open a specific project
  // and scroll to it without reaching into this component's state.
  useEffect(() => {
    const onOpenProject = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id || !flagshipProjects.some((p) => p.id === id)) return;
      setActiveId(id);
      window.setTimeout(() => {
        stageRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      }, 50);
    };
    window.addEventListener("open-project", onOpenProject);
    return () => window.removeEventListener("open-project", onOpenProject);
  }, [reducedMotion]);

  return (
    <section id="projects" className="section-shell py-16 sm:py-24">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={fadeUpVariants(reducedMotion)}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-teal">04 · Other systems</p>
          <h2 className="mt-4 font-hero text-4xl font-black leading-[0.98] tracking-[-0.03em] text-white sm:text-6xl">More engineering <span className="text-teal">case studies</span></h2>
        </div>
        <p className="max-w-sm text-sm text-slate-400">
          Architecture, the key decision, and verified results for each system. Every number comes from the repository or resume.
        </p>
      </motion.div>

      <div className="mt-10 grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8">
        {/* Project selector */}
        <div
          role="tablist"
          aria-label="Projects"
          aria-orientation="vertical"
          className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
        >
          {flagshipProjects.map((p, i) => {
            const selected = p.id === activeId;
            return (
              <button
                key={p.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                id={`project-header-${p.id}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls="project-stage"
                tabIndex={selected ? 0 : -1}
                onClick={() => select(p.id)}
                onKeyDown={onTabKey}
                className="group relative min-w-[13.5rem] shrink-0 snap-start overflow-hidden rounded-2xl border px-4 py-3.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white lg:min-w-0"
                style={{
                  borderColor: selected ? `${p.accent}88` : "rgba(255,255,255,0.08)",
                  background: selected ? `linear-gradient(120deg, ${p.accent}1f, rgba(255,255,255,0.02))` : "rgba(255,255,255,0.02)",
                }}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-3 left-0 w-[3px] rounded-full transition-opacity"
                  style={{ background: p.accent, opacity: selected ? 1 : 0 }}
                />
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[10px] tracking-widest" style={{ color: p.accent }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-mono text-sm font-semibold text-white">{p.metrics[0].value}</span>
                </span>
                <span className={`mt-1 block font-display text-base font-semibold ${selected ? "text-white" : "text-slate-300 group-hover:text-white"}`}>
                  {p.name}
                </span>
                <span className="block text-[11px] text-slate-400">{p.metrics[0].label}</span>
              </button>
            );
          })}
        </div>

        {/* Stage */}
        <div
          ref={stageRef}
          id="project-stage"
          role="tabpanel"
          aria-labelledby={`project-header-${project.id}`}
          className="relative scroll-mt-24 overflow-hidden rounded-3xl border border-white/10 bg-base-900/60"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 transition-[background] duration-700"
            style={{ background: `radial-gradient(60% 50% at 100% 0%, ${project.accent}22, transparent 70%), radial-gradient(40% 40% at 0% 100%, ${project.accent}12, transparent 70%)` }}
          />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: reducedMotion ? 0 : 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reducedMotion ? 0 : -8 }}
              transition={{ duration: reducedMotion ? 0.01 : 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="relative p-5 sm:p-8"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color: project.accent }}>
                {project.githubUrl ? "Case study · public repository" : "Case study · details from resume"}
              </p>
              <h3 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">{project.name}</h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300 sm:text-base">{project.tagline}</p>

              <dl className="mt-6 grid grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/10 bg-base-950/50">
                {project.metrics.map((m) => (
                  <div key={m.label} className="flex flex-col px-3 py-3.5 sm:px-5">
                    <dt className="order-2 mt-0.5 text-[11px] leading-snug text-slate-400">{m.label}</dt>
                    <dd className="order-1 truncate font-mono text-lg font-semibold text-white sm:text-2xl">{m.value}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-7">
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-slate-400">Architecture · select a step</p>
                <ArchitectureFlow architecture={project.architecture} accent={project.accent} reducedMotion={reducedMotion} />
              </div>

              <div className="mt-6 grid gap-5 border-t border-white/10 pt-6 md:grid-cols-3">
                {[
                  { label: "Problem", body: project.problem },
                  { label: "Key decision", body: project.challenge },
                  { label: "Result", body: project.impact },
                ].map((b) => (
                  <div key={b.label}>
                    <h4 className="font-mono text-[10px] uppercase tracking-[0.22em]" style={{ color: b.label === "Result" ? project.accent : "#94a3b8" }}>
                      {b.label}
                    </h4>
                    <p className="mt-2 text-sm leading-relaxed text-slate-300">{b.body}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-1.5">
                {project.tech.map((t) => (
                  <span key={t} className="chip !text-[11px]">
                    {t}
                  </span>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <Link
                  href={`/projects/${project.id}`}
                  className="btn-primary"
                  onClick={() => track("project_click", { source: "project_card_case_study", project: project.id })}
                >
                  Full case study
                  <ArrowRight className="h-4 w-4" />
                </Link>
                {project.githubUrl ? (
                  <a
                    href={project.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary"
                    onClick={() => track("github_click", { source: "project", project: project.id })}
                  >
                    <Github className="h-4 w-4" />
                    View repository
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <p className="text-xs italic text-slate-400">No public repository yet.</p>
                )}
                {project.id === "pipelinemedic-ai" && (
                  <Link href="/event#architecture" prefetch={false} className="btn-ghost text-cyan-200">
                    Explore the MCP architecture
                  </Link>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
