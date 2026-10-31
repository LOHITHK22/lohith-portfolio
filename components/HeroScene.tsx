"use client";

import { useEffect, useRef } from "react";

/**
 * Canvas layer for the Design A hero: dust, the neural mesh over the right
 * half of the portrait, and PipelineMedic's control flow with travelling data
 * pulses. Geometry is measured from the portrait element, so the mesh stays
 * locked to the face at every viewport size. Purely decorative (aria-hidden);
 * the hero renders the same pipeline as text for screen readers.
 */

// Positions as fractions of the (square) portrait box, measured on the source image.
const FACE = { cx: 0.471, cy: 0.313, rx: 0.179, ry: 0.241 };
const STAGES = [
  { n: "01", label: "DETECT", sub: "DETERMINISTIC", x: 0.708, y: 0.153 },
  { n: "02", label: "DIAGNOSE", sub: "LLM", x: 0.737, y: 0.217 },
  { n: "03", label: "POLICY GATE", sub: "RISK + APPROVAL", x: 0.747, y: 0.281 },
  { n: "04", label: "MCP", sub: "17 TOOLS · 10 READ-ONLY DEFAULT", x: 0.737, y: 0.345 },
  { n: "05", label: "VALIDATE", sub: "CANARY · ROLLBACK", x: 0.708, y: 0.409 },
];

type Pt = { x: number; y: number; a: number; ph: number };

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function HeroScene({
  portraitRef,
  reducedMotion,
  showLabels,
}: {
  portraitRef: React.RefObject<HTMLElement>;
  reducedMotion: boolean;
  showLabels: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const portrait = portraitRef.current;
    if (!canvas || !portrait) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-jetbrains-mono").trim() || "monospace";

    let W = 0, H = 0, dpr = 1;
    let box = { x: 0, y: 0, s: 1 };
    let pts: Pt[] = [];
    let pairs: [number, number, number][] = [];
    let dust: { x: number; y: number; r: number; a: number; v: number; ph: number }[] = [];
    let anchors: { x: number; y: number }[] = [];
    let raf = 0;
    let visible = true;
    const t0 = performance.now();

    const layout = () => {
      const host = canvas.parentElement!.getBoundingClientRect();
      const p = portrait.getBoundingClientRect();
      W = host.width;
      H = host.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      box = { x: p.left - host.left, y: p.top - host.top, s: p.width };

      const r = rng(7);
      const cx = box.x + FACE.cx * box.s, cy = box.y + FACE.cy * box.s;
      const rx = FACE.rx * box.s, ry = FACE.ry * box.s;
      const density = showLabels ? 420 : 220;
      pts = [];
      for (let i = 0; i < density; i++) {
        const x = cx + box.s * 0.004 + Math.pow(r(), 0.9) * box.s * 0.29;
        const y = cy - ry * 1.05 + r() * ry * 2.2;
        const inside = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (inside > 1.9 && r() > 0.25) continue;
        const fade = Math.max(0, 1 - (inside - 0.2) / 2) * (0.35 + 0.65 * Math.min(1, (x - cx) / (box.s * 0.09)));
        pts.push({ x, y, a: fade, ph: r() * Math.PI * 2 });
      }

      // Pipeline anchors, kept inside the viewport so labels never clip.
      anchors = STAGES.map((st) => ({ x: box.x + st.x * box.s, y: box.y + st.y * box.s }));
      if (showLabels) {
        ctx.font = `700 12px ${mono}`;
        const nw = ctx.measureText("00 ").width;
        ctx.font = `500 10px ${mono}`;
        const widest = Math.max(...STAGES.map((st) => ctx.measureText(st.sub).width)) + nw + 30;
        const limit = W - widest - 28;
        const shift = Math.max(0, Math.max(...anchors.map((a) => a.x)) - limit);
        anchors = anchors.map((a) => ({ x: a.x - shift, y: a.y }));
        anchors.forEach((a) => pts.push({ x: a.x - 10, y: a.y, a: 1, ph: 0 }));
      }

      const link = 54 * (box.s / 1317);
      pairs = [];
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
          if (d < link) pairs.push([i, j, 1 - d / link]);
        }

      const dr = rng(3);
      const count = Math.round((W * H) / (showLabels ? 4200 : 5200));
      dust = Array.from({ length: count }, () => {
        const x = dr() * W, y = dr() * H;
        const near = Math.hypot(x - cx, y - cy) < box.s * 0.4;
        return { x, y, r: dr() * (near ? 1.5 : 1) + 0.25, a: (near ? 0.34 : 0.16) * dr() + 0.04, v: 4 + dr() * 10, ph: dr() * 6.28 };
      });
    };

    const draw = (now: number) => {
      // rAF timestamps can predate t0 on the first frame; clamp so indices stay >= 0.
      const t = reducedMotion ? 0 : Math.max(0, (now - t0) / 1000);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Dust drifts slowly upward and twinkles.
      for (const d of dust) {
        const y = (((d.y - t * d.v) % H) + H) % H;
        const tw = reducedMotion ? 1 : 0.65 + 0.35 * Math.sin(t * 1.3 + d.ph);
        ctx.fillStyle = `rgba(94,234,212,${d.a * tw})`;
        ctx.beginPath();
        ctx.arc(d.x, y, d.r, 0, 6.283);
        ctx.fill();
      }

      // Mesh: breathing points, a scan band sweeping outward from the seam.
      const cx = box.x + FACE.cx * box.s;
      const sweep = cx + ((t * box.s * 0.12) % (box.s * 0.42));
      const pos = pts.map((p) => ({
        x: p.x + (reducedMotion ? 0 : Math.sin(t * 0.7 + p.ph) * 1.6),
        y: p.y + (reducedMotion ? 0 : Math.cos(t * 0.6 + p.ph) * 1.6),
      }));
      ctx.lineWidth = 0.7;
      for (const [i, j, k] of pairs) {
        const a = Math.min(pts[i].a, pts[j].a);
        const band = reducedMotion ? 0 : Math.max(0, 1 - Math.abs(pos[i].x - sweep) / (box.s * 0.03));
        ctx.strokeStyle = `rgba(94,234,212,${k * a * (0.5 + band * 0.6)})`;
        ctx.beginPath();
        ctx.moveTo(pos[i].x, pos[i].y);
        ctx.lineTo(pos[j].x, pos[j].y);
        ctx.stroke();
      }
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const band = reducedMotion ? 0 : Math.max(0, 1 - Math.abs(pos[i].x - sweep) / (box.s * 0.03));
        ctx.fillStyle = `rgba(170,255,242,${Math.min(1, p.a * 0.9 + band * 0.5)})`;
        ctx.beginPath();
        ctx.arc(pos[i].x, pos[i].y, p.a > 0.8 ? 1.7 : 1.1, 0, 6.283);
        ctx.fill();
      }

      if (!showLabels) return;

      // PipelineMedic control flow: dashed path with moving data.
      ctx.save();
      ctx.strokeStyle = "rgba(94,234,212,0.55)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 5]);
      ctx.lineDashOffset = -t * 14;
      ctx.beginPath();
      anchors.forEach((a, i) => (i ? ctx.lineTo(a.x, a.y) : ctx.moveTo(a.x, a.y)));
      ctx.stroke();
      ctx.restore();

      const segs = anchors.length - 1;
      if (!reducedMotion)
        for (const off of [0, 0.5]) {
          const u = ((t / 4.5 + off) % 1) * segs;
          const k = Math.floor(u), f = u - k;
          const a = anchors[k], b = anchors[k + 1];
          const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
          const g = ctx.createRadialGradient(x, y, 0, x, y, 12);
          g.addColorStop(0, "rgba(220,255,250,0.95)");
          g.addColorStop(0.3, "rgba(94,234,212,0.55)");
          g.addColorStop(1, "rgba(94,234,212,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, 12, 0, 6.283);
          ctx.fill();
        }

      const active = reducedMotion ? -1 : Math.floor(t / 1.6) % STAGES.length;
      ctx.textBaseline = "middle";
      ctx.font = `600 10px ${mono}`;
      ctx.fillStyle = "rgba(148,214,206,0.85)";
      ctx.fillText("PIPELINEMEDIC AI · CONTROL FLOW", anchors[0].x - 4, anchors[0].y - 34);
      STAGES.forEach((st, i) => {
        const a = anchors[i];
        const on = i === active;
        if (on) {
          const pulse = 0.5 + 0.5 * Math.sin(t * 6);
          ctx.strokeStyle = `rgba(94,234,212,${0.35 + pulse * 0.4})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(a.x, a.y, 10 + pulse * 3, 0, 6.283);
          ctx.stroke();
        }
        ctx.fillStyle = "#021412";
        ctx.strokeStyle = on ? "#a0fff0" : "#5eead4";
        ctx.lineWidth = 1.6;
        ctx.shadowColor = "#19d3c5";
        ctx.shadowBlur = on ? 16 : 10;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 5, 0, 6.283);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        const lx = a.x + 16;
        ctx.font = `700 12px ${mono}`;
        ctx.fillStyle = on ? "#5eead4" : "rgba(94,234,212,0.8)";
        ctx.fillText(st.n, lx, a.y - 6);
        const nw = ctx.measureText(`${st.n} `).width;
        ctx.fillStyle = on ? "#ffffff" : "rgba(232,250,248,0.92)";
        ctx.fillText(st.label, lx + nw, a.y - 6);
        ctx.font = `500 10px ${mono}`;
        ctx.fillStyle = on ? "rgba(160,255,240,0.95)" : "rgba(130,190,184,0.85)";
        ctx.fillText(st.sub, lx + nw, a.y + 9);
      });
    };

    const loop = (now: number) => {
      draw(now);
      if (!reducedMotion && visible) raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };

    layout();
    start();
    const ro = new ResizeObserver(() => {
      layout();
      if (reducedMotion) draw(performance.now());
    });
    ro.observe(canvas.parentElement!);
    // Fonts load after first paint; relayout so label widths are measured correctly.
    document.fonts?.ready.then(() => {
      layout();
      draw(performance.now());
    });
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting && document.visibilityState === "visible";
      if (visible) start();
    });
    io.observe(canvas);
    const onVis = () => {
      visible = document.visibilityState === "visible";
      if (visible) start();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [portraitRef, reducedMotion, showLabels]);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5] mix-blend-screen" />;
}
