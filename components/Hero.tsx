"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Github, FileText, ArrowDown, Mail, Users, Briefcase, Cpu } from "lucide-react";
import { profile, heroStats } from "@/data/profile";
import { track } from "@/lib/analytics";
import { AnimatedCounter } from "./AnimatedCounter";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fadeUpVariants } from "@/lib/motion";
import { openAgentTeam } from "@/lib/agentTeamEvents";

// The network is decorative and canvas-driven: keep it out of the SSR HTML and
// the critical bundle so it never delays the portrait/headline paint.
const NeuralField = dynamic(() => import("./NeuralField").then((m) => m.NeuralField), { ssr: false });

export function Hero() {
  const reducedMotion = useReducedMotion();

  return (
    <section id="top" className="relative isolate overflow-hidden pb-16 pt-8 sm:pb-24 sm:pt-14">
      {/* Midnight-blue scene lighting: cyan key light left, violet rim light right. */}
      <div aria-hidden="true" className="absolute inset-0 -z-20 bg-base-950" />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20"
        style={{
          background:
            "radial-gradient(60% 50% at 18% 20%, rgba(34,211,238,0.10), transparent 70%), radial-gradient(50% 55% at 85% 35%, rgba(139,92,246,0.16), transparent 70%), linear-gradient(180deg, #070c1d 0%, #050814 70%)",
        }}
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 opacity-70">
        <NeuralField />
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-b from-transparent to-base-950"
      />

      <div className="section-shell grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
        {/* Portrait first on mobile so identity lands immediately. */}
        {/* Portrait and headline render visible in the SSR HTML (no fade-in):
            they're the LCP candidates, so they must not wait for hydration. */}
        <div className="relative order-first mx-auto w-full max-w-[19rem] sm:max-w-sm lg:order-last lg:max-w-md">
          <PortraitFrame />
        </div>

        <div>
          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeUpVariants(reducedMotion)}
            className="mb-5 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-accent-cyan/20 bg-accent-cyan/[0.06] px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-cyan-200/90 sm:text-[11px]"
          >
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-cyan opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-cyan" />
            </span>
            {profile.name}
            <span className="text-slate-500">/</span>
            Data Analyst @ Uline
          </motion.p>

          <h1
            className="font-display text-[2.35rem] font-bold leading-[1.04] tracking-tight text-white sm:text-6xl lg:text-[4.1rem]"
          >
            {profile.heroHeadlineLead}{" "}
            <span className="bg-gradient-to-r from-accent-cyan via-indigo-400 to-accent-violet bg-clip-text text-transparent">
              {profile.heroHeadlineAccent}
            </span>
          </h1>

          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeUpVariants(reducedMotion, 0.14)}
            className="mt-5 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg"
          >
            {profile.heroSupporting}
          </motion.p>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUpVariants(reducedMotion, 0.2)}
            className="mt-7 flex flex-wrap items-center gap-3"
          >
            <a href="#projects" className="btn-primary" onClick={() => track("hero_cta_click", { cta: "explore" })}>
              Explore My Work
              <ArrowDown className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={() => {
                track("hero_cta_click", { cta: "ai_team" });
                openAgentTeam();
              }}
              className="group relative inline-flex items-center gap-2 rounded-full border border-accent-violet/40 bg-accent-violet/10 px-5 py-2.5 text-sm font-semibold text-violet-100 shadow-[0_0_30px_-8px_rgba(139,92,246,0.7)] transition-colors hover:bg-accent-violet/20"
            >
              <Users className="h-4 w-4" />
              Meet My AI Team
            </button>
          </motion.div>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUpVariants(reducedMotion, 0.25)}
            className="mt-3 flex flex-wrap items-center gap-2"
          >
            <a
              href={profile.resumeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost gap-1.5 !px-3"
              onClick={() => track("resume_view_click", { source: "hero" })}
            >
              <FileText className="h-4 w-4" />
              View Resume
            </a>
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
              href="#contact"
              className="btn-ghost gap-1.5 !px-3"
              onClick={() => track("contact_click", { source: "hero" })}
            >
              <Mail className="h-4 w-4" />
              Contact
            </a>
          </motion.div>

          <motion.dl
            initial="hidden"
            animate="visible"
            variants={fadeUpVariants(reducedMotion, 0.3)}
            className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-white/10 pt-7 sm:grid-cols-4"
          >
            {heroStats.map((stat) => (
              <div key={stat.id} className="flex flex-col">
                <dt className="order-2 mt-1 text-xs text-slate-400 sm:text-sm">{stat.label}</dt>
                <dd className="order-1 font-mono text-2xl font-bold text-white sm:text-3xl">
                  <AnimatedCounter value={stat.value} suffix={stat.suffix} decimals={stat.decimals} />
                </dd>
              </div>
            ))}
          </motion.dl>
        </div>
      </div>
    </section>
  );
}

function PortraitFrame() {
  return (
    <div className="relative">
      {/* Lighting behind the portrait. */}
      <div aria-hidden="true" className="absolute -inset-8 -z-10 rounded-full bg-accent-violet/25 blur-[80px]" />
      <div aria-hidden="true" className="absolute -left-10 top-10 -z-10 h-40 w-40 rounded-full bg-accent-cyan/20 blur-[70px]" />

      {/* Orbit ring with nodes. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 400 400"
        className="absolute -inset-[12%] -z-10 h-[124%] w-[124%] animate-spin-slow opacity-60 [animation-duration:60s]"
      >
        <circle cx="200" cy="200" r="190" fill="none" stroke="rgba(148,163,184,0.18)" strokeDasharray="2 8" />
        <circle cx="200" cy="10" r="3.5" fill="#22d3ee" />
        <circle cx="390" cy="200" r="2.5" fill="#8b5cf6" />
        <circle cx="66" cy="334" r="3" fill="#22d3ee" />
      </svg>

      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-accent-cyan/60 via-indigo-500/30 to-accent-violet/60 p-px shadow-2xl shadow-black/60">
        <div className="relative overflow-hidden rounded-[calc(2rem-1px)] bg-base-900">
          <Image
            src={profile.portrait.src}
            alt={profile.portrait.alt}
            width={1200}
            height={1500}
            priority
            sizes="(min-width: 1024px) 448px, (min-width: 640px) 384px, 304px"
            className="h-auto w-full"
          />
          {/* Fade the bottom into the scene and add a subtle cyan rim. */}
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-base-950 via-transparent to-transparent" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-tr from-accent-cyan/10 via-transparent to-accent-violet/15 mix-blend-screen" />
        </div>
      </div>

      {/* Floating evidence chips: both facts are on the page below. */}
      <div className="absolute -left-3 bottom-16 flex items-center gap-2 rounded-xl border border-white/10 bg-base-900/80 px-3 py-2 text-xs text-slate-200 shadow-lg backdrop-blur-md sm:-left-8">
        <Briefcase className="h-3.5 w-3.5 text-accent-cyan" aria-hidden="true" />
        <span>
          Data Analyst <span className="text-slate-400">· Uline</span>
        </span>
      </div>
      <div className="absolute -right-3 top-10 flex items-center gap-2 rounded-xl border border-white/10 bg-base-900/80 px-3 py-2 text-xs text-slate-200 shadow-lg backdrop-blur-md sm:-right-8">
        <Cpu className="h-3.5 w-3.5 text-accent-violet" aria-hidden="true" />
        <span>
          PipelineMedic AI <span className="text-slate-400">· 17 MCP tools</span>
        </span>
      </div>
    </div>
  );
}
