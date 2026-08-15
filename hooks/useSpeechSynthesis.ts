"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeakOptions = { onEnd?: () => void };

/**
 * Thin wrapper around the browser's SpeechSynthesis API with a silent
 * timed fallback for browsers that don't support it (the guided tour still
 * auto-scrolls and shows captions, just without audio). A monotonically
 * increasing id guards against a superseded/cancelled utterance's onend
 * firing after the fact and double-advancing the caller's sequence.
 */
export function useSpeechSynthesis() {
  const [supported, setSupported] = useState(false);
  const currentIdRef = useRef(0);
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  const clearFallback = () => {
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }
  };

  const cancel = useCallback(() => {
    currentIdRef.current += 1;
    clearFallback();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const speak = useCallback((text: string, { onEnd }: SpeakOptions = {}) => {
    const id = ++currentIdRef.current;
    clearFallback();

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      // No TTS available — hold on this step long enough to read the caption.
      const words = text.split(/\s+/).length;
      const delay = Math.max(2200, words * 320);
      fallbackTimeoutRef.current = setTimeout(() => {
        if (currentIdRef.current === id) onEnd?.();
      }, delay);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.98;
    utterance.pitch = 1;

    const finish = () => {
      if (currentIdRef.current !== id) return;
      clearFallback();
      onEnd?.();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);

    // Safety watchdog: some browsers/devices silently never fire onend if
    // no voice is actually available. Never let the tour hang forever.
    const words = text.split(/\s+/).length;
    const maxDuration = Math.min(20000, Math.max(3000, words * 480)) + 2000;
    fallbackTimeoutRef.current = setTimeout(finish, maxDuration);
  }, []);

  const pause = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.pause();
    }
  }, []);

  const resume = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.resume();
    }
  }, []);

  return { supported, speak, cancel, pause, resume };
}
