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

## Connect the site
Add two public values to the Vercel project `kahanio` (Settings -> Environment Variables, Production), then redeploy:
```
VITE_TTS_URL=https://kahanio-voice.<your-account>.workers.dev
VITE_TURNSTILE_SITEKEY=<Turnstile site key>
```
Without them the site hides the online voices: English uses the on-device voice; Urdu and Hindi ask for your own voice.
