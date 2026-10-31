"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

type Node = { x: number; y: number; vx: number; vy: number; r: number; hue: "cyan" | "violet" };

const LINK_DIST = 140;
const COLORS = { cyan: "34, 211, 238", violet: "139, 92, 246" };

/**
 * Lightweight canvas "AI network": drifting nodes joined by fading links,
 * with occasional pulses travelling along a link. Decorative only
 * (aria-hidden). Pauses when off-screen or the tab is hidden, and renders a
 * single static frame under prefers-reduced-motion.
 */
export function NeuralField({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let nodes: Node[] = [];
    let pulses: { a: number; b: number; t: number }[] = [];
    let raf = 0;
    let visible = true;
    let w = 0;
    let h = 0;

    const makeNode = (): Node => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.6 + 0.8,
      hue: Math.random() > 0.35 ? "cyan" : "violet",
    });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const prevW = w;
      const prevH = h;
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Rescale existing nodes instead of re-randomizing, so mobile URL-bar
      // resizes don't make the field jump.
      if (prevW && prevH) {
        for (const n of nodes) {
          n.x *= w / prevW;
          n.y *= h / prevH;
        }
      }
      // Density scales with area, capped so phones stay cheap.
      const count = Math.min(70, Math.max(24, Math.round((w * h) / 16000)));
      if (nodes.length > count) nodes.length = count;
      while (nodes.length < count) nodes.push(makeNode());
      pulses = pulses.filter((p) => p.a < nodes.length && p.b < nodes.length);
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK_DIST) {
            ctx.strokeStyle = `rgba(${COLORS[a.hue]}, ${(1 - d / LINK_DIST) * 0.18})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      for (const p of pulses) {
        const a = nodes[p.a];
        const b = nodes[p.b];
        if (!a || !b) continue;
        const x = a.x + (b.x - a.x) * p.t;
        const y = a.y + (b.y - a.y) * p.t;
        ctx.fillStyle = `rgba(${COLORS.cyan}, ${0.9 * Math.sin(Math.PI * p.t)})`;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const n of nodes) {
        ctx.fillStyle = `rgba(${COLORS[n.hue]}, 0.7)`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const step = () => {
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }
      pulses = pulses.map((p) => ({ ...p, t: p.t + 0.012 })).filter((p) => p.t < 1);
      if (pulses.length < 4 && Math.random() < 0.03 && nodes.length > 1) {
        const a = Math.floor(Math.random() * nodes.length);
        let best = -1;
        let bestD = LINK_DIST;
        nodes.forEach((n, i) => {
          const d = Math.hypot(n.x - nodes[a].x, n.y - nodes[a].y);
          if (i !== a && d < bestD) {
            best = i;
            bestD = d;
          }
        });
        if (best >= 0) pulses.push({ a, b: best, t: 0 });
      }
      draw();
      raf = requestAnimationFrame(step);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      if (reducedMotion) draw();
      else if (visible && !document.hidden) raf = requestAnimationFrame(step);
    };

    resize();
    start();

    const ro = new ResizeObserver(() => {
      resize();
      start();
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else cancelAnimationFrame(raf);
    });
    io.observe(canvas);

    const onVisibility = () => (document.hidden ? cancelAnimationFrame(raf) : start());
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reducedMotion]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`pointer-events-none h-full w-full ${className}`} />;
}
