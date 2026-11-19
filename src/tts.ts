// AI voice: FameSpeak free voices (Urdu + English) through our Worker, and Kokoro (English) on the visitor's device.
// Text in Hindi script is converted to Urdu script before an Urdu voice speaks it (captions keep the Hindi).
// Each scene is spoken separately, so captions match the voice exactly.
import { ONLINE_VOICES } from "../worker/core.ts";
import { devanagariToUrdu, hasDevanagari } from "./translit.ts";
import type { Scene } from "./script.ts";

export type VoiceEngine = "online" | "kokoro";
export type VoiceOption = { engine: VoiceEngine; id: string; lang: "en" | "ur" | "hi"; label: string };

export const KOKORO_VOICES: VoiceOption[] = [
  { engine: "kokoro", id: "af_heart", lang: "en", label: "Heart (US, female)" },
  { engine: "kokoro", id: "af_bella", lang: "en", label: "Bella (US, female)" },
  { engine: "kokoro", id: "am_michael", lang: "en", label: "Michael (US, male)" },
  { engine: "kokoro", id: "am_fenrir", lang: "en", label: "Fenrir (US, male)" },
  { engine: "kokoro", id: "bf_emma", lang: "en", label: "Emma (UK, female)" },
  { engine: "kokoro", id: "bm_george", lang: "en", label: "George (UK, male)" },
];
export const ONLINE_OPTIONS: VoiceOption[] = ONLINE_VOICES.map((v) => ({ engine: "online", id: v.id, lang: v.lang, label: v.label }));

const TTS_URL = (import.meta.env.VITE_TTS_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const SITEKEY = (import.meta.env.VITE_TURNSTILE_SITEKEY as string | undefined) ?? "";
export const onlineAvailable = () => !!TTS_URL && !!SITEKEY;

/** Voice languages offered in step 3. "hiur" = Hindi script spoken by an Urdu voice. Kokoro covers English always. */
export type VoiceLang = "en" | "ur" | "hiur" | "hi";
export function voicesFor(lang: VoiceLang): VoiceOption[] {
  const want = lang === "hiur" ? "ur" : lang;
  const online = onlineAvailable() ? ONLINE_OPTIONS.filter((v) => v.lang === want) : [];
  return want === "en" ? [...online, ...KOKORO_VOICES] : online;
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

// ---- FameSpeak (through the Worker) ----
/** fetch to our Worker with a readable error instead of the browser's bare "Failed to fetch". */
async function reach(path: string, body: unknown, what: string): Promise<Response> {
  try {
    return await fetch(`${TTS_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error(`Could not reach the ${what} server (${TTS_URL.replace(/^https?:\/\//, "")}). Check your connection or pause an ad blocker for this site, then press Retry.`);
  }
}

let session: { token: string; exp: number } | null = null;

/** Plain words for Cloudflare Turnstile error codes (from Cloudflare's client-side error code list). */
export function turnstileMessage(code: string): string {
  const c = String(code);
  if (/^(110100|110110|110200|400020)/.test(c)) return `The bot check is not set up for this address (code ${c}). Please tell us at clientorahq.com.`;
  if (/^(300|600)/.test(c))
    return `The bot check could not finish in this browser (code ${c}). An ad blocker or strict privacy setting often causes this: pause it for this site, or try another browser, then press Retry.`;
  return `The bot check did not load (code ${c}). Press Retry.`;
}

// A token that arrived after we stopped waiting (the visitor ticked late). Cloudflare tokens live 300 s; reuse it on Retry.
let lateToken: { t: string; at: number } | null = null;

function turnstileToken(onStatus: (s: string) => void, anchor?: HTMLElement | null): Promise<string> {
  if (lateToken && Date.now() - lateToken.at < 240000) {
    const t = lateToken.t;
    lateToken = null;
    return Promise.resolve(t);
  }
  return new Promise((resolve, reject) => {
    const run = () => {
      const w = window as unknown as { turnstile?: { render(el: HTMLElement, o: Record<string, unknown>): string; reset(id: string): void } };
      let box = document.getElementById("ts-box");
      if (!box) {
        box = document.createElement("div");
        box.id = "ts-box";
      }
      // Show the check next to the button the visitor pressed (script step or voice step).
      const host = anchor ?? document.getElementById("voiceBox");
      if (host && box.parentElement !== host.parentElement) host.after(box);
      else if (!box.parentElement) document.getElementById("voiceBox")?.append(box);
      box.innerHTML = "";
      let done = false;
      // Never hang, but give a person time to tick: two minutes, with the reason in plain words.
      const timer = setTimeout(() => {
        done = true;
        reject(new Error("The bot check was not completed. Tick the box, then press Retry."));
      }, 120000);
      // If no token after a few seconds, Cloudflare wants a click: say so (some widgets never fire the callback below).
      const hint = setTimeout(() => {
        onStatus("Quick check: tick the box to continue.");
        box!.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 3000);
      let resets = 0;
      let widget = "";
      widget = w.turnstile!.render(box, {
        sitekey: SITEKEY,
        // We reset the widget ourselves on a failure (twice), so it never hangs and never loops forever.
        retry: "never",
        "before-interactive-callback": () => {
          onStatus("Quick check: tick the box to continue.");
          box!.scrollIntoView({ block: "center", behavior: "smooth" });
        },
        callback: (t: string) => {
          clearTimeout(timer);
          clearTimeout(hint);
          if (done) lateToken = { t, at: Date.now() };
          else resolve(t);
        },
        "error-callback": (code: string) => {
          // Client-side hiccups (e.g. 300030, often caused by a blocker or a slow page) usually pass on a fresh try.
          if (resets < 2 && widget) {
            resets++;
            onStatus("The bot check hiccuped. Trying it again…");
            setTimeout(() => w.turnstile!.reset(widget), 800);
            return true;
          }
          clearTimeout(timer);
          clearTimeout(hint);
          done = true;
          reject(new Error(turnstileMessage(String(code))));
          return true;
        },
      });
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

// One bot check at a time: voice, footage and script share the same session, so parallel calls wait for one check
// instead of each drawing a new box over the other (which left the first one waiting forever).
let pendingSession: Promise<string> | null = null;

async function onlineSession(onStatus: (s: string) => void, anchor?: HTMLElement | null): Promise<string> {
  if (session && session.exp > Date.now() + 30000) return session.token;
  if (pendingSession) return pendingSession;
  pendingSession = (async () => {
    const token = await turnstileToken(onStatus, anchor);
    const r = await reach("/session", { turnstile: token }, "bot-check");
    const j = (await r.json().catch(() => ({}))) as { session?: string; error?: string };
    if (!r.ok || !j.session) throw new Error(j.error ?? "Could not start the session. Press Retry.");
    session = { token: j.session, exp: Date.now() + 14 * 60 * 1000 };
    document.getElementById("ts-box")?.replaceChildren();
    return j.session;
  })();
  try {
    return await pendingSession;
  } finally {
    pendingSession = null;
  }
}

export class QuotaError extends Error {}

/** One scene through the Worker. Waits and retries while the voice service is busy (it makes one voice at a time). */
async function onlineScene(text: string, voice: string, onStatus: (s: string) => void): Promise<ArrayBuffer> {
  let netFails = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    // The bot check runs first and outside the retry below: its own errors (not ticked, expired) must show as they are.
    const s = await onlineSession(onStatus);
    let r: Response;
    try {
      r = await reach("/tts", { text, voice, session: s }, "voice");
    } catch (e) {
      // A dropped connection (e.g. the edge timing out while the voice service was busy) is retried like "busy",
      // three times with growing gaps, before the visitor sees an error.
      if (++netFails > 3) throw e;
      onStatus("The voice server is slow right now. Trying again…");
      await new Promise((res) => setTimeout(res, 2500 * netFails));
      attempt--;
      continue;
    }
    if (r.ok) return r.arrayBuffer();
    const j = (await r.json().catch(() => ({}))) as { error?: string; busy?: boolean; quota?: boolean };
    if (r.status === 401 && attempt === 0) {
      session = null;
      continue;
    }
    if (j.busy) {
      onStatus("Many people are making voices right now. Waiting for your turn…");
      await new Promise((res) => setTimeout(res, 3000 * (attempt + 1)));
      continue;
    }
    if (j.quota) throw new QuotaError(j.error ?? "The online voice is not available right now.");
    throw new Error(j.error ?? `The voice service did not answer (HTTP ${r.status}). Press Retry.`);
  }
  throw new QuotaError("The online voice is very busy right now.");
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
    if (engine === "online") {
      // Urdu voices read Urdu script: convert Hindi-script text first (the captions keep what the user wrote).
      const text = voice.lang === "ur" && hasDevanagari(scenes[i].text) ? devanagariToUrdu(scenes[i].text) : scenes[i].text;
      try {
        parts.push(await toBuffer(decodeCtx, await onlineScene(text, voice.id, onStatus)));
        continue;
      } catch (e) {
        // When the online voice is unavailable or too busy, English falls back to the on-device voice. Urdu has no fallback.
        if (!(e instanceof QuotaError) || voice.lang !== "en") throw e;
        engine = "kokoro";
        note = "The online voice was busy, so this video uses the free on-device voice.";
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

// ---- Free stock footage through the same Worker (Pexels, owner's free key) ----
export class StockUnavailable extends Error {}

/** Finds one real clip for a scene. The clip streams through the Worker so the browser may draw it. */
export async function findStockClip(keywords: string[], orientation: "portrait" | "landscape", used: Set<string>, onStatus: (s: string) => void): Promise<import("./stock.ts").Clip | null> {
  const s = await onlineSession(onStatus);
  const r = await reach("/stock", { q: keywords.join(" ") || "city", orientation, session: s }, "stock footage");
  const j = (await r.json().catch(() => ({}))) as { clips?: { id: string; file: string; author: string; page: string }[]; error?: string };
  if (r.status === 503) throw new StockUnavailable(j.error ?? "Stock footage is not set up yet.");
  if (!r.ok) throw new Error(j.error ?? `Stock search failed (HTTP ${r.status}).`);
  const c = (j.clips ?? []).find((x) => !used.has(x.id));
  if (!c) return null;
  return { id: c.id, url: `${TTS_URL}/clip?u=${encodeURIComponent(c.file)}&s=${encodeURIComponent(s)}`, credit: { source: "Pexels", author: c.author, url: c.page } };
}

/** Free AI script through our Worker (the owner's free model keys stay on the server). Same bot-check session as the voice. */
export async function workerScript(
  req: { topic: string; lang: "en" | "ur" | "hi"; seconds: number; platformSafe: boolean },
  onStatus: (s: string) => void,
  anchor?: HTMLElement | null,
): Promise<string> {
  if (!TTS_URL) throw new Error("Free AI scripts are not available here. Write the script yourself or use your own key.");
  const session = await onlineSession(onStatus, anchor);
  onStatus("Writing your script…");
  let r: Response;
  try {
    r = await fetch(`${TTS_URL}/script`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...req, session }) });
  } catch {
    throw new Error("Could not reach the free AI. Check your connection and press Get script again.");
  }
  const j = (await r.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!r.ok || !j.text) throw new Error(j.error ?? `The free AI did not answer (HTTP ${r.status}). Press Get script again.`);
  return j.text;
}
