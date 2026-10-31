"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowDown, ArrowUpRight, FileText, Github, Mail, Radio } from "lucide-react";
import { heroStats, profile } from "@/data/profile";
import { track } from "@/lib/analytics";
import { AnimatedCounter } from "./AnimatedCounter";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useCanHover } from "@/hooks/useCanHover";
import { fadeUpVariants } from "@/lib/motion";
import { openAgentTeam } from "@/lib/agentTeamEvents";

// Decorative canvas network, kept out of SSR and the critical bundle.
const NeuralField = dynamic(() => import("./NeuralField").then((m) => m.NeuralField), { ssr: false });

/** PipelineMedic's real control flow, drawn as the animated "architecture" behind the portrait. */
const FLOW = [
  { id: "detect", label: "Detect", x: 40, y: 230 },
  { id: "diagnose", label: "LLM diagnose", x: 190, y: 140 },
  { id: "policy", label: "Policy", x: 340, y: 200 },
  { id: "mcp", label: "MCP · 17 tools", x: 490, y: 110 },
  { id: "validate", label: "Validate", x: 620, y: 170 },
];
const FLOW_PATH = "M40 230 C 110 230, 120 140, 190 140 S 280 200, 340 200 S 430 110, 490 110 S 580 170, 620 170";

export function Hero() {
  const reducedMotion = useReducedMotion();
  const canHover = useCanHover();

  // Gentle pointer parallax: portrait drifts with the cursor, the architecture
  // layer drifts against it. Desktop with a mouse only, never under reduced motion.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 60, damping: 20 });
  const sy = useSpring(py, { stiffness: 60, damping: 20 });
  const portraitX = useTransform(sx, (v) => v * 12);
  const portraitY = useTransform(sy, (v) => v * 8);
  const flowX = useTransform(sx, (v) => v * -18);
  const flowY = useTransform(sy, (v) => v * -10);

  useEffect(() => {
    if (!canHover || reducedMotion) return;
    const onMove = (e: PointerEvent) => {
      px.set(e.clientX / window.innerWidth - 0.5);
      py.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [canHover, reducedMotion, px, py]);

  return (
    <section id="top" className="relative isolate overflow-hidden bg-base-950 lg:min-h-[calc(100svh-4rem)]">
      {/* Scene lighting */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-30"
        style={{
          background:
            "radial-gradient(55% 60% at 72% 38%, rgba(139,92,246,0.22), transparent 70%), radial-gradient(40% 45% at 92% 70%, rgba(34,211,238,0.16), transparent 70%), radial-gradient(45% 50% at 10% 15%, rgba(34,211,238,0.07), transparent 70%), linear-gradient(180deg, #060a1a 0%, #050814 100%)",
        }}
      />
      <div aria-hidden="true" className="absolute inset-0 -z-20 opacity-50">
        <NeuralField />
      </div>
      {/* Fine grid, fading out toward the edges */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(70%_60%_at_60%_40%,black,transparent)]"
      />

      {/* ---------- Portrait (the main visual) ---------- */}
      {/* Rendered visible in SSR HTML (no fade-in): it is the LCP element. */}
      <motion.div
        style={{ x: portraitX, y: portraitY }}
        className="pointer-events-none relative mx-auto h-[min(108vw,30rem)] w-full max-w-xl sm:h-[34rem] lg:absolute lg:inset-y-0 lg:right-[-4%] lg:mx-0 lg:h-auto lg:w-[56%] lg:max-w-none xl:right-0 xl:w-[52%]"
      >
        <div className="hero-portrait-mask absolute inset-0">
          <Image
            src={profile.portrait.src}
            alt={profile.portrait.alt}
            fill
            priority
            sizes="(min-width: 1024px) 56vw, 100vw"
            className="object-cover object-[50%_18%] [filter:contrast(1.06)_saturate(0.92)_brightness(0.96)]"
          />
          {/* Cinematic grade: cool rim light from the right, violet fill from the left, shadowed base */}
          <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(270deg,rgba(34,211,238,0.28),transparent_38%)] mix-blend-screen" />
          <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,rgba(91,33,182,0.35),transparent_45%)] mix-blend-multiply" />
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(60%_55%_at_55%_30%,transparent_40%,rgba(5,8,20,0.55)_100%)]" />
        </div>

        {/* Viewfinder brackets around the subject */}
        <div aria-hidden="true" className="absolute left-[22%] right-[18%] top-[10%] hidden h-[46%] lg:block">
          {["left-0 top-0 border-l border-t", "right-0 top-0 border-r border-t", "left-0 bottom-0 border-l border-b", "right-0 bottom-0 border-r border-b"].map((c) => (
            <span key={c} className={`absolute h-6 w-6 border-cyan-300/50 ${c}`} />
          ))}
          <span className="absolute -top-6 left-0 font-mono text-[10px] uppercase tracking-[0.25em] text-cyan-200/70">
            {profile.name} · Data Analyst @ Uline
          </span>
        </div>
      </motion.div>

      {/* ---------- Animated architecture layer ---------- */}
      <motion.svg
        aria-hidden="true"
        viewBox="0 0 720 280"
        preserveAspectRatio="xMidYMid meet"
        style={{ x: flowX, y: flowY }}
        className="pointer-events-none absolute bottom-24 right-0 hidden w-[50%] mix-blend-screen max-w-[46rem] lg:block"
      >
        <defs>
          <linearGradient id="hero-flow" x1="0" x2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
            <stop offset="30%" stopColor="#22d3ee" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <path d={FLOW_PATH} fill="none" stroke="url(#hero-flow)" strokeWidth="1.2" strokeDasharray="3 7" />
        {!reducedMotion &&
          [0, 2.4, 4.8].map((delay) => (
            <circle key={delay} r="3.2" fill="#e0f2fe" style={{ filter: "drop-shadow(0 0 6px #22d3ee)" }}>
              <animateMotion dur="7.2s" begin={`${delay}s`} repeatCount="indefinite" path={FLOW_PATH} />
            </circle>
          ))}
        {FLOW.map((n) => (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r="5" fill="#050814" stroke="#67e8f9" strokeWidth="1.2" />
            <text x={n.x + 10} y={n.y - 10} fill="#a5f3fc" fillOpacity="0.75" fontSize="11" fontFamily="var(--font-jetbrains-mono), monospace" letterSpacing="1.5">
              {n.label.toUpperCase()}
            </text>
          </g>
        ))}
      </motion.svg>

      {/* ---------- Copy ---------- */}
      <div className="section-shell relative -mt-24 pb-10 sm:-mt-28 lg:mt-0 lg:flex lg:min-h-[calc(100svh-4rem)] lg:flex-col lg:justify-center lg:pb-36 lg:pt-16">
        <div className="max-w-[40rem]">
          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeUpVariants(reducedMotion)}
            className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-200/80 sm:text-[11px] sm:tracking-[0.28em]"
          >
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-cyan-300" aria-hidden="true" />
            Lohith Kovuri · AI &amp; Data Engineering
          </motion.p>

          <h1 className="mt-5 font-display text-[clamp(2.6rem,7.4vw,5.6rem)] font-bold leading-[0.95] tracking-[-0.035em] text-white">
            {profile.heroHeadlineLead}{" "}
            <span className="hero-shimmer bg-gradient-to-r from-cyan-300 via-indigo-300 to-violet-400 bg-[length:200%_100%] bg-clip-text text-transparent">
              {profile.heroHeadlineAccent}
            </span>
          </h1>

          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeUpVariants(reducedMotion, 0.12)}
            className="mt-6 max-w-lg text-base leading-relaxed text-slate-300 sm:text-lg"
          >
            {profile.heroSupporting}
          </motion.p>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUpVariants(reducedMotion, 0.2)}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <a href="#projects" className="btn-primary !px-6 !py-3.5" onClick={() => track("hero_cta_click", { cta: "explore" })}>
              Explore My Work
              <ArrowDown className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={() => {
                track("hero_cta_click", { cta: "ai_team" });
                openAgentTeam();
              }}
              className="group relative inline-flex items-center gap-2.5 overflow-hidden rounded-full border border-violet-300/40 bg-violet-500/10 px-6 py-3.5 text-sm font-semibold text-violet-50 shadow-[0_0_40px_-10px_rgba(139,92,246,0.9)] transition-colors hover:bg-violet-500/20"
            >
              <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full rounded-full bg-violet-300 opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-violet-300" />
              </span>
              Meet My AI Team
            </button>
          </motion.div>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUpVariants(reducedMotion, 0.26)}
            className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm"
          >
            <a href={profile.resumeUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost gap-1.5 !px-3" onClick={() => track("resume_view_click", { source: "hero" })}>
              <FileText className="h-4 w-4" /> View Resume
            </a>
            <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost gap-1.5 !px-3" onClick={() => track("github_click", { source: "hero" })}>
              <Github className="h-4 w-4" /> GitHub
            </a>
            <a href="#contact" className="btn-ghost gap-1.5 !px-3" onClick={() => track("contact_click", { source: "hero" })}>
              <Mail className="h-4 w-4" /> Contact
            </a>
            <a href="/event" className="btn-ghost gap-1.5 !px-3 text-cyan-200" onClick={() => track("hero_cta_click", { cta: "event" })}>
              <Radio className="h-4 w-4" /> 45-sec demo <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </motion.div>
        </div>
      </div>

      {/* ---------- Evidence band ---------- */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeUpVariants(reducedMotion, 0.32)}
        className="relative border-y border-white/10 bg-base-950/70 backdrop-blur-md lg:absolute lg:inset-x-0 lg:bottom-0"
      >
        <dl className="section-shell grid grid-cols-2 divide-white/10 sm:grid-cols-4 sm:divide-x">
          {heroStats.map((stat) => (
            <div key={stat.id} className="flex flex-col px-1 py-4 sm:px-5 sm:first:pl-0">
              <dt className="order-2 mt-0.5 text-xs leading-snug text-slate-400">{stat.label}</dt>
              <dd className="order-1 font-mono text-2xl font-semibold tracking-tight text-white sm:text-[1.7rem]">
                <AnimatedCounter value={stat.value} suffix={stat.suffix} decimals={stat.decimals} />
              </dd>
            </div>
          ))}
        </dl>
      </motion.div>
    </section>
  );
}
