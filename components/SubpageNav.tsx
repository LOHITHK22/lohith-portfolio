import Link from "next/link";
import { FileText } from "lucide-react";
import { profile } from "@/data/profile";

const LINKS = [
  { href: "/agents", label: "Agents" },
  { href: "/resources", label: "Resources" },
  { href: "/#pipelinemedic", label: "Projects" },
];

/** Minimal header for standalone pages (/agents, /resources). */
export function SubpageNav({ current }: { current: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-950/85 backdrop-blur">
      <div className="section-shell flex h-16 items-center justify-between gap-4">
        <Link href="/" className="font-hero text-lg font-black tracking-tight text-white">
          Lohith<span className="text-teal">.</span>
        </Link>
        <nav aria-label="Site" className="flex items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] sm:gap-2">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={current === l.href ? "page" : undefined}
              className={`rounded-md px-2 py-1.5 transition-colors sm:px-3 ${current === l.href ? "text-teal" : "text-slate-300 hover:text-white"}`}
            >
              {l.label}
            </Link>
          ))}
          <a
            href={profile.resumeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 hidden items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-slate-200 hover:border-teal/60 sm:inline-flex"
          >
            <FileText className="h-3.5 w-3.5" /> Resume
          </a>
        </nav>
      </div>
    </header>
  );
}
