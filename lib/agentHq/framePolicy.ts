// Adaptive frame rate for Agent HQ. Devices that keep up render at the display rate
// (60 fps). When frames keep arriving late, rendering drops to a steady 30 fps, which
// reads as smoother than an uneven 35-50 fps and leaves the main thread room for input.
// The simulation runs on a fixed timestep either way, so characters move at the same speed.
//
// Pure and deterministic so it can be unit-tested without a browser.

export type FrameMode = 60 | 30;

export type FramePolicy = {
  mode: FrameMode;
  /** Smoothed time between drawn frames (ms). */
  emaInterval: number;
  /** Smoothed JavaScript cost of one frame (ms). */
  emaWork: number;
  /** How long frames have been consistently late (ms). */
  slowFor: number;
  /** In 30 fps mode, don't try 60 again before this time (ms). */
  holdUntil: number;
  /** Next hold length; doubles each time the device drops back to 30. */
  backoff: number;
  /** Ignore the first second after start (loading, first paints). */
  startedAt: number;
  switches: number;
};

export const POLICY = {
  /** Smoothed interval above this means the device is not keeping 60 fps (about 48 fps). */
  slowIntervalMs: 21,
  /** How long frames must stay slow before dropping to 30 fps. */
  slowForMs: 1500,
  /** In 30 fps mode, frame work below this leaves room to try 60 again. */
  fastWorkMs: 8,
  firstHoldMs: 5000,
  maxHoldMs: 60000,
  warmupMs: 1000,
  /** Intervals longer than this are stalls (tab switch, debugger), not slowness. */
  stallMs: 250,
  ema: 0.1,
} as const;

export function createFramePolicy(now: number): FramePolicy {
  return { mode: 60, emaInterval: 1000 / 60, emaWork: 0, slowFor: 0, holdUntil: 0, backoff: POLICY.firstHoldMs, startedAt: now, switches: 0 };
}

/** Minimum time between drawn frames for the current mode, with a little slack for vsync jitter. */
export function minFrameGap(p: FramePolicy) {
  return p.mode === 60 ? 0 : 1000 / 30 - 4;
}

/**
 * Feeds one drawn frame into the policy: `interval` is the time since the previous drawn
 * frame, `work` the JavaScript time this frame took. Returns true if the mode changed.
 */
export function updateFramePolicy(p: FramePolicy, now: number, interval: number, work: number): boolean {
  if (now - p.startedAt < POLICY.warmupMs || interval > POLICY.stallMs || interval <= 0) return false;
  p.emaInterval += (interval - p.emaInterval) * POLICY.ema;
  p.emaWork += (work - p.emaWork) * POLICY.ema;
  if (p.mode === 60) {
    p.slowFor = p.emaInterval > POLICY.slowIntervalMs ? p.slowFor + interval : 0;
    if (p.slowFor >= POLICY.slowForMs) {
      p.mode = 30;
      p.slowFor = 0;
      p.holdUntil = now + p.backoff;
      p.backoff = Math.min(POLICY.maxHoldMs, p.backoff * 2);
      p.switches++;
      return true;
    }
    return false;
  }
  if (now >= p.holdUntil && p.emaWork < POLICY.fastWorkMs) {
    p.mode = 60;
    p.emaInterval = 1000 / 60;
    p.slowFor = 0;
    p.switches++;
    return true;
  }
  return false;
}
