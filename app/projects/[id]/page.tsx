import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink, Github, AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { flagshipProjects } from "@/data/projects";
import { caseStudies } from "@/data/caseStudies";
import { profile } from "@/data/profile";
import { ArchitectureExplorer } from "@/components/ArchitectureExplorer";
import { Footer } from "@/components/Footer";

// Data-platform case studies link to the hands-on SQL challenge.
const PLAYGROUND_DATA_PROJECTS = ["aws-streaming-platform", "retailbench"];

export function generateStaticParams() {
  return flagshipProjects.filter((p) => caseStudies[p.id]).map((p) => ({ id: p.id }));
}

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const project = flagshipProjects.find((p) => p.id === params.id);
  if (!project) return {};
  return { title: `${project.name} case study`, description: project.tagline };
}

export default function CaseStudyPage({ params }: { params: { id: string } }) {
  const project = flagshipProjects.find((p) => p.id === params.id);
  const study = caseStudies[params.id];
  if (!project || !study) notFound();

  const others = flagshipProjects.filter((p) => p.id !== project.id && caseStudies[p.id]);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/5 bg-base-950/80 backdrop-blur-xl">
        <div className="section-shell flex h-14 items-center justify-between">
          <Link href="/#projects" className="btn-ghost !px-2 text-sm">
            <ArrowLeft className="h-4 w-4" />
            {profile.name}
          </Link>
          <a href={profile.resumeUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost !px-3 text-xs">
            <FileText className="h-3.5 w-3.5" />
            Resume
          </a>
        </div>
      </header>

      <main id="main-content" className="relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 -z-10 h-[32rem]"
          style={{
            background:
              "radial-gradient(50% 60% at 20% 0%, rgba(34,211,238,0.10), transparent 70%), radial-gradient(45% 60% at 85% 10%, rgba(139,92,246,0.14), transparent 70%)",
          }}
        />

        <section className="section-shell pb-10 pt-12 sm:pt-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-cyan">Case study · personal project</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">{project.name}</h1>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-300">{project.tagline}</p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {project.githubUrl && (
              <a href={project.githubUrl} target="_blank" rel="noopener noreferrer" className="btn-primary">
                <Github className="h-4 w-4" />
                View repository
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                study.sourceKind === "repo"
                  ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-200"
                  : "border-amber-300/30 bg-amber-300/5 text-amber-100"
              }`}
            >
              {study.sourceKind === "repo" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {study.source}
            </span>
          </div>

          <dl className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {study.stats.map((s) => (
              <div key={s.label} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <dt className="order-2 mt-1 text-xs text-slate-400">{s.label}</dt>
                <dd className="order-1 font-mono text-2xl font-bold text-white">{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="section-shell grid gap-6 pb-12 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">The problem</h2>
            <p className="mt-2 leading-relaxed text-slate-200">{project.problem}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">The approach</h2>
            <p className="mt-2 leading-relaxed text-slate-200">{project.solution}</p>
          </div>
        </section>

        <section className="section-shell pb-12" aria-labelledby="arch-heading">
          <h2 id="arch-heading" className="font-display text-2xl font-bold text-white">
            Architecture
          </h2>
          <div className="glass-panel mt-4 rounded-2xl p-5 sm:p-6">
            <div className="relative z-10">
              <ArchitectureExplorer architecture={project.architecture} details={study.stepDetails} />
            </div>
          </div>
        </section>

        <section className="section-shell pb-12" aria-labelledby="decisions-heading">
          <h2 id="decisions-heading" className="font-display text-2xl font-bold text-white">
            Engineering decisions
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {study.decisions.map((d) => (
              <div key={d.title} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <h3 className="font-semibold text-white">{d.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{d.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section-shell grid gap-6 pb-12 md:grid-cols-2">
          <div>
            <h2 className="font-display text-xl font-bold text-white">Stack</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {project.tech.map((t) => (
                <span key={t} className="chip">
                  {t}
                </span>
              ))}
            </div>
            <h2 className="mt-8 font-display text-xl font-bold text-white">Evidence</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {study.evidence.map((e) => (
                <li key={e.label}>
                  {e.href ? (
                    <a
                      href={e.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-mono text-slate-300 hover:text-white"
                    >
                      {e.label}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-slate-400">{e.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.03] p-6">
            <h2 className="font-display text-xl font-bold text-white">Limitations, stated plainly</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-300">
              {study.limitations.map((l) => (
                <li key={l} className="flex gap-2">
                  <span aria-hidden="true" className="text-amber-300">•</span>
                  {l}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {PLAYGROUND_DATA_PROJECTS.includes(project.id) && (
          <section className="section-shell pb-12">
            <Link
              href="/playground/sql-detective"
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal/25 bg-teal/[0.04] p-5 transition-colors hover:border-teal/50"
            >
              <span>
                <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-teal">Engineering Playground</span>
                <span className="mt-1 block font-semibold text-white">Try the data-quality checks yourself: solve a SQL mystery in your browser</span>
              </span>
              <ArrowRight className="h-5 w-5 text-teal" aria-hidden="true" />
            </Link>
          </section>
        )}

        <section className="section-shell pb-20">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">More case studies</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {others.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-accent-cyan/40"
              >
                <p className="font-semibold text-white">{p.name}</p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-400">{p.tagline}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
