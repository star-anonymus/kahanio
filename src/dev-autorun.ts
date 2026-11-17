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
    const res = await runJob(
      { scenes: parseScript(sample.script), format: sample.format, music: true, aiLabel: true, keys: {}, seed: sample.seed, style: (q.get("style") as Job["style"]) ?? sample.style, topic: sample.topic, photos: box?.get(), character: (q.get("char") as Job["character"]) ?? undefined },
      (f, label) => (window.__devStatus = `${label} ${Math.round(f * 100)}%`),
    );
    const target = out && /^[a-z0-9-]+$/.test(out) ? `/__save?name=${out}&dir=photo` : `/__save?name=${name}`;
    const r = await fetch(target, { method: "POST", body: res.blob });
    window.__devStatus = r.ok ? `saved ${Math.round(res.seconds)}s ${res.blob.size} bytes` : `save failed ${r.status}`;
  } catch (e) {
    window.__devStatus = `error: ${(e as Error).message}`;
  }
}
