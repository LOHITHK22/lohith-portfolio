"use client";

import Link from "next/link";
import { ArrowRight, Headphones } from "lucide-react";
import { agents } from "@/data/agentTeam";
import { track } from "@/lib/analytics";
import { openAgentTeam } from "@/lib/agentTeamEvents";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { AgentConstellation } from "./event/AgentConstellation";

/** Homepage chapter 02: the seven narrated presentation characters. */
export function TeamSection() {
  const reducedMotion = useReducedMotion();

  return (
    <section id="ai-team" className="relative overflow-hidden border-y border-white/[0.06] bg-[#03080b] py-20 sm:py-28">
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(40% 60% at 28% 50%, rgba(25,211,197,0.12), transparent 70%), radial-gradient(35% 50% at 85% 30%, rgba(139,92,246,0.10), transparent 70%)",
        }}
      />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="order-2 lg:order-1">
          <AgentConstellation
            index={0}
            phase="scene"
            speaking={false}
            handoffMs={0}
            reducedMotion={reducedMotion}
            allActive
            onSelect={() => openAgentTeam()}
            size="max-w-[22rem] sm:max-w-[30rem]"
          />
        </div>

        <div className="order-1 lg:order-2">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-teal">02 · AI team</p>
          <h2 className="mt-4 font-hero text-4xl font-black leading-[0.98] tracking-[-0.03em] text-white sm:text-6xl">
            Seven voices.
            <br />
            <span className="text-teal">One handoff chain.</span>
          </h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-300 sm:text-lg">
            A narrated command center: each character introduces one discipline behind this portfolio, then hands control to the
            next, from orchestration and design to testing and voice.
          </p>

          <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {agents.map((a) => (
              <li key={a.id} className="flex items-baseline gap-2 font-mono text-[11px] uppercase tracking-[0.14em]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.color }} aria-hidden="true" />
                <span className="font-bold text-white">{a.name}</span>
                <span className="truncate text-slate-400">{a.short}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                track("hero_cta_click", { cta: "ai_team_section" });
                openAgentTeam();
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-teal px-5 py-3.5 text-sm font-bold text-[#021b19] shadow-[0_14px_40px_-12px_rgba(25,211,197,0.8)] transition-transform hover:-translate-y-0.5"
            >
              <Headphones className="h-4 w-4" /> Meet the team · 3½ min
            </button>
            <Link href="/event" prefetch={false} className="btn-secondary !py-3.5" onClick={() => track("hero_cta_click", { cta: "event_from_team" })}>
              45-second version <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/agent-hq" className="btn-ghost !py-3.5" onClick={() => track("hero_cta_click", { cta: "agent_hq_from_team" })}>
              Agent HQ prototype <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <p className="mt-6 max-w-lg border-l-2 border-white/10 pl-4 text-xs leading-relaxed text-slate-400">
            These are scripted presentation characters with recorded OpenAI TTS voices, not autonomous agents. The site itself
            was built with an AI coding assistant (Claude Code). The real scheduled maintenance jobs (research, repo sync,
            testing, performance) are reported on the{" "}
            <Link href="/agents" className="text-teal hover:underline">
              Agent Activity Center
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
