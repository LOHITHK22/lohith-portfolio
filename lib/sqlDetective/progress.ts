// Per-visitor progress for the Data Quality Detective, kept in localStorage only.
// How a case was completed is fixed at the moment of the first correct check, so hints or the
// solution opened afterwards (for learning) never change it, and nothing before it is forgotten.

import { CHALLENGES } from "./challenges";

export type Completion = "independent" | "hints" | "solution";

export type CaseProgress = {
  attempts: number;
  /** Hints revealed so far. */
  hints: number;
  solutionViewed: boolean;
  /** Set once, on the first correct check. */
  completion: Completion | null;
  /** Hints that had been revealed when the case was completed. */
  hintsAtCompletion: number;
};

export type ProgressMap = Record<string, CaseProgress>;

export const STORAGE_KEY = "sql-detective-progress-v2";
export const LEGACY_KEYS = ["sql-detective-progress-v1"];

export const emptyCase = (): CaseProgress => ({ attempts: 0, hints: 0, solutionViewed: false, completion: null, hintsAtCompletion: 0 });
export const blankProgress = (): ProgressMap => Object.fromEntries(CHALLENGES.map((c) => [c.id, emptyCase()]));

const count = (v: unknown, max = 1000) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? Math.min(v, max) : 0);

/** Validates one stored v2 entry; anything malformed falls back to an empty case. */
function readCase(raw: unknown, maxHints: number): CaseProgress {
  if (!raw || typeof raw !== "object") return emptyCase();
  const r = raw as Record<string, unknown>;
  const completion = r.completion === "independent" || r.completion === "hints" || r.completion === "solution" ? r.completion : null;
  return {
    attempts: count(r.attempts),
    hints: count(r.hints, maxHints),
    solutionViewed: r.solutionViewed === true,
    completion,
    hintsAtCompletion: completion ? count(r.hintsAtCompletion, maxHints) : 0,
  };
}

/**
 * Converts v1 progress ({ solved, attempts, hints, solutionViewed }). v1 did not record when hints or
 * the solution were opened, so a solved case is labelled conservatively: any solution view counts as
 * "after the solution", any hint as "with hints". It never claims more independence than v1 can prove.
 */
function fromV1(raw: unknown, maxHints: number): CaseProgress {
  if (!raw || typeof raw !== "object") return emptyCase();
  const r = raw as Record<string, unknown>;
  const hints = count(r.hints, maxHints);
  const solutionViewed = r.solutionViewed === true;
  const completion: Completion | null = r.solved === true ? (solutionViewed ? "solution" : hints > 0 ? "hints" : "independent") : null;
  return { attempts: count(r.attempts), hints, solutionViewed, completion, hintsAtCompletion: completion ? hints : 0 };
}

/** Parses stored progress of any known version. Returns blank progress for missing or corrupt data. */
export function parseProgress(v2: string | null, v1: string | null): { progress: ProgressMap; migrated: boolean } {
  const decode = (text: string | null) => {
    try {
      const value = text ? JSON.parse(text) : null;
      return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const current = decode(v2);
  const legacy = current ? null : decode(v1);
  const source = current ?? legacy;
  const progress = blankProgress();
  if (source) {
    for (const c of CHALLENGES) progress[c.id] = (current ? readCase : fromV1)(source[c.id], c.hints.length);
  }
  return { progress, migrated: !!legacy };
}

/** Records one answer check. Only the first correct check decides how the case was completed. */
export function recordCheck(p: CaseProgress, correct: boolean): CaseProgress {
  const next = { ...p, attempts: p.attempts + 1 };
  if (correct && !p.completion) {
    next.completion = p.solutionViewed ? "solution" : p.hints > 0 ? "hints" : "independent";
    next.hintsAtCompletion = p.hints;
  }
  return next;
}

export const COMPLETION_LABEL: Record<Completion, string> = {
  independent: "Solved independently",
  hints: "Solved using hints",
  solution: "Completed after viewing the solution",
};

export function describeCompletion(p: CaseProgress): string {
  if (!p.completion) return "Not completed";
  if (p.completion === "hints") return `Solved using ${p.hintsAtCompletion} hint${p.hintsAtCompletion === 1 ? "" : "s"}`;
  return COMPLETION_LABEL[p.completion];
}

export function loadProgress(): ProgressMap {
  try {
    const { progress, migrated } = parseProgress(window.localStorage.getItem(STORAGE_KEY), window.localStorage.getItem(LEGACY_KEYS[0]));
    if (migrated) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
      LEGACY_KEYS.forEach((k) => window.localStorage.removeItem(k));
    }
    return progress;
  } catch {
    // Storage can be unavailable (private mode, blocked site data). Progress then lasts for this visit only.
    return blankProgress();
  }
}

export function saveProgress(p: ProgressMap) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    LEGACY_KEYS.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // See loadProgress.
  }
}
