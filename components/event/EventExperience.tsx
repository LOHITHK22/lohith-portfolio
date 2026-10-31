"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Captions,
  CaptionsOff,
  Contact as ContactIcon,
  FileText,
  Github,
  Linkedin,
  Mail,
  Maximize,
  Network,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { agentById, agents } from "@/data/agentTeam";
import { eventScenes, HANDOFF_MS, HANDOFF_MS_REDUCED } from "@/data/eventTour";
import { profile } from "@/data/profile";
import { topProjects } from "@/data/projects";
import { useEventPlayback } from "@/hooks/useEventPlayback";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { track } from "@/lib/analytics";
import { AgentAvatar } from "./AgentAvatar";
import { AgentConstellation } from "./AgentConstellation";
import { EventQRCode } from "./EventQRCode";
import { MCPArchitecture } from "./MCPArchitecture";
import { OfflineStatus } from "./OfflineStatus";
import { SceneVisual } from "./SceneVisuals";

const SPECIALIZATION = "Applied AI & Data Engineering";
const ROLE_LINE = "Data Analyst at Uline. Builds agentic AI and data systems: MCP tool servers, LLM evaluation, and streaming pipelines.";
const PROJECT_SUMMARY =
  "Featured: PipelineMedic AI, an agent that detects data-pipeline failures deterministically, lets an LLM propose a typed repair, and routes risky fixes through human approval and an MCP server with 17 typed tools (10 read-only by default).";
const DISCLAIMER =
  "Scripted presentation with recorded AI voices (OpenAI TTS, stock voices). The seven agents are illustrative roles, not autonomous AI running in your browser. The PipelineMedic walkthrough is a recorded, simulated incident.";
const KIOSK_IDLE_LOOP_MS = 60000;

function sentenceIndex(caption: string, fraction: number) {
  const sentences = caption.split(/(?<=[.!?])\s+/);
  const target = fraction * caption.length;
  let acc = 0;
  for (let i = 0; i < sentences.length; i++) {
    acc += sentences[i].length + 1;
    if (target < acc) return { sentences, active: i };
  }
  return { sentences, active: sentences.length - 1 };
}

function ContactLinks({ source, large = false }: { source: string; large?: boolean }) {
  const cls = large ? "btn-secondary !px-5 !py-3 text-base" : "btn-secondary !px-4 !py-2";
  return (
    <div className="flex flex-wrap gap-2">
      <a href={profile.resumeUrl} target="_blank" rel="noopener noreferrer" className={cls} onClick={() => track("event_cta_click", { cta: "resume", source })}>
        <FileText className="h-4 w-4" aria-hidden="true" /> View Resume
      </a>
      <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer" className={cls} onClick={() => track("event_cta_click", { cta: "github", source })}>
        <Github className="h-4 w-4" aria-hidden="true" /> GitHub
      </a>
      <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className={cls} onClick={() => track("event_cta_click", { cta: "linkedin", source })}>
        <Linkedin className="h-4 w-4" aria-hidden="true" /> LinkedIn
      </a>
      <a href={`mailto:${profile.email}`} className={cls} onClick={() => track("event_cta_click", { cta: "email", source })}>
        <Mail className="h-4 w-4" aria-hidden="true" /> Contact
      </a>
      <a href="/event/lohith-kovuri.vcf" download className={cls} onClick={() => track("vcard_download", { source })}>
        <ContactIcon className="h-4 w-4" aria-hidden="true" /> Save contact
      </a>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  primary = false,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  primary?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
        primary ? "bg-white text-base-950 hover:bg-slate-200" : "border border-white/15 bg-white/5 text-white hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

export function EventExperience({ kiosk = false, source }: { kiosk?: boolean; source?: string }) {
  const reduced = useReducedMotion();
  const pb = useEventPlayback({ reducedMotion: reduced });
  const { state } = pb;
  const [captions, setCaptions] = useState(true);
  const [loopSilently, setLoopSilently] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const landingRef = useRef<HTMLDivElement>(null);

  const open = state.status !== "idle";
  const completed = state.status === "completed";
  const scene = eventScenes[state.index];
  const agent = agentById[scene.agentId];
  const clipMs = state.clipMs || state.hold;
  const audioActive = state.mode === "audio" && !state.failedClips.includes(scene.id);
  const speaking = state.status === "playing" && state.phase === "scene" && audioActive && state.elapsed < clipMs;
  const progress = state.hold ? Math.min(1, state.elapsed / state.hold) : 0;
  const showClosing = completed || scene.id === "closing";

  useEffect(() => {
    track("event_view", { source: source ?? "direct", kiosk });
  }, [source, kiosk]);

  useEffect(() => {
    if (completed) track("event_complete", { ms: state.lastRunMs ?? 0, mode: state.mode });
  }, [completed, state.lastRunMs, state.mode]);

  const begin = (mode: "audio" | "silent") => {
    openerRef.current = document.activeElement as HTMLElement | null;
    track("event_start", { mode, kiosk });
    void pb.start(mode);
  };

  const exit = useCallback(() => {
    track("event_exit", { scene: eventScenes[state.index].id, completed });
    pb.exit();
    window.setTimeout(() => openerRef.current?.focus(), 0);
  }, [pb, state.index, completed]);

  const exitTo = (hash: string) => {
    pb.exit();
    window.setTimeout(() => {
      const el = document.getElementById(hash);
      if (!el) return;
      el.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
      el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
    }, 50);
  };

  const togglePlay = useCallback(() => {
    if (state.status === "playing") pb.pause();
    else if (state.status === "paused") pb.resume();
    else if (state.status === "completed") pb.restart();
  }, [pb, state.status]);

  // Lock page scroll, make the page behind inert, and move focus into the presentation.
  useEffect(() => {
    const landing = landingRef.current;
    if (!open || !landing) return;
    // React 18 has no `inert` prop, so set the attribute directly.
    landing.setAttribute("inert", "");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      landing.removeAttribute("inert");
    };
  }, [open]);

  // Keyboard: Space/K play-pause, arrows prev/next, M mute, C captions, R restart, Esc exit, Tab trapped.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.repeat && e.key !== "Tab") return;
      const target = e.target as HTMLElement;
      const onControl = target.closest("button, a, input, select, textarea, summary");
      if (e.key === "Escape") {
        e.preventDefault();
        exit();
      } else if ((e.key === " " && !onControl) || e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") pb.next();
      else if (e.key === "ArrowLeft") pb.prev();
      else if (e.key.toLowerCase() === "m") pb.toggleMute();
      else if (e.key.toLowerCase() === "c") setCaptions((c) => !c);
      else if (e.key.toLowerCase() === "r") pb.restart();
      else if (e.key === "Tab" && dialogRef.current) {
        const items = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input, select, textarea, summary, [tabindex='0']")
        );
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, exit, togglePlay, pb]);

  // Kiosk: optional silent loop after the closing screen sits idle.
  useEffect(() => {
    if (!kiosk || !loopSilently || !completed) return;
    let timer = window.setTimeout(() => void pb.start("silent"), KIOSK_IDLE_LOOP_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void pb.start("silent"), KIOSK_IDLE_LOOP_MS);
    };
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
    };
  }, [kiosk, loopSilently, completed, pb]);

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const { sentences, active } = sentenceIndex(scene.caption, clipMs ? Math.min(1, state.elapsed / clipMs) : 0);
  const big = kiosk;

  return (
    <>
      {/* ---------- Landing ---------- */}
      <div ref={landingRef} className="relative min-h-screen overflow-x-hidden bg-ink-950 text-white">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_72%_30%,rgba(25,211,197,0.14),transparent_55%),radial-gradient(ellipse_at_left,rgba(14,50,60,0.4),transparent_50%)]" />
        <div aria-hidden="true" className="hero-grain pointer-events-none absolute inset-0" />

        {!kiosk && (
          <header className="section-shell relative flex items-center justify-between py-5">
            <Link prefetch={false} href="/" className="font-hero text-lg font-black tracking-tight">
              Lohith<span className="text-teal">.</span>
            </Link>
            <nav aria-label="Event page" className="flex items-center gap-1 text-sm">
              <Link prefetch={false} href="/#projects" className="btn-ghost !px-3">Projects</Link>
              <a href="#architecture" className="btn-ghost hidden !px-3 sm:inline-flex">Architecture</a>
              <a href="#connect" className="btn-ghost !px-3">Connect</a>
            </nav>
          </header>
        )}

        <main id="main-content" className="relative">
          <section className={`section-shell grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr] ${kiosk ? "min-h-screen py-10" : "pb-14 pt-4 sm:pt-10"}`}>
            <div className="order-2 lg:order-1">
              <p className="inline-flex items-center gap-2 rounded-full border border-teal/30 bg-teal/10 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-teal">
                AI Event Mode
              </p>
              <h1 className={`mt-3 font-hero font-black leading-[0.95] tracking-[-0.03em] text-[#eef6f6] sm:mt-4 ${big ? "text-6xl sm:text-8xl" : "text-5xl sm:text-7xl"}`}>
                {profile.name}
              </h1>
              <p className={`mt-3 font-mono font-bold uppercase tracking-[0.14em] text-teal ${big ? "text-2xl" : "text-sm sm:text-lg"}`}>
                {SPECIALIZATION}
              </p>
              <p className={`mt-4 max-w-xl leading-relaxed text-slate-300 ${big ? "text-xl" : "text-base"}`}>{ROLE_LINE}</p>
              {!kiosk && <p className="mt-3 hidden max-w-xl text-sm leading-relaxed text-slate-400 sm:block">{PROJECT_SUMMARY}</p>}

              <div className="mt-5 flex flex-col gap-2.5 sm:mt-7 sm:flex-row sm:flex-wrap sm:gap-3">
                <button
                  type="button"
                  onClick={() => begin("audio")}
                  className={`group inline-flex items-center justify-center gap-3 hero-launch rounded-2xl bg-teal font-hero font-extrabold text-[#021b19] transition-transform hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-base-950 ${big ? "px-9 py-5 text-xl" : "px-7 py-4 text-base"}`}
                >
                  <Play className="h-5 w-5 fill-current" aria-hidden="true" />
                  Start 45-Second AI Experience
                </button>
                <button type="button" onClick={() => begin("silent")} className={`btn-secondary ${big ? "!px-7 !py-5 text-lg" : "!py-4"}`}>
                  <CaptionsOff className="h-4 w-4" aria-hidden="true" /> Watch Without Sound
                </button>
                {!kiosk && (
                  <Link prefetch={false} href="/#projects" className="btn-ghost !py-4" onClick={() => track("event_cta_click", { cta: "skip_to_projects", source: "landing" })}>
                    Skip to Projects <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                )}
              </div>

              <div className="mt-5">
                <ContactLinks source="landing" large={big} />
              </div>
              {!kiosk && <p className="mt-4 text-sm leading-relaxed text-slate-400 sm:hidden">{PROJECT_SUMMARY}</p>}

              {kiosk && (
                <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-slate-300">
                  <button type="button" onClick={fullscreen} className="btn-secondary !px-4 !py-2">
                    <Maximize className="h-4 w-4" aria-hidden="true" /> Full screen
                  </button>
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={loopSilently} onChange={(e) => setLoopSilently(e.target.checked)} className="h-4 w-4 accent-cyan-400" />
                    Replay silently after 60 s idle
                  </label>
                  <OfflineStatus compact />
                </div>
              )}

              <p className="mt-6 max-w-xl text-xs leading-relaxed text-slate-400">{DISCLAIMER}</p>
            </div>

            <div className="order-1 lg:order-2">
              <div className="relative mx-auto flex max-w-md flex-col items-center">
                <div className="relative w-28 sm:w-56 lg:w-full">
                  <div aria-hidden="true" className="absolute -inset-3 rounded-[2rem] bg-[radial-gradient(closest-side,rgba(25,211,197,0.35),transparent)] blur-2xl" />
                  <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] border border-teal/25 bg-[radial-gradient(60%_50%_at_50%_35%,#0c252b,#020608)]">
                    <Image
                      src={profile.heroPortrait.src}
                      alt={profile.heroPortrait.alt}
                      fill
                      priority
                      unoptimized
                      sizes="(min-width: 1024px) 28rem, 14rem"
                      className="object-cover object-[50%_0%] scale-[1.35] origin-top"
                    />
                    <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ink-950/90 to-transparent" />
                  </div>
                </div>
                <div className="mt-4 hidden flex-wrap justify-center gap-3 sm:flex" aria-label="The seven agents in this presentation">
                  {agents.map((a) => (
                    <AgentAvatar key={a.id} agent={a} size="sm" />
                  ))}
                </div>
                {kiosk && (
                  <div className="mt-8">
                    <EventQRCode size="lg" />
                  </div>
                )}
              </div>
            </div>
          </section>

          {!kiosk && (
            <section aria-labelledby="top-projects" className="section-shell pb-14">
              <h2 id="top-projects" className="font-hero text-2xl font-black">Top projects</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {topProjects.map((p) => (
                  <article key={p.id} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-300">{p.tagline}</p>
                    <div className="mt-4 flex flex-wrap gap-3 text-sm">
                      <Link prefetch={false} href={`/projects/${p.id}`} className="font-semibold text-teal hover:underline" onClick={() => track("event_cta_click", { cta: `case_${p.id}`, source: "landing" })}>
                        Case study
                      </Link>
                      {p.githubUrl && (
                        <a href={p.githubUrl} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-white">
                          Source
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section id="architecture" aria-labelledby="arch-title" className="section-shell scroll-mt-6 pb-14">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-cyan">PipelineMedic AI</p>
            <h2 id="arch-title" className="mt-1 font-display text-2xl font-semibold sm:text-3xl">Explore the Architecture</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
              Click any component to see what it does, a sample structured input and output, its security boundary, and how it is
              tested. Shapes and names come from the repository; values are a sanitized sample.
            </p>
            <div className="mt-6">
              <MCPArchitecture />
            </div>
          </section>

          <section id="connect" aria-labelledby="connect-title" className="section-shell scroll-mt-6 pb-16">
            <div className="grid gap-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8 md:grid-cols-[auto_1fr] md:items-center">
              <EventQRCode showDownloads />
              <div>
                <h2 id="connect-title" className="font-display text-2xl font-semibold">Connect with Lohith</h2>
                <p className="mt-2 text-sm text-slate-300">
                  {profile.email} · {profile.linkedinLabel} · {profile.githubLabel}
                </p>
                <div className="mt-4">
                  <ContactLinks source="connect" />
                </div>
                {!kiosk && (
                  <div className="mt-6 border-t border-white/10 pt-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Presenting at a venue?</p>
                    <div className="mt-3">
                      <OfflineStatus />
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-slate-400">
                      Caches this page, the narration, and the QR code on this device so the demo plays without venue Wi-Fi. A first visit
                      still needs a connection.{" "}
                      <a href="/event?kiosk=true" className="text-cyan-300 hover:underline">Kiosk mode</a>
                      {" · "}
                      <a href="/event/emergency.html" className="text-cyan-300 hover:underline">No-JavaScript fallback</a>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* ---------- Presentation ---------- */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={dialogRef}
            key="stage"
            role="dialog"
            aria-modal="true"
            aria-label="45-second AI experience"
            tabIndex={-1}
            data-status={state.status}
            data-scene={scene.id}
            data-runtime-ms={state.lastRunMs ?? undefined}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.01 : 0.3 }}
            className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-ink-950 text-white focus:outline-none"
          >
            <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,rgba(25,211,197,0.09),transparent_60%)]" />

            {/* Top bar */}
            <div className="relative flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <p className="min-w-0 truncate font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
                {completed ? "Experience complete" : `Scene ${state.index + 1}/${eventScenes.length} · `}
                {!completed && <span style={{ color: agent.color }}>{agent.name}</span>}
                {!completed && ` · ${scene.title}`}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-wide text-slate-400 sm:inline">
                  Scripted demo
                </span>
                <IconButton label="Exit experience" onClick={exit}>
                  <X className="h-5 w-5" aria-hidden="true" />
                </IconButton>
              </div>
            </div>

            {state.status === "preparing" ? (
              <div className="relative flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center" role="status">
                <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-accent-cyan" aria-hidden="true" />
                <p className="text-sm text-slate-300">{state.mode === "audio" ? "Loading narration..." : "Starting..."}</p>
              </div>
            ) : (
              <div className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-3 px-4 pb-4 sm:gap-5 sm:px-6 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-10">
                <div className="mx-auto w-full max-w-[11rem] sm:max-w-[19rem] lg:max-w-none">
                  <AgentConstellation
                    index={state.index}
                    phase={state.phase}
                    speaking={speaking}
                    handoffMs={reduced ? HANDOFF_MS_REDUCED : HANDOFF_MS}
                    reducedMotion={reduced}
                    allActive={showClosing}
                  />
                </div>

                <div className="min-w-0">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={showClosing ? "closing" : scene.id}
                      initial={{ opacity: 0, y: reduced ? 0 : 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: reduced ? 0 : -8 }}
                      transition={{ duration: reduced ? 0.01 : 0.3 }}
                    >
                      {showClosing ? (
                        <div className="text-center lg:text-left">
                          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-cyan">{profile.name} · {SPECIALIZATION}</p>
                          <h2 className={`mt-2 font-display font-bold leading-tight ${big ? "text-5xl" : "text-3xl sm:text-4xl"}`}>
                            Built With Curiosity.{" "}
                            <span className="text-teal">Engineered With Evidence.</span>
                          </h2>
                          <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:items-center lg:items-start">
                            <EventQRCode size={big ? "lg" : "md"} />
                            <div className="flex w-full flex-col gap-2 sm:max-w-xs">
                              <button type="button" onClick={() => exitTo("top-projects")} className="btn-primary">
                                Explore Projects
                              </button>
                              <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary" onClick={() => track("event_cta_click", { cta: "github", source: "closing" })}>
                                <Github className="h-4 w-4" aria-hidden="true" /> View GitHub
                              </a>
                              <a href={profile.resumeUrl} download={profile.resumeFileName} className="btn-secondary" onClick={() => track("event_cta_click", { cta: "resume_download", source: "closing" })}>
                                <FileText className="h-4 w-4" aria-hidden="true" /> Download Resume
                              </a>
                              <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary" onClick={() => track("event_cta_click", { cta: "linkedin", source: "closing" })}>
                                <Linkedin className="h-4 w-4" aria-hidden="true" /> Connect on LinkedIn
                              </a>
                              <button
                                type="button"
                                onClick={() => {
                                  track("event_architecture_open", {});
                                  exitTo("architecture");
                                }}
                                className="btn-ghost"
                              >
                                <Network className="h-4 w-4" aria-hidden="true" /> Explore the Architecture
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: agent.color }}>
                            {agent.name} · {agent.short}
                          </p>
                          <h2 className={`mt-1 font-display font-semibold ${big ? "text-4xl" : "text-xl sm:text-3xl"}`}>{scene.title}</h2>
                          <div className="mt-3 sm:mt-4">
                            <SceneVisual sceneId={scene.id} progress={progress} reduced={reduced} />
                          </div>
                        </>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* Captions + controls */}
            <div className="sticky bottom-0 z-10 mt-auto border-t border-white/10 bg-ink-950/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-6">
              <div className="mx-auto max-w-4xl">
                {state.failedClips.length > 0 && state.mode === "audio" && (
                  <p className="mb-2 text-center text-xs text-amber-300" role="status">
                    Audio unavailable for {state.failedClips.length} scene{state.failedClips.length === 1 ? "" : "s"}. Showing captions instead.
                  </p>
                )}
                {state.mode === "silent" && state.status !== "preparing" && (
                  <p className="mb-2 text-center text-[11px] uppercase tracking-wide text-slate-400">Silent mode · captions</p>
                )}
                <div className="min-h-[2.75rem] sm:min-h-[3.5rem]" aria-live={state.mode === "silent" || state.muted ? "polite" : "off"} aria-atomic="true">
                  {captions && state.status !== "preparing" && !completed && (
                    <p className={`text-center leading-snug ${big ? "text-2xl sm:text-3xl" : "text-sm sm:text-xl"}`} data-testid="caption">
                      <span className="mr-2 font-mono text-xs font-semibold uppercase tracking-wider align-middle" style={{ color: agent.color }}>
                        {agent.name}
                      </span>
                      {sentences.map((s, i) => (
                        <span key={i} className={`transition-colors duration-300 ${i === active ? "text-white" : "text-slate-400"}`}>
                          {s}{" "}
                        </span>
                      ))}
                    </p>
                  )}
                  {!captions && <span className="sr-only">{completed ? "" : scene.caption}</span>}
                </div>

                {/* Progress: one segment per scene, each a jump target */}
                <div className="mt-2 flex gap-1" role="group" aria-label="Jump to scene">
                  {eventScenes.map((s, i) => {
                    const a = agentById[s.agentId];
                    const fill = completed || i < state.index ? 1 : i === state.index ? (state.phase === "handoff" ? 1 : progress) : 0;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => pb.goTo(i)}
                        aria-label={`Scene ${i + 1}: ${a.name}, ${s.title}`}
                        aria-current={i === state.index && !completed ? "step" : undefined}
                        className="group relative h-6 flex-1 focus-visible:outline-none"
                      >
                        <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/10 group-focus-visible:ring-2 group-focus-visible:ring-white">
                          <span className="block h-full rounded-full" style={{ width: `${fill * 100}%`, background: a.color, transition: "width 100ms linear" }} />
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2 flex items-center justify-center gap-2 sm:gap-3">
                  <IconButton label="Previous scene" onClick={pb.prev}>
                    <SkipBack className="h-5 w-5" aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label={state.status === "playing" ? "Pause" : completed ? "Replay" : "Resume"}
                    onClick={togglePlay}
                    primary
                  >
                    {state.status === "playing" ? (
                      <Pause className="h-5 w-5" aria-hidden="true" />
                    ) : completed ? (
                      <RotateCcw className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <Play className="h-5 w-5 fill-current" aria-hidden="true" />
                    )}
                  </IconButton>
                  <IconButton label="Next scene" onClick={pb.next}>
                    <SkipForward className="h-5 w-5" aria-hidden="true" />
                  </IconButton>
                  <IconButton label="Restart" onClick={pb.restart}>
                    <RotateCcw className="h-5 w-5" aria-hidden="true" />
                  </IconButton>
                  {state.mode === "audio" && (
                    <IconButton label={state.muted ? "Unmute" : "Mute"} onClick={pb.toggleMute} pressed={state.muted}>
                      {state.muted ? <VolumeX className="h-5 w-5" aria-hidden="true" /> : <Volume2 className="h-5 w-5" aria-hidden="true" />}
                    </IconButton>
                  )}
                  <IconButton label={captions ? "Hide captions" : "Show captions"} onClick={() => setCaptions((c) => !c)} pressed={captions}>
                    {captions ? <Captions className="h-5 w-5" aria-hidden="true" /> : <CaptionsOff className="h-5 w-5" aria-hidden="true" />}
                  </IconButton>
                  {kiosk && (
                    <IconButton label="Toggle full screen" onClick={fullscreen}>
                      <Maximize className="h-5 w-5" aria-hidden="true" />
                    </IconButton>
                  )}
                </div>
                <p className="mt-2 hidden text-center text-[11px] text-slate-400 sm:block">
                  Space pause · ← → scenes · M mute · C captions · R restart · Esc exit
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
