// Renders the whole video in the visitor's browser with WebCodecs (through Mediabunny) into an MP4. No server.
import type { StyleId } from "./styles.ts";
import { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, QUALITY_MEDIUM, canEncodeAudio, canEncodeVideo } from "mediabunny";
import { buildSoundtrack } from "./audio.ts";
import { drawEndCard, drawScene } from "./draw.ts";
import type { Scene } from "./script.ts";
import type { Clip } from "./stock.ts";
import { creditLines } from "./stock.ts";
import { motionAt, motionForScene } from "./motion.ts";
import { ParallaxRenderer, type PhotoLayer } from "./parallax.ts";
import { type Caption, captionChunks, findIndex, sceneTimings, toSrt } from "./timing.ts";

export type Format = "9:16" | "16:9";
export const FPS = 30;
export const END_CARD_SEC = 2.5;

export type RenderJob = {
  scenes: Scene[];
  format: Format;
  clips: (Clip | null)[];
  voice?: AudioBuffer;
  music: boolean;
  aiLabel: boolean;
  style?: StyleId;
  topic?: string;
  photos?: PhotoLayer[];
  seed: number;
};
export type RenderResult = { blob: Blob; srt: string; credits: string[]; seconds: number; warnings: string[] };

export function sizeFor(format: Format) {
  return format === "9:16" ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 };
}

export function browserCanRender(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof AudioEncoder !== "undefined" && typeof OfflineAudioContext !== "undefined";
}

function loadVideo(url: string, signal?: AbortSignal): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    const t = setTimeout(() => reject(new Error("timeout")), 30000);
    v.onloadeddata = () => {
      clearTimeout(t);
      resolve(v);
    };
    v.onerror = () => {
      clearTimeout(t);
      reject(new Error("load"));
    };
    signal?.addEventListener("abort", () => reject(new Error("aborted")));
    v.src = url;
  });
}

function seek(v: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(v.currentTime - time) < 0.004) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      v.removeEventListener("seeked", done);
      resolve();
    };
    v.addEventListener("seeked", done);
    v.currentTime = time;
    setTimeout(done, 2000); // never hang on one frame
  });
}

export async function renderVideo(job: RenderJob, onProgress: (fraction: number, label: string) => void, signal?: AbortSignal): Promise<RenderResult> {
  const warnings: string[] = [];
  const { w, h } = sizeFor(job.format);
  const spans = sceneTimings(job.scenes, job.voice?.duration);
  const body = spans.length ? spans[spans.length - 1].end : 0;
  const total = body + END_CARD_SEC;
  const captions: Caption[][] = job.scenes.map((s, i) => captionChunks(s.text, spans[i]));

  onProgress(0.02, "Loading clips");
  const videos: (HTMLVideoElement | null)[] = [];
  for (let i = 0; i < job.clips.length; i++) {
    const c = job.clips[i];
    if (!c) {
      videos.push(null);
      continue;
    }
    try {
      videos.push(await loadVideo(c.url, signal));
    } catch {
      warnings.push(`Clip for scene ${i + 1} would not load, so that scene uses the animated background.`);
      videos.push(null);
    }
  }
  const credits = creditLines(job.clips.filter((c, i): c is Clip => !!c && !!videos[i]).map((c) => c.credit));

  onProgress(0.06, "Mixing sound");
  const audio = await buildSoundtrack(total, { music: job.music, seed: job.seed, voice: job.voice });

  const videoCodec = (await canEncodeVideo("avc", { width: w, height: h })) ? "avc" : "vp9";
  const audioCodec = (await canEncodeAudio("aac")) ? "aac" : "opus";
  const photos = job.photos ?? [];
  let parallax: ParallaxRenderer | null = null;
  if (photos.length) {
    try {
      parallax = new ParallaxRenderer(w, h);
    } catch (e) {
      warnings.push(`${(e as Error).message} Photo scenes use the animated background.`);
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("This browser could not open a drawing canvas.");

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const vsrc = new CanvasSource(canvas, { codec: videoCodec, bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
  const asrc = new AudioBufferSource({ codec: audioCodec, bitrate: QUALITY_MEDIUM });
  output.addVideoTrack(vsrc, { frameRate: FPS });
  output.addAudioTrack(asrc);
  await output.start();
  await asrc.add(audio);
  asrc.close();

  const frames = Math.ceil(total * FPS);
  for (let n = 0; n < frames; n++) {
    if (signal?.aborted) {
      await output.cancel();
      throw new Error("Stopped.");
    }
    const t = n / FPS;
    if (t < body) {
      const i = findIndex(spans, t);
      const video = videos[i];
      if (video) await seek(video, (t - spans[i].start) % Math.max(0.5, video.duration - 0.1));
      const photo = !video && photos.length ? photos[i % photos.length] : null;
      const local = (t - spans[i].start) / Math.max(0.001, spans[i].end - spans[i].start);
      const clip = video ?? (photo && parallax ? parallax.render(photo, motionAt(motionForScene(i), local)) : null);
      drawScene(ctx, {
        w,
        h,
        t,
        total: body,
        sceneIndex: i,
        sceneCount: spans.length,
        sceneStart: spans[i].start,
        sceneEnd: spans[i].end,
        clip,
        captions: captions[i],
        aiLabel: job.aiLabel,
        style: job.style,
        topic: job.topic,
      });
    } else drawEndCard(ctx, w, h, t - body, credits, job.aiLabel);
    await vsrc.add(t, 1 / FPS);
    if (n % 15 === 0) onProgress(0.08 + 0.9 * (n / frames), `Rendering ${Math.round((n / frames) * 100)}%`);
  }
  vsrc.close();
  await output.finalize();
  const buf = output.target.buffer;
  if (!buf) throw new Error("The video file came out empty. Press Retry.");
  onProgress(1, "Done");
  return { blob: new Blob([buf], { type: "video/mp4" }), srt: toSrt(captions.flat()), credits, seconds: total, warnings };
}
