import Link from "next/link";
import { Github, Linkedin, Mail } from "lucide-react";
import { profile } from "@/data/profile";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 py-10">
      <div className="section-shell flex flex-col items-center justify-between gap-4 text-sm text-slate-400 sm:flex-row">
        <p>
          © {year} {profile.name}. Built with Next.js.
        </p>
        <nav aria-label="More" className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.14em]">
          <Link href="/agents" className="hover:text-slate-200">Agent activity</Link>
          <Link href="/resources" className="hover:text-slate-200">AI resources</Link>
          <Link href="/recruiter" className="hover:text-slate-200">Recruiter mode</Link>
        </nav>
        <div className="flex items-center gap-4">
          <a
            href={`mailto:${profile.email}`}
            aria-label="Email"
            className="hover:text-slate-200"
          >
            <Mail className="h-4 w-4" />
          </a>
          <a
            href={profile.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="hover:text-slate-200"
          >
            <Github className="h-4 w-4" />
          </a>
          <a
            href={profile.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            className="hover:text-slate-200"
          >
            <Linkedin className="h-4 w-4" />
          </a>
        </div>
      </div>
    </footer>
  );
}
