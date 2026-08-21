"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  FileText,
  Zap,
  Github,
  Linkedin,
  Mail,
  Home,
  Sparkles,
  Wrench,
  Briefcase,
  GraduationCap,
  Volume2,
  TerminalSquare,
  Command as CommandIcon,
  type LucideIcon,
} from "lucide-react";
import { profile } from "@/data/profile";
import { track } from "@/lib/analytics";
import { useReducedMotion } from "@/hooks/useReducedMotion";

type Command = {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  keywords?: string;
  action: () => void;
};

const scrollTo = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

export function CommandPalette() {
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = useMemo(
    () => [
      { id: "top", label: "Go to top", hint: "Hero", icon: Home, action: () => scrollTo("top") },
      { id: "why-me", label: "Why Me", hint: "Section", icon: Sparkles, action: () => scrollTo("why-me") },
      {
        id: "projects",
        label: "Projects",
        hint: "Section",
        icon: Wrench,
        keywords: "case studies engineering",
        action: () => scrollTo("projects"),
      },
      { id: "skills", label: "Skills", hint: "Section", icon: Wrench, action: () => scrollTo("skills") },
      {
        id: "experience",
        label: "Experience",
        hint: "Section",
        icon: Briefcase,
        action: () => scrollTo("experience"),
      },
      {
        id: "education",
        label: "Education & Certifications",
        hint: "Section",
        icon: GraduationCap,
        action: () => scrollTo("education-heading"),
      },
      { id: "contact", label: "Contact", hint: "Section", icon: Mail, action: () => scrollTo("contact") },
      {
        id: "resume",
        label: "View Resume",
        hint: "Open PDF",
        icon: FileText,
        keywords: "cv pdf download",
        action: () => {
          track("resume_view_click", { source: "command_palette" });
          window.open(profile.resumeUrl, "_blank", "noopener,noreferrer");
        },
      },
      {
        id: "recruiter",
        label: "Recruiter Mode",
        hint: "30-second summary",
        icon: Zap,
        action: () => {
          track("recruiter_mode_open", { source: "command_palette" });
          window.location.href = "/recruiter";
        },
      },
      {
        id: "github",
        label: "Open GitHub",
        hint: profile.githubLabel,
        icon: Github,
        action: () => {
          track("github_click", { source: "command_palette" });
          window.open(profile.githubUrl, "_blank", "noopener,noreferrer");
        },
      },
      {
        id: "linkedin",
        label: "Open LinkedIn",
        hint: profile.linkedinLabel,
        icon: Linkedin,
        action: () => {
          track("linkedin_click", { source: "command_palette" });
          window.open(profile.linkedinUrl, "_blank", "noopener,noreferrer");
        },
      },
      {
        id: "pitch",
        label: "Hear My Pitch",
        hint: "AI-narrated highlight tour",
        icon: Volume2,
        keywords: "audio voice tour ai",
        action: () => {
          scrollTo("top");
          window.dispatchEvent(new Event("open-ai-pitch"));
        },
      },
      {
        id: "terminal",
        label: "Open Terminal",
        hint: "whoami, skills, projects...",
        icon: TerminalSquare,
        keywords: "cli command line",
        action: () => {
          scrollTo("terminal-heading");
          window.dispatchEvent(new Event("open-terminal"));
        },
      },
    ],
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.keywords?.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpenRequest = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("open-command-palette", onOpenRequest);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("open-command-palette", onOpenRequest);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      track("command_palette_open");
      const t = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const runCommand = (cmd: Command) => {
    track("command_palette_select", { command: cmd.id });
    cmd.action();
    setOpen(false);
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[activeIndex];
      if (cmd) runCommand(cmd);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0.01 : 0.15 }}
          className="fixed inset-0 z-[70] flex items-start justify-center bg-base-950/80 px-4 pt-24 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -8, scale: reducedMotion ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: reducedMotion ? 1 : 0.98 }}
            transition={{ duration: reducedMotion ? 0.01 : 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel w-full max-w-lg overflow-hidden rounded-2xl"
          >
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Jump to a section, or run a command..."
                aria-label="Command palette search"
                className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
              />
              <kbd className="hidden shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 sm:block">
                esc
              </kbd>
            </div>

            <div role="listbox" className="max-h-80 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-500">No matching commands.</p>
              ) : (
                filtered.map((cmd, i) => {
                  const Icon = cmd.icon;
                  const active = i === activeIndex;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => runCommand(cmd)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                        active ? "bg-white/10 text-white" : "text-slate-300"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-accent-cyan" />
                      <span className="flex-1 font-medium">{cmd.label}</span>
                      <span className="text-xs text-slate-500">{cmd.hint}</span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center gap-4 border-t border-white/10 px-4 py-2.5 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 font-mono">↑↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 font-mono">↵</kbd>
                select
              </span>
              <span className="ml-auto flex items-center gap-1">
                <CommandIcon className="h-3 w-3" />K to toggle
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
