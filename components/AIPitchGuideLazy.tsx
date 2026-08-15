"use client";

import dynamic from "next/dynamic";

// `ssr: false` is only permitted inside a Client Component, so the dynamic()
// call itself has to live here rather than directly in app/page.tsx.
const AIPitchGuide = dynamic(() => import("./AIPitchGuide").then((m) => m.AIPitchGuide), {
  ssr: false,
});

export function AIPitchGuideLazy() {
  return <AIPitchGuide />;
}
