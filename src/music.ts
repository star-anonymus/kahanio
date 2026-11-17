// Our own background music, made from notes at render time: no licence, no download, no Content ID match.

export type Chord = { t: number; dur: number; notes: number[] };
export type MusicPlan = { bpm: number; chords: Chord[]; kicks: number[]; hats: number[] };

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// MIDI notes for a few calm, upbeat four-bar progressions.
export const PROGRESSIONS: number[][][] = [
  [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], // Am F C G
  [[48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60]], // C G Am F
  [[50, 53, 57], [55, 59, 62], [48, 52, 55], [57, 60, 64]], // Dm G C Am
];

export function planMusic(durationSec: number, seed = 1, bpm = 92): MusicPlan {
  const rnd = mulberry32(seed);
  const prog = PROGRESSIONS[Math.floor(rnd() * PROGRESSIONS.length)];
  const beat = 60 / bpm;
  const bar = beat * 4;
  const chords: Chord[] = [];
  const kicks: number[] = [];
  const hats: number[] = [];
  for (let i = 0, t = 0; t < durationSec; i++, t += bar) {
    chords.push({ t, dur: bar, notes: prog[i % prog.length] });
    for (let b = 0; b < 4; b++) {
      const bt = t + b * beat;
      if (bt >= durationSec) break;
      if (b === 0 || b === 2) kicks.push(bt);
      if (bt + beat / 2 < durationSec) hats.push(bt + beat / 2);
    }
  }
  return { bpm, chords, kicks, hats };
}

export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
