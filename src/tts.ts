// AI voice: Azure neural voices (Urdu + English) through our Worker, and Kokoro (English) on the visitor's device.
// Each scene is spoken separately, so captions match the voice exactly.
import { AZURE_VOICES } from "../worker/core.ts";
import type { Scene } from "./script.ts";

export type VoiceEngine = "azure" | "kokoro";
export type VoiceOption = { engine: VoiceEngine; id: string; lang: "en" | "ur"; label: string };

export const KOKORO_VOICES: VoiceOption[] = [
  { engine: "kokoro", id: "af_heart", lang: "en", label: "Heart (US, female)" },
  { engine: "kokoro", id: "af_bella", lang: "en", label: "Bella (US, female)" },
  { engine: "kokoro", id: "am_michael", lang: "en", label: "Michael (US, male)" },
  { engine: "kokoro", id: "am_fenrir", lang: "en", label: "Fenrir (US, male)" },
  { engine: "kokoro", id: "bf_emma", lang: "en", label: "Emma (UK, female)" },
  { engine: "kokoro", id: "bm_george", lang: "en", label: "George (UK, male)" },
];
export const AZURE_OPTIONS: VoiceOption[] = AZURE_VOICES.map((v) => ({ engine: "azure", id: v.id, lang: v.lang, label: v.label }));

const TTS_URL = (import.meta.env.VITE_TTS_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const SITEKEY = (import.meta.env.VITE_TURNSTILE_SITEKEY as string | undefined) ?? "";
export const azureAvailable = () => !!TTS_URL && !!SITEKEY;

/** Voices offered for a language: Azure first when the Worker is configured; Kokoro for English always. */
export function voicesFor(lang: "en" | "ur"): VoiceOption[] {
  const az = azureAvailable() ? AZURE_OPTIONS.filter((v) => v.lang === lang) : [];
  return lang === "ur" ? az : [...az, ...KOKORO_VOICES];
}

export const GAP_SEC = 0.25;
export const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

// ---- Kokoro (on device) ----
type Kokoro = { generate(text: string, o: { voice: string; speed?: number }): Promise<{ audio: Float32Array; sampling_rate: number }> };
let kokoro: Promise<Kokoro> | null = null;
function loadKokoro(onStatus: (s: string) => void): Promise<Kokoro> {
  if (kokoro) return kokoro;
  kokoro = (async () => {
    const [{ KokoroTTS }, { env }] = await Promise.all([import("kokoro-js"), import("@huggingface/transformers")]);
    // Run the model in a background worker so the page stays responsive while the voice is made.
    const wasm = env.backends.onnx.wasm as { proxy?: boolean } | undefined;
    if (wasm) wasm.proxy = true;
    return (await KokoroTTS.from_pretrained(KOKORO_MODEL, {
      dtype: "q8",
      device: "wasm",
      progress_callback: (e: { status?: string; progress?: number; file?: string }) => {
        if (e.status === "progress" && typeof e.progress === "number" && e.file?.endsWith(".onnx")) onStatus(`Downloading the free AI voice (once, about 92 MB): ${Math.round(e.progress)}%`);
      },
    })) as unknown as Kokoro;
  })();
  kokoro.catch(() => (kokoro = null));
  return kokoro;
}

// ---- Azure (through the Worker) ----
let session: { token: string; exp: number } | null = null;

function turnstileToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const run = () => {
      const w = window as unknown as { turnstile?: { render(el: HTMLElement, o: Record<string, unknown>): string } };
      let box = document.getElementById("ts-box");
      if (!box) {
        box = document.createElement("div");
        box.id = "ts-box";
        document.getElementById("voiceBox")?.append(box);
      }
      box.innerHTML = "";
      w.turnstile!.render(box, { sitekey: SITEKEY, callback: resolve, "error-callback": () => reject(new Error("The bot check did not load. Press Retry.")) });
    };
    if ((window as unknown as { turnstile?: unknown }).turnstile) return run();
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = run;
    s.onerror = () => reject(new Error("The bot check could not load. Check your connection and press Retry."));
    document.head.append(s);
  });
}

async function azureSession(): Promise<string> {
  if (session && session.exp > Date.now() + 30000) return session.token;
  const token = await turnstileToken();
  const r = await fetch(`${TTS_URL}/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turnstile: token }) });
  const j = (await r.json().catch(() => ({}))) as { session?: string; error?: string };
  if (!r.ok || !j.session) throw new Error(j.error ?? "Could not start the voice session. Press Retry.");
  session = { token: j.session, exp: Date.now() + 14 * 60 * 1000 };
  return j.session;
}

export class QuotaError extends Error {}

async function azureScene(text: string, voice: string): Promise<ArrayBuffer> {
  const r = await fetch(`${TTS_URL}/tts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice, session: await azureSession() }) });
  if (r.ok) return r.arrayBuffer();
  const j = (await r.json().catch(() => ({}))) as { error?: string; quota?: boolean };
  if (r.status === 401) session = null;
  if (j.quota) throw new QuotaError(j.error ?? "The free AI voice is used up for now.");
  throw new Error(j.error ?? `The voice service did not answer (HTTP ${r.status}). Press Retry.`);
}

// ---- Joining scenes ----
const RATE = 48000;

async function toBuffer(ctx: BaseAudioContext, part: ArrayBuffer | { audio: Float32Array; sampling_rate: number }): Promise<AudioBuffer> {
  if (part instanceof ArrayBuffer) return ctx.decodeAudioData(part);
  const b = new AudioBuffer({ length: part.audio.length, sampleRate: part.sampling_rate, numberOfChannels: 1 });
  b.copyToChannel(part.audio as Float32Array<ArrayBuffer>, 0);
  return b;
}

export type SpokenScript = { buffer: AudioBuffer; durations: number[]; engineUsed: VoiceEngine; note?: string };

/** Speaks every scene and joins them with short pauses. Durations are per scene (voice + pause). */
export async function speakScenes(scenes: Scene[], voice: VoiceOption, onStatus: (s: string) => void): Promise<SpokenScript> {
  const decodeCtx = new OfflineAudioContext(1, RATE, RATE);
  const parts: AudioBuffer[] = [];
  let engine = voice.engine;
  let note: string | undefined;
  for (let i = 0; i < scenes.length; i++) {
    onStatus(`AI voice ${i + 1}/${scenes.length}…`);
    if (engine === "azure") {
      try {
        parts.push(await toBuffer(decodeCtx, await azureScene(scenes[i].text, voice.id)));
        continue;
      } catch (e) {
        // When the free Azure quota is used up, English falls back to the on-device voice. Urdu has no fallback.
        if (!(e instanceof QuotaError) || voice.lang !== "en") throw e;
        engine = "kokoro";
        note = "The online voice is used up for now, so this video uses the free on-device voice.";
        parts.length = 0;
        i = -1;
        continue;
      }
    }
    let tts: Kokoro;
    try {
      tts = await loadKokoro(onStatus);
    } catch {
      throw new Error("The free AI voice could not load. Check your connection and press Retry.");
    }
    const kv = voice.engine === "kokoro" ? voice.id : "af_heart";
    parts.push(await toBuffer(decodeCtx, await tts.generate(scenes[i].text, { voice: kv })));
  }
  const durations = parts.map((p) => p.duration + GAP_SEC);
  const total = durations.reduce((a, b) => a + b, 0);
  const mix = new OfflineAudioContext(1, Math.ceil(total * RATE), RATE);
  let t = 0;
  parts.forEach((p, k) => {
    const src = mix.createBufferSource();
    src.buffer = p;
    src.connect(mix.destination);
    src.start(t);
    t += durations[k];
  });
  return { buffer: await mix.startRendering(), durations, engineUsed: engine, note };
}
