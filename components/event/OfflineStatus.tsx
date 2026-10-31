"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, DownloadCloud, Loader2, TriangleAlert } from "lucide-react";
import { checkExistingOfflineCache, prepareOfflineDemo, type OfflineCheck } from "@/lib/offlineAssets";
import { track } from "@/lib/analytics";

type Status = { kind: "idle" } | { kind: "working" } | { kind: "ready"; check: OfflineCheck } | { kind: "error"; message: string };

/**
 * "Prepare for Offline Demo": caches the presentation and only reports
 * "Offline Demo Ready" after every file has been confirmed in Cache Storage.
 */
export function OfflineStatus({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    checkExistingOfflineCache().then((check) => {
      if (!check) return;
      if (check.ok) setStatus({ kind: "ready", check });
      else setStatus({ kind: "error", message: "Offline copy is from an older version. Prepare again." });
    });
  }, []);

  const prepare = async () => {
    setStatus({ kind: "working" });
    try {
      const check = await prepareOfflineDemo();
      if (check.ok) {
        setStatus({ kind: "ready", check });
        track("event_offline_ready", { files: check.total });
      } else {
        setStatus({ kind: "error", message: `${check.missing.length} of ${check.total} files could not be cached.` });
      }
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Could not prepare offline mode." });
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-3 ${compact ? "text-xs" : "text-sm"}`} data-testid="offline-status">
      <button type="button" onClick={prepare} disabled={status.kind === "working"} className="btn-secondary !px-4 !py-2 disabled:opacity-60">
        {status.kind === "working" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <DownloadCloud className="h-4 w-4" aria-hidden="true" />
        )}
        {status.kind === "ready" ? "Re-prepare offline demo" : "Prepare for Offline Demo"}
      </button>
      <p role="status" className="min-h-[1.25rem]">
        {status.kind === "working" && <span className="text-slate-300">Caching and verifying files...</span>}
        {status.kind === "ready" && (
          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Offline Demo Ready · {status.check.total} files verified
          </span>
        )}
        {status.kind === "error" && (
          <span className="inline-flex items-center gap-1.5 text-amber-300">
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            {status.message}
          </span>
        )}
      </p>
    </div>
  );
}
