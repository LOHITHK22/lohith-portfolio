"use client";

import { motion } from "framer-motion";
import { Github, ArrowUpRight } from "lucide-react";
import { secondaryProjects, viewAllReposUrl } from "@/data/projects";
import { track } from "@/lib/analytics";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fadeUpVariants, staggerContainer } from "@/lib/motion";

export function GitHubProjects() {
  const reducedMotion = useReducedMotion();

  return (
    <section aria-labelledby="github-projects-heading" className="section-shell py-16 sm:py-24">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={fadeUpVariants(reducedMotion)}
        className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"
      >
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-teal">Also on GitHub</p>
          <h2 id="github-projects-heading" className="mt-3 font-hero text-3xl font-black leading-tight tracking-[-0.02em] text-white sm:text-4xl">
            Actively-maintained side projects
          </h2>
        </div>
        <a
          href={viewAllReposUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost gap-1.5 self-start !px-0 text-accent-cyan sm:self-auto"
          onClick={() => track("github_click", { source: "github_projects_view_all" })}
        >
          View all repositories on GitHub
          <ArrowUpRight className="h-4 w-4" />
        </a>
      </motion.div>

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer(reducedMotion)}
        className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        {secondaryProjects.map((repo) => (
          <motion.a
            key={repo.id}
            href={repo.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            variants={fadeUpVariants(reducedMotion)}
            onClick={() => track("github_click", { source: "secondary_project", project: repo.id })}
            className="glass-panel group flex flex-col gap-3 rounded-2xl p-5 transition-colors duration-300 hover:border-white/20"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-mono text-sm font-semibold text-white">
                <Github className="h-4 w-4 text-slate-400" />
                {repo.name}
              </span>
              <ArrowUpRight className="h-4 w-4 text-slate-500 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent-cyan" />
            </div>
            <p className="text-sm leading-relaxed text-slate-300">{repo.description}</p>
            <p className="text-xs italic text-slate-500">{repo.whyItMatters}</p>
            <span className="chip w-fit !text-[11px]">{repo.stack}</span>
          </motion.a>
        ))}
      </motion.div>
    </section>
  );
}
