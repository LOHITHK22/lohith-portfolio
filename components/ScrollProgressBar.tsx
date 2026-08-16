"use client";

import { motion, useScroll, useSpring } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/** Thin gradient bar pinned to the top of the viewport, tracking scroll progress. */
export function ScrollProgressBar() {
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: reducedMotion ? 1000 : 300,
    damping: reducedMotion ? 100 : 40,
    restDelta: 0.001,
  });

  return (
    <motion.div
      aria-hidden="true"
      className="fixed left-0 top-0 z-50 h-[3px] w-full origin-left bg-gradient-to-r from-accent-cyan via-accent to-accent-violet"
      style={{ scaleX }}
    />
  );
}
