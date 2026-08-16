"use client";

import { useEffect, useState } from "react";

/**
 * True only on devices with a real mouse (fine pointer + hover support) —
 * gates desktop-only flourishes (cursor glow, card tilt) so touch devices
 * never get janky mouse-based effects.
 */
export function useCanHover(): boolean {
  const [canHover, setCanHover] = useState(false);

  useEffect(() => {
    setCanHover(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  }, []);

  return canHover;
}
