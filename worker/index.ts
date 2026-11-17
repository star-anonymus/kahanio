// Kahanio voice Worker: a Cloudflare Worker that turns one scene of text into speech with FameSpeak's free voices
// (Urdu Uzma/Asad, English). The FameSpeak key never reaches the browser. Bot check (Turnstile) once, then a
// 15-minute session token; a per-IP rate limit on top. Nothing is stored.
// FameSpeak's API is async and allows one generation at a time on the current plan, so this waits its turn,
// polls until the audio is ready, then streams it back.
import { corsHeaders, FAMESPEAK_API, ONLINE_VOICES, signSession, validateTts, verifySession } from "./core.ts";

type RateLimiter = { limit(o: { key: string }): Promise<{ success: boolean }> };
export type Env = {
  FAMESPEAK_KEY: string; // secret: wrangler secret put FAMESPEAK_KEY
  TURNSTILE_SECRET: string; // secret
  SESSION_SECRET: string; // secret: any long random string
  ALLOWED_ORIGINS: string; // e.g. "https://kahanio.clientorahq.com,http://localhost:4830"
  LIMITER?: RateLimiter; // [[ratelimits]] binding (optional)
};

const json = (data: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fame(env: Env, path: string, init: RequestInit = {}) {
  return fetch(`${FAMESPEAK_API}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${env.FAMESPEAK_KEY}`, "Content-Type": "application/json" } });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(req.headers.get("Origin"), env.ALLOWED_ORIGINS);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return json({ error: "Not found." }, 404, cors);
    const ip = req.headers.get("CF-Connecting-IP") ?? "0.0.0.0";
    const path = new URL(req.url).pathname;

    if (env.LIMITER) {
      const { success } = await env.LIMITER.limit({ key: ip });
      if (!success) return json({ error: "Too many voice requests. Wait a minute and press Retry." }, 429, cors);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Bad request." }, 400, cors);
    }

    if (path === "/session") {
      const token = (body as { turnstile?: unknown })?.turnstile;
      if (typeof token !== "string" || !token) return json({ error: "The bot check is missing. Reload and try again." }, 400, cors);
      const form = new FormData();
      form.append("secret", env.TURNSTILE_SECRET);
      form.append("response", token);
      form.append("remoteip", ip);
      const check = (await (await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form })).json()) as { success?: boolean };
      if (!check.success) return json({ error: "The bot check failed. Reload and try again." }, 403, cors);
      return json({ session: await signSession(env.SESSION_SECRET, ip) }, 200, cors);
    }

    if (path === "/tts") {
      const r = validateTts(body);
      if ("error" in r) return json(r, 400, cors);
      if (!(await verifySession(env.SESSION_SECRET, r.session, ip))) return json({ error: "Your voice session expired. Press Retry." }, 401, cors);
      const voice = ONLINE_VOICES.find((v) => v.id === r.voice)!;

      // Start the generation; wait our turn while another one is running (one at a time on this plan).
      let id = "";
      for (let attempt = 0; attempt < 8 && !id; attempt++) {
        const start = await fame(env, "/tts/generations", { method: "POST", body: JSON.stringify({ text: r.text, voice: voice.fsId }) });
        if (start.status === 202 || start.ok) {
          id = ((await start.json()) as { id?: string }).id ?? "";
          break;
        }
        if (start.status !== 429) return json({ error: `The voice service did not accept the text (HTTP ${start.status}).` }, 502, cors);
        const wait = Number(start.headers.get("Retry-After")) || 2;
        await sleep(Math.min(5, wait) * 1000);
      }
      if (!id) return json({ error: "The voice service is busy. Retrying…", busy: true }, 429, cors);

      for (let poll = 0; poll < 30; poll++) {
        await sleep(1500);
        const st = (await (await fame(env, `/tts/generations/${id}`)).json()) as { status?: string; failureMessage?: string };
        if (st.status === "completed") {
          const audio = await fame(env, `/tts/generations/${id}/audio`);
          if (!audio.ok) return json({ error: `Could not fetch the voice audio (HTTP ${audio.status}).` }, 502, cors);
          return new Response(audio.body, { status: 200, headers: { ...cors, "Content-Type": audio.headers.get("Content-Type") ?? "audio/mpeg", "Cache-Control": "no-store" } });
        }
        if (st.status === "failed" || st.status === "cancelled") return json({ error: `The voice could not read this scene. ${st.failureMessage ?? ""}`.trim() }, 422, cors);
      }
      return json({ error: "The voice took too long. Press Retry." }, 504, cors);
    }
    return json({ error: "Not found." }, 404, cors);
  },
};
