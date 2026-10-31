"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { agentById, type AgentId } from "@/data/agentTeam";
import { eventScenes } from "@/data/eventTour";
import { profile } from "@/data/profile";
import { AgentAvatar } from "./AgentAvatar";

const VIEW = 400;
const R = 158;
const C = VIEW / 2;

const EVENT_ORDER: AgentId[] = eventScenes.map((s) => s.agentId);

const points = EVENT_ORDER.map((_, i) => {
  const angle = (i / EVENT_ORDER.length) * Math.PI * 2 - Math.PI / 2;
  return { x: C + R * Math.cos(angle), y: C + R * Math.sin(angle) };
});

/**
 * The seven agents arranged around Lohith's portrait. The active agent is lit,
 * links to agents that have already spoken stay lit, and during a handoff a
 * signal travels from the current agent to the next one. With `onSelect` the
 * avatars become buttons (used by the homepage command center).
 */
export function AgentConstellation({
  index,
  phase,
  speaking,
  handoffMs,
  reducedMotion,
  allActive = false,
  onSelect,
  size = "max-w-[min(100%,26rem)]",
}: {
  index: number;
  phase: "scene" | "handoff";
  speaking: boolean;
  handoffMs: number;
  reducedMotion: boolean;
  allActive?: boolean;
  onSelect?: (index: number) => void;
  /** Tailwind max-width for the square. */
  size?: string;
}) {
  const from = points[index];
  const to = points[(index + 1) % points.length];

  return (
    <div className={`relative mx-auto aspect-square w-full ${size}`}>
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <radialGradient id="ec-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r={R + 30} fill="url(#ec-glow)" />
        <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(148,163,184,0.14)" strokeDasharray="2 6" />
        {/* Spokes from the portrait to each agent */}
        {points.map((p, i) => (
          <line
            key={`s${i}`}
            x1={C}
            y1={C}
            x2={p.x}
            y2={p.y}
            stroke={agentById[EVENT_ORDER[i]].color}
            strokeOpacity={allActive || i === index ? 0.45 : i < index ? 0.18 : 0.06}
            strokeWidth={1}
            style={{ transition: "stroke-opacity 500ms" }}
          />
        ))}
        {/* Ring segments: lit once a handoff has passed along them */}
        {points.map((p, i) => {
          const q = points[(i + 1) % points.length];
          const lit = allActive || i < index || (i === index && phase === "handoff");
          return (
            <line
              key={`r${i}`}
              x1={p.x}
              y1={p.y}
              x2={q.x}
              y2={q.y}
              stroke={agentById[EVENT_ORDER[i]].color}
              strokeOpacity={lit ? 0.55 : 0.08}
              strokeWidth={lit ? 1.6 : 1}
              style={{ transition: "stroke-opacity 400ms" }}
            />
          );
        })}
        {phase === "handoff" && !allActive && (
          <motion.circle
            key={`sig-${index}`}
            r={5}
            fill="#fff"
            initial={{ cx: from.x, cy: from.y, opacity: 0.2 }}
            animate={{ cx: to.x, cy: to.y, opacity: 1 }}
            transition={{ duration: reducedMotion ? 0 : handoffMs / 1000, ease: "easeInOut" }}
            style={{ filter: `drop-shadow(0 0 8px ${agentById[EVENT_ORDER[(index + 1) % EVENT_ORDER.length]].color})` }}
          />
        )}
      </svg>

      {/* Portrait */}
      <div className="absolute left-1/2 top-1/2 w-[42%] -translate-x-1/2 -translate-y-1/2">
        <div className="relative aspect-square overflow-hidden rounded-full border border-white/15 bg-base-900 shadow-[0_0_60px_-10px_rgba(34,211,238,0.45)]">
          <Image
            src={profile.portrait.src}
            alt={profile.portrait.alt}
            fill
            sizes="(min-width: 1024px) 180px, 40vw"
            unoptimized
            className="object-cover object-top"
            priority
          />
        </div>
      </div>

      {EVENT_ORDER.map((agentId, i) => {
        const agent = agentById[agentId];
        const isActive = !allActive && i === index;
        const avatar = (
          <AgentAvatar
            agent={agent}
            size="ring"
            active={isActive || allActive}
            speaking={isActive && speaking}
            dim={!allActive && !isActive && i > index}
          />
        );
        return (
          <div
            key={agentId}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${(points[i].x / VIEW) * 100}%`, top: `${(points[i].y / VIEW) * 100}%` }}
          >
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-label={`Go to ${agent.name}, ${agent.role}`}
                aria-current={isActive ? "step" : undefined}
                className="rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {avatar}
              </button>
            ) : (
              avatar
            )}
          </div>
        );
      })}
    </div>
  );
}
