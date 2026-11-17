// Camera moves for photo scenes. Pure maths, so it is tested without a browser.
import { easeInOutCubic } from "./ease.ts";

export type MotionKind = "push" | "orbit" | "drift" | "rise";
export type Motion = { dx: number; dy: number; zoom: number };

export const MOTIONS: MotionKind[] = ["push", "drift", "orbit", "rise"];

/** Gentle, eased camera move for progress p (0..1) through a scene. Offsets are in UV units; kept small so motion stays smooth. */
export function motionAt(kind: MotionKind, p: number): Motion {
  const e = easeInOutCubic(p);
  switch (kind) {
    case "push":
      return { dx: 0, dy: -0.01 * e, zoom: 1.06 + 0.08 * e };
    case "drift":
      return { dx: -0.018 + 0.036 * e, dy: 0, zoom: 1.1 };
    case "orbit": {
      const a = e * Math.PI;
      return { dx: 0.016 * Math.cos(a), dy: 0.01 * Math.sin(a), zoom: 1.1 };
    }
    case "rise":
      return { dx: 0, dy: 0.016 - 0.032 * e, zoom: 1.08 + 0.03 * e };
  }
}

export function motionForScene(i: number): MotionKind {
  return MOTIONS[i % MOTIONS.length];
}

/** UV scale and offset that make an image cover a frame (centre crop), like CSS object-fit: cover. */
export function coverUV(srcW: number, srcH: number, dstW: number, dstH: number) {
  const src = srcW / srcH;
  const dst = dstW / dstH;
  if (src > dst) {
    const sx = dst / src;
    return { sx, sy: 1, ox: (1 - sx) / 2, oy: 0 };
  }
  const sy = src / dst;
  return { sx: 1, sy, ox: 0, oy: (1 - sy) / 2 };
}

/** Size to scale a photo down to before depth estimation and upload (long side capped). */
export function fitLongSide(w: number, h: number, max: number) {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * s), h: Math.round(h * s) };
}
