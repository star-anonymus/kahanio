# Reelora (working name): free topic-to-short-video tool by ClientoraHQ

Shared rules are in `..\CLAUDE.md`. Plan and name checks: see HANDOFF (17 Nov 2026).

## What it is
Static site (Vite + TypeScript). Everything runs in the visitor's browser: script, footage search, music, captions and MP4 encoding (WebCodecs through Mediabunny). No server, no stored data, no keys of ours.
- Script: the user's own text, a no-AI starter, or a free AI tier with the user's own key (Groq, Gemini, OpenRouter free), called from the browser.
- Footage: Pexels / Pixabay with the user's own free key; otherwise an animated brand gradient.
- Voice: the user's own recording (upload or record). No TTS yet.
- Music: generated from notes at render time (`src/music.ts`, `src/audio.ts`): no licence or Content ID risk.
- End card: AI-assisted label, footage credits, "by ClientoraHQ".

## Layout
- `src/brand.ts`: name and colours. A rename touches this file, `index.html` title/meta and `public/logo-mark.svg`.
- Pure, tested: `script.ts`, `timing.ts`, `music.ts`, `stock.ts`, `llm.ts` (`tests/core.test.ts`).
- Browser only: `audio.ts`, `draw.ts`, `render.ts`, `main.ts`.
- `src/dev-autorun.ts` + the plugin in `vite.config.ts`: dev server only; render `samples/<name>.json` with `/?auto=<name>`, saved to `samples-out/` (git-ignored). Not in the build.

## Commands
```
npm.cmd run dev        # port 4830
npm.cmd test           # node --test
npm.cmd run typecheck
npm.cmd run build      # dist/
```

## Not done yet (v2)
- Name: "Reelora" clashes with reelora.cc / reelora.ai (AI video makers). Owner to confirm or pick another; the logo waits for that.
- Shared keys through a small proxy (Cloudflare Worker: Turnstile, per-IP daily cap, nothing stored) so visitors need no keys.
- TTS: English in the browser (kokoro-js, Apache-2.0); Urdu via Azure Speech free tier behind the proxy.
- Own subdomain, a listing on clientorahq.com/tools and tools.clientorahq.com. No git remote yet; nothing deployed.
