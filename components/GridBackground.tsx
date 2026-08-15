"use client";

import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * Lightweight animated grid/network background built with pure CSS + SVG —
 * no Three.js/WebGL. A static CSS grid, two slow-pulsing radial glows, and a
 * handful of SVG nodes/lines that drift gently. Disabled/stilled entirely
 * when the user prefers reduced motion.
 */
export function GridBackground() {
  const reducedMotion = useReducedMotion();

  const nodes = [
    { x: 60, y: 80, r: 2.5 },
    { x: 220, y: 40, r: 2 },
    { x: 340, y: 140, r: 3 },
    { x: 120, y: 220, r: 2 },
    { x: 300, y: 260, r: 2.5 },
    { x: 420, y: 90, r: 2 },
    { x: 40, y: 320, r: 2 },
    { x: 380, y: 330, r: 2.5 },
  ];

  const edges: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 5],
    [0, 3],
    [3, 4],
    [4, 7],
    [3, 6],
    [1, 4],
  ];

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* static dot/line grid */}
      <div className="absolute inset-0 bg-grid-pattern bg-grid [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />

      {/* ambient glows */}
      <div
        className={`absolute -top-40 left-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-accent/20 blur-[120px] ${
          reducedMotion ? "" : "animate-pulse-slow"
        }`}
      />
      <div
        className={`absolute -right-32 top-40 h-[380px] w-[380px] rounded-full bg-accent-cyan/10 blur-[110px] ${
          reducedMotion ? "" : "animate-pulse-slow"
        }`}
      />

      {/* network nodes */}
      <svg
        className={`absolute right-0 top-0 h-[420px] w-[460px] opacity-40 sm:opacity-60 ${
          reducedMotion ? "" : "animate-float"
        }`}
        viewBox="0 0 460 420"
        fill="none"
      >
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            stroke="url(#edge-gradient)"
            strokeWidth="1"
          />
        ))}
        {nodes.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r={n.r} fill="#22d3ee" opacity={0.8} />
        ))}
        <defs>
          <linearGradient id="edge-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#22d3ee" stopOpacity="0.5" />
            <stop offset="1" stopColor="#8b5cf6" stopOpacity="0.15" />
          </linearGradient>
        </defs>
      </svg>

      {/* bottom fade into page background */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-base-950" />
    </div>
  );
}
