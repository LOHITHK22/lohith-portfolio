"use client";

import { useState, type FormEvent } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { useAskLohith, MAX_QUESTIONS_PER_SESSION } from "@/hooks/useAskLohith";

/** "Ask about me" Q&A, grounded in the site's own data (see app/api/ask). */
export function AskPanel() {
  const askLohith = useAskLohith();
  const [askInput, setAskInput] = useState("");

  const handleAskSubmit = (e: FormEvent) => {
    e.preventDefault();
    const question = askInput.trim();
    if (!question || askLohith.pending || askLohith.limitReached) return;
    setAskInput("");
    askLohith.ask(question);
  };

  const left = MAX_QUESTIONS_PER_SESSION - askLohith.questionsAsked;

  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent-cyan">
        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Have a question about him?
      </p>

      {askLohith.exchanges.length > 0 && (
        <div className="no-scrollbar mt-3 max-h-52 space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {askLohith.exchanges.map((ex, i) => (
            <div key={i} className="text-sm">
              <p className="font-medium text-white">{ex.question}</p>
              <p className="mt-1 leading-relaxed text-slate-300">{ex.answer}</p>
            </div>
          ))}
        </div>
      )}

      {askLohith.limitReached ? (
        <p className="mt-3 text-xs text-slate-400">
          That&apos;s plenty of questions for now. Use the contact section to ask him directly.
        </p>
      ) : (
        <form onSubmit={handleAskSubmit} className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={askInput}
            onChange={(e) => setAskInput(e.target.value)}
            placeholder="e.g. What does PipelineMedic do?"
            aria-label="Ask a question about Lohith"
            disabled={askLohith.pending}
            className="w-full rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-accent-cyan disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!askInput.trim() || askLohith.pending}
            aria-label="Ask"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-cyan text-base-950 transition-opacity disabled:opacity-40"
          >
            {askLohith.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      )}
      <p className="mt-2 text-[11px] text-slate-400">
        {left} question{left === 1 ? "" : "s"} left this session · answers come only from this site&apos;s content
      </p>
    </div>
  );
}
