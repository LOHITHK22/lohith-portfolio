import type { MouseEvent } from "react";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Sets --spot-x/--spot-y CSS vars on the hovered element to the cursor's
 * position within it, driving the .glass-panel cursor-spotlight effect
 * (see globals.css). Spread onto onMouseMove of any .glass-panel element.
 */
export function onSpotlightMove(e: MouseEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
}

/** Splits an "A → B → C" architecture string into ordered step labels. */
export function parseArchitectureSteps(architecture: string): string[] {
  return architecture
    .split("→")
    .map((step) => step.trim())
    .filter(Boolean);
}
