"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Github, Linkedin, FileText, ArrowDown, Mail, Zap } from "lucide-react";
import { profile, heroStats } from "@/data/profile";
import { track } from "@/lib/analytics";
import { AnimatedCounter } from "./AnimatedCounter";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fadeUpVariants } from "@/lib/motion";
import dynamic from "next/dynamic";

const GridBackground = dynamic(() => import("./GridBackground").then((m) => m.GridBackground), {
  ssr: true,
});

export function Hero() {
  const reducedMotion = useReducedMotion();

  return (
    <section id="top" className="relative overflow-hidden pb-16 pt-10 sm:pb-24 sm:pt-16">
      <GridBackground />

      <div className="section-shell relative">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUpVariants(reducedMotion)}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-slate-300"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          {profile.careerFairTagline}
        </motion.div>

        <motion.h1
          initial="hidden"
          animate="visible"
          variants={fadeUpVariants(reducedMotion, 0.05)}
          className="max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl md:text-6xl"
        >
          {profile.name}
        </motion.h1>

        <motion.p
          initial="hidden"
          animate="visible"
          variants={fadeUpVariants(reducedMotion, 0.1)}
          className="mt-4 max-w-2xl text-lg font-medium sm:text-xl"
        >
          <span className="gradient-text">{profile.headline}</span>
        </motion.p>

        <motion.p
          initial="hidden"
          animate="visible"
          variants={fadeUpVariants(reducedMotion, 0.15)}
          className="mt-2 text-sm font-medium uppercase tracking-wide text-slate-400 sm:text-base"
        >
          {profile.subIdentity}
        </motion.p>

        <motion.p
          initial="hidden"
          animate="visible"
          variants={fadeUpVariants(reducedMotion, 0.2)}
          className="mt-5 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg"
        >
          {profile.heroParagraph}
        </motion.p>

        {/* Primary CTAs */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUpVariants(reducedMotion, 0.25)}
          className="mt-8 flex flex-wrap items-center gap-3"
        >
          <a
            href={profile.resumeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
            onClick={() => track("resume_view_click", { source: "hero" })}
          >
            <FileText className="h-4 w-4" />
            View Resume
          </a>
          <Link href="/recruiter" className="btn-secondary">
            <Zap className="h-4 w-4" />
            Recruiter Mode
          </Link>
          <a href="#projects" className="btn-secondary">
            Explore Projects
            <ArrowDown className="h-4 w-4" />
          </a>
        </motion.div>

        {/* Secondary CTAs */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUpVariants(reducedMotion, 0.3)}
          className="mt-3 flex flex-wrap items-center gap-3"
        >
          <a
            href={profile.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost gap-1.5 !px-3"
            onClick={() => track("github_click", { source: "hero" })}
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
          <a
            href={profile.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost gap-1.5 !px-3"
            onClick={() => track("linkedin_click", { source: "hero" })}
          >
            <Linkedin className="h-4 w-4" />
            LinkedIn
          </a>
          <a
            href="#contact"
            className="btn-ghost gap-1.5 !px-3"
            onClick={() => track("contact_click", { source: "hero" })}
          >
            <Mail className="h-4 w-4" />
            Contact Me
          </a>
        </motion.div>

        {/* Stat counters */}
        <motion.dl
          initial="hidden"
          animate="visible"
          variants={fadeUpVariants(reducedMotion, 0.35)}
          className="mt-14 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-white/10 pt-8 sm:grid-cols-4"
        >
          {heroStats.map((stat) => (
            <div key={stat.id}>
              <dt className="sr-only">{stat.label}</dt>
              <dd className="font-mono text-2xl font-bold text-white sm:text-3xl">
                <AnimatedCounter value={stat.value} suffix={stat.suffix} decimals={stat.decimals} />
              </dd>
              <p className="mt-1 text-xs text-slate-400 sm:text-sm">{stat.label}</p>
            </div>
          ))}
        </motion.dl>
      </div>
    </section>
  );
}
