"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Captions,
  CaptionsOff,
  FlaskConical,
  Headphones,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  SkipBack,
  SkipForward,
  Type,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { agents, agentById, readingTimeMs, teamSteps, type AgentId } from "@/data/agentTeam";
import { track } from "@/lib/analytics";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useAudioNarration } from "@/hooks/useAudioNarration";
import { AskPanel } from "./AskPanel";

type Mode = "audio" | "text";
type Phase = "gate" | "playing" | "paused" | "handoff" | "done";

// Ring geometry for the command-center diagram (SVG user units).
const VIEW = 400;
const CENTER = VIEW / 2;
const RADIUS = 150;

function agentPoint(id: AgentId) {
  const i = agents.findIndex((a) => a.id === id);
  const angle = (i / agents.length) * Math.PI * 2 - Math.PI / 2;
  return { x: CENTER + RADIUS * Math.cos(angle), y: CENTER + RADIUS * Math.sin(angle) };
}

/** Splits a caption into sentences so we can highlight the one being spoken. */
function sentences(text: string) {
  return text.match(/[^.!?]+[.!?]+(\s|$)/g)?.map((s) => s.trim()) ?? [text];
}

export function AgentTeamExperience({ onClose }: { onClose: () => void }) {
  const reducedMotion = useReducedMotion();
  const narration = useAudioNarration();

  const [mode, setMode] = useState<Mode>("audio");
  const [phase, setPhase] = useState<Phase>("gate");
  const [stepIndex, setStepIndex] = useState(0);
  const [handoffFrom, setHandoffFrom] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [audioNotice, setAudioNotice] = useState(false);

  const runIdRef = useRef(0);
  const stepRef = useRef(0);
  const modeRef = useRef<Mode>("audio");
  const levelRef = useRef<HTMLSpanElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<{ id: number | null; started: number; duration: number; elapsed: number }>({
    id: null,
    started: 0,
    duration: 0,
    elapsed: 0,
  });

  const handoffMs = reducedMotion ? 150 : 900;
  const step = teamSteps[stepIndex];
  const agent = agentById[step.agentId];
  const nextAgent = teamSteps[stepIndex + 1] ? agentById[teamSteps[stepIndex + 1].agentId] : null;

  const setLevel = useCallback((level: number) => {
    const el = levelRef.current;
    if (!el) return;
    el.style.transform = `scale(${1 + level * 0.45})`;
    el.style.opacity = `${0.25 + level * 0.6}`;
  }, []);

  const clearTimer = () => {
    if (timerRef.current.id !== null) window.clearTimeout(timerRef.current.id);
    timerRef.current.id = null;
  };

  const stopAll = useCallback(() => {
    narration.stop();
    clearTimer();
    setLevel(0);
  }, [narration, setLevel]);

  // Forward-declared via ref so startStep/finishStep can call each other.
  const finishStepRef = useRef<(index: number, runId: number) => void>(() => {});

  const runTextTimer = useCallback((index: number, runId: number, remaining: number) => {
    clearTimer();
    timerRef.current.started = performance.now();
    timerRef.current.id = window.setTimeout(() => finishStepRef.current(index, runId), remaining);
  }, []);

  const startStep = useCallback(
    (index: number, runId: number) => {
      if (runId !== runIdRef.current) return;
      stepRef.current = index;
      setStepIndex(index);
      setHandoffFrom(null);
      setProgress(0);
      setPhase("playing");

      const s = teamSteps[index];
      const startText = () => {
        const duration = readingTimeMs(s.caption);
        timerRef.current.duration = duration;
        timerRef.current.elapsed = 0;
        runTextTimer(index, runId, duration);
      };

      if (modeRef.current === "audio") {
        narration.play(s.audioFile, {
          onEnd: () => finishStepRef.current(index, runId),
          onError: () => {
            if (runId !== runIdRef.current) return;
            // Clip missing or blocked: keep going as a captioned presentation.
            modeRef.current = "text";
            setMode("text");
            setAudioNotice(true);
            startText();
          },
          onLevel: setLevel,
        });
        // Warm the cache for the next clip without blocking this one.
        const next = teamSteps[index + 1];
        if (next) {
          const pre = new Audio();
          pre.preload = "auto";
          pre.src = next.audioFile;
        }
      } else {
        startText();
      }
    },
    [narration, runTextTimer, setLevel]
  );

  finishStepRef.current = (index: number, runId: number) => {
    if (runId !== runIdRef.current) return;
    setLevel(0);
    setProgress(1);
    if (index >= teamSteps.length - 1) {
      setPhase("done");
      track("ai_team_complete", { mode: modeRef.current });
      return;
    }
    setHandoffFrom(index);
    setPhase("handoff");
    window.setTimeout(() => startStep(index + 1, runId), handoffMs);
  };

  const begin = (chosen: Mode) => {
    modeRef.current = chosen;
    setMode(chosen);
    runIdRef.current += 1;
    track("ai_team_start", { mode: chosen });
    startStep(0, runIdRef.current);
  };

  const goTo = (index: number) => {
    const target = Math.max(0, Math.min(teamSteps.length - 1, index));
    stopAll();
    runIdRef.current += 1;
    startStep(target, runIdRef.current);
  };

  const skipToEnd = () => {
    runIdRef.current += 1;
    stopAll();
    setHandoffFrom(null);
    setPhase("done");
  };

  const jumpToAgent = (id: AgentId) => {
    const index = teamSteps.findIndex((s) => s.agentId === id);
    track("ai_team_jump", { agent: id });
    if (phase === "gate") {
      modeRef.current = mode;
      track("ai_team_start", { mode });
    }
    goTo(index);
  };

  const togglePause = () => {
    if (phase === "playing") {
      if (modeRef.current === "audio") narration.pause();
      else {
        clearTimer();
        timerRef.current.elapsed += performance.now() - timerRef.current.started;
      }
      setLevel(0);
      setPhase("paused");
    } else if (phase === "paused") {
      if (modeRef.current === "audio") narration.resume();
      else
        runTextTimer(
          stepRef.current,
          runIdRef.current,
          Math.max(0, timerRef.current.duration - timerRef.current.elapsed)
        );
      setPhase("playing");
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    narration.setMuted(next);
  };

  const switchMode = () => {
    const next: Mode = modeRef.current === "audio" ? "text" : "audio";
    modeRef.current = next;
    setMode(next);
    setAudioNotice(false);
    if (phase !== "gate" && phase !== "done") goTo(stepRef.current);
  };

  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  const close = useCallback(() => {
    track("ai_team_close", { atStep: teamSteps[stepRef.current].id, phase: phaseRef.current });
    runIdRef.current += 1;
    stopAll();
    onClose();
  }, [onClose, stopAll]);
  const closeRef = useRef(close);
  closeRef.current = close;

  const exitTo = (hash: string) => {
    close();
    window.setTimeout(() => document.querySelector(hash)?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  // Caption progress: audio position, or elapsed time in text mode.
  // Sampled at 10Hz: enough for sentence highlighting and the progress bar
  // without re-rendering the whole command center every frame.
  useEffect(() => {
    if (phase !== "playing") return;
    const id = window.setInterval(() => {
      if (modeRef.current === "audio") setProgress(narration.getProgress());
      else {
        const t = timerRef.current;
        setProgress(Math.min(1, (t.elapsed + performance.now() - t.started) / t.duration));
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, narration]);

  // Modal behavior: lock scroll, Escape closes, focus moves in and returns on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, []);

  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const captionSentences = useMemo(() => sentences(step.caption), [step.caption]);
  const activeSentence = useMemo(() => {
    // Map progress to a sentence by cumulative character length (approximate sync).
    const total = captionSentences.reduce((n, s) => n + s.length, 0);
    let acc = 0;
    for (let i = 0; i < captionSentences.length; i++) {
      acc += captionSentences[i].length;
      if (progress * total <= acc) return i;
    }
    return captionSentences.length - 1;
  }, [captionSentences, progress]);

  const running = phase === "playing" || phase === "paused" || phase === "handoff";
  const activeEdge =
    phase === "handoff" && handoffFrom !== null
      ? { from: teamSteps[handoffFrom].agentId, to: teamSteps[handoffFrom + 1].agentId }
      : null;

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-team-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reducedMotion ? 0.01 : 0.25 }}
      className="fixed inset-0 z-[60] overflow-y-auto bg-base-950/95 backdrop-blur-xl"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(50% 40% at 30% 20%, rgba(34,211,238,0.08), transparent 70%), radial-gradient(50% 50% at 75% 70%, rgba(139,92,246,0.12), transparent 70%)",
        }}
      />

      <div className="relative mx-auto flex min-h-full max-w-6xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-cyan">AI engineering command center</p>
            <h2 id="ai-team-title" className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">
              Meet My AI Team
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {running && (
              <button type="button" onClick={skipToEnd} className="btn-ghost whitespace-nowrap !px-3 text-xs">
                Skip intro
              </button>
            )}
            <button
              type="button"
              onClick={close}
              aria-label="Close AI team introduction"
              className="rounded-full border border-white/10 p-2 text-slate-300 hover:bg-white/10 hover:text-white"
              data-autofocus={phase !== "gate" ? true : undefined}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="mt-6 grid flex-1 gap-6 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-10">
          {/* Command-center diagram */}
          <div className="relative mx-auto w-full max-w-[22rem] sm:max-w-md">
            <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="h-auto w-full" role="img" aria-label="Agent handoff ring: Astra, Nova, Forge, Atlas, Pulse, Sentinel, Echo, then back to Astra">
              <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="rgba(148,163,184,0.12)" strokeDasharray="3 6" />
              {agents.map((a, i) => {
                const b = agents[(i + 1) % agents.length];
                const p = agentPoint(a.id);
                const q = agentPoint(b.id);
                const isActive = activeEdge?.from === a.id && activeEdge?.to === b.id;
                const isUpcoming = !activeEdge && running && a.id === agent.id && nextAgent?.id === b.id;
                return (
                  <line
                    key={a.id}
                    x1={p.x}
                    y1={p.y}
                    x2={q.x}
                    y2={q.y}
                    stroke={isActive ? a.color : isUpcoming ? `${a.color}80` : "rgba(148,163,184,0.18)"}
                    strokeWidth={isActive ? 2.5 : 1.2}
                    style={{ transition: "stroke 200ms" }}
                  />
                );
              })}
              {/* Handoff signal travelling along the active connection. */}
              {activeEdge && (
                <motion.circle
                  key={`${activeEdge.from}-${activeEdge.to}`}
                  r={5}
                  fill={agentById[activeEdge.from].color}
                  initial={{ cx: agentPoint(activeEdge.from).x, cy: agentPoint(activeEdge.from).y, opacity: 0 }}
                  animate={{ cx: agentPoint(activeEdge.to).x, cy: agentPoint(activeEdge.to).y, opacity: [0, 1, 1, 0] }}
                  transition={{ duration: handoffMs / 1000, ease: "easeInOut" }}
                  style={{ filter: `drop-shadow(0 0 6px ${agentById[activeEdge.from].color})` }}
                />
              )}
              {/* Center: current speaker. */}
              <circle cx={CENTER} cy={CENTER} r={58} fill="rgba(8,13,28,0.9)" stroke={`${agent.color}66`} />
              <text x={CENTER} y={CENTER - 4} textAnchor="middle" className="fill-white font-display" fontSize="22" fontWeight="700">
                {phase === "done" ? "TEAM" : agent.name}
              </text>
              <text x={CENTER} y={CENTER + 18} textAnchor="middle" fill="#94a3b8" fontSize="10" className="font-mono">
                {phase === "done" ? "handoff complete" : phase === "gate" ? "standing by" : agent.short.toLowerCase()}
              </text>
            </svg>

            {/* Agent avatars, positioned over the SVG ring. */}
            {agents.map((a) => {
              const p = agentPoint(a.id);
              const isCurrent = running && a.id === agent.id;
              const dim = running && !isCurrent;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => jumpToAgent(a.id)}
                  aria-label={`Go to ${a.name}, ${a.role}`}
                  aria-current={isCurrent ? "step" : undefined}
                  className="group absolute -translate-x-1/2 -translate-y-1/2 focus-visible:outline-none"
                  style={{ left: `${(p.x / VIEW) * 100}%`, top: `${(p.y / VIEW) * 100}%` }}
                >
                  <span
                    className="relative flex h-11 w-11 items-center justify-center rounded-full border-2 font-display text-sm font-bold text-white transition-all duration-300 group-focus-visible:ring-2 group-focus-visible:ring-white sm:h-14 sm:w-14 sm:text-base"
                    style={{
                      borderColor: a.color,
                      background: `radial-gradient(circle at 30% 25%, ${a.color}55, rgba(8,13,28,0.95) 70%)`,
                      opacity: dim ? 0.38 : 1,
                      transform: isCurrent ? "scale(1.18)" : "scale(1)",
                      boxShadow: isCurrent ? `0 0 28px -2px ${a.color}` : "none",
                    }}
                  >
                    {isCurrent && (
                      <span
                        ref={levelRef}
                        aria-hidden="true"
                        className="absolute -inset-1.5 rounded-full border-2"
                        style={{ borderColor: a.color, opacity: 0.3, transition: "transform 80ms linear" }}
                      />
                    )}
                    {a.glyph}
                  </span>
                  <span
                    className="mt-1 block whitespace-nowrap text-center font-mono text-[9px] uppercase tracking-wider sm:text-[10px]"
                    style={{ color: dim ? "#64748b" : a.color }}
                  >
                    {a.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Info panel */}
          <div className="min-w-0">
            <AnimatePresence mode="wait">
              {phase === "gate" && (
                <motion.div
                  key="gate"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: reducedMotion ? 0.01 : 0.25 }}
                >
                  <p className="text-lg leading-relaxed text-slate-200">
                    Seven specialist roles, one handoff chain. Each agent introduces its part of the workflow behind this
                    portfolio, then passes control to the next.
                  </p>
                  <p className="mt-3 text-sm text-slate-400">About 3½ minutes. You can pause, skip, or jump to any agent.</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button type="button" onClick={() => begin("audio")} className="btn-primary" data-autofocus>
                      <Headphones className="h-4 w-4" />
                      Start with voices
                    </button>
                    <button type="button" onClick={() => begin("text")} className="btn-secondary">
                      <Type className="h-4 w-4" />
                      Read without audio
                    </button>
                  </div>
                </motion.div>
              )}

              {running && (
                <motion.div
                  key={`step-${stepIndex}`}
                  initial={{ opacity: 0, x: reducedMotion ? 0 : 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: reducedMotion ? 0 : -16 }}
                  transition={{ duration: reducedMotion ? 0.01 : 0.25 }}
                >
                  <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider" style={{ color: agent.color }}>
                    <SpeakingBars active={phase === "playing" && !reducedMotion} color={agent.color} />
                    {phase === "handoff" ? `Handing off to ${nextAgent?.name}` : phase === "paused" ? "Paused" : "Now speaking"}
                    <span className="text-slate-400">· {stepIndex + 1}/{teamSteps.length}</span>
                  </p>
                  <h3 className="mt-2 font-display text-3xl font-bold text-white">{agent.name}</h3>
                  <p className="text-sm font-medium text-slate-300">{agent.role}</p>
                  <ul className="mt-3 space-y-1 text-sm text-slate-400">
                    {agent.responsibilities.map((r) => (
                      <li key={r} className="flex gap-2">
                        <span aria-hidden="true" style={{ color: agent.color }}>▸</span>
                        {r}
                      </li>
                    ))}
                  </ul>

                  {captionsOn && (
                    <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4" aria-live="polite">
                      <p className="text-[15px] leading-relaxed">
                        {captionSentences.map((s, i) => (
                          <span
                            key={i}
                            className="transition-colors duration-300"
                            style={{ color: i === activeSentence ? "#f8fafc" : i < activeSentence ? "#94a3b8" : "#64748b" }}
                          >
                            {s}{" "}
                          </span>
                        ))}
                      </p>
                    </div>
                  )}
                </motion.div>
              )}

              {phase === "done" && (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reducedMotion ? 0.01 : 0.25 }}
                >
                  <h3 className="font-display text-3xl font-bold text-white">You&apos;ve met the team.</h3>
                  <p className="mt-2 text-slate-300">Now look at the real work: architectures, decisions, and evidence.</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button type="button" onClick={() => exitTo("#projects")} className="btn-primary" data-autofocus>
                      Explore the projects
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => exitTo("#ai-lab")} className="btn-secondary">
                      <FlaskConical className="h-4 w-4" />
                      Open the AI Lab
                    </button>
                    <button type="button" onClick={() => goTo(0)} className="btn-ghost">
                      <RotateCcw className="h-4 w-4" />
                      Replay
                    </button>
                  </div>
                  <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <AskPanel />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {audioNotice && (
              <p className="mt-3 text-xs text-amber-300/90" role="status">
                Audio couldn&apos;t load, so the presentation continues with captions.
              </p>
            )}
          </div>
        </div>

        {/* Progress + controls */}
        {running && (
          <div className="sticky bottom-3 z-10 mt-6 rounded-2xl border border-white/10 bg-base-900/90 p-3 shadow-2xl shadow-black/60 backdrop-blur-md sm:p-4 lg:static lg:shadow-none">
            <div className="flex gap-1" role="group" aria-label="Presentation progress">
              {teamSteps.map((s, i) => {
                const a = agentById[s.agentId];
                const fill = i < stepIndex ? 1 : i === stepIndex ? progress : 0;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-label={`Step ${i + 1}: ${a.name}`}
                    aria-current={i === stepIndex ? "step" : undefined}
                    className="group relative h-6 flex-1"
                  >
                    <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/10 group-hover:bg-white/20">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${fill * 100}%`, background: a.color }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <IconButton label="Previous agent" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0}>
                  <SkipBack className="h-4 w-4" />
                </IconButton>
                <IconButton label={phase === "paused" ? "Resume" : "Pause"} onClick={togglePause} disabled={phase === "handoff"} primary>
                  {phase === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </IconButton>
                <IconButton label="Next agent" onClick={() => (stepIndex >= teamSteps.length - 1 ? skipToEnd() : goTo(stepIndex + 1))}>
                  <SkipForward className="h-4 w-4" />
                </IconButton>
                <IconButton label="Replay this agent" onClick={() => goTo(stepIndex)}>
                  <RotateCcw className="h-4 w-4" />
                </IconButton>
              </div>
              <div className="flex items-center gap-1">
                {mode === "audio" && (
                  <IconButton label={muted ? "Unmute" : "Mute"} onClick={toggleMute} pressed={muted}>
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </IconButton>
                )}
                <IconButton label={captionsOn ? "Hide captions" : "Show captions"} onClick={() => setCaptionsOn((v) => !v)} pressed={captionsOn}>
                  {captionsOn ? <Captions className="h-4 w-4" /> : <CaptionsOff className="h-4 w-4" />}
                </IconButton>
                <IconButton label={transcriptOpen ? "Hide transcript" : "Show full transcript"} onClick={() => setTranscriptOpen((v) => !v)} pressed={transcriptOpen}>
                  <ScrollText className="h-4 w-4" />
                </IconButton>
                <button type="button" onClick={switchMode} className="btn-ghost !px-3 text-xs">
                  {mode === "audio" ? <Type className="h-3.5 w-3.5" /> : <Headphones className="h-3.5 w-3.5" />}
                  {mode === "audio" ? "Text only" : "Use voices"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Full transcript (also the non-audio alternative). */}
        {phase === "gate" ? (
          <details className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm">
            <summary className="cursor-pointer select-none font-medium text-slate-300">Read the full transcript</summary>
            <Transcript activeIndex={null} />
          </details>
        ) : (
          transcriptOpen && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm">
              <p className="font-medium text-slate-300">Full transcript</p>
              <Transcript activeIndex={running ? stepIndex : null} />
            </div>
          )
        )}

        <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-400">
          Scripted presentation with AI-generated voices (OpenAI TTS, stock voices). The agents are illustrative roles for
          the disciplines used to plan, build, and test this site. They are not autonomous AI running in your browser.
        </p>
      </div>
    </motion.div>
  );
}

function Transcript({ activeIndex }: { activeIndex: number | null }) {
  return (
    <ol className="mt-3 space-y-3">
      {teamSteps.map((s, i) => {
        const a = agentById[s.agentId];
        return (
          <li key={s.id} className={i === activeIndex ? "text-slate-100" : "text-slate-400"}>
            <span className="font-mono text-xs font-semibold" style={{ color: a.color }}>
              {a.name}
            </span>{" "}
            {s.caption}
          </li>
        );
      })}
    </ol>
  );
}

function IconButton({
  label,
  onClick,
  children,
  disabled,
  primary,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  primary?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors disabled:opacity-30 ${
        primary ? "bg-white text-base-950 hover:bg-slate-200" : "text-slate-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function SpeakingBars({ active, color }: { active: boolean; color: string }) {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full"
          style={{ background: color }}
          animate={active ? { height: ["30%", "100%", "45%", "80%", "30%"] } : { height: "30%" }}
          transition={{ duration: 0.9, repeat: active ? Infinity : 0, delay: i * 0.12 }}
        />
      ))}
    </span>
  );
}
