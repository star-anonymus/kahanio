import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";

// Dev server only: serves samples/*.json and saves rendered samples to samples-out/. Not part of the built site.
function devSamples(): Plugin {
  const ok = (n: string | null): n is string => !!n && /^[a-z0-9-]+$/.test(n);
  return {
    name: "dev-samples",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__sample", (req, res) => {
        const name = new URL(req.url ?? "", "http://x").searchParams.get("name");
        if (!ok(name)) return void res.writeHead(400).end();
        res.setHeader("Content-Type", "application/json");
        res.end(readFileSync(join(__dirname, "samples", `${name}.json`)));
      });
      server.middlewares.use("/__save", (req, res) => {
        const name = new URL(req.url ?? "", "http://x").searchParams.get("name");
        if (req.method !== "POST" || !ok(name)) return void res.writeHead(400).end();
        const dir = join(__dirname, new URL(req.url ?? "", "http://x").searchParams.get("dir") === "photo" ? "photo-out" : "samples-out");
        mkdirSync(dir, { recursive: true });
        const out = createWriteStream(join(dir, `${name}.mp4`));
        req.pipe(out);
        out.on("finish", () => res.writeHead(200).end("saved"));
        out.on("error", () => res.writeHead(500).end());
      });
    },
  };
}

// Cross-origin isolation lets the on-device AI (voice, depth) use all CPU threads. "credentialless" keeps
// cross-origin fonts, models and stock clips loading. Production hosting must send the same two headers (see vercel.json).
const isolation = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "credentialless" };

const pages = Object.fromEntries(["index", "urdu-reel-maker", "topic-to-video", "ai-short-video-generator"].map((p) => [p, join(__dirname, `${p}.html`)]));

export default defineConfig({ build: { rollupOptions: { input: pages } }, plugins: [devSamples()], server: { headers: isolation }, preview: { headers: isolation } });
