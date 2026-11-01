import type { Metadata } from "next";
import { Cpu, FlaskConical, ShieldCheck } from "lucide-react";
import { SubpageNav } from "@/components/SubpageNav";
import { Footer } from "@/components/Footer";
import { SqlDetective } from "@/components/playground/SqlDetective";

export const metadata: Metadata = {
  title: "Data Quality Detective",
  description:
    "Solve four data-quality incidents with real SQL. Queries run in a disposable SQLite database in your browser, over synthetic shipping and payment data.",
};

const FACTS = [
  {
    icon: Cpu,
    title: "Real SQL execution",
    body: "SQLite compiled to WebAssembly runs in a worker in your browser. Your query really executes; nothing is sent to a server.",
  },
  {
    icon: ShieldCheck,
    title: "Checked by results",
    body: "Answers are judged by comparing your result set with the expected one, so any logically equivalent query passes.",
  },
  {
    icon: FlaskConical,
    title: "Synthetic data",
    body: "Every record is generated for this page, with deliberately planted issues. No company, customer or payment data is used.",
  },
];

export default function SqlDetectivePage() {
  return (
    <>
      <SubpageNav current="/playground/sql-detective" />
      <main id="main-content" className="min-h-screen bg-ink-950 pb-20">
        <div className="section-shell pt-10 sm:pt-14">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-teal">Engineering Playground · SQL</p>
          <h1 className="mt-4 font-hero text-4xl font-black leading-[0.98] tracking-[-0.03em] text-white sm:text-6xl">
            Data Quality <span className="text-teal">Detective</span>
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-slate-300">
            Four incidents from a shipping and payments data platform. Investigate each one with SQL: find the duplicate loads, the
            orders that never shipped, the settlements that don&apos;t match, then build the report finance actually needs.
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
            <SqlDetective />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
