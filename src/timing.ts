import type { Scene } from "./script.ts";

export type Span = { start: number; end: number };
export type Word = { w: string; start: number; end: number };
export type Caption = { text: string; start: number; end: number; words: Word[] };

export const WORDS_PER_SEC = 2.6;
export const MIN_SCENE_SEC = 2.2;

export function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/**
 * Gives each scene a time span. Without a voice, length follows a calm reading pace.
 * With a voice of known length, the spans are scaled to fill it exactly.
 */
export function sceneTimings(scenes: Scene[], totalSec?: number): Span[] {
  const natural = scenes.map((s) => Math.max(MIN_SCENE_SEC, wordCount(s.text) / WORDS_PER_SEC + 0.4));
  const sum = natural.reduce((a, b) => a + b, 0);
  const scale = totalSec && totalSec > 0 && sum > 0 ? totalSec / sum : 1;
  const spans: Span[] = [];
  let t = 0;
  for (const d of natural) {
    const end = t + d * scale;
    spans.push({ start: t, end });
    t = end;
  }
  return spans;
}

/** Splits a scene into short on-screen caption chunks with a time for every word (weighted by letters). */
export function captionChunks(text: string, span: Span, maxWords = 4): Caption[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const weights = words.map((w) => w.length + 2);
  const total = weights.reduce((a, b) => a + b, 0);
  const dur = span.end - span.start;
  const timed: Word[] = [];
  let t = span.start;
  words.forEach((w, i) => {
    const d = (weights[i] / total) * dur;
    timed.push({ w, start: t, end: t + d });
    t += d;
  });
  const out: Caption[] = [];
  for (let i = 0; i < timed.length; i += maxWords) {
    const group = timed.slice(i, i + maxWords);
    out.push({ text: group.map((g) => g.w).join(" "), start: group[0].start, end: group[group.length - 1].end, words: group });
  }
  return out;
}

/** Index of the span that contains time t (the last one once t is past the end). */
export function findIndex(spans: Span[], t: number): number {
  for (let i = 0; i < spans.length; i++) if (t < spans[i].end) return i;
  return spans.length - 1;
}

/** Greedy line wrap with a caller-supplied text measure, so it can be tested without a canvas. */
export function wrapWords(words: string[], maxWidth: number, measure: (s: string) => number): string[][] {
  const lines: string[][] = [];
  let cur: string[] = [];
  for (const w of words) {
    const next = [...cur, w];
    if (cur.length && measure(next.join(" ")) > maxWidth) {
      lines.push(cur);
      cur = [w];
    } else cur = next;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

/** SubRip text for the captions, so users can upload real subtitles to YouTube too. */
export function toSrt(captions: Caption[]): string {
  const ts = (s: number) => {
    const ms = Math.round(s * 1000);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    const r = ms % 1000;
    const p = (n: number, l = 2) => String(n).padStart(l, "0");
    return `${p(h)}:${p(m)}:${p(sec)},${p(r, 3)}`;
  };
  return captions.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join("\n");
}
