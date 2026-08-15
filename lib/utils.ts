export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** Splits an "A → B → C" architecture string into ordered step labels. */
export function parseArchitectureSteps(architecture: string): string[] {
  return architecture
    .split("→")
    .map((step) => step.trim())
    .filter(Boolean);
}
