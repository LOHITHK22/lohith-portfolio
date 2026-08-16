"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useCanHover } from "@/hooks/useCanHover";

/**
 * A soft ambient glow that trails the cursor across the whole page —
 * desktop-only "mouse interaction" flourish. Position is lerped toward the
 * cursor via requestAnimationFrame and applied with a direct style mutation
 * (not React state) so it stays smooth at 60fps without re-rendering React.
 */
export function CursorGlow() {
  const reducedMotion = useReducedMotion();
  const canHover = useCanHover();
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canHover || reducedMotion) return;

    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const current = { ...target };
    let raf: number;
    let visible = false;

    const onMove = (e: MouseEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      if (!visible && glowRef.current) {
        visible = true;
        glowRef.current.style.opacity = "1";
      }
    };

    const tick = () => {
      current.x += (target.x - current.x) * 0.12;
      current.y += (target.y - current.y) * 0.12;
      if (glowRef.current) {
        glowRef.current.style.transform = `translate3d(${current.x}px, ${current.y}px, 0)`;
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
    <div
      ref={glowRef}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[1] h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity duration-500"
      style={{
        background:
          "radial-gradient(circle, rgba(99,102,241,0.10), rgba(34,211,238,0.05) 45%, transparent 70%)",
      }}
    />
  );
}
