"use client";

import { Github, Linkedin, Mail, FileText } from "lucide-react";
import { profile, careerFairCopy } from "@/data/profile";
import { topSkills } from "@/data/skills";
import { topProjects } from "@/data/projects";
import { track } from "@/lib/analytics";

/**
 * Career Fair Mode banner, shown when the URL has ?careerfair=true.
 * Deliberately renders with no scroll-triggered motion and no dependency on
 * JS having finished animating anything — it needs to paint the essentials
 * (resume, skills, top projects, contact) as fast as possible for someone
 * standing at a booth with ~10-30 seconds.
 */
export function CareerFairBanner() {
  return (
    <div className="border-b border-white/10 bg-gradient-to-b from-accent/10 to-transparent">
      <div className="section-shell py-6 sm:py-8">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-accent-cyan/30 bg-accent-cyan/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-cyan">
          Career Fair Mode
        </p>
        <h1 className="mt-3 text-2xl font-bold text-white sm:text-3xl">{careerFairCopy.heading}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
          {careerFairCopy.intro}
        </p>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <a
            href={profile.resumeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
            onClick={() => track("resume_download_click", { source: "careerfair_banner" })}
          >
            <FileText className="h-4 w-4" />
            Resume
          </a>
          <a
            href={profile.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            onClick={() => track("github_click", { source: "careerfair_banner" })}
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
          <a
            href={profile.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            onClick={() => track("linkedin_click", { source: "careerfair_banner" })}
          >
            <Linkedin className="h-4 w-4" />
            LinkedIn
          </a>
          <a
            href={`mailto:${profile.email}`}
            className="btn-secondary"
            onClick={() => track("contact_click", { source: "careerfair_banner" })}
          >
            <Mail className="h-4 w-4" />
            Contact
          </a>
        </div>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {topSkills.map((skill) => (
            <span key={skill} className="chip !text-[11px]">
              {skill}
            </span>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {topProjects.map((project, i) => (
            <a
              key={project.id}
              href="#projects"
              onClick={() => track("project_click", { project: project.id, source: "careerfair_banner" })}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-xs hover:border-white/20 hover:bg-white/[0.06]"
            >
              <span className="font-mono text-slate-500">0{i + 1}</span>
              <span className="mt-1 block font-semibold text-white">{project.name}</span>
              <span className="mt-0.5 line-clamp-2 text-slate-400">{project.tagline}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
