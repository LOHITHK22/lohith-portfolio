"use client";

import dynamic from "next/dynamic";

// `ssr: false` is only permitted inside a Client Component, so the dynamic()
// call itself has to live here rather than directly in app/page.tsx.
const Terminal = dynamic(() => import("./Terminal").then((m) => m.Terminal), {
  ssr: false,
  loading: () => <div className="section-shell py-16 sm:py-20" aria-hidden="true" />,
});

export function TerminalLazy() {
  return <Terminal />;
}
