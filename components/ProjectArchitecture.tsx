import { ArrowRight, ArrowDown } from "lucide-react";
import { parseArchitectureSteps } from "@/lib/utils";

type ProjectArchitectureProps = {
  architecture: string;
  className?: string;
};

/**
 * Renders an "A → B → C" architecture string as a small step-flow diagram
 * using styled divs + lucide arrow icons. No external diagramming library.
 * Wraps horizontally on desktop, stacks vertically on narrow mobile widths.
 */
export function ProjectArchitecture({ architecture, className }: ProjectArchitectureProps) {
  const steps = parseArchitectureSteps(architecture);

  return (
    <div className={className}>
      {/* Mobile: vertical flow */}
      <ol className="flex flex-col gap-2 sm:hidden" aria-label="Architecture flow">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-snug text-slate-200">
                {step}
              </div>
              {i < steps.length - 1 && (
                <div className="flex justify-center py-0.5 text-accent-cyan/70">
                  <ArrowDown className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      {/* Desktop/tablet: horizontal flow, wraps as needed */}
      <ol
        className="hidden flex-wrap items-stretch gap-y-3 sm:flex"
        aria-label="Architecture flow"
      >
        {steps.map((step, i) => (
          <li key={i} className="flex items-center">
            <div className="flex max-w-[190px] items-center rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs leading-snug text-slate-200">
              {step}
            </div>
            {i < steps.length - 1 && (
              <ArrowRight className="mx-1.5 h-4 w-4 shrink-0 text-accent-cyan/70" aria-hidden="true" />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
