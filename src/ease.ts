// Easing curves for motion (0..1 in, 0..1 out; easeOutBack overshoots a little).
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOutCubic = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const easeOutBack = (x: number) => {
  const t = clamp01(x);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Story-style progress: one segment per scene, 0..1 fill each. */
export function segmentFills(sceneCount: number, sceneIndex: number, local: number): number[] {
  return Array.from({ length: sceneCount }, (_, i) => (i < sceneIndex ? 1 : i > sceneIndex ? 0 : clamp01(local)));
}
