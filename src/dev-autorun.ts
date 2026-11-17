// Development only (never in the build): renders a sample from samples/<name>.json and saves it through the dev server.
import type { Job } from "./main.ts";
import { parseScript } from "./script.ts";

type RunJob = (job: Job, onProgress: (f: number, label: string) => void) => Promise<{ blob: Blob; seconds: number; warnings: string[] }>;
type Sample = { script: string; format: Job["format"]; seed: number; style?: Job["style"]; topic?: string };

declare global {
  interface Window {
    __devStatus?: string;
  }
}

export async function autorun(runJob: RunJob) {
  const q = new URLSearchParams(location.search);
  const name = q.get("auto");
  const out = q.get("out");
  const photoUrls = (q.get("photos") ?? "").split(",").filter((p) => /^dev-photos\/[\w.-]+$/.test(p));
  if (!name || !/^[a-z0-9-]+$/.test(name)) return;
  window.__devStatus = "starting";
  try {
    const sample = (await (await fetch(`/__sample?name=${name}`)).json()) as Sample;
    const box = (window as unknown as { __photos?: { addFromUrls(u: string[], d: boolean): Promise<void>; get(): Job["photos"] } }).__photos;
    if (photoUrls.length && box) {
      window.__devStatus = "loading photos";
      await box.addFromUrls(photoUrls.map((p) => "/" + p), q.get("depth") !== "0");
    }
    const scenes = parseScript(sample.script);
    let voice: AudioBuffer | undefined;
    let sceneDurations: number[] | undefined;
    const vq = q.get("voice");
    if (vq) {
      const { KOKORO_VOICES, speakScenes } = await import("./tts.ts");
      const opt = KOKORO_VOICES.find((v) => v.id === vq);
      if (!opt) throw new Error("unknown voice " + vq);
      const t0 = performance.now();
      const sp = await speakScenes(scenes, opt, (m) => (window.__devStatus = m));
      voice = sp.buffer;
      sceneDurations = sp.durations;
      (window as unknown as { __ttsMs?: number }).__ttsMs = Math.round(performance.now() - t0);
    }
    const res = await runJob(
      { voice, sceneDurations, scenes, format: sample.format, music: true, aiLabel: true, keys: {}, seed: sample.seed, style: (q.get("style") as Job["style"]) ?? sample.style, topic: sample.topic, photos: box?.get(), character: (q.get("char") as Job["character"]) ?? undefined },
      (f, label) => (window.__devStatus = `${label} ${Math.round(f * 100)}%`),
    );
    const target = out && /^[a-z0-9-]+$/.test(out) ? `/__save?name=${out}&dir=photo` : `/__save?name=${name}`;
    const r = await fetch(target, { method: "POST", body: res.blob });
    window.__devStatus = r.ok ? `saved ${Math.round(res.seconds)}s ${res.blob.size} bytes` : `save failed ${r.status}`;
  } catch (e) {
    window.__devStatus = `error: ${(e as Error).message}`;
  }
}
