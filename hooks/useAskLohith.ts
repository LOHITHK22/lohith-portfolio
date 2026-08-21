"use client";

import { useCallback, useState } from "react";
import { track } from "@/lib/analytics";
import { useSpeechSynthesis } from "./useSpeechSynthesis";

export type AskExchange = {
  question: string;
  answer: string;
  projectId: string | null;
  sectionId: string | null;
};

const SESSION_KEY = "ask-lohith-count";
export const MAX_QUESTIONS_PER_SESSION = 6;

function getSessionCount(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.sessionStorage.getItem(SESSION_KEY);
  return raw ? parseInt(raw, 10) || 0 : 0;
}

function bumpSessionCount(): number {
  const next = getSessionCount() + 1;
  window.sessionStorage.setItem(SESSION_KEY, String(next));
  return next;
}

/** Scrolls to a project's header and expands its case-study card. */
function openProject(projectId: string) {
  window.dispatchEvent(new CustomEvent("open-project", { detail: { id: projectId } }));
}

function scrollToSection(sectionId: string) {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function useAskLohith() {
  const speech = useSpeechSynthesis();
  const [exchanges, setExchanges] = useState<AskExchange[]>([]);
  const [pending, setPending] = useState(false);
  const [questionsAsked, setQuestionsAsked] = useState(getSessionCount);

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || pending) return;

      if (questionsAsked >= MAX_QUESTIONS_PER_SESSION) return;

      setPending(true);
      track("ask_question", { length: trimmed.length });

      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
        });
        const data = await res.json();

        const exchange: AskExchange = {
          question: trimmed,
          answer: data.answer ?? "Something went wrong — please try again.",
          projectId: data.projectId ?? null,
          sectionId: data.sectionId ?? null,
        };

        setExchanges((prev) => [...prev, exchange]);
        setQuestionsAsked(bumpSessionCount());
        speech.speak(exchange.answer);

        if (exchange.projectId) {
          openProject(exchange.projectId);
        } else if (exchange.sectionId) {
          scrollToSection(exchange.sectionId);
        }
      } catch {
        setExchanges((prev) => [
          ...prev,
          {
            question: trimmed,
            answer: "Couldn't reach the assistant — please try again, or use the contact section below.",
            projectId: null,
            sectionId: null,
          },
        ]);
      } finally {
        setPending(false);
      }
    },
    [pending, questionsAsked, speech]
  );

  return {
    exchanges,
    ask,
    pending,
    questionsAsked,
    limitReached: questionsAsked >= MAX_QUESTIONS_PER_SESSION,
  };
}
