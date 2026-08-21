"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Pause, Play, SkipForward, Sparkles, Volume2, X } from "lucide-react";
import { guidedTourSteps } from "@/data/guidedTour";
import { profile } from "@/data/profile";
import { track } from "@/lib/analytics";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useAudioNarration } from "@/hooks/useAudioNarration";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";

type Status = "idle" | "playing" | "paused" | "done";
type Engine = "audio" | "speech";

const SCROLL_SETTLE_MS_MOTION = 550;
const SCROLL_SETTLE_MS_REDUCED = 150;

export function AIPitchGuide() {
  const reducedMotion = useReducedMotion();
  const audioNarration = useAudioNarration();
  const speech = useSpeechSynthesis();

  const [status, setStatus] = useState<Status>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [pastHero, setPastHero] = useState(false);

  const orbRef = useRef<HTMLSpanElement>(null);
  const runIdRef = useRef(0);
  const engineRef = useRef<Engine>("audio");
  // Authoritative "what step are we on" for control flow. React state
  // (stepIndex) is only for rendering — reading it inside handleSkip would
  // race on rapid double-clicks (stale closure), letting two clicks both
  // compute the same "next index" and double-schedule/double-fire analytics.
  const stepIndexRef = useRef(0);
  // Once a pre-generated clip 404s (not yet built for this deployment), stop
  // trying audio for the rest of the tour and use speech synthesis instead.
  const audioUnavailableRef = useRef(false);

  useEffect(() => {
    const heroEl = document.getElementById("top");
    if (!heroEl) {
      setPastHero(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setPastHero(!entry.isIntersecting), {
      rootMargin: "-80% 0px 0px 0px",
    });
    observer.observe(heroEl);
    return () => observer.disconnect();
  }, []);

  const setOrbLevel = useCallback((level: number) => {
    const el = orbRef.current;
    if (!el) return;
    el.style.transform = `scale(${1 + level * 0.7})`;
    el.style.opacity = `${0.35 + level * 0.5}`;
  }, []);

  const goToStep = useCallback(
    (index: number, runId: number) => {
      if (runId !== runIdRef.current) return;
      stepIndexRef.current = index;

      if (index >= guidedTourSteps.length) {
        setStatus("done");
        track("ai_pitch_complete");
        return;
      }

      setStepIndex(index);
      const step = guidedTourSteps[index];
      document
        .getElementById(step.sectionId)
        ?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });

      window.setTimeout(
        () => {
          if (runId !== runIdRef.current) return;

          const advance = () => goToStep(index + 1, runId);

          const fallbackToSpeech = () => {
            engineRef.current = "speech";
            speech.speak(step.line, { onEnd: advance });
          };

          if (audioUnavailableRef.current) {
            fallbackToSpeech();
            return;
          }

          engineRef.current = "audio";
          audioNarration.play(step.audioFile, {
            onEnd: advance,
            onError: () => {
              audioUnavailableRef.current = true;
              fallbackToSpeech();
            },
            onLevel: setOrbLevel,
          });
        },
        reducedMotion ? SCROLL_SETTLE_MS_REDUCED : SCROLL_SETTLE_MS_MOTION
      );
    },
    [reducedMotion, speech, audioNarration, setOrbLevel]
  );

  const handlePlay = () => {
    runIdRef.current += 1;
    const runId = runIdRef.current;
    setStatus("playing");
    track("ai_pitch_start");
    goToStep(0, runId);
  };

  // Lets the command palette (or anything else) trigger the pitch without
  // needing to reach into this component's local state.
  useEffect(() => {
    window.addEventListener("open-ai-pitch", handlePlay);
    return () => window.removeEventListener("open-ai-pitch", handlePlay);
  });

  const stopEverything = () => {
    audioNarration.stop();
    speech.cancel();
    setOrbLevel(0);
  };

  const handleClose = () => {
    track("ai_pitch_close", { atStep: guidedTourSteps[stepIndexRef.current]?.id ?? "unknown" });
    runIdRef.current += 1;
    stopEverything();
    setStatus("idle");
    setStepIndex(0);
    stepIndexRef.current = 0;
  };

  const handlePauseResume = () => {
    if (status === "playing") {
      if (engineRef.current === "audio") audioNarration.pause();
      else speech.pause();
      setStatus("paused");
    } else if (status === "paused") {
      if (engineRef.current === "audio") audioNarration.resume();
      else speech.resume();
      setStatus("playing");
    }
  };

  const handleSkip = () => {
    if (status === "done") return;
    track("ai_pitch_skip", { atStep: guidedTourSteps[stepIndexRef.current]?.id ?? "unknown" });
    const runId = runIdRef.current;
    stopEverything();
    setStatus("playing");
    goToStep(stepIndexRef.current + 1, runId);
  };

  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      stopEverything();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOpen = status !== "idle";
  const currentStep = guidedTourSteps[Math.min(stepIndex, guidedTourSteps.length - 1)];

  return (
    <>
      {!isOpen && pastHero && (
        <motion.button
          type="button"
          onClick={handlePlay}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0.01 : 0.2 }}
          className="group fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-accent-cyan/30 bg-base-900/90 py-3 pl-3 pr-4 shadow-2xl shadow-black/50 backdrop-blur-sm transition-colors hover:border-accent-cyan/60 sm:bottom-6 sm:right-6"
          aria-label="Play an audio pitch that highlights why you should interview me"
        >
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-cyan to-accent-violet">
            <span
              className={`absolute inline-flex h-full w-full rounded-full bg-accent-cyan/50 ${
                reducedMotion ? "" : "animate-ping"
              }`}
            />
            <Bot className="relative h-4 w-4 text-base-950" />
          </span>
          <span className="text-xs font-semibold text-white">Hear My Pitch</span>
        </motion.button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: reducedMotion ? 1 : 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: reducedMotion ? 1 : 0.96 }}
            transition={{ duration: reducedMotion ? 0.01 : 0.2 }}
            role="dialog"
            aria-label="AI pitch guided tour"
            className="fixed inset-x-4 bottom-5 z-40 mx-auto max-w-sm rounded-2xl border border-white/10 bg-base-900/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-md sm:inset-x-auto sm:bottom-6 sm:right-6 sm:left-auto sm:w-96"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-cyan to-accent-violet">
                  {/* Idle ambient pulse (always on while playing) */}
                  <motion.span
                    className="absolute inset-0 rounded-full bg-accent-cyan/40"
                    animate={
                      status === "playing" && !reducedMotion
                        ? { scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }
                        : { scale: 1, opacity: 0 }
                    }
                    transition={{ duration: 1.6, repeat: status === "playing" ? Infinity : 0 }}
                  />
                  {/* Real-time waveform-reactive ring, driven imperatively for perf */}
                  <span
                    ref={orbRef}
                    className="absolute inset-0 rounded-full bg-accent-violet/50"
                    style={{ transform: "scale(1)", opacity: 0.35, transition: "transform 60ms linear" }}
                  />
                  <Volume2 className="relative h-4 w-4 text-base-950" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent-cyan">
                    {status === "done" ? "That's my pitch" : currentStep.eyebrow}
                  </p>
                  <p className="text-[11px] text-slate-500">AI pitch</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close pitch"
                className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-slate-200">
              {status === "done"
                ? `${profile.contactCtaLine} My resume and contact info are just below.`
                : currentStep.line}
            </p>

            {/* Step progress */}
            <div className="mt-4 flex items-center gap-1.5">
              {guidedTourSteps.map((step, i) => (
                <span
                  key={step.id}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i < stepIndex || status === "done"
                      ? "bg-accent-cyan"
                      : i === stepIndex
                        ? "bg-accent-cyan/50"
                        : "bg-white/10"
                  }`}
                />
              ))}
            </div>

            {/* Controls */}
            <div className="mt-4 flex items-center gap-2">
              {status !== "done" ? (
                <>
                  <button
                    type="button"
                    onClick={handlePauseResume}
                    className="btn-ghost !px-3 text-xs"
                    aria-label={status === "playing" ? "Pause" : "Resume"}
                  >
                    {status === "playing" ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {status === "playing" ? "Pause" : "Resume"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSkip}
                    className="btn-ghost !px-3 text-xs"
                    aria-label="Skip to next highlight"
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                    Skip
                  </button>
                </>
              ) : (
                <>
                  <a
                    href={profile.resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary flex-1 justify-center !py-2 text-xs"
                    onClick={() => track("resume_view_click", { source: "ai_pitch" })}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    View Resume
                  </a>
                  <a
                    href="#contact"
                    onClick={() => {
                      track("contact_click", { source: "ai_pitch" });
                      handleClose();
                    }}
                    className="btn-secondary flex-1 justify-center !py-2 text-xs"
                  >
                    Contact
                  </a>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
