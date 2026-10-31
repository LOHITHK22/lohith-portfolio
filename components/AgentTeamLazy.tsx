"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { Users } from "lucide-react";
import { OPEN_AGENT_TEAM_EVENT, openAgentTeam } from "@/lib/agentTeamEvents";
import { track } from "@/lib/analytics";
import { useReducedMotion } from "@/hooks/useReducedMotion";

// The command center (and its audio) is only downloaded once someone opens it.
const AgentTeamExperience = dynamic(
  () => import("./AgentTeamExperience").then((m) => m.AgentTeamExperience),
  { ssr: false }
);

export function AgentTeamLazy() {
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [pastHero, setPastHero] = useState(false);

  useEffect(() => {
    const onOpen = () => {
      track("ai_team_open");
      setOpen(true);
    };
    window.addEventListener(OPEN_AGENT_TEAM_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_AGENT_TEAM_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const heroEl = document.getElementById("top");
    if (!heroEl) {
      setPastHero(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setPastHero(!entry.isIntersecting), {
      rootMargin: "-80% 0px 0px 0px",
    });
    observer.observe(heroEl);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {!open && pastHero && (
        <motion.button
          type="button"
          onClick={openAgentTeam}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0.01 : 0.2 }}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-accent-violet/40 bg-base-900/90 py-3 pl-3 pr-4 shadow-2xl shadow-black/50 backdrop-blur-sm transition-colors hover:border-accent-violet/70 sm:bottom-6 sm:right-6"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent-cyan to-accent-violet">
            <Users className="h-4 w-4 text-base-950" aria-hidden="true" />
          </span>
          <span className="text-xs font-semibold text-white">Meet my AI team</span>
        </motion.button>
      )}
      <AnimatePresence>{open && <AgentTeamExperience onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}
