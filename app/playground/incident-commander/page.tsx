import type { Metadata } from "next";
import { GitBranch, ShieldCheck, Workflow } from "lucide-react";
import { SubpageNav } from "@/components/SubpageNav";
import { Footer } from "@/components/Footer";
import { IncidentCommander } from "@/components/playground/IncidentCommander";

export const metadata: Metadata = {
  title: "Incident Commander",
  description:
    "Command a simulated PipelineMedic incident across Kafka, Flink, PostgreSQL and Airflow. Your diagnosis, repair plan, approvals and validation decide the outcome.",
};

const FACTS = [
  {
    icon: ShieldCheck,
    title: "Real policy rules",
    body: "Risk decisions come from a TypeScript port of PipelineMedic's policy engine and its autonomy_policy.yaml: the same tool names, risk levels and hard blocks.",
  },
  {
    icon: Workflow,
    title: "Your decisions matter",
    body: "Evidence, diagnosis, repair plan, approval and validation each change the result: recovered, degraded or worsened. Every run is deterministic.",
  },
  {
    icon: GitBranch,
    title: "Simulated infrastructure",
    body: "Nothing connects to Kafka, Flink, PostgreSQL, Airflow or an MCP server. Metrics and tool results are scripted for each scenario.",
  },
];

export default function IncidentCommanderPage() {
  return (
    <>
      <SubpageNav current="/playground/incident-commander" />
      <main id="main-content" className="min-h-screen bg-ink-950 pb-20">
        <div className="section-shell pt-10 sm:pt-14">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-teal">Engineering Playground · Incident response</p>
          <h1 className="mt-4 font-hero text-4xl font-black leading-[0.98] tracking-[-0.03em] text-white sm:text-6xl">
            Incident <span className="text-teal">Commander</span>
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-slate-300">
            Four incidents from PipelineMedic AI, my self-healing data pipeline agent. Gather evidence, pick the root cause and a typed repair plan, then see
            what the safety policy allows, approve or reject it, and decide how to validate the fix.
          </p>
          <ul className="mt-6 grid gap-3 md:grid-cols-3">
            {FACTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Icon className="h-4 w-4 text-teal" aria-hidden="true" />
                  {title}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{body}</p>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <IncidentCommander />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
