import type { Variants } from "framer-motion";

/**
 * Builds scroll-reveal variants that respect reduced-motion preference.
 * When `reduced` is true, transitions collapse to an instant opacity fade
 * with no translation, so content never "flies in".
 */
export function fadeUpVariants(reduced: boolean, delay = 0): Variants {
  if (reduced) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: { duration: 0.15, delay: 0 } },
    };
  }
  return {
    hidden: { opacity: 0, y: 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] },
    },
  };
}

export function staggerContainer(reduced: boolean, stagger = 0.08): Variants {
  return {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: reduced ? 0 : stagger,
      },
    },
  };
}
