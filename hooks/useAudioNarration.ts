"use client";

import { useCallback, useEffect, useRef } from "react";

type PlayOptions = {
  onEnd?: () => void;
  /** `blocked`: the browser refused to start playback without a user gesture (autoplay policy). */
  onError?: (reason: "blocked" | "error") => void;
  /** Called every animation frame while playing, with a 0-1 loudness level. */
  onLevel?: (level: number) => void;
};

/**
 * Plays pre-generated narration MP3s (see data/agentTeam.ts +
 * scripts/generate-team-audio.ts) through a single reused <audio> element,
 * and taps a Web Audio AnalyserNode so the caller can drive a reactive
 * "speaking" visualization off the real waveform instead of a canned loop.
 *
 * The analyser graph is created lazily on first play (inside a user gesture)
 * so it satisfies mobile autoplay/audio-context policies.
 */
export function useAudioNarration() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const onLevelRef = useRef<((level: number) => void) | undefined>(undefined);
  /**
   * Bumped by every play() and stop(). A callback from an earlier clip (a late play() rejection,
   * a late "playing" resolution) checks it and does nothing, so it can never report on, or
   * start the level meter for, a clip that has since been replaced or stopped.
   */
  const genRef = useRef(0);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = "";
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const ensureGraph = useCallback(() => {
    if (!audioRef.current || analyserRef.current) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new AudioCtx();
      const source = ctx.createMediaElementSource(audioRef.current);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
    } catch {
      // Web Audio graph is a visual nicety — playback still works without it.
    }
  }, []);

  const stopLevelLoop = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const startLevelLoop = (onLevel?: (level: number) => void) => {
    stopLevelLoop();
    const analyser = analyserRef.current;
    if (!analyser || !onLevel) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
      onLevel(Math.min(1, avg / 128));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const play = useCallback((src: string, { onEnd, onError, onLevel }: PlayOptions = {}) => {
    const audio = audioRef.current;
    if (!audio) {
      onError?.("error");
      return;
    }

    ensureGraph();
    audioCtxRef.current?.resume().catch(() => {});
    onLevelRef.current = onLevel;
    const gen = ++genRef.current;
    const current = () => gen === genRef.current;

    // A clip can fail via both `onerror` and the play() promise; report once.
    let failed = false;
    const fail = (reason: "blocked" | "error" = "error") => {
      if (failed || !current()) return;
      failed = true;
      stopLevelLoop();
      onLevel?.(0);
      onError?.(reason);
    };

    audio.onended = () => {
      if (!current()) return;
      stopLevelLoop();
      onLevel?.(0);
      onEnd?.();
    };
    audio.onerror = () => fail("error");

    audio.src = src;
    audio
      .play()
      .then(() => {
        if (current()) startLevelLoop(onLevel);
      })
      .catch((err: unknown) => {
        // pause()/stop() before playback starts rejects with AbortError. That's
        // the user pausing, not a broken clip, so don't fall back.
        if (err instanceof DOMException && err.name === "AbortError") return;
        fail(err instanceof DOMException && err.name === "NotAllowedError" ? "blocked" : "error");
      });
  }, [ensureGraph]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    stopLevelLoop();
  }, []);

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audioCtxRef.current?.resume().catch(() => {});
    const gen = genRef.current;
    audio
      .play()
      .then(() => {
        if (gen === genRef.current) startLevelLoop(onLevelRef.current);
      })
      .catch(() => {});
  }, []);

  const stop = useCallback(() => {
    genRef.current++;
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.currentTime = 0;
    }
    stopLevelLoop();
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, []);

  /** 0-1 position within the current clip (0 when unknown). */
  const getProgress = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.duration || !isFinite(audio.duration)) return 0;
    return audio.currentTime / audio.duration;
  }, []);

  return { play, pause, resume, stop, setMuted, getProgress };
}
