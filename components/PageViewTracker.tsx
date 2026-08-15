"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

/**
 * Fires page-level analytics events once on mount. Kept as its own tiny
 * client component so `app/page.tsx` (and the career-fair banner decision)
 * can stay a server component for fast first paint.
 */
export function PageViewTracker({ careerFair }: { careerFair: boolean }) {
  useEffect(() => {
    track("qr_landing_view");
    if (careerFair) {
      track("careerfair_mode_view");
    }
    // Only ever fire once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
