// Kahanio voice Worker: a Cloudflare Worker that turns scene text into Azure neural speech (Urdu and English).
// The Azure key never reaches the browser. Bot check (Turnstile) once, then a 15-minute session token; a per-IP rate
// limit on top. Nothing is stored. Azure's free tier (F0) stops at its monthly quota instead of billing.
import { buildSsml, corsHeaders, OUTPUT_FORMAT, signSession, validateTts, verifySession } from "./core.ts";

type RateLimiter = { limit(o: { key: string }): Promise<{ success: boolean }> };
export type Env = {
  AZURE_KEY: string; // secret: wrangler secret put AZURE_KEY
  AZURE_REGION: string; // e.g. "eastus" (wrangler.toml [vars])
  TURNSTILE_SECRET: string; // secret
  SESSION_SECRET: string; // secret: any long random string
  ALLOWED_ORIGINS: string; // e.g. "https://kahanio.clientorahq.com,http://localhost:4830"
  LIMITER?: RateLimiter; // [[ratelimits]] binding (optional)
};

const json = (data: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

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
      const az = await fetch(`https://${env.AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": env.AZURE_KEY,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
          "User-Agent": "kahanio-voice",
        },
        body: buildSsml(r.text, r.voice),
      });
      if (az.status === 429) return json({ error: "The free AI voice is busy or used up for now.", quota: true }, 429, cors);
      if (!az.ok) return json({ error: `The voice service did not answer (HTTP ${az.status}).` }, 502, cors);
      return new Response(az.body, { status: 200, headers: { ...cors, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
    }
    return json({ error: "Not found." }, 404, cors);
  },
};
