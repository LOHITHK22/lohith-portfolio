"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Captions, CaptionsOff, Pause, Play, RotateCcw, SkipForward, Square, Users, Volume2, VolumeX, X } from "lucide-react";
import Link from "next/link";
import {
  CLIP_SECONDS,
  FULL_MEETING_AUDIO_SECONDS,
  HQ_INTRO,
  SILENT_MEETING_LINES,
  VOICED_MEETING_LINES,
  formatClip,
  hqAgent,
} from "@/data/agentHq";
import { readingTimeMs } from "@/data/agentTeam";
import { HQ_AGENTS, type HqAgentId } from "@/lib/agentHq/layout";
import {
  DT,
  advanceSpeaker,
  callMeeting,
  charById,
  clearFocus,
  createSim,
  drainEvents,
  jumpToSpeaker,
  narrationDone,
  narrationStarted,
  selectAgent,
  setLevel,
  setReduced,
  skipMeeting,
  step,
  type MeetingPhase,
  type Sim,
} from "@/lib/agentHq/sim";
import { announceAudio, onOtherAudio } from "@/lib/siteAudio";
import { useAudioNarration } from "@/hooks/useAudioNarration";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { track } from "@/lib/analytics";
import { LOOK, WORLD_BOUNDS, characterTop, drawScene, type View } from "./render";

type Caption = { agent: HqAgentId; text: string; source: "intro" | "meeting-voiced" | "meeting-silent" } | null;
type AudioState = "idle" | "playing" | "ended" | "stopped" | "captions";

declare global {
  interface Window {
    __agentHqLoops?: number;
  }
}

function sentences(text: string) {
  return text.match(/[^.!?]+[.!?]+(\s|$)/g)?.map((s) => s.trim()) ?? [text];
}

const PHASE_TEXT: Record<MeetingPhase, string> = {
  calling: "ASTRA is calling a meeting",
  gathering: "The team is walking to the meeting table",
  speaking: "Meeting in progress",
  closing: "Wrapping up",
  returning: "Heading back to the desks",
};

export function AgentHQ() {
  const reduced = useReducedMotion();
  const narration = useAudioNarration();

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Sim | null>(null);
  if (!simRef.current) simRef.current = createSim({ silentLines: SILENT_MEETING_LINES });
  const overlayRefs = useRef<Partial<Record<HqAgentId, HTMLButtonElement | null>>>({});
  const bubbleRefs = useRef<Partial<Record<HqAgentId, HTMLDivElement | null>>>({});

  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<HqAgentId | null>(null);
  const [meeting, setMeeting] = useState<{ phase: MeetingPhase; voiced: boolean; speaker: HqAgentId | null } | null>(null);
  const [caption, setCaption] = useState<Caption>(null);
  const [progress, setProgress] = useState(0);
  const [audio, setAudio] = useState<AudioState>("idle");
  const [muted, setMuted] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [paused, setPaused] = useState(false);
  const [statuses, setStatuses] = useState<Record<HqAgentId, string>>({ astra: "", nova: "", forge: "" });
  const [live, setLive] = useState("");

  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const selectedRef = useRef<HqAgentId | null>(null);
  selectedRef.current = selected;
  const mutedRef = useRef(false);
  mutedRef.current = muted;
  const textTimer = useRef<{ id: number | null; start: number; dur: number }>({ id: null, start: 0, dur: 0 });
  const sourceRef = useRef<NonNullable<Caption>["source"] | null>(null);
  const audioStateRef = useRef<AudioState>("idle");
  audioStateRef.current = audio;

  const sim = simRef.current;

  useEffect(() => {
    setReduced(sim, reduced);
  }, [reduced, sim]);

  const clearTextTimer = () => {
    if (textTimer.current.id !== null) window.clearTimeout(textTimer.current.id);
    textTimer.current.id = null;
  };

  /** Stops whatever Agent HQ is saying. */
  const silence = useCallback(() => {
    narration.stop();
    clearTextTimer();
    for (const id of HQ_AGENTS) setLevel(sim, id, 0);
  }, [narration, sim]);

  /** Plays a clip with captions; falls back to timed captions if the clip can't play. */
  const speak = useCallback(
    (agent: HqAgentId, clip: string, text: string, source: NonNullable<Caption>["source"], onDone: () => void) => {
      silence();
      sourceRef.current = source;
      setCaption({ agent, text, source });
      setProgress(0);
      setAudio("playing");
      announceAudio("agent-hq");
      narration.setMuted(mutedRef.current);
      narration.play(clip, {
        onEnd: () => {
          setLevel(sim, agent, 0);
          setProgress(1);
          setAudio("ended");
          onDone();
        },
        onError: () => {
          // Clip missing or blocked: keep going with captions only.
          setAudio("captions");
          const dur = readingTimeMs(text);
          textTimer.current = {
            start: performance.now(),
            dur,
            id: window.setTimeout(() => {
              textTimer.current.id = null;
              setProgress(1);
              setAudio("ended");
              onDone();
            }, dur),
          };
        },
        onLevel: (l) => setLevel(sim, agent, l),
      });
    },
    [narration, silence, sim]
  );

  const introduce = useCallback(
    (id: HqAgentId) => {
      narrationStarted(sim, id);
      speak(id, HQ_INTRO[id].audioFile, HQ_INTRO[id].caption, "intro", () => narrationDone(sim, id));
    },
    [sim, speak]
  );

  const select = useCallback(
    (id: HqAgentId) => {
      if (simRef.current?.meeting) setMeeting(null);
      selectAgent(sim, id);
      setSelected(id);
      track("agent_hq_select", { agent: id });
      introduce(id);
    },
    [introduce, sim]
  );

  const backToOffice = useCallback(() => {
    const id = selectedRef.current;
    silence();
    clearFocus(sim);
    setSelected(null);
    setCaption(null);
    setAudio("idle");
    if (id) window.setTimeout(() => overlayRefs.current[id]?.focus(), 0);
  }, [silence, sim]);

  /** Quick meeting: one quoted line each, captions only. Full meeting: every recorded introduction, in turn. */
  const startMeeting = (voiced: boolean) => {
    if (selectedRef.current) backToOffice();
    callMeeting(sim, { voiced, lines: voiced ? VOICED_MEETING_LINES : SILENT_MEETING_LINES });
    track("agent_hq_meeting", { voiced });
  };

  const endMeeting = () => {
    silence();
    skipMeeting(sim);
    setCaption(null);
    setAudio("idle");
  };

  const nextSpeaker = () => {
    silence();
    advanceSpeaker(sim);
  };

  const jumpTo = (index: number) => {
    silence();
    jumpToSpeaker(sim, index);
  };

  const stopTalking = () => {
    silence();
    setAudio("stopped");
    if (selectedRef.current) narrationDone(sim, selectedRef.current);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    narration.setMuted(next);
  };

  // Another narrator (PRISM) started: stop talking. The page never plays two voices at once.
  useEffect(
    () =>
      onOtherAudio("agent-hq", () => {
        silence();
        setAudio("stopped");
        if (selectedRef.current) narrationDone(sim, selectedRef.current);
        if (sim.meeting?.voiced) skipMeeting(sim);
      }),
    [silence, sim]
  );

  // Stop narrating when the tab is hidden or the page is left.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && audioStateRef.current === "playing") stopTalking();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", silence);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", silence);
      silence();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape returns to the office view.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") backToOffice();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, backToOffice]);

  // Caption progress at 10 Hz.
  useEffect(() => {
    if (audio !== "playing" && audio !== "captions") return;
    const id = window.setInterval(() => {
      if (audio === "playing") setProgress(narration.getProgress());
      else {
        const t = textTimer.current;
        setProgress(Math.min(1, (performance.now() - t.start) / t.dur));
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [audio, narration]);

  // Sim events → audio, captions and announcements. Kept in a ref so the render loop always calls the latest version.
  const handleEvents = useRef<(s: Sim) => void>(() => {});
  handleEvents.current = (s: Sim) => {
    for (const e of drainEvents(s)) {
      if (e.type === "meeting-phase") {
        setMeeting({ phase: e.phase, voiced: !!s.meeting?.voiced, speaker: null });
        if (e.phase === "calling") setLive("ASTRA called a meeting. The team is heading to the table.");
        if (e.phase === "returning" && sourceRef.current !== "intro") {
          silence();
          setCaption((c) => (c && c.source !== "intro" ? null : c));
          setAudio((a) => (selectedRef.current ? a : "idle"));
        }
      } else if (e.type === "speaker") {
        const line = s.meeting!.lines[e.index];
        setMeeting({ phase: "speaking", voiced: e.voiced, speaker: e.agent });
        if (e.voiced) {
          speak(e.agent, HQ_INTRO[e.agent].audioFile, line.text, "meeting-voiced", () => advanceSpeaker(s));
        } else {
          sourceRef.current = "meeting-silent";
          setCaption({ agent: e.agent, text: line.text, source: "meeting-silent" });
          setProgress(1);
        }
      } else if (e.type === "meeting-end") {
        setMeeting(null);
        setLive("The meeting is over. Everyone is back at their desk.");
      }
    }
  };

  // The render loop: fixed-step simulation, camera, canvas and overlay positions.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !wrap || !ctx) return;
    window.__agentHqLoops = (window.__agentHqLoops ?? 0) + 1;

    let css = { w: 0, h: 0 };
    let dpr = 1;
    const cam = { z: 1, cx: 0, cy: 0, init: false };
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      css = { w: r.width, h: r.height };
      dpr = Math.min(window.devicePixelRatio || 1, css.w < 640 ? 1.75 : 2);
      canvas.width = Math.round(css.w * dpr);
      canvas.height = Math.round(css.h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let animTime = 0;
    let lastAttr = 0;
    let lastStatus = 0;
    let onScreen = true;
    let docVisible = document.visibilityState !== "hidden";

    const fitScale = () => Math.min(css.w / WORLD_BOUNDS.width, css.h / WORLD_BOUNDS.height);
    const homeX = WORLD_BOUNDS.left + WORLD_BOUNDS.width / 2;
    const homeY = WORLD_BOUNDS.top + WORLD_BOUNDS.height / 2;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const s = simRef.current!;
      if (!pausedRef.current) {
        acc += dt;
        while (acc >= DT) {
          step(s, DT);
          acc -= DT;
        }
        animTime += dt;
      }
      handleEvents.current(s);

      // Camera: ease towards the selected character, or back to the whole office.
      const focusId = selectedRef.current;
      const narrow = css.w < 640;
      // Phones frame the floor more tightly so the characters stay readable.
      let tz = narrow ? 1.32 : 1;
      let tx = homeX;
      let ty = homeY + (narrow ? 14 : 0);
      if (focusId) {
        const { feet } = characterTop(charById(s, focusId));
        tz = narrow ? 2.3 : 1.6;
        tx = feet.X;
        ty = feet.Y - 30;
      }
      const k = s.reduced || !cam.init ? 1 : 1 - Math.exp(-dt * 5);
      cam.z += (tz - cam.z) * k;
      cam.cx += (tx - cam.cx) * k;
      cam.cy += (ty - cam.cy) * k;
      cam.init = true;
      const scale = fitScale() * cam.z;
      const view: View = { scale, ox: css.w / 2 - cam.cx * scale, oy: css.h / 2 - cam.cy * scale, dpr };

      drawScene(ctx, s, view, { time: animTime, still: s.reduced, selected: focusId, highlighted: null });

      // Overlay buttons and speech bubbles follow the characters.
      const writeAttrs = now - lastAttr > 150;
      if (writeAttrs) lastAttr = now;
      for (const c of s.chars) {
        const el = overlayRefs.current[c.id];
        if (!el) continue;
        const { feet, height } = characterTop(c);
        const w = Math.max(44, 30 * scale);
        const h = Math.max(48, (height + 10) * scale);
        const x = view.ox + feet.X * scale - w / 2;
        const y = view.oy + feet.Y * scale - h + 6 * scale;
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        const b = bubbleRefs.current[c.id];
        if (b) b.style.transform = `translate(${(x + w / 2).toFixed(1)}px, ${(y - 4).toFixed(1)}px) translate(-50%, -100%)`;
        if (writeAttrs) {
          el.dataset.x = c.x.toFixed(2);
          el.dataset.y = c.y.toFixed(2);
          el.dataset.face = c.face.toFixed(2);
          el.dataset.activity = c.activity;
          el.dataset.sit = c.sit.toFixed(2);
          el.dataset.gesture = c.gesture;
        }
      }
      if (writeAttrs && rootRef.current) {
        rootRef.current.dataset.mode = s.mode;
        rootRef.current.dataset.meeting = s.meeting?.phase ?? "none";
        rootRef.current.dataset.time = s.time.toFixed(1);
      }
      if (now - lastStatus > 500) {
        lastStatus = now;
        setStatuses((prev) => {
          const next = { ...prev };
          let changed = false;
          for (const c of s.chars) {
            if (next[c.id] !== c.label) {
              next[c.id] = c.label;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
    };

    const start = () => {
      if (raf || !onScreen || !docVisible) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const halt = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    // Don't animate offscreen or in a hidden tab.
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
      else halt();
    });
    io.observe(wrap);
    const onVis = () => {
      docVisible = document.visibilityState !== "hidden";
      if (docVisible) start();
      else halt();
    };
    document.addEventListener("visibilitychange", onVis);
    start();
    setReady(true);

    return () => {
      halt();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.__agentHqLoops = (window.__agentHqLoops ?? 1) - 1;
    };
  }, []);

  const captionSentences = useMemo(() => (caption ? sentences(caption.text) : []), [caption]);
  const activeSentence = useMemo(() => {
    const total = captionSentences.reduce((n, s) => n + s.length, 0);
    let acc = 0;
    for (let i = 0; i < captionSentences.length; i++) {
      acc += captionSentences[i].length;
      if (progress * total <= acc) return i;
    }
    return captionSentences.length - 1;
  }, [captionSentences, progress]);

  const selAgent = selected ? hqAgent(selected) : null;
  const meetingActive = !!meeting && meeting.phase !== "returning";
  const silentBubble = caption?.source === "meeting-silent" ? caption : null;

  return (
    <div
      ref={rootRef}
      data-testid="agent-hq"
      data-ready={ready ? "true" : "false"}
      data-selected={selected ?? ""}
      data-speaker={meeting?.speaker ?? ""}
      data-audio={audio}
      data-paused={paused ? "true" : "false"}
      data-reduced={reduced ? "true" : "false"}
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]"
    >
      <div className="min-w-0">
        {/* Toolbar */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {meetingActive ? (
            <>
              <button type="button" onClick={endMeeting} className="btn-secondary !px-4 !py-2.5 text-sm">
                <X className="h-4 w-4" aria-hidden="true" /> Skip meeting
              </button>
              {meeting?.phase === "speaking" && (
                <button type="button" onClick={nextSpeaker} className="btn-ghost !px-3 !py-2.5 text-sm">
                  <SkipForward className="h-4 w-4" aria-hidden="true" /> Next speaker
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => startMeeting(false)}
                className="btn-primary !px-4 !py-2.5 text-sm"
                disabled={meeting?.phase === "returning"}
              >
                <Users className="h-4 w-4" aria-hidden="true" /> Quick meeting
                <span className="text-xs font-normal opacity-80">· captions, about 25 s</span>
              </button>
              <button
                type="button"
                onClick={() => startMeeting(true)}
                className="btn-secondary !px-4 !py-2.5 text-sm"
                disabled={meeting?.phase === "returning"}
              >
                <Volume2 className="h-4 w-4" aria-hidden="true" /> Full meeting with voices
                <span className="text-xs font-normal opacity-80">· about 1½ min</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={toggleMute}
            aria-pressed={muted}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 text-slate-200 hover:bg-white/10"
            aria-label={muted ? "Unmute voices" : "Mute voices"}
            title={muted ? "Unmute voices" : "Mute voices"}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setCaptionsOn((v) => !v)}
            aria-pressed={captionsOn}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 text-slate-200 hover:bg-white/10"
            aria-label={captionsOn ? "Hide captions" : "Show captions"}
            title={captionsOn ? "Hide captions" : "Show captions"}
          >
            {captionsOn ? <Captions className="h-4 w-4" /> : <CaptionsOff className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            className="flex h-11 items-center gap-2 rounded-full border border-white/10 px-3 text-xs text-slate-200 hover:bg-white/10"
          >
            {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
            {paused ? "Resume motion" : "Pause motion"}
          </button>
          <p className="min-w-0 flex-1 text-right font-mono text-[11px] uppercase tracking-[0.16em] text-slate-400" data-testid="hq-phase">
            {meeting ? PHASE_TEXT[meeting.phase] : selected ? `Focused on ${hqAgent(selected).name}` : "Office view"}
          </p>
        </div>

        {meeting?.voiced && meeting.phase === "speaking" && (
          <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Jump to a speaker" data-testid="hq-jump">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">Jump to</span>
            {VOICED_MEETING_LINES.map((l, i) => (
              <button
                key={l.agent}
                type="button"
                onClick={() => jumpTo(i)}
                aria-pressed={meeting.speaker === l.agent}
                className="flex min-h-[44px] items-center gap-2 rounded-full border px-3 text-xs font-semibold text-white hover:bg-white/10 aria-pressed:bg-white/10"
                style={{ borderColor: `${LOOK[l.agent].accent}66` }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: LOOK[l.agent].accent }} aria-hidden="true" />
                {hqAgent(l.agent).name}
                <span className="font-mono font-normal text-slate-400">{formatClip(CLIP_SECONDS[l.agent])}</span>
              </button>
            ))}
          </div>
        )}

        {/* The office */}
        <div
          ref={wrapRef}
          className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-ink-950 sm:aspect-[592/406]"
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label="Animated isometric office. ASTRA, NOVA and FORGE work at their desks, walk between the coffee station, whiteboard and build server, and meet at the central table."
          />
          {HQ_AGENTS.map((id) => {
            const a = hqAgent(id);
            const look = LOOK[id];
            return (
              <button
                key={id}
                ref={(el) => {
                  overlayRefs.current[id] = el;
                }}
                type="button"
                data-testid={`hq-agent-${id}`}
                data-agent={id}
                onClick={() => (selected === id ? undefined : select(id))}
                aria-pressed={selected === id}
                aria-label={`${a.name}, ${a.role}. ${statuses[id] || "In the office"}. ${selected === id ? "Selected." : "Select to meet."}`}
                className="group absolute left-0 top-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-teal"
                style={{ width: 44, height: 48 }}
              >
                <span
                  className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full border px-1.5 py-px font-mono text-[10px] font-bold tracking-[0.12em] text-white shadow group-hover:brightness-125"
                  style={{ borderColor: `${look.accent}88`, background: "rgba(2,6,8,0.82)", color: look.accent }}
                >
                  {a.name}
                </span>
              </button>
            );
          })}
          {HQ_AGENTS.map((id) => (
            <div
              key={`bubble-${id}`}
              ref={(el) => {
                bubbleRefs.current[id] = el;
              }}
              aria-hidden="true"
              data-testid={`hq-bubble-${id}`}
              className={`pointer-events-none absolute left-0 top-0 max-w-[13rem] rounded-xl border bg-ink-900/95 px-2.5 py-1.5 text-[11px] leading-snug text-slate-100 shadow-lg transition-opacity duration-200 ${
                silentBubble?.agent === id ? "opacity-100" : "opacity-0"
              }`}
              style={{ borderColor: `${LOOK[id].accent}66`, marginTop: -18 }}
            >
              {silentBubble?.agent === id ? `“${silentBubble.text}”` : ""}
            </div>
          ))}
        </div>

        {/* Captions */}
        <div className="mt-3 min-h-[3.5rem]" data-testid="hq-captions" aria-live={audio === "captions" || muted || caption?.source === "meeting-silent" ? "polite" : "off"}>
          {captionsOn && caption && (
            <p className="rounded-xl bg-black/50 px-3 py-2 text-sm leading-relaxed sm:text-base">
              <span className="mr-2 font-mono text-xs font-bold" style={{ color: LOOK[caption.agent].accent }}>
                {hqAgent(caption.agent).name}
              </span>
              {captionSentences.map((s, i) => (
                <span key={i} style={{ color: i === activeSentence ? "#f8fafc" : i < activeSentence ? "#94a3b8" : "#64748b" }}>
                  {s}{" "}
                </span>
              ))}
            </p>
          )}
        </div>
        {caption?.agent === "forge" && caption.source !== "meeting-silent" && (
          <p className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-xs leading-relaxed text-slate-300" data-testid="hq-atlas-note">
            FORGE&apos;s recorded introduction ends by handing over to ATLAS, the systems architect. ATLAS isn&apos;t part of this
            three-agent prototype; the{" "}
            <Link href="/#ai-team" className="text-teal underline underline-offset-2">
              full AI Team tour
            </Link>{" "}
            introduces all seven agents.
          </p>
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {live}
        </p>
      </div>

      {/* Side panel */}
      <aside className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.02] p-4" aria-label={selAgent ? `${selAgent.name} details` : "Agent HQ guide"}>
        {selAgent && selected ? (
          <div data-testid="hq-panel">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: LOOK[selected].accent }}>
              {audio === "playing" ? "Speaking" : audio === "captions" ? "Captions (audio unavailable)" : "Selected"}
            </p>
            <h2 className="mt-1 font-display text-3xl font-black tracking-tight text-white" tabIndex={-1}>
              {selAgent.name}
            </h2>
            <p className="text-sm text-slate-300">{selAgent.role}</p>
            <ul className="mt-4 space-y-1.5 text-sm text-slate-300">
              {selAgent.responsibilities.map((r) => (
                <li key={r} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: LOOK[selected].accent }} aria-hidden="true" />
                  {r}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              {audio === "playing" || audio === "captions" ? (
                <button type="button" onClick={stopTalking} className="btn-secondary !px-4 !py-2.5 text-sm">
                  <Square className="h-4 w-4" aria-hidden="true" /> Stop
                </button>
              ) : (
                <button type="button" onClick={() => introduce(selected)} className="btn-secondary !px-4 !py-2.5 text-sm">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" /> Replay
                </button>
              )}
              <button type="button" onClick={backToOffice} className="btn-primary !px-4 !py-2.5 text-sm" data-testid="hq-back">
                Back to office
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500">Esc also returns to the office view.</p>
          </div>
        ) : (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-teal">Prototype · 3 of 7 agents</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Select a character to hear only its introduction. A quick meeting shows the team gather at the table with one line
              each; the full meeting plays every recorded introduction in turn.
            </p>
            <ul className="mt-4 space-y-2" aria-label="Agents in the office">
              {HQ_AGENTS.map((id) => {
                const a = hqAgent(id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => select(id)}
                      className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-white/10 px-3 py-2 text-left hover:bg-white/[0.04]"
                      data-testid={`hq-roster-${id}`}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LOOK[id].accent }} aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-white">
                          {a.name} <span className="font-normal text-slate-400">· {a.role}</span>
                        </span>
                        <span className="block truncate text-xs text-slate-500" data-testid={`hq-status-${id}`}>
                          {statuses[id] || " "}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              The full meeting plays {formatClip(FULL_MEETING_AUDIO_SECONDS)} of recorded audio (ASTRA {formatClip(CLIP_SECONDS.astra)}, NOVA{" "}
              {formatClip(CLIP_SECONDS.nova)}, FORGE {formatClip(CLIP_SECONDS.forge)}). Use Jump to or Next speaker to skip ahead
              {muted ? "; voices are muted, so it shows captions only" : ""}.
            </p>
          </div>
        )}
        <p className="mt-5 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-slate-500">
          A scripted, deterministic animation of the AI team&apos;s roles. No live autonomous agents are running behind it. Voices are the AI team&apos;s
          existing recorded OpenAI TTS clips.
        </p>
      </aside>
    </div>
  );
}
