import type { Metadata } from "next";
import { SubpageNav } from "@/components/SubpageNav";
import { Footer } from "@/components/Footer";
import { AgentHQ } from "@/components/agentHq/AgentHQ";

export const metadata: Metadata = {
  title: "Agent HQ",
  description:
    "A miniature isometric office where the AI team's seven simulated agents (orchestration, design, frontend, architecture, performance, security and voice) work, walk, meet and introduce themselves.",
};

export default function AgentHQPage() {
  return (
    <>
      <SubpageNav current="/agent-hq" />
      <main id="main-content" className="min-h-screen bg-ink-950 pb-20">
        <div className="section-shell pt-10 sm:pt-14">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-teal">AI team · Agent HQ simulation</p>
          <h1 className="mt-4 font-hero text-4xl font-black leading-[0.98] tracking-[-0.03em] text-white sm:text-6xl">
            Agent <span className="text-teal">HQ</span>
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-slate-300">
            A miniature office for the AI team. All seven agents work at their own stations: ATLAS sketches architecture on the whiteboard, PULSE
            chases simulated performance warnings, SENTINEL reviews simulated alerts, ECHO records and presents. They visit each other, gather for
            meetings and introduce themselves in their recorded voices. It is a scripted simulation of their roles, not live autonomous agents.
            Select a character to meet it.
          </p>
          <div className="mt-8">
            <AgentHQ />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
