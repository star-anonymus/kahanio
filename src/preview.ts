// Live preview on the page: plays the current script with the same drawing code as the final video.
import type { StyleId } from "./styles.ts";
import { drawEndCard, drawScene } from "./draw.ts";
import { END_CARD_SEC, type Format } from "./render.ts";
import type { Scene } from "./script.ts";
import { captionChunks, findIndex, sceneTimings } from "./timing.ts";

export type PreviewState = { scenes: Scene[]; format: Format; aiLabel: boolean; style: StyleId; topic: string };

export function startPreview(canvas: HTMLCanvasElement, getState: () => PreviewState) {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;
  let key = "";
  let spans: ReturnType<typeof sceneTimings> = [];
  let caps: ReturnType<typeof captionChunks>[] = [];
  let t0 = performance.now();

  const frame = (now: number) => {
    requestAnimationFrame(frame);
    if (document.hidden || canvas.offsetParent === null) return;
    const r = canvas.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return; // off screen: save the battery
    const s = getState();
    const k = JSON.stringify(s);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (k !== key) {
      key = k;
      spans = sceneTimings(s.scenes);
      caps = s.scenes.map((sc, i) => captionChunks(sc.text, spans[i]));
      t0 = now;
    }
    const body = spans.length ? spans[spans.length - 1].end : 0;
    const total = body + END_CARD_SEC;
    const t = ((now - t0) / 1000) % total;
    if (t < body) {
      const i = findIndex(spans, t);
      drawScene(ctx, { w, h, t, total: body, sceneIndex: i, sceneCount: spans.length, sceneStart: spans[i].start, sceneEnd: spans[i].end, clip: null, captions: caps[i], aiLabel: s.aiLabel, style: s.style, topic: s.topic });
    } else drawEndCard(ctx, w, h, t - body, [], s.aiLabel);
  };
  requestAnimationFrame(frame);
}
