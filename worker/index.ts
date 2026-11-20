// Kahanio voice Worker: a Cloudflare Worker that turns one scene of text into speech with FameSpeak's free voices
// (Urdu Uzma/Asad, English). The FameSpeak key never reaches the browser. Bot check (Turnstile) once, then a
// 15-minute session token; a per-IP rate limit on top. Nothing is stored.
// FameSpeak's API is async and allows one generation at a time on the current plan, so this waits its turn,
// polls until the audio is ready, then streams it back.
import { corsHeaders, FAMESPEAK_API, sameSecret, validateFeedback, isPexelsVideoUrl, ONLINE_VOICES, SCRIPT_MODELS, signSession, validateScript, validateStock, validateTts, verifySession } from "./core.ts";
import { buildMessages } from "../src/llm.ts";
import { pexelsSearchUrl, pickPexelsFile, type PexelsVideo } from "../src/stock.ts";

type RateLimiter = { limit(o: { key: string }): Promise<{ success: boolean }> };
type D1 = { prepare(q: string): { bind(...v: unknown[]): { run(): Promise<unknown>; all<T>(): Promise<{ results: T[] }> }; all<T>(): Promise<{ results: T[] }> } };
export type Env = {
  DB?: D1; // [[d1_databases]] binding "DB" (database kahanio-feedback, schema in worker/schema.sql)
  ADMIN_KEY?: string; // secret: wrangler secret put ADMIN_KEY (opens /feedback/view?key=...)
  FAMESPEAK_KEY: string; // secret: wrangler secret put FAMESPEAK_KEY
  PEXELS_KEY?: string; // secret: wrangler secret put PEXELS_KEY (free key from pexels.com/api)
  GROQ_KEY?: string; // secret: free key from console.groq.com/keys (script writing)
  GEMINI_KEY?: string; // secret: free key from aistudio.google.com/apikey (script fallback)
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
    try {
      return await handle(req, env, cors);
    } catch (e) {
      console.error("worker error", (e as Error)?.message);
      return json({ error: "The server had a hiccup. Retrying…", busy: true }, 503, cors);
    }
  },
};

async function handle(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const ip = req.headers.get("CF-Connecting-IP") ?? "0.0.0.0";
    const url = new URL(req.url);
    const path = url.pathname;

    // Stream one Pexels clip with CORS headers, so the browser may draw it into the video.
    if (req.method === "GET" && path === "/clip") {
      const u = url.searchParams.get("u") ?? "";
      const s = url.searchParams.get("s") ?? "";
      if (!isPexelsVideoUrl(u)) return json({ error: "Not allowed." }, 400, cors);
      if (!(await verifySession(env.SESSION_SECRET, s, ip))) return json({ error: "Your session expired. Press Retry." }, 401, cors);
      const range = req.headers.get("Range");
      const upstream = await fetch(u, { headers: range ? { Range: range } : {}, cf: { cacheEverything: true, cacheTtl: 86400 } } as RequestInit);
      const h = new Headers(cors);
      for (const k of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"]) {
        const v = upstream.headers.get(k);
        if (v) h.set(k, v);
      }
      h.set("Cross-Origin-Resource-Policy", "cross-origin");
      return new Response(upstream.body, { status: upstream.status, headers: h });
    }
    // Owner's private view of the feedback: /feedback/view?key=<ADMIN_KEY>
    if (req.method === "GET" && path === "/feedback/view") {
      if (!env.ADMIN_KEY || !sameSecret(url.searchParams.get("key") ?? "", env.ADMIN_KEY)) return new Response("Not found.", { status: 404 });
      if (!env.DB) return new Response("The feedback database is not connected yet.", { status: 503 });
      const rows = (await env.DB.prepare("SELECT created_at, tool, rating, comment, context, country FROM feedback ORDER BY id DESC LIMIT 300").all<{ created_at: string; tool: string; rating: number; comment: string; context: string; country: string }>()).results;
      const avg = (await env.DB.prepare("SELECT tool, COUNT(*) n, ROUND(AVG(rating), 2) a FROM feedback GROUP BY tool").all<{ tool: string; n: number; a: number }>()).results;
      const e = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
      const html = `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Kahanio feedback</title>
<style>body{font:15px system-ui;margin:24px;background:#0c0c1c;color:#fff4e6}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #26264a;padding:6px 8px;text-align:left;vertical-align:top}th{color:#ffb703}.s{color:#ffb703}</style>
<h1>Feedback</h1><p>${avg.map((a) => `<b>${e(a.tool)}</b>: ${a.n} answers, average ${a.a} ★`).join(" · ") || "No feedback yet."}</p>
<table><tr><th>Time (UTC)</th><th>Tool</th><th>Rating</th><th>Comment</th><th>Settings</th><th>Country</th></tr>${rows.map((r) => `<tr><td>${e(r.created_at)}</td><td>${e(r.tool)}</td><td class="s">${"★".repeat(r.rating)}</td><td>${e(r.comment)}</td><td>${e(r.context)}</td><td>${e(r.country)}</td></tr>`).join("")}</table>`;
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
    }
    if (req.method !== "POST") return json({ error: "Not found." }, 404, cors);

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
      const check = (await (await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form })).json()) as { success?: boolean; "error-codes"?: string[] };
      if (!check.success) {
        // Cloudflare's reason codes are safe to show and say what is wrong (e.g. an expired token or a wrong secret).
        const codes = (check["error-codes"] ?? []).filter((c) => /^[a-z-]+$/.test(c)).join(", ");
        const expired = /timeout-or-duplicate/.test(codes);
        return json({ error: expired ? "The bot check expired. Press the button again and tick the box." : `The bot check failed${codes ? ` (${codes})` : ""}. Reload and try again.`, codes }, 403, cors);
      }
      return json({ session: await signSession(env.SESSION_SECRET, ip) }, 200, cors);
    }

    if (path === "/feedback") {
      const r = validateFeedback(body);
      if ("error" in r) return json(r, 400, cors);
      if (!env.DB) return json({ error: "Feedback storage is not set up yet." }, 503, cors);
      const country = (req as unknown as { cf?: { country?: string } }).cf?.country ?? "";
      await env.DB.prepare("INSERT INTO feedback (tool, rating, comment, context, country, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(r.tool, r.rating, r.comment, r.context, country, new Date().toISOString())
        .run();
      return json({ ok: true }, 200, cors);
    }

    if (path === "/stock") {
      if (!env.PEXELS_KEY) return json({ error: "Stock footage is not set up yet." }, 503, cors);
      const r = validateStock(body);
      if ("error" in r) return json(r, 400, cors);
      if (!(await verifySession(env.SESSION_SECRET, r.session, ip))) return json({ error: "Your session expired. Press Retry." }, 401, cors);
      const api = pexelsSearchUrl(r.q, r.orientation);
      // Cache each search for a day (Pexels asks API users to cache), so popular words cost nothing.
      const cache = (caches as unknown as { default: Cache }).default;
      const key = new Request(api);
      let res = await cache.match(key);
      if (!res) {
        const up = await fetch(api, { headers: { Authorization: env.PEXELS_KEY } });
        if (up.status === 429) return json({ error: "Stock footage is busy. Try again in a minute." }, 429, cors);
        if (!up.ok) return json({ error: `Stock search failed (HTTP ${up.status}).` }, 502, cors);
        res = new Response(up.body, { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" } });
        await cache.put(key, res.clone());
      }
      const data = (await res.json()) as { videos?: PexelsVideo[] };
      const clips = (data.videos ?? [])
        .map((v) => ({ id: `pexels-${v.id}`, file: pickPexelsFile(v, r.orientation), author: v.user.name, page: v.url }))
        .filter((c) => c.file)
        .slice(0, 6);
      return json({ clips }, 200, cors);
    }

    if (path === "/script") {
      const r = validateScript(body);
      if ("error" in r) return json(r, 400, cors);
      if (!(await verifySession(env.SESSION_SECRET, r.session, ip))) return json({ error: "Your session expired. Press Retry." }, 401, cors);
      const messages = buildMessages(r.topic, r.lang, r.seconds, { platformSafe: r.platformSafe });
      let lastStatus = 0;
      for (const m of SCRIPT_MODELS) {
        const key = (env as unknown as Record<string, string | undefined>)[m.keyName];
        if (!key) continue;
        const res = await fetch(m.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: m.model, messages, temperature: 0.8, ...(m.json ? { response_format: { type: "json_object" } } : {}) }),
        });
        lastStatus = res.status;
        if (!res.ok) continue; // busy or refused: try the next free model
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = data.choices?.[0]?.message?.content;
        if (text) return json({ text, model: m.id }, 200, cors);
      }
      if (!lastStatus) return json({ error: "Free AI scripts are not set up yet. Write the script yourself or use your own key." }, 503, cors);
      return json({ error: "The free AI is busy right now. Wait a minute and press Get script again." }, 429, cors);
    }

    if (path === "/tts") {
      const r = validateTts(body);
      if ("error" in r) return json(r, 400, cors);
      if (!(await verifySession(env.SESSION_SECRET, r.session, ip))) return json({ error: "Your voice session expired. Press Retry." }, 401, cors);
      const voice = ONLINE_VOICES.find((v) => v.id === r.voice)!;

      // Start the generation; wait our turn while another one is running (one at a time on this plan).
      // Answer well before the edge gives up (about 100 s): after 60 s say "busy" and let the page retry.
      const deadline = Date.now() + 60000;
      // Cloudflare allows 50 sub-requests per request on the free plan; going over crashes the Worker (no CORS,
      // which the page sees as "could not reach"). Keep a budget well under it and answer "busy" instead.
      let budget = 40;
      let id = "";
      for (let attempt = 0; attempt < 6 && !id && Date.now() < deadline && budget > 2; attempt++) {
        budget--;
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

      while (Date.now() < deadline && budget > 1) {
        await sleep(2500);
        budget--;
        const st = (await (await fame(env, `/tts/generations/${id}`)).json().catch(() => ({}))) as { status?: string; failureMessage?: string };
        if (st.status === "completed") {
          const audio = await fame(env, `/tts/generations/${id}/audio`);
          if (!audio.ok) return json({ error: `Could not fetch the voice audio (HTTP ${audio.status}).` }, 502, cors);
          return new Response(audio.body, { status: 200, headers: { ...cors, "Content-Type": audio.headers.get("Content-Type") ?? "audio/mpeg", "Cache-Control": "no-store" } });
        }
        if (st.status === "failed" || st.status === "cancelled") return json({ error: `The voice could not read this scene. ${st.failureMessage ?? ""}`.trim() }, 422, cors);
      }
      return json({ error: "The voice service is slow right now. Retrying…", busy: true }, 429, cors);
    }
    return json({ error: "Not found." }, 404, cors);
  }
}
