"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity, ChevronDown, ChevronUp, FolderKanban, Pause, Play, RotateCcw, Users, Volume2, VolumeX, X } from "lucide-react";
import { openAgentTeam, OPEN_AGENT_TEAM_EVENT } from "@/lib/agentTeamEvents";
import { track } from "@/lib/analytics";
import { announceAudio, onOtherAudio } from "@/lib/siteAudio";
import { PRISM_CAPTIONS, PRISM_SESSION_KEY, PRISM_SOUND_KEY } from "@/data/prismWelcome";
import manifest from "@/data/prismWelcomeManifest.json";

// PRISM's homepage welcome: one prerecorded greeting with measured captions,
// three real shortcuts, and nothing else. PRISM itself is the weekly review
// agent (scripts/agents/prism.mjs); this panel only introduces it.
//
// Audio rules: autoplay is attempted once per browsing session and only if the
// browser allows it (a rejected play() shows "Hear PRISM" instead, nothing is
// retried or worked around). Any other site audio starting, the AI team
// opening, or leaving the page stops PRISM, so two voices never overlap.

type Phase = "idle" | "loading" | "playing" | "paused" | "ended" | "blocked" | "failed";

const read = (store: () => Storage, key: string) => {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
};
const write = (store: () => Storage, key: string, value: string) => {
  try {
    store().setItem(key, value);
  } catch {
    /* private mode or blocked storage: the panel still works, it just won't remember */
  }
};
const session = () => window.sessionStorage;
const local = () => window.localStorage;

/** True while another narrated presentation (AI team, any modal player) is open. */
const otherPresentationOpen = () => Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));

export function PrismWelcome() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [shown, setShown] = useState(false);
  const [closed, setClosed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [muted, setMuted] = useState(false);
  const [cue, setCue] = useState(-1);
  const [pastHero, setPastHero] = useState(false);

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      const a = new Audio(manifest.file);
      a.preload = "auto";
      a.addEventListener("playing", () => setPhase("playing"));
      a.addEventListener("pause", () => setPhase((p) => (p === "playing" ? (a.ended ? "ended" : "paused") : p)));
      a.addEventListener("ended", () => {
        setPhase("ended");
        setCue(-1);
      });
      a.addEventListener("error", () => {
        setPhase("failed");
        setExpanded(true);
      });
      a.addEventListener("timeupdate", () => {
        const t = a.currentTime * 1000;
        setCue(manifest.cues.findIndex((c) => t >= c.startMs && t < c.endMs));
      });
      audioRef.current = a;
    }
    return audioRef.current;
  }, []);

  const stop = useCallback(() => {
    const a = audioRef.current;
    if (a && !a.paused) a.pause();
  }, []);

  /** Plays from `fromStart` or the current position. `auto` marks the one autoplay attempt. */
  const play = useCallback(
    async (fromStart: boolean, auto = false) => {
      if (otherPresentationOpen()) return;
      const a = getAudio();
      if (fromStart) a.currentTime = 0;
      setPhase("loading");
      try {
        await a.play();
        announceAudio("prism");
        track("prism_welcome_play", { auto });
      } catch (e) {
        const blocked = e instanceof DOMException && e.name === "NotAllowedError";
        setPhase(blocked ? "blocked" : "failed");
        if (blocked) track("prism_welcome_blocked");
        // Without audio the full transcript is the greeting.
        else setExpanded(true);
      }
    },
    [getAudio],
  );

  // Appear once the hero is on screen and the page has settled; never before
  // the hero paints, and never as part of the critical path.
  useEffect(() => {
    if (read(session, `${PRISM_SESSION_KEY}-closed`) === "1") {
      setClosed(true);
      return;
    }
    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      const heardThisSession = read(session, PRISM_SESSION_KEY) === "1";
      const soundOff = read(local, PRISM_SOUND_KEY) === "off";
      setMuted(soundOff);
      setShown(true);
      write(session, PRISM_SESSION_KEY, "1");
      if (!heardThisSession && !soundOff) void play(true, true);
    };
    // Below lg the hero stacks portrait, headline and CTA down the first
    // screen, leaving no free corner, so PRISM waits until the hero's primary
    // CTA has scrolled out of view.
    let io: IntersectionObserver | undefined;
    const settle = () => {
      const cta = document.querySelector('#top a[href="/event"]');
      if (!window.matchMedia("(max-width: 1023px)").matches || !cta) return start();
      io = new IntersectionObserver(([entry]) => {
        // Only once the CTA is above the viewport, i.e. the visitor scrolled past it.
        if (entry.isIntersecting || entry.boundingClientRect.top > 0) return;
        io?.disconnect();
        start();
      });
      io.observe(cta);
    };
    const timer = window.setTimeout(() => {
      if (document.readyState === "complete") settle();
      else window.addEventListener("load", settle, { once: true });
    }, 900);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("load", settle);
      io?.disconnect();
    };
  }, [play]);

  // Never overlap other narration: stop when the AI team opens, when any
  // other audio/video element starts, and when the page is hidden or left.
  useEffect(() => {
    const onOtherPlay = (e: Event) => {
      if (e.target !== audioRef.current) stop();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") stop();
    };
    window.addEventListener(OPEN_AGENT_TEAM_EVENT, stop);
    const offOtherAudio = onOtherAudio("prism", stop);
    document.addEventListener("play", onOtherPlay, true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener(OPEN_AGENT_TEAM_EVENT, stop);
      offOtherAudio();
      document.removeEventListener("play", onOtherPlay, true);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", stop);
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.removeAttribute("src");
        a.load();
      }
      audioRef.current = null;
    };
  }, [stop]);

  // On the hero (lg+) PRISM sits in the empty band above the headline and
  // scrolls away with it; past the hero it floats above "Meet my AI team".
  useEffect(() => {
    const hero = document.getElementById("top");
    if (!hero) return;
    const io = new IntersectionObserver(([entry]) => setPastHero(!entry.isIntersecting), { rootMargin: "-80% 0px 0px 0px" });
    io.observe(hero);
    return () => io.disconnect();
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    write(local, PRISM_SOUND_KEY, next ? "off" : "on");
    if (audioRef.current) audioRef.current.muted = next;
  };

  const hear = () => {
    // An explicit request to listen turns sound back on.
    if (muted) {
      setMuted(false);
      write(local, PRISM_SOUND_KEY, "on");
    }
    getAudio().muted = false;
    void play(phase === "ended" || phase === "idle" || phase === "blocked" || phase === "failed");
  };

  const close = () => {
    stop();
    setClosed(true);
    write(session, `${PRISM_SESSION_KEY}-closed`, "1");
  };

  const exploreProjects = () => {
    track("prism_welcome_shortcut", { target: "projects" });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("projects")?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
  };

  if (closed || !shown) return null;

  const speaking = phase === "playing";
  const caption = cue >= 0 ? PRISM_CAPTIONS[cue] : null;
  const status =
    phase === "playing"
      ? muted
        ? "Speaking (muted)"
        : "Speaking"
      : phase === "loading"
        ? "Loading greeting…"
        : phase === "blocked"
          ? "Sound is off until you choose to hear it"
          : phase === "failed"
            ? "Audio unavailable. Captions below."
            : phase === "paused"
              ? "Paused"
              : "AI portfolio guide";
  const primaryLabel = speaking ? "Pause PRISM" : phase === "paused" ? "Resume PRISM" : phase === "ended" ? "Replay PRISM" : "Hear PRISM";
  const ctl =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal";

  return (
    <aside
      aria-label="PRISM, AI portfolio guide"
      data-testid="prism-welcome"
      data-phase={phase}
      className={`fixed right-4 z-40 w-[min(22rem,calc(100vw-2rem))] sm:right-6 ${
        pastHero
          ? "bottom-20 sm:bottom-24"
          : "bottom-4 sm:bottom-6 lg:absolute lg:bottom-auto lg:right-auto lg:top-[5.25rem] lg:left-[max(4rem,calc((100vw-1720px)/2))] lg:w-[min(30rem,calc(60vw-18rem))]"
      }`}
    >
      <div
        className={`relative overflow-hidden rounded-2xl border border-teal/25 bg-ink-950/90 shadow-[0_0_40px_-12px_rgba(25,211,197,0.45)] backdrop-blur-md ${speaking ? "prism-speaking" : ""}`}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_0%_0%,rgba(25,211,197,0.14),transparent_70%)]" />

        {/* Header: orb, name, status, controls */}
        <div className="relative flex items-center gap-3 p-2 pl-3">
          <PrismOrb />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-teal">
              PRISM <Waveform />
            </p>
            <p className="truncate text-xs text-slate-300" aria-live="polite">
              {status}
            </p>
          </div>
          <div className="-ml-1 flex shrink-0 items-center">
            <button type="button" onClick={speaking ? stop : hear} aria-label={primaryLabel} title={primaryLabel} className={ctl}>
              {speaking ? (
                <Pause className="h-4 w-4" aria-hidden="true" />
              ) : phase === "ended" ? (
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "Unmute PRISM" : "Mute PRISM"}
              aria-pressed={muted}
              title={muted ? "Unmute" : "Mute"}
              className={ctl}
            >
              {muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
            </button>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Minimize PRISM" : "Expand PRISM"}
              aria-expanded={expanded}
              aria-controls="prism-welcome-body"
              title={expanded ? "Minimize" : "Expand"}
              className={ctl}
            >
              {expanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronUp className="h-4 w-4" aria-hidden="true" />}
            </button>
            <button type="button" onClick={close} aria-label="Close PRISM" title="Close" className={ctl}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Compact: the sentence being spoken (captions never disappear), the
            listen button when autoplay was refused, and on the desktop hero
            the three shortcuts. */}
        {!expanded && (caption || phase === "blocked" || !pastHero) && (
          <div className="relative px-4 empty:hidden [&:not(:empty)]:pb-3">
            {caption && (
              <p className="text-sm leading-snug text-white" data-testid="prism-caption">
                {caption}
              </p>
            )}
            {phase === "blocked" && <HearButton onClick={hear} />}
            {!pastHero && <Shortcuts compact className="mt-2 hidden first:mt-0 lg:flex" onProjects={exploreProjects} />}
          </div>
        )}

        {expanded && (
          <div id="prism-welcome-body" className="relative px-4 pb-4">
            {/* Full captions; the sentence being spoken is highlighted */}
            <p className="text-sm leading-relaxed" data-testid="prism-captions">
              {PRISM_CAPTIONS.map((c, i) => (
                <span
                  key={c}
                  data-active={i === cue || undefined}
                  className={`transition-colors duration-200 ${i === cue ? "text-white" : cue >= 0 ? "text-slate-500" : "text-slate-300"}`}
                >
                  {c}{" "}
                </span>
              ))}
            </p>
            {phase === "blocked" && <HearButton onClick={hear} />}
            <Shortcuts className="mt-3 flex" onProjects={exploreProjects} />
            <p className="mt-3 text-[11px] leading-snug text-slate-500">
              Prerecorded greeting. PRISM is a weekly review agent that writes improvement prompts; changes ship only after Lohith approves them.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

function HearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-teal px-4 text-sm font-semibold text-ink-950 transition-colors first:mt-0 hover:bg-teal-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <Volume2 className="h-4 w-4" aria-hidden="true" /> Hear PRISM
    </button>
  );
}

/** The three real actions. Compact chips show a short label; the accessible name stays the full one and contains it. */
function Shortcuts({ compact = false, className, onProjects }: { compact?: boolean; className: string; onProjects: () => void }) {
  const chip =
    "inline-flex min-h-10 items-center gap-1.5 rounded-full border border-white/10 px-3 text-xs font-medium text-slate-200 transition-colors hover:border-teal/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal";
  const icon = "h-3.5 w-3.5";
  return (
    <div className={`flex-wrap gap-2 ${className}`}>
      <button type="button" onClick={onProjects} aria-label={compact ? "Explore Projects" : undefined} className={chip}>
        <FolderKanban className={icon} aria-hidden="true" /> {compact ? "Projects" : "Explore Projects"}
      </button>
      <button
        type="button"
        onClick={() => {
          track("prism_welcome_shortcut", { target: "ai-team" });
          openAgentTeam();
        }}
        aria-label={compact ? "Meet the AI Team" : undefined}
        className={chip}
      >
        <Users className={icon} aria-hidden="true" /> {compact ? "AI Team" : "Meet the AI Team"}
      </button>
      <Link
        href="/agents"
        onClick={() => track("prism_welcome_shortcut", { target: "agents" })}
        aria-label={compact ? "See Real Agent Activity" : undefined}
        className={chip}
      >
        <Activity className={icon} aria-hidden="true" /> {compact ? "Agent Activity" : "See Real Agent Activity"}
      </Link>
    </div>
  );
}

/** Geometric holographic orb: a prism inside a slowly orbiting teal ring. */
function PrismOrb() {
  return (
    <span aria-hidden="true" className="relative flex h-10 w-10 shrink-0 items-center justify-center">
      <span className="prism-orbit absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,rgba(25,211,197,0.9),rgba(160,255,240,0.15),rgba(34,211,238,0.85),rgba(25,211,197,0.1),rgba(25,211,197,0.9))] p-[1.5px]">
        <span className="block h-full w-full rounded-full bg-ink-950" />
      </span>
      <span className="absolute inset-[5px] rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(160,255,240,0.35),rgba(25,211,197,0.12)_45%,transparent_70%)]" />
      <svg viewBox="0 0 24 24" className="relative h-5 w-5">
        <path d="M12 4 L20 18 H4 Z" fill="none" stroke="#a0fff0" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M12 4 L12 18 M12 11 L20 18" stroke="#19d3c5" strokeWidth="1" opacity="0.8" />
      </svg>
    </span>
  );
}

function Waveform() {
  return (
    <span aria-hidden="true" className="flex h-3 items-center gap-[2px]">
      {[0, 0.15, 0.3, 0.1, 0.25].map((d, i) => (
        <span key={i} className="prism-wave-bar block h-3 w-[2px] rounded-full bg-teal" style={{ animationDelay: `${d}s` }} />
      ))}
    </span>
  );
}
