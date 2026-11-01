// Browser-side wrapper around the SQL Detective worker. The worker (and the ~650 KB SQLite
// WebAssembly build it loads) is only created when the workbench page mounts.

import { DATABASE_SQL } from "./dataset";
import { checkQuery } from "./guard";
import type { ResultSet } from "./compare";

export const QUERY_TIMEOUT_MS = 3000;
export const MAX_ROWS = 500;

export type QueryResult = ResultSet & { truncated: boolean; ms: number };

type Reply = { id: number; ok: boolean; error?: string } & Partial<QueryResult>;

export class SqlDetectiveEngine {
  private worker: Worker | null = null;
  private loading: Promise<void> | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve: (r: Reply) => void }>();

  /** Loads (or reloads) the disposable database. */
  load(): Promise<void> {
    if (!this.loading) {
      this.loading = (async () => {
        const worker = new Worker("/sqljs/detective-worker.js");
        worker.onmessage = (e: MessageEvent<Reply>) => {
          this.pending.get(e.data.id)?.resolve(e.data);
          this.pending.delete(e.data.id);
        };
        this.worker = worker;
        const reply = await this.send({ type: "init", sql: DATABASE_SQL }, 20_000);
        if (!reply.ok) throw new Error(reply.error);
      })().catch((error) => {
        this.dispose();
        throw error;
      });
    }
    return this.loading;
  }

  /** Throws the database away and rebuilds it from the synthetic dataset. */
  async reset(): Promise<void> {
    this.dispose();
    await this.load();
  }

  /** Runs one read-only query. Resolves with rows or rejects with a readable message. */
  async query(sql: string): Promise<QueryResult> {
    const guard = checkQuery(sql);
    if (!guard.ok) throw new Error(guard.error);
    await this.load();
    const reply = await this.send({ type: "exec", sql: guard.sql, maxRows: MAX_ROWS }, QUERY_TIMEOUT_MS);
    if (!reply.ok) throw new Error(friendly(reply.error ?? "Query failed."));
    return { columns: reply.columns ?? [], rows: reply.rows ?? [], truncated: !!reply.truncated, ms: reply.ms ?? 0 };
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.loading = null;
    this.pending.forEach((p, id) => p.resolve({ id, ok: false, error: "The database was reset." }));
    this.pending.clear();
  }

  private send(message: Record<string, unknown>, timeoutMs: number): Promise<Reply> {
    const worker = this.worker;
    if (!worker) return Promise.resolve({ id: -1, ok: false, error: "The database is not loaded." });
    const id = ++this.seq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        // A runaway query can't be interrupted inside the worker, so drop the worker and database.
        this.pending.delete(id);
        this.dispose();
        resolve({ id, ok: false, error: `Query stopped after ${timeoutMs / 1000} seconds. The database was reloaded; try a narrower query.` });
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
      });
      worker.postMessage({ id, ...message });
    });
  }
}

function friendly(message: string) {
  if (/readonly|query_only/i.test(message)) return "This workbench is read-only. Use SELECT to investigate the data.";
  return message.replace(/^Error:\s*/, "");
}
