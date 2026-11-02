"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Captions, CaptionsOff, Locate, Minus, Pause, Play, Plus, RotateCcw, SkipForward, Square, Users, Volume2, VolumeX, X } from "lucide-react";
import Link from "next/link";
import {
  CLIP_SECONDS,
  FULL_MEETING_AUDIO_SECONDS,
  HQ_INTRO,
  QUICK_MEETING_SPEAKING_SECONDS,
  SILENT_MEETING_LINES,
  VOICED_MEETING_LINES,
  formatClip,
  hqAgent,
  lineSeconds,
} from "@/data/agentHq";
import { readingTimeMs } from "@/data/agentTeam";
import { HQ_AGENTS, type HqAgentId } from "@/lib/agentHq/layout";
import { createFramePolicy, minFrameGap, updateFramePolicy } from "@/lib/agentHq/framePolicy";
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
  switchToCaptions,
  type MeetingLine,
  type MeetingPhase,
  type Sim,
} from "@/lib/agentHq/sim";
import { announceAudio, onOtherAudio } from "@/lib/siteAudio";
import { useAudioNarration } from "@/hooks/useAudioNarration";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { track } from "@/lib/analytics";
import { AMBIENT_FPS, LOOK, WORLD_BOUNDS, characterTop, createStaticLayer, drawScene, type View } from "./render";

type Caption = { agent: HqAgentId; text: string; source: "intro" | "meeting-voiced" | "meeting-silent" } | null;
type AudioState = "idle" | "playing" | "ended" | "stopped" | "captions";

declare global {
  interface Window {
    __agentHqLoops?: number;
    /** Frames actually drawn (for tests: drawing stops when nothing on screen can change). */
    __agentHqDraws?: number;
  }
}

function sentences(text: string) {
  return text.match(/[^.!?]+[.!?]+(\s|$)/g)?.map((s) => s.trim()) ?? [text];
}

/** Zoom steps for the office view (on top of the fitted view). */
const ZOOMS = [1, 1.5, 2, 2.6];

/** Roughly how long a quick meeting takes: the call, the walk to the table and every line at reading pace. */
const QUICK_MEETING_ABOUT = Math.round((QUICK_MEETING_SPEAKING_SECONDS + 10) / 5) * 5;

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
  const [meeting, setMeeting] = useState<{ phase: MeetingPhase; voiced: boolean; speaker: HqAgentId | null; index?: number } | null>(null);
  const [caption, setCaption] = useState<Caption>(null);
  const [progress, setProgress] = useState(0);
  const [audio, setAudio] = useState<AudioState>("idle");
  const [muted, setMuted] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [paused, setPaused] = useState(false);
  const [statuses, setStatuses] = useState<Record<HqAgentId, string>>(() => Object.fromEntries(HQ_AGENTS.map((id) => [id, ""])) as Record<HqAgentId, string>);
  const [meetingLines, setMeetingLines] = useState<MeetingLine[]>([]);
  const [zoomIndex, setZoomIndex] = useState(0);
  const userCam = useRef({ z: 1, px: 0, py: 0 });
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

  /** Stop narration during a full meeting: the voices stop and the meeting carries on in captions. */
  const meetingToCaptions = () => {
    silence();
    setAudio("idle");
    switchToCaptions(sim, SILENT_MEETING_LINES);
  };

  const setZoom = (i: number) => {
    const next = Math.max(0, Math.min(ZOOMS.length - 1, i));
    userCam.current.z = ZOOMS[next];
    if (next === 0) {
      userCam.current.px = 0;
      userCam.current.py = 0;
    }
    setZoomIndex(next);
  };
  const resetView = () => setZoom(0);

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

  // Escape returns to the office view, or leaves a meeting.
  const meetingOn = !!meeting && meeting.phase !== "returning";
  useEffect(() => {
    if (!selected && !meetingOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectedRef.current) backToOffice();
      else {
        silence();
        skipMeeting(sim);
        setCaption(null);
        setAudio("idle");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, meetingOn, backToOffice, silence, sim]);

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
        if (e.phase === "calling") {
          setMeetingLines(s.meeting?.lines ?? []);
          setLive("ASTRA called a meeting. The team is heading to the table.");
        }
        if (e.phase === "returning" && sourceRef.current !== "intro") {
          silence();
          setCaption((c) => (c && c.source !== "intro" ? null : c));
          setAudio((a) => (selectedRef.current ? a : "idle"));
        }
      } else if (e.type === "speaker") {
        const line = s.meeting!.lines[e.index];
        setMeeting({ phase: "speaking", voiced: e.voiced, speaker: e.agent, index: e.index });
        setMeetingLines(s.meeting!.lines);
        if (e.voiced) {
          speak(e.agent, line.audio ?? HQ_INTRO[e.agent].audioFile, line.text, "meeting-voiced", () => advanceSpeaker(s));
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
    const layer = createStaticLayer();
    // Adaptive frame rate: a steady 30 fps on devices that cannot keep 60.
    const policy = createFramePolicy(performance.now());
    let lastFrame = performance.now();
    if (rootRef.current) rootRef.current.dataset.fps = String(policy.mode);
    // With motion paused or reduced, nothing animates on its own: redraw only when something changed.
    let lastSig = "";

    const fitScale = () => Math.min(css.w / WORLD_BOUNDS.width, css.h / WORLD_BOUNDS.height);
    const homeX = WORLD_BOUNDS.left + WORLD_BOUNDS.width / 2;
    const homeY = WORLD_BOUNDS.top + WORLD_BOUNDS.height / 2;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // In 30 fps mode every other display frame is skipped; the fixed-step simulation catches up next time.
      if (now - lastFrame < minFrameGap(policy)) return;
      const interval = now - lastFrame;
      lastFrame = now;
      const workStart = performance.now();
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
      // The whole office fits on every screen so all seven are visible; phones can zoom in and drag to look around.
      const u = userCam.current;
      let tz = u.z;
      let tx = homeX + u.px;
      let ty = homeY + u.py;
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

      let draw = true;
      if (pausedRef.current || s.reduced) {
        let sig = `${canvas.width}x${canvas.height}|${view.scale.toFixed(4)}|${view.ox.toFixed(1)}|${view.oy.toFixed(1)}|${focusId}|${s.meeting?.phase}|${pausedRef.current ? animTime : 0}`;
        // Every character field the renderer reads, so a turning head or a voice level change still redraws.
        for (const c of s.chars)
          sig += `|${c.x.toFixed(3)},${c.y.toFixed(3)},${c.face.toFixed(3)},${c.look.toFixed(3)},${c.sit.toFixed(3)},${c.walkPhase.toFixed(2)},${c.walkAmt.toFixed(3)},${c.gesture},${c.activity},${c.level.toFixed(2)}`;
        draw = sig !== lastSig;
        lastSig = sig;
      } else lastSig = "";
      if (draw) {
        drawScene(ctx, s, view, { time: animTime, still: s.reduced, selected: focusId, highlighted: null, layer,
          // A slower-running device gets the background animation at half rate (7.5 updates a second).
          ambientFps: policy.mode === 60 ? AMBIENT_FPS : AMBIENT_FPS / 2,
        });
        window.__agentHqDraws = (window.__agentHqDraws ?? 0) + 1;
        if (updateFramePolicy(policy, now, interval, performance.now() - workStart) && rootRef.current) {
          rootRef.current.dataset.fps = String(policy.mode);
        }
      }

      // Overlay buttons and speech bubbles follow the characters.
      const writeAttrs = now - lastAttr > 150;
      if (writeAttrs) lastAttr = now;
      for (const c of s.chars) {
        const el = overlayRefs.current[c.id];
        if (!el) continue;
        const { feet, height } = characterTop(c);
        // At least 44 px (with a little margin for subpixel layout) so every character is easy to tap.
        const w = Math.max(46, 30 * scale);
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
        rootRef.current.dataset.zoom = cam.z.toFixed(2);
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
      lastFrame = last;
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
    // Drag to pan when zoomed in.
    let drag: { id: number; x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (userCam.current.z <= 1 || e.target !== canvas) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const sc = fitScale() * cam.z;
      const u = userCam.current;
      const limX = WORLD_BOUNDS.width / 2;
      const limY = WORLD_BOUNDS.height / 2;
      u.px = Math.max(-limX, Math.min(limX, u.px - (e.clientX - drag.x) / sc));
      u.py = Math.max(-limY, Math.min(limY, u.py - (e.clientY - drag.y) / sc));
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) drag = null;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    start();
    setReady(true);

    return () => {
      halt();
      io.disconnect();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
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
              {meeting?.voiced && (
                <button type="button" onClick={meetingToCaptions} className="btn-ghost !px-3 !py-2.5 text-sm">
                  <Square className="h-4 w-4" aria-hidden="true" /> Stop narration
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
                <span className="text-xs font-normal opacity-80">· captions, about {QUICK_MEETING_ABOUT} s</span>
              </button>
              <button
                type="button"
                onClick={() => startMeeting(true)}
                className="btn-secondary !px-4 !py-2.5 text-sm"
                disabled={meeting?.phase === "returning"}
              >
                <Volume2 className="h-4 w-4" aria-hidden="true" /> Full meeting with voices
                <span className="text-xs font-normal opacity-80">· {formatClip(FULL_MEETING_AUDIO_SECONDS)} of audio</span>
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

        {meeting?.phase === "speaking" && meetingLines.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Jump to a speaker" data-testid="hq-jump">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">Jump to</span>
            {meetingLines.map((l, i) => {
              const closing = i > 0 && meetingLines.slice(0, i).some((x) => x.agent === l.agent);
              return (
                <button
                  key={`${l.id ?? l.agent}-${i}`}
                  type="button"
                  onClick={() => jumpTo(i)}
                  aria-pressed={meeting.index === i}
                  aria-label={`${hqAgent(l.agent).name}${closing ? " closing" : ""}${meeting.voiced ? `, ${formatClip(lineSeconds(l))}` : ""}`}
                  className="flex min-h-[44px] items-center gap-2 rounded-full border px-3 text-xs font-semibold text-white hover:bg-white/10 aria-pressed:bg-white/10"
                  style={{ borderColor: `${LOOK[l.agent].accent}66` }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: LOOK[l.agent].accent }} aria-hidden="true" />
                  {hqAgent(l.agent).name}
                  {closing && <span className="font-normal text-slate-400">closing</span>}
                  {meeting.voiced && <span className="font-mono font-normal text-slate-400">{formatClip(lineSeconds(l))}</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* The office */}
        <div
          ref={wrapRef}
          className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-ink-950 sm:aspect-[592/406]"
        >
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 h-full w-full ${zoomIndex > 0 ? "cursor-grab touch-none active:cursor-grabbing" : "touch-pan-y"}`}
            role="img"
            aria-label="Animated isometric office with seven simulated AI agents. ASTRA, NOVA, FORGE, ECHO, ATLAS, PULSE and SENTINEL work at their own stations, visit each other, use the whiteboard, coffee station and build server, and meet at the central table."
          />
          <div className="absolute bottom-2 right-2 z-10 flex gap-1.5" role="group" aria-label="Camera">
            <button
              type="button"
              onClick={() => setZoom(zoomIndex + 1)}
              disabled={zoomIndex === ZOOMS.length - 1}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-ink-950/80 text-slate-100 hover:bg-white/10 disabled:opacity-40"
              aria-label="Zoom in"
              title="Zoom in"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(zoomIndex - 1)}
              disabled={zoomIndex === 0}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-ink-950/80 text-slate-100 hover:bg-white/10 disabled:opacity-40"
              aria-label="Zoom out"
              title="Zoom out"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                resetView();
                if (selectedRef.current) backToOffice();
              }}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-ink-950/80 text-slate-100 hover:bg-white/10"
              aria-label="Reset view"
              title="Reset view"
            >
              <Locate className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {zoomIndex > 0 && !selected && (
            <p className="pointer-events-none absolute left-2 top-2 z-10 rounded-full bg-ink-950/80 px-2 py-1 font-mono text-[10px] text-slate-300">Drag to look around</p>
          )}
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
        {/* The seven-agent roster: quick to reach on phones, where the side panel sits below the office. */}
        <ul className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-7 lg:hidden" aria-label="Choose an agent">
          {HQ_AGENTS.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => (selected === id ? backToOffice() : select(id))}
                aria-pressed={selected === id}
                data-testid={`hq-chip-${id}`}
                className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border px-1 font-mono text-[11px] font-bold tracking-[0.06em] text-white aria-pressed:bg-white/10"
                style={{ borderColor: `${LOOK[id].accent}66` }}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: LOOK[id].accent }} aria-hidden="true" />
                {hqAgent(id).name}
              </button>
            </li>
          ))}
        </ul>
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
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-teal">Simulation · all 7 agents</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Select a character to hear only its introduction. A quick meeting shows the team gather at the table with one line
              each, in captions; the full meeting plays every recorded introduction in turn and is entirely optional.
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
              The full meeting plays {formatClip(FULL_MEETING_AUDIO_SECONDS)} of recorded audio: eight clips of {formatClip(Math.min(...Object.values(CLIP_SECONDS)))}–
              {formatClip(Math.max(...Object.values(CLIP_SECONDS)))}. Use Jump to, Next speaker or Stop narration at any time
              {muted ? "; voices are muted, so it shows captions only" : ""}.
            </p>
          </div>
        )}
        <p className="mt-5 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-slate-500">
          A scripted, deterministic animation of the AI team&apos;s roles. No live autonomous agents are running behind it, and the alerts,
          warnings and performance figures in the office are simulated. Voices are the AI team&apos;s existing recorded OpenAI TTS clips.{" "}
          <Link href="/#projects" className="text-teal underline underline-offset-2">
            See the real projects
          </Link>
          .
        </p>
      </aside>
    </div>
  );
}
