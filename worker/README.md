# Kahanio voice Worker (Azure neural voices: Urdu and English)

A Cloudflare Worker that turns one scene of text into speech with Azure's neural voices. The Azure key stays here; the
browser never sees it. Flow: Turnstile bot check once -> `/session` gives a 15-minute token bound to the visitor's IP ->
`/tts` per scene. Per-IP limit: 20 requests a minute. Nothing is stored.

Cost: Azure Speech **Free (F0)** tier = 0.5 million characters of neural voice a month. When it is used up, Azure stops
(429) instead of billing; English then falls back to the on-device voice, Urdu shows a clear message.

## One-time setup (owner)
1. Azure portal: create a **Speech** resource, pricing tier **Free F0**, region e.g. East US. Copy one key and the region.
2. Cloudflare dashboard: Turnstile -> add a widget for `kahanio.clientorahq.com` (and `localhost` for testing).
   Copy the **site key** (public) and the **secret key**.
3. In `wrangler.toml`, set `AZURE_REGION` if it is not `eastus`.

## Deploy (owner runs these in Command Prompt, in this folder)
```
cd C:\ClientoraHQ\ClientoraHQ_Video_Tool\worker
npx.cmd wrangler login
npx.cmd wrangler secret put AZURE_KEY
npx.cmd wrangler secret put TURNSTILE_SECRET
npx.cmd wrangler secret put SESSION_SECRET
npx.cmd wrangler deploy
```
`SESSION_SECRET` is any long random text (for example from a password manager). Wrangler asks for each value; type it
there, never in a chat or a file.

## Connect the site
Build the site with the Worker URL and the Turnstile site key (public values), e.g. in the hosting project's environment:
```
VITE_TTS_URL=https://kahanio-voice.<your-account>.workers.dev
VITE_TURNSTILE_SITEKEY=<site key>
```
Without these two, the site hides the online voices: English uses the on-device voice and Urdu asks for your own voice.
