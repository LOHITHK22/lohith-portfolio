"use client";

import dynamic from "next/dynamic";

// `ssr: false` is only permitted inside a Client Component, so the dynamic()
// call itself has to live here rather than directly in app/page.tsx.
const CommandPalette = dynamic(() => import("./CommandPalette").then((m) => m.CommandPalette), {
  ssr: false,
});

export function CommandPaletteLazy() {
  return <CommandPalette />;
}
