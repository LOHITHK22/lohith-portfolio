"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clipDurationMs,
  eventScenes,
  HANDOFF_MS,
  HANDOFF_MS_REDUCED,
  sceneHoldMs,
} from "@/data/eventTour";

export type EventStatus = "idle" | "preparing" | "playing" | "paused" | "completed" | "error";
export type EventMode = "audio" | "silent";
export type EventPhase = "scene" | "handoff";

export type EventPlaybackState = {
  status: EventStatus;
  mode: EventMode;
  index: number;
  phase: EventPhase;
  /** ms elapsed in the current scene or handoff (sampled ~20x/second). */
  elapsed: number;
  /** ms the current scene stays up before its handoff. */
  hold: number;
  /** Real length of the current clip (decoded), or the measured length if not decoded. */
  clipMs: number;
  muted: boolean;
  /** Scene ids whose audio could not be loaded or decoded (shown as captions only). */
  failedClips: string[];
  /** Wall-clock length of the last completed run, start to Echo's last word. */
  lastRunMs: number | null;
};

const PREPARE_TIMEOUT_MS = 8000;
const STALL_GRACE_MS = 2500;
const TICK_MS = 50;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

/**
 * A freshly resumed AudioContext can take a second to actually start its
 * clock. Starting scene 1 before that would make ASTRA's line begin late
 * while the visuals run on, so wait (briefly) until audio time is moving.
 */
async function waitForRunning(ctx: AudioContext, timeoutMs = 2000) {
  const deadline = performance.now() + timeoutMs;
  await ctx.resume().catch(() => {});
  const t0 = ctx.currentTime;
  while (performance.now() < deadline && (ctx.state !== "running" || ctx.currentTime <= t0)) {
    await new Promise((r) => setTimeout(r, 20));
  }
}
type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

/**
 * Single state machine for the /event presentation:
 *
 *   idle -> preparing -> playing <-> paused -> completed
 *
 * Narration uses the Web Audio API: every clip is fetched and decoded during
 * "preparing", so the show itself makes no network requests and each clip
 * starts within milliseconds of its scene (HTMLAudioElement start latency
 * added ~300 ms per clip). Exactly one AudioBufferSourceNode exists at a
 * time, so clips can never overlap. Pause suspends the AudioContext and the
 * scene clock together.
 *
 * Each scene start bumps a run id; callbacks from older runs are ignored,
 * which makes rapid Next / Previous / Restart safe. A scene advances when its
 * hold time has elapsed and its clip has ended (or failed). A clip that
 * cannot load becomes a captions-only scene of the same length.
 */
export function useEventPlayback({ reducedMotion }: { reducedMotion: boolean }) {
  const [state, setState] = useState<EventPlaybackState>({
    status: "idle",
    mode: "audio",
    index: 0,
    phase: "scene",
    elapsed: 0,
    hold: 0,
    clipMs: 0,
    muted: false,
    failedClips: [],
    lastRunMs: null,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const buffers = useRef<Map<string, AudioBuffer>>(new Map());
  const failed = useRef<Set<string>>(new Set());
  const runId = useRef(0);
  const clipDone = useRef(true);
  const clock = useRef({ base: 0, startedAt: 0, running: false });
  const runStartedAt = useRef(0);
  /** The mode the visitor chose; restart retries audio even after a fallback to silent. */
  const requestedMode = useRef<EventMode>("audio");
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  const handoffMs = () => (reducedRef.current ? HANDOFF_MS_REDUCED : HANDOFF_MS);

  const now = () => performance.now();
  const clockElapsed = () => {
    const c = clock.current;
    return c.base + (c.running ? now() - c.startedAt : 0);
  };
  const clockReset = (running: boolean) => {
    clock.current = { base: 0, startedAt: now(), running };
  };
  const clockPause = () => {
    const c = clock.current;
    if (!c.running) return;
    clock.current = { base: c.base + now() - c.startedAt, startedAt: 0, running: false };
  };
  const clockResume = () => {
    const c = clock.current;
    if (c.running) return;
    clock.current = { base: c.base, startedAt: now(), running: true };
  };

  /** Create (or resume) the AudioContext. Must run inside a user gesture. */
  const ensureContext = () => {
    if (!ctxRef.current) {
      const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (!Ctor) return null;
      // Play through the iOS ringer/silent switch, like a video would.
      const nav = navigator as AudioSessionNavigator;
      if (nav.audioSession) nav.audioSession.type = "playback";
      const ctx = new Ctor();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      ctxRef.current = ctx;
      gainRef.current = gain;
    }
    void ctxRef.current.resume().catch(() => {});
    return ctxRef.current;
  };

  const stopSource = () => {
    const src = sourceRef.current;
    if (!src) return;
    src.onended = null;
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
    src.disconnect();
    sourceRef.current = null;
  };

  const markFailed = (id: string) => {
    failed.current.add(id);
    setState((s) => (s.failedClips.includes(id) ? s : { ...s, failedClips: [...s.failedClips, id] }));
  };

  /** Fetch and decode every clip so playback never touches the network. */
  const prepare = useCallback(async (ctx: AudioContext) => {
    await Promise.all(
      eventScenes.map(async (scene) => {
        if (buffers.current.has(scene.id)) return;
        const ctrl = new AbortController();
        const timer = window.setTimeout(() => ctrl.abort(), PREPARE_TIMEOUT_MS);
        try {
          const res = await fetch(scene.audioFile, { signal: ctrl.signal });
          if (!res.ok) throw new Error(String(res.status));
          const data = await res.arrayBuffer();
          const buffer = await ctx.decodeAudioData(data);
          buffers.current.set(scene.id, buffer);
          failed.current.delete(scene.id);
        } catch {
          failed.current.add(scene.id);
        } finally {
          window.clearTimeout(timer);
        }
      })
    );
    setState((s) => ({ ...s, failedClips: Array.from(failed.current) }));
  }, []);

  const finishRun = (elapsed: number) => {
    runId.current++;
    const total = runStartedAt.current ? Math.round(now() - runStartedAt.current) : null;
    stateRef.current = { ...stateRef.current, status: "completed", elapsed, lastRunMs: total };
    setState((prev) => ({ ...prev, status: "completed", elapsed, lastRunMs: total }));
  };

  /** Advance past the current scene if its time is up and its clip is done. */
  const checkAdvance = () => {
    const s = stateRef.current;
    if (s.status !== "playing" || s.phase !== "scene") return false;
    const elapsed = clockElapsed();
    const stalled = elapsed > s.hold + STALL_GRACE_MS;
    if (elapsed < s.hold || !(clipDone.current || stalled)) return false;
    if (stalled && !clipDone.current) stopSource();
    if (s.index === eventScenes.length - 1) {
      finishRun(elapsed);
    } else {
      runId.current++;
      clockReset(true);
      stateRef.current = { ...stateRef.current, phase: "handoff", elapsed: 0 };
      setState((prev) => ({ ...prev, phase: "handoff", elapsed: 0 }));
    }
    return true;
  };

  const playScene = useCallback((index: number, opts?: { paused?: boolean }) => {
    const id = ++runId.current;
    const scene = eventScenes[index];
    const s = stateRef.current;
    stopSource();

    const buffer = buffers.current.get(scene.id);
    const ctx = ctxRef.current;
    const useAudio = s.mode === "audio" && !!buffer && !!ctx && !failed.current.has(scene.id);
    const clipMs = buffer ? Math.round(buffer.duration * 1000) : clipDurationMs(scene) ?? 0;
    const hold = sceneHoldMs(scene, index, useAudio || s.mode === "silent" ? clipMs || null : null, handoffMs());

    clipDone.current = !useAudio;
    clockReset(!opts?.paused);
    const next: EventPlaybackState = {
      ...s,
      status: opts?.paused ? "paused" : "playing",
      index,
      phase: "scene",
      elapsed: 0,
      hold,
      clipMs,
      failedClips: Array.from(failed.current),
    };
    stateRef.current = next;
    setState(next);

    if (!useAudio || !buffer || !ctx || !gainRef.current) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gainRef.current);
    src.onended = () => {
      if (runId.current !== id) return;
      clipDone.current = true;
      checkAdvance();
    };
    sourceRef.current = src;
    // While paused the context is suspended, so the clip waits at 0:00.
    src.start();
  }, []);

  // Scene clock: advances scenes and handoffs, and samples elapsed for the UI.
  useEffect(() => {
    if (state.status !== "playing") return;
    const interval = window.setInterval(() => {
      const s = stateRef.current;
      if (s.status !== "playing") return;
      if (s.phase === "scene") {
        if (checkAdvance()) return;
      } else if (clockElapsed() >= handoffMs()) {
        playScene(s.index + 1);
        return;
      }
      const elapsed = clockElapsed();
      setState((prev) => (prev.status === "playing" ? { ...prev, elapsed } : prev));
    }, TICK_MS);
    return () => window.clearInterval(interval);
    // checkAdvance only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, playScene]);

  const start = useCallback(
    async (mode: EventMode) => {
      const myRun = ++runId.current;
      requestedMode.current = mode;
      stopSource();
      // Create/resume audio inside the click, before any await (Safari rule).
      const ctx = mode === "audio" ? ensureContext() : null;
      const preparing = { ...stateRef.current, status: "preparing" as const, mode, index: 0, phase: "scene" as const, elapsed: 0 };
      stateRef.current = preparing;
      setState(preparing);
      if (mode === "audio") {
        if (ctx) {
          await prepare(ctx);
          if (runId.current !== myRun) return; // exited or restarted while loading
          await waitForRunning(ctx);
          if (runId.current !== myRun) return;
        } else eventScenes.forEach((sc) => failed.current.add(sc.id));
        if (failed.current.size === eventScenes.length) {
          // Nothing playable: continue as a captions-only presentation.
          stateRef.current = { ...stateRef.current, mode: "silent", failedClips: Array.from(failed.current) };
          setState(stateRef.current);
        }
      }
      runStartedAt.current = now();
      playScene(0);
    },
    [prepare, playScene]
  );

  const pause = useCallback(() => {
    if (stateRef.current.status !== "playing") return;
    clockPause();
    void ctxRef.current?.suspend().catch(() => {});
    stateRef.current = { ...stateRef.current, status: "paused", elapsed: clockElapsed() };
    setState((s) => ({ ...s, status: "paused", elapsed: clockElapsed() }));
  }, []);

  const resume = useCallback(() => {
    if (stateRef.current.status !== "paused") return;
    clockResume();
    if (stateRef.current.mode === "audio") ensureContext();
    stateRef.current = { ...stateRef.current, status: "playing" };
    setState((prev) => ({ ...prev, status: "playing" }));
  }, []);

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(eventScenes.length - 1, index));
      const s = stateRef.current;
      if (s.status === "idle" || s.status === "preparing") return;
      if (s.status === "completed" && s.mode === "audio") ensureContext();
      // Keep the visitor's pause if they were paused; otherwise play the target.
      playScene(clamped, { paused: s.status === "paused" });
    },
    [playScene]
  );

  const next = useCallback(() => {
    const s = stateRef.current;
    if (s.status === "completed" || s.status === "idle" || s.status === "preparing") return;
    if (s.index >= eventScenes.length - 1) {
      stopSource();
      finishRun(clockElapsed());
      return;
    }
    goTo(s.index + 1);
  }, [goTo]);

  const prev = useCallback(() => {
    const s = stateRef.current;
    if (s.status === "completed") {
      goTo(eventScenes.length - 1);
      return;
    }
    goTo(s.index - 1);
  }, [goTo]);

  const skipToEnd = useCallback(() => {
    runId.current++;
    stopSource();
    setState((s) => ({ ...s, status: "completed", index: eventScenes.length - 1, phase: "scene" }));
  }, []);

  const restart = useCallback(() => {
    void start(requestedMode.current);
  }, [start]);

  const exit = useCallback(() => {
    runId.current++;
    stopSource();
    stateRef.current = { ...stateRef.current, status: "idle", index: 0, phase: "scene", elapsed: 0 };
    setState((s) => ({ ...s, status: "idle", index: 0, phase: "scene", elapsed: 0 }));
  }, []);

  const toggleMute = useCallback(() => {
    setState((s) => {
      const muted = !s.muted;
      if (gainRef.current) gainRef.current.gain.value = muted ? 0 : 1;
      return { ...s, muted };
    });
  }, []);

  // Auto-pause when the tab is hidden or the OS interrupts audio (calls, Siri),
  // so the scene clock never runs ahead of a stalled clip.
  useEffect(() => {
    const onHidden = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", onHidden);
    const ctx = ctxRef.current;
    const onState = () => {
      if (ctx && ctx.state !== "running" && stateRef.current.status === "playing" && stateRef.current.mode === "audio") pause();
    };
    ctx?.addEventListener("statechange", onState);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      ctx?.removeEventListener("statechange", onState);
    };
  }, [pause, state.status]);

  // Release audio resources on unmount.
  useEffect(() => {
    const decoded = buffers.current;
    return () => {
      runId.current++;
      stopSource();
      decoded.clear();
      void ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  return { state, start, pause, resume, next, prev, goTo, skipToEnd, restart, exit, toggleMute };
}
