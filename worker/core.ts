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
