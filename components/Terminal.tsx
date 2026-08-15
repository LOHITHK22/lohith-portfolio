"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TerminalSquare, X, CornerDownLeft } from "lucide-react";
import { terminalCommands, terminalHelpText } from "@/data/terminal";
import { profile } from "@/data/profile";
import { track } from "@/lib/analytics";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fadeUpVariants } from "@/lib/motion";

type HistoryEntry = { command: string; output: string[] };

// Build an alias lookup so short forms ("skills") resolve to the exact
// scripted commands ("skills --top") from the content brief.
const aliasMap: Record<string, string> = {
  whoami: "whoami",
  status: "status",
  skills: "skills --top",
  "skills --top": "skills --top",
  projects: "projects --top",
  "projects --top": "projects --top",
  education: "education",
  contact: "contact",
  resume: "resume --download",
  "resume --download": "resume --download",
};

const commandOutputMap: Record<string, string[]> = Object.fromEntries(
  terminalCommands.map((c) => [c.command, c.output])
);

const welcomeLines = [
  `${profile.name} — interactive terminal.`,
  "Type 'help' to see available commands, or 'clear' to reset.",
];

export function Terminal() {
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, open]);

  const handleOpen = () => {
    setOpen(true);
    track("terminal_open");
  };

  const handleClose = () => setOpen(false);

  const runCommand = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    if (trimmed === "clear") {
      setHistory([]);
      return;
    }

    if (trimmed === "help") {
      setHistory((h) => [...h, { command: trimmed, output: terminalHelpText }]);
      return;
    }

    const normalized = trimmed.toLowerCase();
    const canonical = aliasMap[normalized];

    if (canonical && commandOutputMap[canonical]) {
      setHistory((h) => [...h, { command: trimmed, output: commandOutputMap[canonical] }]);
      if (canonical === "resume --download") {
        track("resume_download_click", { source: "terminal" });
        window.open(profile.resumeUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }

    setHistory((h) => [
      ...h,
      {
        command: trimmed,
        output: [`command not found: ${trimmed}`, "type 'help' for available commands"],
      },
    ]);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    runCommand(input);
    setInput("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      handleClose();
    }
  };

  return (
    <section aria-labelledby="terminal-heading" className="section-shell py-16 sm:py-20">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={fadeUpVariants(reducedMotion)}
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-cyan">Optional</p>
        <h2 id="terminal-heading" className="mt-2 text-2xl font-bold text-white sm:text-3xl">
          Prefer the terminal?
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
          A completely optional CLI view of this page. Everything here is also available above without
          typing a single command.
        </p>
      </motion.div>

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={fadeUpVariants(reducedMotion, 0.1)}
        className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0c12] font-mono shadow-2xl shadow-black/40"
      >
        {/* Title bar */}
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
            <span className="ml-2 text-xs text-slate-400">lohith@portfolio: ~</span>
          </div>
          {open && (
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close terminal"
              className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <AnimatePresence initial={false} mode="wait">
          {!open ? (
            <motion.button
              key="teaser"
              type="button"
              onClick={handleOpen}
              initial={{ opacity: reducedMotion ? 1 : 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex w-full items-center gap-3 px-4 py-8 text-left text-sm text-slate-400 hover:text-slate-200 sm:py-10"
            >
              <TerminalSquare className="h-5 w-5 shrink-0 text-accent-cyan" />
              <span>
                <span className="text-accent-cyan">$</span> Click to launch the interactive terminal
                <span className="animate-blink">_</span>
              </span>
            </motion.button>
          ) : (
            <motion.div
              key="terminal"
              initial={{ opacity: reducedMotion ? 1 : 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div
                ref={scrollRef}
                className="no-scrollbar max-h-72 overflow-y-auto px-4 py-4 text-[13px] leading-relaxed sm:text-sm"
              >
                <p className="text-slate-500">{welcomeLines[0]}</p>
                <p className="mb-3 text-slate-500">{welcomeLines[1]}</p>
                {history.map((entry, i) => (
                  <div key={i} className="mb-3">
                    <p className="text-emerald-400">
                      <span className="text-accent-cyan">$</span> {entry.command}
                    </p>
                    {entry.output.map((line, j) => (
                      <p key={j} className="whitespace-pre-wrap text-slate-300">
                        {line}
                      </p>
                    ))}
                  </div>
                ))}
              </div>

              <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-white/10 px-4 py-3">
                <label htmlFor="terminal-input" className="text-accent-cyan">
                  $
                </label>
                <input
                  id="terminal-input"
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-label="Terminal command input"
                  placeholder="try: whoami, skills, projects, help"
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Run command"
                  className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-white/10 hover:text-accent-cyan"
                >
                  <CornerDownLeft className="h-4 w-4" />
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
