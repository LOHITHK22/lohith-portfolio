"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Database,
  Lightbulb,
  Loader2,
  Play,
  RotateCcw,
  SearchCheck,
  Table2,
  XCircle,
} from "lucide-react";
import { CHALLENGES, type Challenge } from "@/lib/sqlDetective/challenges";
import { TABLES, ROW_COUNTS } from "@/lib/sqlDetective/dataset";
import { judge, type Verdict, type Cell } from "@/lib/sqlDetective/compare";
import { SqlDetectiveEngine, MAX_ROWS, type QueryResult } from "@/lib/sqlDetective/engine";
import { track } from "@/lib/analytics";

type Progress = { solved: boolean; attempts: number; hints: number; solutionViewed: boolean };
type Feedback = { verdict: Verdict; rows: number; expectedRows: number } | null;

const STORAGE_KEY = "sql-detective-progress-v1";
const DISPLAY_ROWS = 200;
const blank = (): Record<string, Progress> =>
  Object.fromEntries(CHALLENGES.map((c) => [c.id, { solved: false, attempts: 0, hints: 0, solutionViewed: false }]));

function loadProgress(): Record<string, Progress> {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved && typeof saved === "object") return { ...blank(), ...saved };
  } catch {
    // Storage can be unavailable (private mode, blocked site data). Progress then lasts for this visit only.
  }
  return blank();
}

function saveProgress(p: Record<string, Progress>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // See loadProgress.
  }
}

const distinctRows = (r: QueryResult) => new Set(r.rows.map((row) => JSON.stringify(row))).size;

export function SqlDetective() {
  const engine = useRef<SqlDetectiveEngine | null>(null);
  const [engineState, setEngineState] = useState<"loading" | "ready" | "error">("loading");
  const [active, setActive] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(CHALLENGES.map((c) => [c.id, c.starter])));
  const [progress, setProgress] = useState<Record<string, Progress>>(blank);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"run" | "check" | "reset" | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [status, setStatus] = useState("Loading the SQLite engine…");
  const [showSummary, setShowSummary] = useState(false);

  const challenge = CHALLENGES[active];
  const sql = drafts[challenge.id];
  const p = progress[challenge.id];
  const solvedCount = CHALLENGES.filter((c) => progress[c.id].solved).length;

  useEffect(() => {
    setProgress(loadProgress());
    const e = new SqlDetectiveEngine();
    engine.current = e;
    e.load().then(
      () => {
        setEngineState("ready");
        setStatus("Database ready: 6 tables of synthetic data loaded in your browser.");
      },
      (err) => {
        setEngineState("error");
        setStatus(`The SQL engine could not load: ${err instanceof Error ? err.message : String(err)}`);
      },
    );
    return () => e.dispose();
  }, []);

  const update = useCallback((id: string, patch: Partial<Progress>) => {
    setProgress((prev) => {
      const next = { ...prev, [id]: { ...prev[id], ...patch } };
      saveProgress(next);
      return next;
    });
  }, []);

  const execute = useCallback(async (text: string) => {
    const e = engine.current;
    if (!e) throw new Error("The database is not loaded.");
    return e.query(text);
  }, []);

  const run = async (text = sql) => {
    setBusy("run");
    setError(null);
    setFeedback(null);
    try {
      const r = await execute(text);
      setResult(r);
      setStatus(`Query returned ${r.rows.length}${r.truncated ? "+" : ""} row${r.rows.length === 1 ? "" : "s"} in ${r.ms.toFixed(1)} ms.`);
    } catch (err) {
      setResult(null);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus(`Query error: ${message}`);
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    setBusy("check");
    setError(null);
    setFeedback(null);
    try {
      const r = await execute(sql);
      setResult(r);
      const accepted = await Promise.all(challenge.accepted.map((q) => execute(q)));
      const verdict = judge(r, accepted);
      const expectedRows = distinctRows(accepted[0]);
      setFeedback({ verdict, rows: r.rows.length, expectedRows });
      update(challenge.id, { attempts: p.attempts + 1, ...(verdict.correct ? { solved: true } : {}) });
      setStatus(verdict.correct ? `Case ${challenge.number} solved. Your result matches the expected answer.` : `Not yet: ${verdict.message}`);
      track("sql_challenge_check", { challenge: challenge.id, correct: verdict.correct });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setResult(null);
      setError(message);
      setStatus(`Query error: ${message}`);
    } finally {
      setBusy(null);
    }
  };

  const resetDatabase = async () => {
    const e = engine.current;
    if (!e) return;
    setBusy("reset");
    setEngineState("loading");
    setStatus("Rebuilding the database from the synthetic dataset…");
    try {
      await e.reset();
      setEngineState("ready");
      setResult(null);
      setError(null);
      setFeedback(null);
      setStatus("Database reset: a fresh copy of the synthetic dataset is loaded.");
    } catch (err) {
      setEngineState("error");
      setStatus(`The SQL engine could not reload: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const select = (i: number) => {
    setActive(i);
    setShowSummary(false);
    setResult(null);
    setError(null);
    setFeedback(null);
  };

  const setSql = (value: string) => setDrafts((d) => ({ ...d, [challenge.id]: value }));

  const revealHint = () => update(challenge.id, { hints: Math.min(p.hints + 1, challenge.hints.length) });
  const revealSolution = () => {
    update(challenge.id, { solutionViewed: true });
    setSql(challenge.solution);
    setStatus("Solution loaded into the editor. Run or check it to see the result.");
  };

  const startOver = () => {
    const fresh = blank();
    saveProgress(fresh);
    setProgress(fresh);
    setDrafts(Object.fromEntries(CHALLENGES.map((c) => [c.id, c.starter])));
    select(0);
  };

  const ready = engineState === "ready" && !busy;

  return (
    <div className="grid gap-5">
      <ProgressTracker progress={progress} active={showSummary ? -1 : active} onSelect={select} solvedCount={solvedCount} onSummary={() => setShowSummary(true)} />

      <p role="status" aria-live="polite" className="sr-only" data-testid="sql-status">
        {status}
      </p>

      {showSummary ? (
        <Summary progress={progress} onStartOver={startOver} onOpen={select} />
      ) : (
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
          <div className="grid min-w-0 content-start gap-5">
            <CaseFile challenge={challenge} progress={p} onHint={revealHint} onSolution={revealSolution} />
            <SchemaExplorer disabled={!ready} onPreview={(t) => {
              const q = `SELECT *\nFROM ${t}\nLIMIT 20;`;
              setSql(q);
              void run(q);
            }} />
          </div>

          <div className="grid min-w-0 content-start gap-4">
            <section aria-labelledby="editor-heading" className="glass-panel rounded-2xl p-4 sm:p-5">
              <div className="relative z-10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id="editor-heading" className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-teal">
                    SQL editor · SQLite
                  </h2>
                  <EngineBadge state={engineState} />
                </div>
                <label htmlFor="sql-editor" className="sr-only">
                  SQL query for case {challenge.number}
                </label>
                <textarea
                  id="sql-editor"
                  data-testid="sql-editor"
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      if (ready) void run();
                    }
                  }}
                  aria-describedby="editor-help"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                  wrap="off"
                  rows={9}
                  className="mt-3 block w-full resize-y rounded-xl border border-white/10 bg-ink-950/80 p-3 font-mono text-[13px] leading-relaxed text-slate-100 outline-none transition-colors focus:border-teal/60 focus-visible:ring-2 focus-visible:ring-teal/40"
                />
                <p id="editor-help" className="mt-2 text-xs text-slate-500">
                  Read-only SQLite. One SELECT statement at a time. Ctrl + Enter (⌘ + Enter on Mac) runs the query.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void run()}
                    disabled={!ready}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-teal/50 bg-teal/10 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                    Run query
                  </button>
                  <button
                    type="button"
                    onClick={() => void check()}
                    disabled={!ready}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full bg-teal px-4 text-sm font-semibold text-ink-950 transition-colors hover:bg-teal-soft disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === "check" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <SearchCheck className="h-4 w-4" aria-hidden="true" />}
                    Check answer
                  </button>
                  <button
                    type="button"
                    onClick={() => setSql(challenge.starter)}
                    disabled={!!busy}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm text-slate-300 transition-colors hover:border-white/30 hover:text-white disabled:opacity-50"
                  >
                    Restore starter query
                  </button>
                  <button
                    type="button"
                    onClick={() => void resetDatabase()}
                    disabled={!!busy || engineState === "loading"}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm text-slate-300 transition-colors hover:border-white/30 hover:text-white disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Reset database
                  </button>
                </div>
              </div>
            </section>

            {feedback && (
              <FeedbackPanel
                feedback={feedback}
                challenge={challenge}
                isLast={active === CHALLENGES.length - 1}
                allSolved={solvedCount === CHALLENGES.length}
                onNext={() => (solvedCount === CHALLENGES.length ? setShowSummary(true) : select(nextOpen(progress, active)))}
              />
            )}

            {error && (
              <div role="alert" data-testid="sql-error" className="flex gap-3 rounded-2xl border border-rose-400/30 bg-rose-400/[0.06] p-4 text-sm text-rose-100">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Query error</p>
                  <p className="mt-1 break-words font-mono text-[13px] text-rose-100/90">{error}</p>
                </div>
              </div>
            )}

            <Results result={result} />
          </div>
        </div>
      )}
    </div>
  );
}

function nextOpen(progress: Record<string, Progress>, from: number) {
  for (let k = 1; k <= CHALLENGES.length; k++) {
    const i = (from + k) % CHALLENGES.length;
    if (!progress[CHALLENGES[i].id].solved) return i;
  }
  return Math.min(from + 1, CHALLENGES.length - 1);
}

function EngineBadge({ state }: { state: "loading" | "ready" | "error" }) {
  const label = state === "ready" ? "Engine ready" : state === "loading" ? "Loading engine" : "Engine unavailable";
  const color = state === "ready" ? "bg-emerald-400" : state === "loading" ? "bg-amber-300 motion-safe:animate-pulse" : "bg-rose-400";
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400" data-testid="engine-state" data-state={state}>
      <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function ProgressTracker({
  progress,
  active,
  onSelect,
  solvedCount,
  onSummary,
}: {
  progress: Record<string, Progress>;
  active: number;
  onSelect: (i: number) => void;
  solvedCount: number;
  onSummary: () => void;
}) {
  return (
    <nav aria-label="Cases" className="glass-panel rounded-2xl p-3 sm:p-4">
      <div className="relative z-10 flex flex-wrap items-center gap-3">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300" data-testid="sql-progress">
          {solvedCount} of {CHALLENGES.length} cases solved
        </p>
        <div className="h-1.5 min-w-[6rem] flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div className="h-full rounded-full bg-teal transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${(solvedCount / CHALLENGES.length) * 100}%` }} />
        </div>
        {solvedCount === CHALLENGES.length && (
          <button type="button" onClick={onSummary} className="inline-flex min-h-10 items-center rounded-full border border-teal/40 px-3 text-xs font-semibold text-teal hover:bg-teal/10">
            View summary
          </button>
        )}
      </div>
      <ol className="relative z-10 mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CHALLENGES.map((c, i) => {
          const solved = progress[c.id].solved;
          const current = i === active;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={current ? "step" : undefined}
                className={`flex min-h-11 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                  current ? "border-teal/50 bg-teal/10 text-white" : "border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200"
                }`}
              >
                {solved ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" /> : <Circle className="h-4 w-4 shrink-0" aria-hidden="true" />}
                <span className="min-w-0">
                  <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">Case {c.number}</span>
                  <span className="block truncate">{c.concepts[0]}</span>
                </span>
                <span className="sr-only">{solved ? "(solved)" : "(not solved)"}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function CaseFile({ challenge, progress, onHint, onSolution }: { challenge: Challenge; progress: Progress; onHint: () => void; onSolution: () => void }) {
  const moreHints = progress.hints < challenge.hints.length;
  return (
    <section aria-labelledby="case-heading" className="glass-panel rounded-2xl p-5" data-testid="case-file">
      <div className="relative z-10">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-teal">
          Case {challenge.number} · {challenge.dataset}
        </p>
        <h2 id="case-heading" className="mt-2 font-display text-xl font-semibold text-white">
          {challenge.title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">{challenge.problem}</p>
        <div className="mt-4 rounded-xl border border-teal/25 bg-teal/[0.05] p-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-teal">Your task</p>
          <p className="mt-1 text-sm text-white">{challenge.task}</p>
          <p className="mt-2 text-xs text-slate-400">Your result must include: {challenge.mustInclude}.</p>
        </div>
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="SQL concepts">
          {challenge.concepts.map((c) => (
            <li key={c} className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] text-slate-400">
              {c}
            </li>
          ))}
        </ul>

        {progress.hints > 0 && (
          <ol className="mt-4 grid gap-2" aria-label="Hints">
            {challenge.hints.slice(0, progress.hints).map((h, i) => (
              <li key={i} className="flex gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-3 text-sm text-amber-50/90">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                <span>
                  <span className="sr-only">Hint {i + 1}: </span>
                  {h}
                </span>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {moreHints && (
            <button type="button" onClick={onHint} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-amber-300/30 px-3 text-xs text-amber-200 hover:bg-amber-300/10">
              <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
              Show hint {progress.hints + 1} of {challenge.hints.length}
            </button>
          )}
          <button type="button" onClick={onSolution} className="inline-flex min-h-10 items-center rounded-full border border-white/15 px-3 text-xs text-slate-300 hover:border-white/30 hover:text-white">
            {progress.solutionViewed ? "Load the solution again" : "Show a solution"}
          </button>
        </div>
      </div>
    </section>
  );
}

function SchemaExplorer({ disabled, onPreview }: { disabled: boolean; onPreview: (table: string) => void }) {
  const groups = [
    { id: "shipping", label: "Dataset A · Shipping operations" },
    { id: "payments", label: "Dataset B · Payment reconciliation" },
  ] as const;
  return (
    <section aria-labelledby="schema-heading" className="glass-panel rounded-2xl p-5">
      <div className="relative z-10">
        <h2 id="schema-heading" className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-teal">
          <Database className="h-3.5 w-3.5" aria-hidden="true" />
          Schema explorer
        </h2>
        <p className="mt-2 text-xs text-slate-500">Synthetic demonstration data. Not real company, customer or payment records.</p>
        {groups.map((g) => (
          <div key={g.id} className="mt-4">
            <h3 className="text-xs font-semibold text-slate-300">{g.label}</h3>
            <ul className="mt-2 grid gap-2">
              {TABLES.filter((t) => t.group === g.id).map((t) => (
                <li key={t.name}>
                  <details className="group rounded-xl border border-white/10 bg-white/[0.02]">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm text-white [&::-webkit-details-marker]:hidden">
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                      <Table2 className="h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
                      <span className="font-mono">{t.name}</span>
                      <span className="ml-auto font-mono text-[10px] text-slate-500">{ROW_COUNTS[t.name]} rows</span>
                    </summary>
                    <div className="border-t border-white/10 px-3 pb-3 pt-2">
                      <p className="text-xs text-slate-400">{t.description}</p>
                      <ul className="mt-2 grid gap-1">
                        {t.columns.map((c) => (
                          <li key={c.name} className="flex flex-wrap items-baseline gap-x-2 font-mono text-[12px]">
                            <span className="text-slate-100">{c.name}</span>
                            <span className="text-[10px] text-slate-500">{c.type}</span>
                            {c.note && <span className="text-[10px] text-slate-500">· {c.note}</span>}
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onPreview(t.name)}
                        className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-teal/30 px-3 text-xs text-teal hover:bg-teal/10 disabled:opacity-50"
                      >
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        Preview {t.name}
                      </button>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

const show = (v: Cell) => (v === null ? null : typeof v === "number" && !Number.isInteger(v) ? String(Math.round(v * 10000) / 10000) : String(v));

function Results({ result }: { result: QueryResult | null }) {
  const rows = useMemo(() => result?.rows.slice(0, DISPLAY_ROWS) ?? [], [result]);
  if (!result) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500" data-testid="sql-results-empty">
        Run a query to see its results here.
      </div>
    );
  }
  const count = result.rows.length;
  return (
    <section aria-labelledby="results-heading" className="glass-panel min-w-0 rounded-2xl p-4 sm:p-5" data-testid="sql-results">
      <div className="relative z-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="results-heading" className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-teal">
            Results
          </h2>
          <p className="font-mono text-[11px] text-slate-400" data-testid="sql-row-count">
            {count}
            {result.truncated ? "+" : ""} row{count === 1 ? "" : "s"} · {result.ms.toFixed(1)} ms
          </p>
        </div>
        {result.truncated && <p className="mt-2 text-xs text-amber-200/90">Stopped at {MAX_ROWS} rows. Add a WHERE clause or LIMIT to narrow the result.</p>}
        {count > DISPLAY_ROWS && <p className="mt-2 text-xs text-slate-400">Showing the first {DISPLAY_ROWS} rows.</p>}
        <div className="mt-3 max-h-[26rem] overflow-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label="Query results table">
          <table className="min-w-full border-collapse text-left font-mono text-[12px]">
            <caption className="sr-only">
              Query results: {count} rows, {result.columns.length} columns
            </caption>
            <thead className="sticky top-0 bg-ink-900">
              <tr>
                {result.columns.map((c, i) => (
                  <th key={`${c}-${i}`} scope="col" className="whitespace-nowrap border-b border-white/10 px-3 py-2 font-semibold text-teal-soft">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="odd:bg-white/[0.02]">
                  {r.map((v, j) => {
                    const text = show(v);
                    return (
                      <td key={j} className="whitespace-nowrap border-b border-white/[0.05] px-3 py-1.5 text-slate-200">
                        {text === null ? <span className="italic text-slate-500">NULL</span> : text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {count === 0 && <p className="p-4 text-sm text-slate-500">No rows.</p>}
        </div>
      </div>
    </section>
  );
}

function FeedbackPanel({
  feedback,
  challenge,
  isLast,
  allSolved,
  onNext,
}: {
  feedback: NonNullable<Feedback>;
  challenge: Challenge;
  isLast: boolean;
  allSolved: boolean;
  onNext: () => void;
}) {
  const { verdict } = feedback;
  if (verdict.correct) {
    return (
      <section aria-labelledby="verdict-heading" data-testid="sql-verdict" data-correct="true" className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] p-5">
        <h2 id="verdict-heading" className="flex items-center gap-2 font-semibold text-emerald-200">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          Case {challenge.number} solved
        </h2>
        <p className="mt-1 text-sm text-emerald-50/80">Your result set matches the expected answer ({feedback.expectedRows} rows), whatever the column names or row order.</p>
        <h3 className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200/80">Why it works</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-200">{challenge.why}</p>
        <h3 className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200/80">Business outcome</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-200">{challenge.outcome}</p>
        <button type="button" onClick={onNext} className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-emerald-300 px-4 text-sm font-semibold text-ink-950 hover:bg-emerald-200">
          {allSolved ? "See your summary" : isLast ? "Go to the next open case" : "Next case"}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </section>
    );
  }
  return (
    <section aria-labelledby="verdict-heading" data-testid="sql-verdict" data-correct="false" className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] p-5">
      <h2 id="verdict-heading" className="flex items-center gap-2 font-semibold text-amber-100">
        <XCircle className="h-5 w-5" aria-hidden="true" />
        Not solved yet
      </h2>
      <p className="mt-1 text-sm text-amber-50/90">{verdict.message}</p>
      <p className="mt-2 font-mono text-[12px] text-slate-300">
        Your query returned {feedback.rows} row{feedback.rows === 1 ? "" : "s"}; the expected result has {feedback.expectedRows} distinct row
        {feedback.expectedRows === 1 ? "" : "s"}.
        {verdict.reason === "rows" && verdict.missing !== undefined && ` ${verdict.missing} expected row(s) missing, ${verdict.extra} unexpected.`}
      </p>
    </section>
  );
}

function Summary({ progress, onStartOver, onOpen }: { progress: Record<string, Progress>; onStartOver: () => void; onOpen: (i: number) => void }) {
  const independent = CHALLENGES.filter((c) => progress[c.id].solved && !progress[c.id].solutionViewed).length;
  return (
    <section aria-labelledby="summary-heading" className="glass-panel rounded-2xl p-5 sm:p-7" data-testid="sql-summary">
      <div className="relative z-10">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-teal">Investigation complete</p>
        <h2 id="summary-heading" className="mt-2 font-hero text-3xl font-black tracking-tight text-white sm:text-4xl">
          All four cases closed
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-slate-300">
          You found duplicate loads, orders without shipments, mis-settled payments, and built a de-duplicated merchant report. {independent} of{" "}
          {CHALLENGES.length} were solved without opening the solution. This summary is stored only in this browser.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">Your results for each case</caption>
            <thead className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th scope="col" className="py-2 pr-4">Case</th>
                <th scope="col" className="py-2 pr-4">Checks</th>
                <th scope="col" className="py-2 pr-4">Hints</th>
                <th scope="col" className="py-2">Solution viewed</th>
              </tr>
            </thead>
            <tbody>
              {CHALLENGES.map((c, i) => (
                <tr key={c.id} className="border-t border-white/[0.07]">
                  <td className="py-2 pr-4">
                    <button type="button" onClick={() => onOpen(i)} className="min-h-10 text-left text-white hover:text-teal">
                      {c.number}. {c.title}
                    </button>
                  </td>
                  <td className="py-2 pr-4 font-mono text-slate-300">{progress[c.id].attempts}</td>
                  <td className="py-2 pr-4 font-mono text-slate-300">{progress[c.id].hints}</td>
                  <td className="py-2 font-mono text-slate-300">{progress[c.id].solutionViewed ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={onStartOver} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm text-slate-200 hover:border-white/30">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Start over
          </button>
          <Link href="/#pipelinemedic" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-teal px-4 text-sm font-semibold text-ink-950 hover:bg-teal-soft">
            See the real data systems
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
