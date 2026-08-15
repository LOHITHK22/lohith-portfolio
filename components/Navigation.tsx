"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Github, Linkedin, FileText, Zap, Menu, X } from "lucide-react";
import { profile } from "@/data/profile";
import { track } from "@/lib/analytics";

const navLinks = [
  { href: "#why-me", label: "Why Me" },
  { href: "#projects", label: "Projects" },
  { href: "#skills", label: "Skills" },
  { href: "#experience", label: "Experience" },
  { href: "#contact", label: "Contact" },
];

export function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
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

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-colors duration-300 ${
        scrolled ? "border-b border-white/10 bg-base-950/85 backdrop-blur-lg" : "bg-transparent"
      }`}
    >
      <nav aria-label="Primary" className="section-shell flex h-16 items-center justify-between">
        <Link
          href="#top"
          className="flex items-center gap-2 rounded-md text-sm font-semibold tracking-tight text-white"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 font-mono text-xs text-accent-cyan">
            LK
          </span>
          <span className="hidden sm:inline">{profile.name}</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="btn-ghost">
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <a
            href={profile.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub profile"
            className="btn-ghost !px-2.5"
            onClick={() => track("github_click", { source: "nav" })}
          >
            <Github className="h-[18px] w-[18px]" />
          </a>
          <a
            href={profile.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn profile"
            className="btn-ghost !px-2.5"
            onClick={() => track("linkedin_click", { source: "nav" })}
          >
            <Linkedin className="h-[18px] w-[18px]" />
          </a>
          <a
            href={profile.resumeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary !px-4 !py-2 text-xs"
            onClick={() => track("resume_view_click", { source: "nav" })}
          >
            <FileText className="h-3.5 w-3.5" />
            Resume
          </a>
          <Link href="/recruiter" className="btn-primary !px-4 !py-2 text-xs">
            <Zap className="h-3.5 w-3.5" />
            Recruiter Mode
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white lg:hidden"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      <div
        id="mobile-menu"
        className={`fixed inset-x-0 top-16 z-40 origin-top border-b border-white/10 bg-base-950/98 backdrop-blur-xl transition-all duration-200 lg:hidden ${
          menuOpen ? "visible max-h-[calc(100vh-4rem)] opacity-100" : "invisible max-h-0 opacity-0"
        }`}
      >
        <div className="section-shell flex flex-col gap-1 py-4">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="rounded-lg px-3 py-3 text-base font-medium text-slate-200 hover:bg-white/5"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={profile.resumeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              onClick={() => track("resume_view_click", { source: "mobile_nav" })}
            >
              <FileText className="h-4 w-4" />
              Resume
            </a>
            <Link href="/recruiter" className="btn-primary" onClick={() => setMenuOpen(false)}>
              <Zap className="h-4 w-4" />
              Recruiter Mode
            </Link>
            <a
              href={profile.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              onClick={() => track("github_click", { source: "mobile_nav" })}
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
            <a
              href={profile.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              onClick={() => track("linkedin_click", { source: "mobile_nav" })}
            >
              <Linkedin className="h-4 w-4" />
              LinkedIn
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
