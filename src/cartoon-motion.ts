// How a cartoon presenter moves: lip-sync, blinks, gestures and idle sway. Pure functions, tested without a browser.
import { clamp01, easeInOutCubic } from "./ease.ts";
import type { Word } from "./timing.ts";

export type CharacterPose = { open: number; blink: number; happy: number; look: number; brow: number; tilt: number; bob: number; gesture: number };

/** Mouth opening from word timing: each word opens and closes once per rough syllable; closed between words. */
export function mouthFromWords(words: Word[], t: number): number {
  const w = words.find((x) => t >= x.start && t < x.end);
  if (!w) return 0;
  const syll = Math.max(1, Math.round(w.w.replace(/[^\p{L}]/gu, "").length / 3));
  const p = (t - w.start) / Math.max(0.01, w.end - w.start);
  return 0.12 + 0.68 * Math.abs(Math.sin(Math.PI * syll * p));
}

/** Loudness per video frame (0..1) from the user's recorded voice, for lip-sync to their real voice. */
export function voiceEnvelope(samples: Float32Array, sampleRate: number, fps: number): number[] {
  const step = sampleRate / fps;
  const out: number[] = [];
  let peak = 1e-6;
  for (let f = 0; f * step < samples.length; f++) {
    let sum = 0;
    const a = Math.floor(f * step);
    const b = Math.min(samples.length, Math.floor((f + 1) * step));
    for (let i = a; i < b; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / Math.max(1, b - a));
    out.push(rms);
    if (rms > peak) peak = rms;
  }
  // Normalise, ignore room noise, and smooth so the mouth does not flutter.
  let prev = 0;
  return out.map((v) => {
    const n = clamp01((v / peak - 0.08) / 0.6);
    prev = prev * 0.45 + n * 0.55;
    return prev;
  });
}

/** Short blink every few seconds, at slightly irregular times (deterministic for a given seed). */
export function blinkAt(t: number, seed = 0): number {
  const period = 3.3;
  const k = Math.floor((t + seed * 0.37) / period);
  const jitter = ((Math.sin(k * 12.9898 + seed) * 43758.5453) % 1 + 1) % 1;
  const start = k * period + jitter * 1.4 - seed * 0.37;
  const d = t - start;
  if (d < 0 || d > 0.16) return 0;
  return Math.sin((d / 0.16) * Math.PI);
}

export type PoseInput = {
  t: number;
  sceneIndex: number;
  sceneCount: number;
  sceneStart: number;
  sceneEnd: number;
  words: Word[];
  voiceLevel?: number;
  seed?: number;
};

/** The full pose for one frame. Gestures rise at the start of every other scene; the last scene ends happy. */
export function cartoonPose(i: PoseInput): CharacterPose {
  const since = i.t - i.sceneStart;
  const left = i.sceneEnd - i.t;
  const talking = i.voiceLevel !== undefined ? 0.1 + 0.75 * i.voiceLevel : mouthFromWords(i.words, i.t);
  const gestureScene = i.sceneIndex % 2 === 1;
  const up = easeInOutCubic(clamp01(since / 0.5));
  const down = easeInOutCubic(clamp01(left / 0.5));
  const last = i.sceneIndex === i.sceneCount - 1;
  return {
    open: last && left < 0.6 ? 0 : clamp01(talking),
    blink: blinkAt(i.t, i.seed ?? 0),
    happy: last && left < 0.6 ? 1 : 0,
    look: 0.25 * Math.sin(i.t * 0.7 + (i.seed ?? 0)),
    brow: since < 0.4 ? 0.6 * (1 - since / 0.4) : 0,
    tilt: 2.2 * Math.sin(i.t * 1.1),
    bob: 3 * Math.sin(i.t * 2.2),
    gesture: gestureScene ? 0.85 * Math.min(up, down) : 0,
  };
}
