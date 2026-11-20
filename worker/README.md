# Kahanio voice Worker (FameSpeak free voices: Urdu, Hindi, English)

A Cloudflare Worker that turns one scene of text into speech with FameSpeak's **free** voices (no credits): Urdu
(Uzma, Asad), Hindi (Swara, Madhur) and English (Ava, Andrew, Emma, Brian). The FameSpeak key stays here; the browser
never sees it. Flow: Turnstile bot check once -> `/session` gives a 15-minute token bound to the visitor's IP -> `/tts`
per scene. Per-IP limit: 20 requests a minute. Nothing is stored.

FameSpeak's API is asynchronous and the current plan allows one generation at a time, so the Worker waits its turn,
polls until the audio is ready and streams it back. When it stays busy, the page tells the visitor and retries; English
then falls back to the free on-device voice. Hindi-script text for an Urdu voice is converted to Urdu letters in the
browser before it is sent.

Check before going public: FameSpeak's terms allow its API to power a public website, the plan is renewed (Basic
expires 24 Nov 2026), and API access is enabled on the account.

## One-time setup (owner)
1. FameSpeak dashboard: create an API key with the `tts:write` and `tts:read` scopes.
2. Cloudflare dashboard -> Turnstile -> Add widget: hostnames `kahanio.clientorahq.com` and `localhost`, mode Managed.
   Copy the **site key** (public) and the **secret key**.

## Deploy (owner runs these in Command Prompt)
```
cd C:\ClientoraHQ\ClientoraHQ_Video_Tool\worker
npx.cmd wrangler login
npx.cmd wrangler secret put FAMESPEAK_KEY
npx.cmd wrangler secret put TURNSTILE_SECRET
npx.cmd wrangler secret put SESSION_SECRET
npx.cmd wrangler deploy
```
`SESSION_SECRET` is any long random text. Wrangler asks for each value; type it there, never in a chat or a file.

## Free stock footage (optional, recommended)
Get a free API key at pexels.com/api, then: `npx.cmd wrangler secret put PEXELS_KEY`. Searches are cached for a day;
clips stream through the Worker (only from videos.pexels.com). Every video credits Pexels and the filmmakers.

## Required feedback (D1 database, free)
After every video the page asks for a 1-5 rating (required before the next video) and an optional comment.
One-time setup, in this folder:
```
npx.cmd wrangler d1 create kahanio-feedback
```
Copy the `database_id` it prints into the `[[d1_databases]]` block of wrangler.toml (it is not a secret), then:
```
npx.cmd wrangler d1 execute kahanio-feedback --remote --file=schema.sql
npx.cmd wrangler secret put ADMIN_KEY
npx.cmd wrangler deploy
```
Read the feedback at https://kahanio-api.clientorahq.com/feedback/view?key=<your ADMIN_KEY> (keep that link private).
Until the database is connected, answers stay saved in each visitor's browser and are sent later.

## Connect the site
Add two public values to the Vercel project `kahanio` (Settings -> Environment Variables, Production), then redeploy:
```
VITE_TTS_URL=https://kahanio-api.clientorahq.com   (own domain; the workers.dev address also works but blockers often block it)
VITE_TURNSTILE_SITEKEY=<Turnstile site key>
```
Without them the site hides the online voices: English uses the on-device voice; Urdu and Hindi ask for your own voice.

## Free AI scripts (`/script`)
Visitors get an AI script without a key of their own. The Worker tries free models in order and keeps the keys server-side:
1. Groq (free plan, does not train on prompts): key from https://console.groq.com/keys, then `npx.cmd wrangler secret put GROQ_KEY`
2. Google Gemini (fallback; Google may use free-tier prompts to improve its products): key from https://aistudio.google.com/apikey, then `npx.cmd wrangler secret put GEMINI_KEY`

Either one is enough; with neither, the page says free scripts are not set up and offers "own key" or writing it yourself. Same bot-check session and per-IP limit as the voice. The prompt (`src/llm.ts` `buildMessages`) follows a hook, problem, value, one-ask structure, facts only, with an optional TikTok-safe switch (no numbers, prices or links).
