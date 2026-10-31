"use client";

import type { Agent } from "@/data/agentTeam";

type Size = "sm" | "md" | "lg" | "ring";

const SIZES: Record<Size, string> = {
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm sm:h-14 sm:w-14 sm:text-base",
  lg: "h-16 w-16 text-lg sm:h-20 sm:w-20 sm:text-xl",
  // Constellation: compact on phones so the scene panel stays visible.
  ring: "h-8 w-8 text-[11px] sm:h-14 sm:w-14 sm:text-base",
};

/**
 * One reusable avatar for all seven agents: a glyph in a tinted orb with the
 * agent's accent ring (no fake human faces). `active` scales and lights it,
 * `speaking` adds an expanding pulse ring, `dim` fades agents that are not
 * part of the current moment.
 */
export function AgentAvatar({
  agent,
  size = "md",
  active = false,
  speaking = false,
  dim = false,
  showName = true,
}: {
  agent: Agent;
  size?: Size;
  active?: boolean;
  speaking?: boolean;
  dim?: boolean;
  showName?: boolean;
}) {
  return (
    <span className="flex flex-col items-center">
      <span
        className={`relative flex items-center justify-center rounded-full border-2 font-display font-bold text-white transition-all duration-500 ${SIZES[size]}`}
        style={{
          borderColor: agent.color,
          background: `radial-gradient(circle at 30% 25%, ${agent.color}66, rgba(8,13,28,0.96) 70%)`,
          opacity: dim ? 0.35 : 1,
          transform: active ? "scale(1.15)" : "scale(1)",
          boxShadow: active ? `0 0 32px -4px ${agent.color}` : "none",
        }}
      >
        {speaking && (
          <>
            <span
              aria-hidden="true"
              className="event-speak-ring absolute -inset-1 rounded-full border-2"
              style={{ borderColor: agent.color }}
            />
            <span
              aria-hidden="true"
              className="event-speak-ring absolute -inset-1 rounded-full border-2 [animation-delay:600ms]"
              style={{ borderColor: agent.color }}
            />
          </>
        )}
        {agent.glyph}
      </span>
      {showName && (
        <span
          className={`whitespace-nowrap font-mono uppercase transition-colors duration-500 ${size === "ring" ? "mt-0.5 text-[9px] tracking-[0.1em] sm:mt-1.5 sm:text-[11px] sm:tracking-[0.18em]" : "mt-1.5 text-[10px] tracking-[0.18em] sm:text-[11px]"}`}
          style={{ color: dim ? "#64748b" : agent.color }}
        >
          {agent.name}
        </span>
      )}
    </span>
  );
}
