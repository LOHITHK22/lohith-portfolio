"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useCanHover } from "@/hooks/useCanHover";

/**
 * A soft ambient glow that trails the cursor across the whole page —
 * desktop-only "mouse interaction" flourish. Position is lerped toward the
 * cursor via requestAnimationFrame and applied with a direct style mutation
 * (not React state) so it stays smooth at 60fps without re-rendering React.
 *
 * Also renders a small context label ("EXPLORE", "OPEN", "VIEW"...) next to
 * the cursor whenever it's over an element carrying a `data-cursor-label`
 * attribute — a tasteful hint at what a click will do, not decoration.
 */
export function CursorGlow() {
  const reducedMotion = useReducedMotion();
  const canHover = useCanHover();
  const glowRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canHover || reducedMotion) return;

    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const current = { ...target };
    let raf: number;
    let visible = false;
    let currentLabel = "";

    const onMove = (e: MouseEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      if (!visible && glowRef.current) {
        visible = true;
        glowRef.current.style.opacity = "1";
      }

      const labelHost = (e.target as HTMLElement | null)?.closest?.(
        "[data-cursor-label]"
      ) as HTMLElement | null;
      const nextLabel = labelHost?.dataset.cursorLabel ?? "";
      if (nextLabel !== currentLabel) {
        currentLabel = nextLabel;
        if (labelRef.current) {
          labelRef.current.textContent = nextLabel;
          labelRef.current.style.opacity = nextLabel ? "1" : "0";
        }
      }
    };

    const tick = () => {
      current.x += (target.x - current.x) * 0.12;
      current.y += (target.y - current.y) * 0.12;
      if (glowRef.current) {
        glowRef.current.style.transform = `translate3d(${current.x}px, ${current.y}px, 0)`;
      }
      if (labelRef.current) {
        labelRef.current.style.transform = `translate3d(${current.x + 18}px, ${current.y + 18}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [canHover, reducedMotion]);

  if (!canHover || reducedMotion) return null;

  return (
    <>
      <div
        ref={glowRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[1] h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity duration-500"
        style={{
          background:
            "radial-gradient(circle, rgba(99,102,241,0.10), rgba(34,211,238,0.05) 45%, transparent 70%)",
        }}
      />
      <div
        ref={labelRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[2] whitespace-nowrap rounded-full border border-white/10 bg-base-950/90 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent-cyan opacity-0 backdrop-blur-sm transition-opacity duration-150"
      />
    </>
  );
}
