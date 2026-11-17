// Development only (never in the build): renders a sample from samples/<name>.json and saves it through the dev server.
import type { Job } from "./main.ts";
import { parseScript } from "./script.ts";

type RunJob = (job: Job, onProgress: (f: number, label: string) => void) => Promise<{ blob: Blob; seconds: number; warnings: string[] }>;
type Sample = { script: string; format: Job["format"]; seed: number };

declare global {
  interface Window {
    __devStatus?: string;
  }
}

export async function autorun(runJob: RunJob) {
  const name = new URLSearchParams(location.search).get("auto");
  if (!name || !/^[a-z0-9-]+$/.test(name)) return;
  window.__devStatus = "starting";
  try {
    const sample = (await (await fetch(`/__sample?name=${name}`)).json()) as Sample;
    const res = await runJob(
      { scenes: parseScript(sample.script), format: sample.format, music: true, aiLabel: true, keys: {}, seed: sample.seed },
      (f, label) => (window.__devStatus = `${label} ${Math.round(f * 100)}%`),
    );
    const r = await fetch(`/__save?name=${name}`, { method: "POST", body: res.blob });
    window.__devStatus = r.ok ? `saved ${Math.round(res.seconds)}s ${res.blob.size} bytes` : `save failed ${r.status}`;
  } catch (e) {
    window.__devStatus = `error: ${(e as Error).message}`;
  }
}
