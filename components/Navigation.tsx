"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, Github, Linkedin, Menu, Play, X, Zap } from "lucide-react";
import { profile } from "@/data/profile";
import { track } from "@/lib/analytics";
import { openAgentTeam } from "@/lib/agentTeamEvents";

const navLinks = [
  { href: "#pipelinemedic", label: "Projects" },
  { href: "#ai-lab", label: "AI Lab" },
  { href: "#experience", label: "Experience" },
  { href: "#contact", label: "Contact" },
];

/** Hexagonal node mark: a hub with six spokes, drawn in the accent teal. */
function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="#19d3c5" strokeWidth="1.6" className="h-7 w-7" aria-hidden="true">
      <path d="M16 2 28 9v14L16 30 4 23V9z" />
      <circle cx="16" cy="16" r="4" />
      <path d="M16 2v10M28 9l-8.5 5M28 23l-8.5-5M16 30V20M4 23l8.5-5M4 9l8.5 5" opacity=".55" />
    </svg>
  );
}

export function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const meetTeam = (source: string) => {
    setMenuOpen(false);
    track("hero_cta_click", { cta: "ai_team_nav", source });
    openAgentTeam();
  };

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-colors duration-300 ${
        scrolled || menuOpen
          ? "border-b border-white/[0.07] bg-ink-950/85 backdrop-blur-lg"
          : "border-b border-white/[0.05] bg-gradient-to-b from-ink-950/80 to-ink-950/10"
      }`}
    >
      <nav aria-label="Primary" className="flex h-16 items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link href="#top" className="flex min-h-10 items-center gap-3 rounded-md" aria-label={`${profile.name}, back to top`}>
          <LogoMark />
          <span className="leading-none">
            <span className="block font-mono text-[13px] font-bold tracking-[0.06em] text-white">
              <span className="text-teal">LOHITH</span> KOVURI
            </span>
            <span className="mt-1 hidden font-mono text-[9px] font-medium tracking-[0.22em] text-slate-400 sm:block">
              AI &amp; DATA ENGINEERING
            </span>
          </span>
        </Link>

        <div className="hidden items-center gap-9 lg:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-slate-300 transition-colors hover:text-teal-glow"
            >
              {link.label}
            </a>
          ))}
          <span className="h-6 w-px bg-white/15" aria-hidden="true" />
          <div className="flex items-center gap-3">
            <a
              href={profile.resumeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-2 font-mono text-[11px] font-bold tracking-[0.1em] text-slate-100 transition-colors hover:border-teal/60"
              onClick={() => track("resume_view_click", { source: "nav" })}
            >
              <ArrowDownToLine className="h-3.5 w-3.5" /> RESUME
            </a>
            <button
              type="button"
              onClick={() => meetTeam("desktop")}
              className="rounded-full bg-teal px-4 py-2 font-mono text-[11px] font-bold tracking-[0.1em] text-[#02201d] shadow-[0_0_24px_-4px_rgba(25,211,197,0.6)] transition-shadow hover:shadow-[0_0_30px_-2px_rgba(25,211,197,0.9)]"
            >
              MEET AI TEAM
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => meetTeam("mobile_bar")}
            className="flex min-h-10 items-center rounded-full"
          >
            {/* Visual pill stays compact; the button itself provides a 40px-tall tap area. */}
            <span className="rounded-full bg-teal px-3.5 py-2 font-mono text-[10px] font-bold tracking-[0.1em] text-[#02201d]">
              AI TEAM
            </span>
          </button>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      <div
        id="mobile-menu"
        className={`fixed inset-x-0 top-16 z-40 border-b border-white/10 bg-ink-950/[0.98] backdrop-blur-xl transition-all duration-200 lg:hidden ${
          menuOpen ? "visible max-h-[calc(100vh-4rem)] overflow-y-auto opacity-100" : "invisible max-h-0 opacity-0"
        }`}
      >
        <div className="flex flex-col gap-1 px-5 py-5 sm:px-8">
          <Link
            href="/event"
            prefetch={false}
            onClick={() => {
              setMenuOpen(false);
              track("hero_cta_click", { cta: "launch_ai_experience", source: "mobile_nav" });
            }}
            className="mb-3 flex items-center justify-between rounded-2xl bg-teal px-4 py-3.5 font-hero text-base font-extrabold text-[#021b19]"
          >
            <span className="flex items-center gap-2">
              <Play className="h-4 w-4 fill-current" /> Launch AI Experience
            </span>
            <span className="font-mono text-[10px] tracking-[0.14em]">45 SEC</span>
          </Link>
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="border-b border-white/[0.06] px-1 py-3.5 font-mono text-sm font-bold uppercase tracking-[0.14em] text-slate-200"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a
              href={profile.resumeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              onClick={() => track("resume_view_click", { source: "mobile_nav" })}
            >
              <ArrowDownToLine className="h-4 w-4" /> Resume
            </a>
            <Link href="/recruiter" className="btn-secondary" onClick={() => setMenuOpen(false)}>
              <Zap className="h-4 w-4" /> Recruiter Mode
            </Link>
            <a
              href={profile.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              onClick={() => track("github_click", { source: "mobile_nav" })}
            >
              <Github className="h-4 w-4" /> GitHub
            </a>
            <a
              href={profile.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              onClick={() => track("linkedin_click", { source: "mobile_nav" })}
            >
              <Linkedin className="h-4 w-4" /> LinkedIn
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
