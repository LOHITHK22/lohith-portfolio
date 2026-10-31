"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, FileText, Github, Linkedin } from "lucide-react";
import { profile } from "@/data/profile";
import { agents } from "@/data/agentTeam";
import { track } from "@/lib/analytics";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fadeUpVariants } from "@/lib/motion";
import { openAgentTeam } from "@/lib/agentTeamEvents";
import { HeroScene } from "./HeroScene";

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

/** Floating "AI TEAM · 7 AGENTS" launcher; opens the narrated command center. */
function AgentDock({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        track("hero_cta_click", { cta: "ai_team_dock" });
        openAgentTeam();
      }}
      className={`group flex items-center gap-3 rounded-2xl border border-teal/30 sm:gap-4 bg-ink-900/80 py-3 pl-4 pr-3 text-left shadow-[0_20px_60px_-20px_rgba(25,211,197,0.45)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-teal/70 hover:bg-ink-800/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${className}`}
    >
      <span className="flex shrink-0 -space-x-2.5 sm:-space-x-2" aria-hidden="true">
        {agents.map((a, i) => (
          <span
            key={a.id}
            className="dock-agent relative flex h-7 w-7 items-center justify-center rounded-full border-2 bg-ink-950 font-mono text-[9px] font-bold text-white sm:h-8 sm:w-8 sm:text-[10px]"
            style={{ borderColor: a.color, animationDelay: `${i * 1.1}s`, ["--agent" as string]: a.color }}
          >
            {a.glyph}
          </span>
        ))}
      </span>
      <span className="flex min-w-0 flex-col whitespace-nowrap">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-teal-glow sm:text-[11px] sm:tracking-[0.18em]">AI Team · 7 agents</span>
        <span className="mt-0.5 flex items-center gap-1 text-[13px] font-medium text-slate-200">
          Meet the team <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
      <span className="relative ml-1 flex h-2.5 w-2.5" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full rounded-full bg-teal opacity-70 motion-safe:animate-ping" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal" />
      </span>
    </button>
  );
}

export function Hero() {
  const reducedMotion = useReducedMotion();
  const desktop = useIsDesktop();
  const portraitRef = useRef<HTMLDivElement>(null);

  return (
    <section
      id="top"
      className="relative isolate -mt-16 overflow-hidden bg-ink-950 lg:h-[100svh] lg:min-h-[680px] lg:max-h-[1240px]"
    >
      {/* Atmosphere */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(38% 55% at 62% 38%, rgba(25,211,197,0.11), transparent 70%), radial-gradient(30% 40% at 92% 88%, rgba(25,211,197,0.08), transparent 70%), radial-gradient(60% 60% at 18% 18%, rgba(14,50,60,0.38), transparent 70%), #020608",
        }}
      />

      {/* Portrait: the scene itself. Mobile/tablet stacks it above the copy. */}
      <div
        ref={portraitRef}
        className="hero-portrait absolute left-1/2 top-[calc(4rem-10.9vw)] z-[2] aspect-square w-[172vw] -translate-x-[47.1%] md:top-[calc(4rem-60px)] md:w-[1100px] lg:left-[60%] lg:top-[-2.2%] lg:h-[146%] lg:w-auto"
      >
        <Image
          src={profile.heroPortrait.src}
          alt={profile.heroPortrait.alt}
          fill
          priority
          unoptimized
          sizes="(min-width: 1024px) 146vh, 172vw"
          className="hero-portrait-img object-contain"
        />
        {/* Warm key light on the face */}
        <div
          aria-hidden="true"
          className="absolute inset-0 mix-blend-screen"
          style={{ background: "radial-gradient(16% 20% at 47% 33%, rgba(255,236,220,0.07), transparent 70%)" }}
        />
        {/* Light seam down the centre line: the border between human and system */}
        <div aria-hidden="true" className="hero-seam absolute left-[47.1%] top-[6%] h-[48%] w-[2px]" />
      </div>

      <HeroScene portraitRef={portraitRef} reducedMotion={reducedMotion} showLabels={desktop} />

      {/* Grade: deep shadow on the copy side, floor and ceiling falloff */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[6] hidden lg:block"
        style={{
          background:
            "linear-gradient(90deg, rgba(2,6,8,0.97) 0%, rgba(2,6,8,0.86) 24%, rgba(2,6,8,0.25) 46%, transparent 60%), linear-gradient(0deg, rgba(2,6,8,0.96) 0%, transparent 26%), linear-gradient(180deg, rgba(2,6,8,0.85) 0%, transparent 14%)",
        }}
      />
      <div aria-hidden="true" className="hero-mobile-grade pointer-events-none absolute inset-0 z-[6] lg:hidden" />
      <div aria-hidden="true" className="hero-grain pointer-events-none absolute inset-0 z-[7]" />

      {/* Simulated trace fragments (desktop) */}
      <p
        aria-hidden="true"
        className="absolute bottom-[19%] right-10 z-[8] hidden whitespace-pre font-mono text-[11px] leading-relaxed text-teal-soft/60 xl:block"
      >
        {"tools/list → 10 read-only (default)\npolicy.evaluate(MEDIUM) → APPROVAL_REQUIRED\ncanary.validate → PASSED   · sample run"}
      </p>

      {/* Copy */}
      <div className="relative z-20 px-5 pb-12 pt-[calc(92vw+4rem-0.5rem)] sm:px-8 md:pt-[calc(640px+4rem-3rem)] lg:absolute lg:inset-0 lg:flex lg:flex-col lg:justify-end lg:px-0 lg:pb-[5.5vh] lg:pl-[max(4rem,calc((100vw-1720px)/2))] lg:pt-0">
        <div className="max-w-[44rem]">
          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeUpVariants(reducedMotion)}
            className="font-mono text-[11px] font-bold uppercase tracking-[0.28em] text-slate-100 sm:text-[13px] sm:tracking-[0.32em]"
          >
            {profile.heroEyebrowLead} <span className="text-teal">{profile.heroEyebrowAccent}</span>
          </motion.p>

          <h1 className="mt-4 font-hero text-[19vw] font-black leading-[0.9] tracking-[-0.035em] text-[#eef6f6] md:text-[8.6rem] lg:mt-5 lg:text-[min(8.6vw,13.8vh)]">
            Lohith
            <span className="hero-name-accent block text-teal">Kovuri.</span>
          </h1>

          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeUpVariants(reducedMotion, 0.12)}
            className="mt-5 max-w-[32rem] text-base leading-relaxed text-slate-300 sm:text-[17px] lg:mt-6"
          >
            {profile.heroStatement}
          </motion.p>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUpVariants(reducedMotion, 0.2)}
            className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Link
              href="/event"
              prefetch={false}
              onClick={() => track("hero_cta_click", { cta: "launch_ai_experience" })}
              className="hero-launch group relative inline-flex items-center gap-3 whitespace-nowrap rounded-2xl bg-teal py-3.5 pl-3.5 pr-4 font-hero text-base sm:gap-4 sm:pr-5 sm:text-[17px] font-extrabold text-[#021b19] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#021b19]" aria-hidden="true">
                <span className="ml-1 h-0 w-0 border-y-[7px] border-l-[11px] border-y-transparent border-l-teal transition-transform group-hover:scale-110" />
              </span>
              Launch AI Experience
              <span className="ml-auto rounded-md bg-[#021b19]/15 px-1.5 py-1 font-mono text-[10px] font-bold tracking-[0.14em] sm:ml-0">45 SEC</span>
            </Link>
            <a
              href="#pipelinemedic"
              onClick={() => track("hero_cta_click", { cta: "pipelinemedic" })}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/[0.03] px-5 py-[1.05rem] text-[15px] font-semibold text-slate-100 transition-colors hover:border-teal/60 hover:text-white"
            >
              PipelineMedic AI <ArrowRight className="h-4 w-4" />
            </a>
          </motion.div>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUpVariants(reducedMotion, 0.26)}
            className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400"
          >
            <a href="#experience" className="hover:text-white">
              <span className="text-slate-100">Data Analyst</span> @ Uline
            </a>
            <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-white" onClick={() => track("github_click", { source: "hero" })}>
              <Github className="h-3.5 w-3.5" /> GitHub
            </a>
            <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-white" onClick={() => track("linkedin_click", { source: "hero" })}>
              <Linkedin className="h-3.5 w-3.5" /> LinkedIn
            </a>
            <a href={profile.resumeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-white" onClick={() => track("resume_view_click", { source: "hero" })}>
              <FileText className="h-3.5 w-3.5" /> Resume
            </a>
          </motion.div>

          <AgentDock className="mt-8 w-full sm:w-auto lg:hidden" />

          <p className="sr-only">
            PipelineMedic AI control flow: detect (deterministic), diagnose (LLM), policy gate, MCP (17 typed tools, 10 read-only
            listed by default), validate.
          </p>
          <ol className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-soft lg:hidden" aria-hidden="true">
            {["Detect", "Diagnose", "Policy", "MCP · 17", "Validate"].map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <span className="rounded border border-teal/30 bg-teal/5 px-2 py-1">{s}</span>
                {i < 4 && <span className="text-teal/50">→</span>}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeUpVariants(reducedMotion, 0.4)}
        className="absolute bottom-[4.5vh] right-10 z-20 hidden lg:block"
      >
        <AgentDock />
      </motion.div>
    </section>
  );
}
