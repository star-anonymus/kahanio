// Pure parts of the Kahanio voice Worker (FameSpeak free-voice proxy). Tested in Node; no Cloudflare types needed.

export type OnlineVoice = { id: string; lang: "en" | "ur" | "hi"; label: string; fsId: string };

/** FameSpeak free voices (no credits). Only these can be requested. */
export const ONLINE_VOICES: OnlineVoice[] = [
  { id: "ur-uzma", lang: "ur", label: "Uzma (Urdu, female)", fsId: "fs_voice_9d9edf25712584d15d09" },
  { id: "ur-asad", lang: "ur", label: "Asad (Urdu, male)", fsId: "fs_voice_78271f9f85daeffd9291" },
  { id: "hi-swara", lang: "hi", label: "Swara (Hindi, female)", fsId: "fs_voice_ca3c966d0b7284655bb2" },
  { id: "hi-madhur", lang: "hi", label: "Madhur (Hindi, male)", fsId: "fs_voice_677d98c1ff2aa996b4c4" },
  { id: "en-ava", lang: "en", label: "Ava (US, female)", fsId: "fs_voice_d1db4bca4b762fc387be" },
  { id: "en-andrew", lang: "en", label: "Andrew (US, male)", fsId: "fs_voice_edd943a5f6396d24a8c4" },
  { id: "en-emma", lang: "en", label: "Emma (US, female)", fsId: "fs_voice_ba59c0a1e557b17c8318" },
  { id: "en-brian", lang: "en", label: "Brian (US, male)", fsId: "fs_voice_77a11b336a8871de26b1" },
];

export const MAX_CHARS = 600;
export const SESSION_SECONDS = 15 * 60;
export const FAMESPEAK_API = "https://famespeak.online/api/v1";

export type TtsRequest = { text: string; voice: string; session: string };

/** Checks a /tts body. Returns the cleaned request, or a reason the visitor can read. */
export function validateTts(body: unknown): TtsRequest | { error: string } {
  if (!body || typeof body !== "object") return { error: "Bad request." };
  const b = body as Record<string, unknown>;
  const text = typeof b.text === "string" ? b.text.replace(/\s+/g, " ").trim() : "";
  if (!text) return { error: "The scene has no text." };
  if (text.length > MAX_CHARS) return { error: `A scene can have at most ${MAX_CHARS} characters for the AI voice.` };
  if (typeof b.voice !== "string" || !ONLINE_VOICES.some((v) => v.id === b.voice)) return { error: "Unknown voice." };
  if (typeof b.session !== "string" || b.session.length > 400) return { error: "Missing session. Reload the page and try again." };
  return { text, voice: b.voice, session: b.session };
}

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** A short-lived token given after the bot check, bound to the visitor's IP. Stateless: nothing is stored. */
export async function signSession(secret: string, ip: string, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + SESSION_SECONDS;
  const payload = `${exp}.${b64url(enc.encode(ip))}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifySession(secret: string, token: string, ip: string, now = Date.now()): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [exp, ipPart, sig] = parts;
  if (!/^\d+$/.test(exp) || Number(exp) < Math.floor(now / 1000)) return false;
  if (ipPart !== b64url(enc.encode(ip))) return false;
  const expect = await hmac(secret, `${exp}.${ipPart}`);
  if (expect.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expect.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export function corsHeaders(origin: string | null, allowed: string): Record<string, string> {
  const list = allowed.split(",").map((s) => s.trim()).filter(Boolean);
  const ok = origin && list.includes(origin) ? origin : list[0] ?? "";
  return {
    "Access-Control-Allow-Origin": ok,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// ---- Free stock footage (Pexels, with the owner's free key) ----

export type StockRequest = { q: string; orientation: "portrait" | "landscape"; session: string };

export function validateStock(body: unknown): StockRequest | { error: string } {
  if (!body || typeof body !== "object") return { error: "Bad request." };
  const b = body as Record<string, unknown>;
  const q = typeof b.q === "string" ? b.q.replace(/[^\p{L}\p{N} -]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60) : "";
  if (!q) return { error: "Missing search words." };
  if (b.orientation !== "portrait" && b.orientation !== "landscape") return { error: "Bad orientation." };
  if (typeof b.session !== "string" || b.session.length > 400) return { error: "Missing session. Reload the page and try again." };
  return { q, orientation: b.orientation, session: b.session };
}

/** Only Pexels' own video CDN may be streamed through /clip (no open proxy). */
export function isPexelsVideoUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.hostname === "videos.pexels.com" && /\.mp4$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export type ScriptRequest = { topic: string; lang: "en" | "ur" | "hi"; seconds: number; platformSafe: boolean; session: string };

/** /script input: a short topic, a known language, a sane length. Nothing else reaches the AI. */
export function validateScript(body: unknown): ScriptRequest | { error: string } {
  if (!body || typeof body !== "object") return { error: "Bad request." };
  const b = body as Record<string, unknown>;
  const topic = typeof b.topic === "string" ? b.topic.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) : "";
  if (topic.length < 3) return { error: "Write a topic first (a few words)." };
  if (b.lang !== "en" && b.lang !== "ur" && b.lang !== "hi") return { error: "Unknown language." };
  const seconds = Number(b.seconds);
  if (![20, 30, 45, 60].includes(seconds)) return { error: "Unknown length." };
  if (typeof b.session !== "string" || b.session.length > 400) return { error: "Missing session. Reload the page and try again." };
  return { topic, lang: b.lang, seconds, platformSafe: b.platformSafe === true, session: b.session };
}

/** Free AI models the Worker tries in order, with the owner's free keys (Worker secrets). */
export const SCRIPT_MODELS = [
  { id: "groq", url: "https://api.groq.com/openai/v1/chat/completions", model: "openai/gpt-oss-120b", keyName: "GROQ_KEY", json: true },
  { id: "gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: "gemini-flash-latest", keyName: "GEMINI_KEY", json: true },
] as const;

// ---- Required feedback (owner rule): tool, rating, optional comment, a few settings. No personal data. ----
export const FEEDBACK_TOOLS = ["kahanio"];

export type FeedbackRow = { tool: string; rating: number; comment: string; context: string };

export function validateFeedback(body: unknown): FeedbackRow | { error: string } {
  if (!body || typeof body !== "object") return { error: "Bad request." };
  const b = body as Record<string, unknown>;
  if (typeof b.tool !== "string" || !FEEDBACK_TOOLS.includes(b.tool)) return { error: "Unknown tool." };
  const rating = Number(b.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Rating must be 1 to 5." };
  const comment = typeof b.comment === "string" ? b.comment.replace(/\s+/g, " ").trim().slice(0, 500) : "";
  const ctx: Record<string, string> = {};
  if (b.context && typeof b.context === "object") {
    for (const k of ["template", "format", "voice", "lang"]) {
      const v = (b.context as Record<string, unknown>)[k];
      if (typeof v === "string" && v) ctx[k] = v.slice(0, 40);
    }
  }
  return { tool: b.tool, rating, comment, context: JSON.stringify(ctx) };
}

/** Same length and every character equal, without stopping early (for the owner's view key). */
export function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
