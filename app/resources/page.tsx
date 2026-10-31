import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { SubpageNav } from "@/components/SubpageNav";
import { Footer } from "@/components/Footer";
import { getResources, RESOURCE_CATEGORIES, REVALIDATE_SECONDS, type Resource } from "@/lib/agentData";

export const revalidate = REVALIDATE_SECONDS;

export const metadata: Metadata = {
  title: "AI Resources",
  description: "A short, curated library of primary sources on LLMs, agents, MCP, RAG, evaluation and data engineering, with dates and attribution.",
};

function age(iso: string, now: number) {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (days < 1) return "today";
  if (days < 31) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months} month${months === 1 ? "" : "s"} ago` : `${Math.floor(months / 12)} year(s) ago`;
}

function Item({ r, now, auto }: { r: Resource; now: number; auto?: boolean }) {
  return (
    <li className="border-t border-white/[0.07] py-4 first:border-t-0">
      <a href={r.url} target="_blank" rel="noopener noreferrer" className="group inline-flex items-start gap-1.5 font-semibold text-white hover:text-teal">
        {r.title}
        <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-500 group-hover:text-teal" aria-hidden="true" />
      </a>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
        {r.source} · published {r.published.slice(0, 10)} ({age(r.published, now)}) · {r.kind}
        {auto ? " · auto-published, not yet reviewed" : ""}
      </p>
      {r.summary && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-300">{r.summary}</p>}
    </li>
  );
}

export default async function ResourcesPage() {
  const { curated, autoPublished } = await getResources();
  // Rendered on the server at most every REVALIDATE_SECONDS; freshness labels use that render time.
  const now = Date.now();
  const total = curated.length + autoPublished.length;

  return (
    <>
      <SubpageNav current="/resources" />
      <main id="main-content" className="min-h-screen bg-ink-950 pb-20">
        <div className="section-shell pt-12 sm:pt-16">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-teal">Reading list</p>
          <h1 className="mt-4 font-hero text-4xl font-black leading-[0.98] tracking-[-0.03em] text-white sm:text-6xl">
            AI <span className="text-teal">Resources</span>
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-slate-300">
            A short list of primary sources I follow: specifications, papers, releases and engineering posts. Quality over
            quantity. Each entry links to the original, keeps the source&apos;s own summary, and shows when it was published.
          </p>
          <p className="mt-3 max-w-3xl text-sm text-slate-400">
            The <Link href="/agents" className="text-teal hover:underline">SCOUT agent</Link> finds candidates from an allowlist of
            sources and checks dates, links and duplicates. An entry appears here only after I review and merge its pull request.
          </p>

          <nav aria-label="Categories" className="mt-8 flex flex-wrap gap-2">
            {RESOURCE_CATEGORIES.map((c) => {
              const n = curated.filter((r) => r.category === c.id).length;
              return (
                <a key={c.id} href={`#${c.id}`} className="rounded-full border border-white/10 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 hover:border-teal/50 hover:text-white">
                  {c.label} <span className="text-slate-500">{n}</span>
                </a>
              );
            })}
          </nav>

          {total === 0 && (
            <p role="status" className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
              No entries have been approved yet. The first ones arrive through the agents&apos; review pull request.
            </p>
          )}

          <div className="mt-10 grid gap-x-12 gap-y-10 lg:grid-cols-2">
            {RESOURCE_CATEGORIES.map((c) => {
              const items = curated.filter((r) => r.category === c.id).sort((a, b) => b.published.localeCompare(a.published));
              return (
                <section key={c.id} id={c.id} aria-labelledby={`${c.id}-h`} className="scroll-mt-24">
                  <h2 id={`${c.id}-h`} className="font-hero text-2xl font-black tracking-tight text-white">{c.label}</h2>
                  {items.length ? (
                    <ul className="mt-2">{items.map((r) => <Item key={r.id} r={r} now={now} />)}</ul>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">Nothing approved in this category yet.</p>
                  )}
                </section>
              );
            })}
          </div>

          {autoPublished.length > 0 && (
            <section aria-labelledby="auto-h" className="mt-14 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5">
              <h2 id="auto-h" className="font-hero text-xl font-black text-white">Recently found (auto-published)</h2>
              <p className="mt-1 text-sm text-slate-400">Validated by the agents (allowlisted source, live link, not a duplicate) but not yet reviewed by me.</p>
              <ul className="mt-2">{autoPublished.map((r) => <Item key={r.id} r={r} now={now} auto />)}</ul>
            </section>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
