"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Database, GitPullRequest, Siren, type LucideIcon } from "lucide-react";
import { track } from "@/lib/analytics";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fadeUpVariants } from "@/lib/motion";

type Experience = { title: string; body: string; skills: string; icon: LucideIcon; href?: string };

const EXPERIENCES: Experience[] = [
  {
    title: "Solve a SQL Mystery",
    body: "Four data-quality incidents. Write real SQL against a disposable SQLite database in your browser.",
    skills: "GROUP BY · JOINs · reconciliation · reporting",
    icon: Database,
    href: "/playground/sql-detective",
  },
  {
    title: "Fix a Broken Pipeline",
    body: "Command a simulated PipelineMedic incident, where your decisions and the MCP safety policy decide the outcome.",
    skills: "Kafka · Flink · Airflow · MCP policy",
    icon: Siren,
  },
  {
    title: "Explore PRISM's Evolution",
    body: "The traceable history of how my maintenance agents improved this site, issue to merged pull request.",
    skills: "Issues · CI · approvals · deploys",
    icon: GitPullRequest,
  },
];

/** Compact homepage entry point to the hands-on experiences, which live on their own routes. */
export function EngineeringPlayground() {
  const reducedMotion = useReducedMotion();
  return (
    <section id="playground" aria-labelledby="playground-heading" className="section-shell pb-16 sm:pb-24">
      <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeUpVariants(reducedMotion)}>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-teal">Engineering Playground</p>
        <h2 id="playground-heading" className="mt-3 font-hero text-3xl font-black leading-[1] tracking-[-0.03em] text-white sm:text-4xl">
          Don&apos;t just read about it. <span className="text-teal">Try it.</span>
        </h2>
        <ul className="mt-6 grid gap-3 md:grid-cols-3">
          {EXPERIENCES.map(({ title, body, skills, icon: Icon, href }) => {
            const content = (
              <>
                <span className="flex items-center justify-between gap-3">
                  <Icon className="h-5 w-5 text-teal" aria-hidden="true" />
                  {href ? (
                    <ArrowRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-teal motion-reduce:transition-none" aria-hidden="true" />
                  ) : (
                    <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">Coming next</span>
                  )}
                </span>
                <span className="mt-3 block font-semibold text-white">{title}</span>
                {/* On phones the upcoming cards collapse to a title so the section stays compact. */}
                <span className={`mt-1.5 text-sm leading-relaxed text-slate-400 ${href ? "block" : "hidden md:block"}`}>{body}</span>
                <span className={`mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500 ${href ? "block" : "hidden md:block"}`}>{skills}</span>
              </>
            );
            return (
              <li key={title}>
                {href ? (
                  <Link
                    href={href}
                    onClick={() => track("playground_open", { experience: href })}
                    className="group block h-full rounded-2xl border border-teal/25 bg-teal/[0.04] p-5 transition-colors hover:border-teal/50 hover:bg-teal/[0.07]"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="h-full rounded-2xl border border-white/[0.08] bg-white/[0.015] p-4 opacity-80 md:p-5">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      </motion.div>
    </section>
  );
}
