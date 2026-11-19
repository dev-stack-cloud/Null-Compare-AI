/** Shared constants. All speeds are in px/s, accelerations in px/s². */

export const STEP_MS = 1000 / 120; // fixed physics step (120 Hz)
export const MAX_STEPS_PER_FRAME = 6; // spiral-of-death guard
export const VEL_TO_PXS = 60; // Matter normalises body.velocity to 1/60 s
export const MAX_SPEED = 2600;
export const MAX_ANGULAR = 0.5; // rad per 1/60 s
export const GRAVITY = 1000;
export const FLOOR_INSET = 46;

export const CAT = { WALL: 1, ITEM: 2, CORE: 4, FRAG: 8 } as const;

export const MAX_FRAGMENTS = 96;
export const MAX_PARTICLES = 480;

export const ACCENT = '#ff5a36';
export const ACCENT_RGB = '255,90,54';

export type Phase = 'still' | 'active' | 'revealing' | 'void' | 'resetting';

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const easeInOutCubic = (t: number) => {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOutBack = (t: number) => {
  const x = clamp(t, 0, 1);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
