# Kahanio: free AI reel maker (topic to short video) by ClientoraHQ

Own brand: coral #FF4D6D, ink #14142B, amber #FFB703; logo in `public/logo-mark.svg` and `public/logo-wordmark.svg` (a story bubble with a play button). Home: kahanio.clientorahq.com (planned), showcased on clientorahq.com/tools with "by ClientoraHQ". Site copy and metadata name no other product; SEO targets generic searches (free AI reel maker, topic to video, AI short video generator free, Urdu reel maker). A test guards this.

Shared rules are in `..\CLAUDE.md`. Plan and name checks: see HANDOFF (17 Nov 2026).

## What it is
Static site (Vite + TypeScript). Everything runs in the visitor's browser: script, footage search, music, captions and MP4 encoding (WebCodecs through Mediabunny). No server, no stored data, no keys of ours.
- Script: the user's own text, a no-AI starter, or a free AI tier with the user's own key (Groq, Gemini, OpenRouter free), called from the browser.
- Footage: Pexels / Pixabay with the user's own free key; otherwise an animated brand gradient.
- Voice: the user's own recording (upload or record). No TTS yet.
- Photos: the user's own photos come alive with slow camera moves (`motion.ts`, WebGL2 `parallax.ts`). Optional 3D depth: Depth Anything V2 **Small** (Apache-2.0) via transformers.js, lazy-loaded (`depth.ts`), about 27 MB downloaded once by the visitor's browser from Hugging Face. Never switch to the Base/Large models: they are CC-BY-NC. Motion stays slow and eased (tested: no frame-to-frame jumps).
- Cartoon template: ClientoraHQ's own 2D characters (Bilal, Baji, Ustad, Chacha from `Clientora_Studio/brand/mascot`) present the script from a speech bubble in flat 2D rooms, with lip-sync to the words (or to the user's recorded voice), blinks and gestures (`cartoon-motion.ts`, `cartoon.ts`). `src/characters.generated.ts` is made by `node scripts/port-characters.mjs`: re-run it after a character changes in the Studio repo; never edit it by hand.
- Voice: none, the user's own (record/upload), or AI. AI voice = FameSpeak free voices (Urdu Uzma/Asad, Hindi Swara/Madhur, English)  through the Worker in `worker/` (owner deploys; see worker/README.md), and Kokoro (English, kokoro-js, about 92 MB q8 once, on device, in a background worker). Each scene is spoken separately so captions match (`spansFromDurations`). FameSpeak busy -> the page waits and retries; English then falls back to Kokoro. Voice languages: English, Urdu, Hindi script spoken by an Urdu voice (src/translit.ts converts Devanagari to Urdu letters; captions keep the Hindi), Hindi. Greetings are always Islamic (Assalam o Alaikum): the AI prompt says so and a test checks the starters. Without VITE_TTS_URL + VITE_TURNSTILE_SITEKEY the online voices are hidden.
- **Licence: GPL-3.0-or-later** (owner chose online + Kokoro voices, 18 Nov 2026; online provider switched from Azure to FameSpeak the same day). Kokoro's phonemizer bundles eSpeak NG (GPL-3.0). Before any deploy the full source must be public (a public GitHub repo) and linked from the footer next to the licence.
- Production must send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` (vercel.json, vite.config.ts) so the on-device AI can use all CPU threads. Not measurable in the Claude browser pane (it stays non-isolated); measured there single-threaded: about 22 s of work for 4.4 s of voice.
- Music: generated from notes at render time (`src/music.ts`, `src/audio.ts`): no licence or Content ID risk.
- End card: AI-assisted label, footage credits, "by ClientoraHQ".

## Layout
- `src/brand.ts`: name, URL and colours. `THIRD_PARTY_NOTICES.md`: licences (Mediabunny MPL-2.0).
- Pure, tested: `script.ts`, `timing.ts`, `music.ts`, `stock.ts`, `llm.ts` (`tests/core.test.ts`).
- Browser only: `audio.ts`, `draw.ts`, `render.ts`, `main.ts`.
- `src/dev-autorun.ts` + the plugin in `vite.config.ts`: dev server only; render `samples/<name>.json` with `/?auto=<name>`, saved to `samples-out/` (git-ignored). Add `&out=<name>&photos=dev-photos/<file>.jpg` to test photo motion; it saves to `photo-out/`. `dev-photos/` and `photo-out/` are git-ignored: the owner's own photos stay local. Not in the build.

## Commands
```
npm.cmd run dev        # port 4830
npm.cmd test           # node --test
npm.cmd run typecheck
npm.cmd run build      # dist/
```

## Not done yet (v2)
- The wordmark SVG uses live text (Poppins); convert to outlines before print or social use.
- Shared keys through a small proxy (Cloudflare Worker: Turnstile, per-IP daily cap, nothing stored) so visitors need no keys.
- TTS: English in the browser (kokoro-js, Apache-2.0); Urdu via Azure Speech free tier behind the proxy.
- Own subdomain, a listing on clientorahq.com/tools and tools.clientorahq.com. No git remote yet; nothing deployed.
