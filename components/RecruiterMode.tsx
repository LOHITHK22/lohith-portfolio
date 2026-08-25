"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  X,
  Mail,
  Github,
  Linkedin,
  FileText,
  GraduationCap,
  Target,
  Cpu,
  FolderGit2,
  Award,
  MapPin,
} from "lucide-react";
import { profile, recruiterSummary } from "@/data/profile";
import { topProjects } from "@/data/projects";
import { track } from "@/lib/analytics";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fadeUpVariants, staggerContainer } from "@/lib/motion";

/**
 * Full "30-second summary" view. Implemented as a dedicated route (/recruiter)
 * rather than a modal overlay, per the spec's "your call" — this keeps the
 * page independently linkable (recruiters can bookmark or re-open it) and
 * lets Next.js code-split it automatically without a manual dynamic import.
 * Escape still returns to the homepage, mirroring modal-close behavior.
 */
export function RecruiterMode() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    track("recruiter_mode_open", { source: "route" });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push("/");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return (
    <main id="main-content" className="relative min-h-screen bg-base-950">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-radial-fade [background-position:top]"
      />

      <div className="section-shell relative flex min-h-screen max-w-3xl flex-col py-8 sm:py-12">
        <div className="mb-8 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-accent-cyan">
            Recruiter Mode
          </span>
          <Link
            href="/"
            aria-label="Close recruiter mode and return to full site"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </Link>
        </div>

        <motion.div initial="hidden" animate="visible" variants={fadeUpVariants(reducedMotion)}>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">{recruiterSummary.who}</h1>
          <p className="mt-2 gradient-text text-base font-semibold sm:text-lg">{profile.headline}</p>
          <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-400">
            <MapPin className="h-4 w-4" />
            {recruiterSummary.location}
          </p>
        </motion.div>

        {/* CTAs up top — no hunting */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUpVariants(reducedMotion, 0.05)}
          className="mt-6 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap"
        >
          <a
            href={profile.resumeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
            onClick={() => track("resume_view_click", { source: "recruiter_mode" })}
          >
            <FileText className="h-4 w-4" />
            Resume
          </a>
          <a
            href={profile.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            onClick={() => track("linkedin_click", { source: "recruiter_mode" })}
          >
            <Linkedin className="h-4 w-4" />
            LinkedIn
          </a>
          <a
            href={profile.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            onClick={() => track("github_click", { source: "recruiter_mode" })}
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
          <a
            href={`mailto:${profile.email}`}
            className="btn-secondary"
            onClick={() => track("contact_click", { source: "recruiter_mode" })}
          >
            <Mail className="h-4 w-4" />
            Email
          </a>
        </motion.div>

        <motion.dl
          initial="hidden"
          animate="visible"
          variants={staggerContainer(reducedMotion)}
          className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <motion.div variants={fadeUpVariants(reducedMotion)} className="glass-panel rounded-2xl p-5">
            <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <Target className="h-4 w-4 text-accent-cyan" />
              Current status
            </dt>
            <dd className="mt-2 text-sm leading-relaxed text-slate-200">{recruiterSummary.currentStatus}</dd>
          </motion.div>

          <motion.div variants={fadeUpVariants(reducedMotion)} className="glass-panel rounded-2xl p-5">
            <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <GraduationCap className="h-4 w-4 text-accent-cyan" />
              Degrees
            </dt>
            <dd className="mt-2 flex flex-col gap-1 text-sm leading-relaxed text-slate-200">
              {recruiterSummary.degree.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </dd>
          </motion.div>

          <motion.div variants={fadeUpVariants(reducedMotion)} className="glass-panel rounded-2xl p-5">
            <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <Target className="h-4 w-4 text-accent-cyan" />
              Targeting
            </dt>
            <dd className="mt-2.5 flex flex-wrap gap-1.5">
              {recruiterSummary.targeting.map((role) => (
                <span key={role} className="chip !text-[11px]">
                  {role}
                </span>
              ))}
            </dd>
          </motion.div>

          <motion.div variants={fadeUpVariants(reducedMotion)} className="glass-panel rounded-2xl p-5">
            <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <Cpu className="h-4 w-4 text-accent-cyan" />
              Strongest skills
            </dt>
            <dd className="mt-2.5 flex flex-wrap gap-1.5">
              {recruiterSummary.strongestSkills.map((skill) => (
                <span key={skill} className="chip !text-[11px]">
                  {skill}
                </span>
              ))}
            </dd>
          </motion.div>

          <motion.div variants={fadeUpVariants(reducedMotion)} className="glass-panel rounded-2xl p-5 sm:col-span-2">
            <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <FolderGit2 className="h-4 w-4 text-accent-cyan" />
              Top 3 projects
            </dt>
            <dd className="mt-3 flex flex-col gap-3">
              {topProjects.map((project, i) => (
                <div key={project.id} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 font-mono text-xs text-slate-500">{i + 1}.</span>
                  <div>
                    <span className="font-semibold text-white">{project.name}</span>
                    <span className="text-slate-400"> · {project.tagline}</span>
                  </div>
                </div>
              ))}
            </dd>
          </motion.div>

          <motion.div variants={fadeUpVariants(reducedMotion)} className="glass-panel rounded-2xl p-5 sm:col-span-2">
            <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <Award className="h-4 w-4 text-accent-cyan" />
              Certifications
            </dt>
            <dd className="mt-2.5 flex flex-wrap gap-1.5">
              {recruiterSummary.certifications.map((cert) => (
                <span key={cert} className="chip !text-[11px]">
                  {cert}
                </span>
              ))}
            </dd>
          </motion.div>
        </motion.dl>

        <Link href="/" className="btn-ghost mt-10 self-start">
          ← Back to full site
        </Link>
      </div>
    </main>
  );
}
