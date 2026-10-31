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
import { AgentConstellation } from "./event/AgentConstellation";

type Mode = "audio" | "text";
type Phase = "gate" | "playing" | "paused" | "handoff" | "done";

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
  const ringIndex = agents.findIndex((a) => a.id === agent.id);
  // The closing ASTRA step and the end screen light the whole team.
  const wholeTeam = phase === "gate" || phase === "done" || (running && stepIndex === teamSteps.length - 1);
  const wash = phase === "gate" || phase === "done" ? "#22d3ee" : agent.color;

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-team-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reducedMotion ? 0.01 : 0.35 }}
      className="fixed inset-0 z-[60] overflow-y-auto bg-[#03050d]"
    >
      {/* Agent-colored light wash, crossfading on every handoff */}
      <AnimatePresence>
        <motion.div
          key={wash}
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0.01 : 0.9 }}
          className="pointer-events-none fixed inset-0"
          style={{
            background: `radial-gradient(45% 55% at 28% 45%, ${wash}2e, transparent 70%), radial-gradient(40% 45% at 85% 85%, ${wash}1a, transparent 70%), radial-gradient(60% 50% at 70% 10%, rgba(25,211,197,0.06), transparent 70%)`,
          }}
        />
      </AnimatePresence>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.7)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(70%_70%_at_50%_45%,black,transparent)]"
      />
      {/* Giant outlined agent name behind the stage */}
      {running && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-[38%] hidden select-none overflow-hidden text-center lg:block">
          <AnimatePresence mode="wait">
            <motion.span
              key={agent.id}
              initial={{ opacity: 0, y: reducedMotion ? 0 : 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reducedMotion ? 0 : -30 }}
              transition={{ duration: reducedMotion ? 0.01 : 0.6 }}
              className="block whitespace-nowrap font-display text-[19vw] font-black leading-none tracking-[-0.06em] text-transparent"
              style={{ WebkitTextStroke: `1px ${agent.color}22` }}
            >
              {agent.name}
            </motion.span>
          </AnimatePresence>
        </div>
      )}

      <div className="relative mx-auto flex min-h-full max-w-7xl flex-col px-4 py-4 sm:px-8 sm:py-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 ${running && !reducedMotion ? "animate-ping" : ""}`} />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-slate-400">AI engineering command center</p>
              <h2 id="ai-team-title" className="font-display text-lg font-semibold text-white sm:text-xl">
                Meet My AI Team
              </h2>
            </div>
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

        <div className="mt-4 grid flex-1 items-center gap-6 lg:mt-2 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
          {/* Constellation: Lohith at the center, seven agents in the handoff ring */}
          <AgentConstellation
            index={ringIndex}
            phase={phase === "handoff" ? "handoff" : "scene"}
            speaking={phase === "playing" && !reducedMotion}
            handoffMs={handoffMs}
            reducedMotion={reducedMotion}
            allActive={wholeTeam}
            onSelect={(i) => jumpToAgent(agents[i].id)}
            size="max-w-[17rem] sm:max-w-[26rem] lg:max-w-[34rem]"
          />

          {/* Agent stage */}
          <div className="min-w-0">
            <AnimatePresence mode="wait">
              {phase === "gate" && (
                <motion.div
                  key="gate"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: reducedMotion ? 0.01 : 0.35 }}
                >
                  <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-teal">7 roles · 1 handoff chain</p>
                  <p className="mt-3 font-hero text-4xl font-black leading-[0.98] tracking-[-0.03em] text-white sm:text-6xl">
                    The team behind
                    <br />
                    <span className="text-teal">this portfolio.</span>
                  </p>
                  <p className="mt-4 max-w-md text-base leading-relaxed text-slate-300">
                    Each agent introduces its part of the workflow, in its own voice, then hands control to the next.
                  </p>
                  <p className="mt-2 text-sm text-slate-400">About 3½ minutes. Pause, skip, or tap any agent to jump.</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button type="button" onClick={() => begin("audio")} className="btn-primary !px-6 !py-3.5" data-autofocus>
                      <Headphones className="h-4 w-4" />
                      Start with voices
                    </button>
                    <button type="button" onClick={() => begin("text")} className="btn-secondary !py-3.5">
                      <Type className="h-4 w-4" />
                      Read without audio
                    </button>
                  </div>
                </motion.div>
              )}

              {running && (
                <motion.div
                  key={`step-${stepIndex}`}
                  initial={{ opacity: 0, y: reducedMotion ? 0 : 18, filter: reducedMotion ? "none" : "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: reducedMotion ? 0 : -18, filter: reducedMotion ? "none" : "blur(6px)" }}
                  transition={{ duration: reducedMotion ? 0.01 : 0.45, ease: [0.22, 1, 0.36, 1] }}
                >
                  <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em]" style={{ color: agent.color }}>
                    <SpeakingBars active={phase === "playing" && !reducedMotion} color={agent.color} />
                    {phase === "paused" ? "Paused" : "Now speaking"}
                    <span className="text-slate-500">
                      {String(stepIndex + 1).padStart(2, "0")} / {String(teamSteps.length).padStart(2, "0")}
                    </span>
                  </p>

                  <div className="mt-4 flex items-center gap-4 sm:gap-5">
                    <span
                      className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border font-display text-xl font-bold text-white sm:h-20 sm:w-20 sm:text-2xl"
                      style={{
                        borderColor: `${agent.color}aa`,
                        background: `radial-gradient(circle at 30% 20%, ${agent.color}66, rgba(5,8,20,0.96) 72%)`,
                        boxShadow: `0 0 50px -10px ${agent.color}`,
                      }}
                    >
                      <span
                        ref={levelRef}
                        aria-hidden="true"
                        className="absolute -inset-2 rounded-[1.2rem] border"
                        style={{ borderColor: agent.color, opacity: 0.25, transition: "transform 80ms linear" }}
                      />
                      {agent.glyph}
                    </span>
                    <div className="min-w-0">
                      <h3
                        className="font-display text-5xl font-black leading-none tracking-[-0.04em] text-transparent sm:text-7xl"
                        style={{ backgroundImage: `linear-gradient(100deg, #fff 35%, ${agent.color})`, WebkitBackgroundClip: "text", backgroundClip: "text" }}
                      >
                        {agent.name}
                      </h3>
                      <p className="mt-1.5 text-sm font-medium text-slate-300 sm:text-base">{agent.role}</p>
                    </div>
                  </div>

                  <ul className="mt-5 flex flex-wrap gap-2">
                    {agent.responsibilities.map((r) => (
                      <li
                        key={r}
                        className="rounded-full border px-3 py-1 text-xs text-slate-200"
                        style={{ borderColor: `${agent.color}40`, background: `${agent.color}10` }}
                      >
                        {r}
                      </li>
                    ))}
                  </ul>

                  {/* Handoff: who has control next */}
                  {nextAgent && (
                    <div className="mt-6 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em]">
                      <span style={{ color: agent.color }}>{agent.name}</span>
                      <span className="relative h-px max-w-[10rem] flex-1 overflow-hidden bg-white/10">
                        <motion.span
                          className="absolute inset-y-0 left-0 w-full origin-left"
                          style={{ background: `linear-gradient(90deg, ${agent.color}, ${nextAgent.color})` }}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: phase === "handoff" ? 1 : progress }}
                          transition={{ duration: phase === "handoff" && !reducedMotion ? handoffMs / 1000 : 0.1, ease: "linear" }}
                        />
                      </span>
                      <span style={{ color: phase === "handoff" ? nextAgent.color : "#64748b" }}>
                        {phase === "handoff" ? `Handing off to ${nextAgent.name}` : `Next: ${nextAgent.name}`}
                      </span>
                    </div>
                  )}
                </motion.div>
              )}

              {phase === "done" && (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reducedMotion ? 0.01 : 0.35 }}
                >
                  <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-emerald-300">Handoff complete</p>
                  <h3 className="mt-2 font-hero text-4xl font-black leading-tight tracking-[-0.03em] text-white sm:text-5xl">You&apos;ve met the team.</h3>
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

        {/* Film-style subtitles */}
        {running && captionsOn && (
          <div className="mx-auto mt-6 w-full max-w-4xl text-center" aria-live={mode === "text" || muted ? "polite" : "off"}>
            <p className="inline rounded-lg bg-black/55 px-3 py-1 text-base leading-[1.9] [box-decoration-break:clone] sm:text-xl sm:leading-[1.85]">
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
