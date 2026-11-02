import type { Gesture } from "./sim";

// Articulated character skeleton for Agent HQ. Joints are computed in the character's
// local 3D frame (f = forward, s = to its right, z = up; units are base pixels where a
// tile is 32 wide), then projected isometrically by the renderer. Walking is a real
// gait cycle: thighs swing in opposition, knees bend on the swing leg, the stance foot
// stays planted, arms counter-swing and the body bobs. Sitting, typing, waving, talking
// and the errand gestures are poses blended on the same skeleton.

export type V3 = { f: number; s: number; z: number };

export type Joints = {
  pelvis: V3;
  chest: V3;
  head: V3;
  hip: [V3, V3];
  knee: [V3, V3];
  foot: [V3, V3];
  shoulder: [V3, V3];
  elbow: [V3, V3];
  hand: [V3, V3];
};

export type PoseInput = {
  walkPhase: number;
  /** 0 standing still … 1 full walk. */
  walkAmt: number;
  /** 0 standing … 1 seated. */
  sit: number;
  gesture: Gesture;
  /** Seconds, for gesture loops. */
  t: number;
  /** Voice loudness 0..1 while talking. */
  level: number;
  bob: number;
  armSwing: number;
  /** Freeze looping motion (reduced motion). */
  still: boolean;
};

export const BODY = {
  thigh: 10.5,
  shin: 10.5,
  hipWidth: 3.6,
  torso: 15,
  shoulderWidth: 5.6,
  upperArm: 8.2,
  foreArm: 7.6,
  headR: 6.4,
  // Chair seat top (13 px) divided by the renderer's 1.2x character scale.
  seatZ: 10.8,
};

const v = (f: number, s: number, z: number): V3 => ({ f, s, z });
const add = (a: V3, b: V3): V3 => ({ f: a.f + b.f, s: a.s + b.s, z: a.z + b.z });
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** A limb segment hanging from `from`: angle 0 points straight down, positive swings forward. */
function seg(from: V3, len: number, angle: number, splay = 0): V3 {
  return add(from, v(Math.sin(angle) * len, splay, -Math.cos(angle) * len));
}

export function computePose(p: PoseInput): Joints {
  const t = p.still ? 0 : p.t;
  const sit = p.sit;
  const w = p.walkAmt * (1 - sit);
  const ph = p.walkPhase;

  // Legs. Left leg uses sin(ph); right leg is half a cycle later.
  const legs = [0, 1].map((i) => {
    const phase = ph + i * Math.PI;
    const swing = Math.sin(phase);
    // Knee bends while the leg swings forward (cos > 0), with a little give in stance.
    const bendWalk = 0.12 + 0.95 * Math.max(0, Math.cos(phase)) * Math.max(0, swing + 0.6) * 0.7;
    const thighA = lerp(lerp(0.02, 0.48 * swing, w), Math.PI / 2 - 0.08, sit);
    const knee = lerp(lerp(0.04, bendWalk, w), Math.PI / 2 + 0.1, sit);
    return { thighA, knee };
  });
  // Hip height keeps the more extended (stance) leg's foot on the floor.
  const reach = Math.max(
    ...legs.map(({ thighA, knee }) => BODY.thigh * Math.cos(thighA) + BODY.shin * Math.cos(thighA - knee))
  );
  const bob = w * p.bob * Math.abs(Math.cos(ph)) * 0.6;
  const breathe = p.still ? 0 : Math.sin(t * 2.1) * 0.35;
  // The hips ride on the stance leg, so the planted foot never leaves the floor;
  // the per-character bounce goes into the upper body instead.
  const standZ = reach;
  const hipZ = lerp(standZ, BODY.seatZ, sit);
  const pelvis = v(lerp(0, -2.5, sit), 0, hipZ);

  const hip: [V3, V3] = [add(pelvis, v(0, -BODY.hipWidth, 0)), add(pelvis, v(0, BODY.hipWidth, 0))];
  const knee = hip.map((h, i) => seg(h, BODY.thigh, legs[i].thighA)) as [V3, V3];
  const foot = knee.map((k, i) => seg(k, BODY.shin, legs[i].thighA - legs[i].knee)) as [V3, V3];

  // Torso leans forward slightly when walking or typing.
  const typing = p.gesture === "type" ? 1 : 0;
  const lean = 0.07 * w + 0.12 * typing * sit + (p.gesture === "inspect" ? 0.15 : 0);
  const chest = add(pelvis, v(Math.sin(lean) * BODY.torso, 0, Math.cos(lean) * BODY.torso + breathe + bob));
  const nod = typing && !p.still ? Math.sin(t * 1.3) * 0.4 : 0;
  const talkBob = p.gesture === "talk" && !p.still ? p.level * 1.2 * Math.sin(t * 11) : 0;
  const head = add(chest, v(Math.sin(lean) * 8 + nod * 0.3, 0, BODY.headR + 2.2 + talkBob * 0.3));

  const shoulder: [V3, V3] = [add(chest, v(0, -BODY.shoulderWidth, -1)), add(chest, v(0, BODY.shoulderWidth, -1))];

  // Arms: [upper angle, elbow bend, splay] per side; index 1 is the right arm.
  const arms = [0, 1].map((i) => {
    const side = i === 0 ? -1 : 1;
    const phase = ph + i * Math.PI;
    let upper = lerp(0.08, -p.armSwing * Math.sin(phase), w);
    let bend = lerp(0.18, 0.35 + 0.25 * Math.max(0, Math.sin(phase)), w);
    let splay = side * 1.2;
    let lift = 0;
    switch (p.gesture) {
      case "type":
        upper = lerp(0.35, 0.55, sit);
        bend = 1.05 + Math.sin(t * 15 + i * 2.1) * 0.09;
        splay = side * 0.2;
        break;
      case "wave":
        if (i === 1) {
          upper = 2.5;
          bend = -0.25 + Math.sin(t * 10) * 0.45;
          splay = side * 4.5;
        }
        break;
      case "talk": {
        const k = 0.35 + p.level * 0.9;
        upper = 0.32 + Math.sin(t * 2.6 + i * 1.7) * 0.18 * k;
        bend = 1.25 + Math.sin(t * 4.1 + i) * 0.35 * k;
        splay = side * 2;
        break;
      }
      case "point":
        if (i === 1) {
          upper = 1.45;
          bend = 0.08;
          splay = side * 1.5;
        }
        break;
      case "write":
        if (i === 1) {
          upper = 1.75 + Math.sin(t * 3) * 0.12;
          bend = 0.25 + Math.cos(t * 3) * 0.15;
          splay = side * 0.5;
        }
        break;
      case "sip":
        if (i === 1) {
          const raise = Math.max(0, Math.sin(t * 0.9));
          upper = 0.45 + raise * 0.15;
          bend = 1.5 + raise * 0.8;
          splay = side * 0.6;
        }
        break;
      case "inspect":
        upper = 0.7;
        bend = 0.75 + (i === 1 ? Math.sin(t * 2) * 0.2 : 0);
        splay = side * 1;
        break;
      case "chat":
        if (i === 1) {
          upper = 0.35 + Math.sin(t * 2.2) * 0.12;
          bend = 1.3 + Math.sin(t * 3.3) * 0.3;
          splay = side * 1.6;
        }
        break;
      case "listen":
        upper = 0.12;
        bend = 0.3;
        lift = 0;
        break;
    }
    return { upper, bend, splay, lift };
  });

  const elbow = shoulder.map((sh, i) => seg(sh, BODY.upperArm, arms[i].upper, arms[i].splay * 0.6)) as [V3, V3];
  const hand = elbow.map((el, i) => seg(el, BODY.foreArm, arms[i].upper + arms[i].bend, arms[i].splay * 0.4)) as [V3, V3];

  return { pelvis, chest, head, hip, knee, foot, shoulder, elbow, hand };
}

/** Rotates a local point by the facing angle into floor-plane offsets (tile x/y axes, in base px). */
export function toWorld(p: V3, face: number) {
  const c = Math.cos(face);
  const s = Math.sin(face);
  return { dx: p.f * c - p.s * s, dy: p.f * s + p.s * c, z: p.z };
}
