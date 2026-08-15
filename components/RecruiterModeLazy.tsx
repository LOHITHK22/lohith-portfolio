"use client";

import dynamic from "next/dynamic";

// `ssr: false` is only permitted inside a Client Component, so the dynamic()
// call itself has to live here rather than directly in app/recruiter/page.tsx
// (which needs to stay a Server Component to export `metadata`).
const RecruiterMode = dynamic(() => import("./RecruiterMode").then((m) => m.RecruiterMode), {
  ssr: false,
});

export function RecruiterModeLazy() {
  return <RecruiterMode />;
}
