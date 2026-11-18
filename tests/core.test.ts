import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { buildMessages, PROVIDERS } from "../src/llm.ts";
import { mulberry32, planMusic } from "../src/music.ts";
import { guessKeywords, parseScript, scenesToText, templateScript } from "../src/script.ts";
import { creditLines, pexelsSearchUrl, pickPexelsFile, pickPixabayFile, pixabaySearchUrl, type PexelsVideo } from "../src/stock.ts";
import { captionChunks, findIndex, MIN_SCENE_SEC, sceneTimings, toSrt, wrapWords } from "../src/timing.ts";

test("parseScript reads plain lines with bracketed keywords and list markers", () => {
  const s = parseScript("1. Hello world [laptop, office]\n\n- Second scene here\n   ");
  assert.equal(s.length, 2);
  assert.deepEqual(s[0], { text: "Hello world", keywords: ["laptop", "office"] });
  assert.equal(s[1].text, "Second scene here");
  assert.ok(s[1].keywords.length > 0);
});

test("parseScript reads fenced JSON from an AI reply", () => {
  const raw = 'Sure!\n```json\n{"scenes":[{"text":"Hook line","keywords":["city"]},{"text":"Call to action"}]}\n```';
  const s = parseScript(raw);
  assert.equal(s.length, 2);
  assert.deepEqual(s[0].keywords, ["city"]);
  assert.ok(s[1].keywords.length > 0);
});

test("parseScript caps scene count and scene length", () => {
  const s = parseScript(Array.from({ length: 30 }, (_, i) => `Scene ${i} ` + "word ".repeat(80)).join("\n"));
  assert.equal(s.length, 12);
  assert.ok(s.every((x) => x.text.length <= 221));
});

test("parseScript keeps Urdu text", () => {
  const s = parseScript("کلائنٹ آپ کو ڈھونڈ رہے ہیں [laptop]");
  assert.equal(s[0].text, "کلائنٹ آپ کو ڈھونڈ رہے ہیں");
});

test("guessKeywords skips stop words", () => {
  assert.deepEqual(guessKeywords("How to find the best clients"), ["clients", "find"]);
});

test("templateScript round-trips through the text form", () => {
  const t = templateScript("cold email");
  assert.equal(t.length, 5);
  assert.deepEqual(parseScript(scenesToText(t)), t);
});

test("sceneTimings follows reading pace, a minimum, and scales to a voice", () => {
  const scenes = parseScript("one\nthis scene has quite a few more words in it than the first");
  const a = sceneTimings(scenes);
  assert.equal(a[0].start, 0);
  assert.ok(a[0].end >= MIN_SCENE_SEC);
  assert.equal(a[1].start, a[0].end);
  const b = sceneTimings(scenes, 20);
  assert.ok(Math.abs(b[1].end - 20) < 1e-9);
});

test("captionChunks covers the span with ordered word times", () => {
  const c = captionChunks("one two three four five six", { start: 2, end: 5 }, 4);
  assert.equal(c.length, 2);
  assert.equal(c[0].words.length, 4);
  assert.equal(c[0].start, 2);
  assert.ok(Math.abs(c[1].end - 5) < 1e-9);
  const words = c.flatMap((x) => x.words);
  for (let i = 1; i < words.length; i++) assert.ok(Math.abs(words[i].start - words[i - 1].end) < 1e-9);
});

test("findIndex returns the containing span and clamps at the end", () => {
  const spans = [{ start: 0, end: 2 }, { start: 2, end: 5 }];
  assert.equal(findIndex(spans, 0), 0);
  assert.equal(findIndex(spans, 2), 1);
  assert.equal(findIndex(spans, 99), 1);
});

test("wrapWords breaks lines at the width", () => {
  const lines = wrapWords(["aa", "bb", "cc", "dd"], 5, (s) => s.length);
  assert.deepEqual(lines, [["aa", "bb"], ["cc", "dd"]]);
  assert.deepEqual(wrapWords(["toolongword"], 3, (s) => s.length), [["toolongword"]]);
});

test("toSrt formats times", () => {
  const srt = toSrt([{ text: "Hi", start: 0, end: 61.5, words: [] }]);
  assert.equal(srt, "1\n00:00:00,000 --> 00:01:01,500\nHi\n");
});

test("planMusic is deterministic and stays inside the duration", () => {
  const a = planMusic(30, 7);
  assert.deepEqual(a, planMusic(30, 7));
  assert.ok(a.chords.length >= 11);
  assert.ok([...a.kicks, ...a.hats].every((t) => t < 30));
  const r = mulberry32(1);
  const v = r();
  assert.ok(v >= 0 && v < 1);
});

test("pickPexelsFile matches orientation, avoids 4K, prefers about 1080", () => {
  const v: PexelsVideo = {
    id: 1,
    url: "https://www.pexels.com/video/1/",
    user: { name: "Ana" },
    video_files: [
      { link: "4k", width: 2160, height: 3840, file_type: "video/mp4" },
      { link: "hd", width: 1080, height: 1920, file_type: "video/mp4" },
      { link: "sd", width: 540, height: 960, file_type: "video/mp4" },
      { link: "land", width: 1920, height: 1080, file_type: "video/mp4" },
    ],
  };
  assert.equal(pickPexelsFile(v, "portrait"), "hd");
  assert.equal(pickPexelsFile(v, "landscape"), "land");
  assert.equal(pickPexelsFile({ ...v, video_files: [] }, "portrait"), null);
});

test("pickPixabayFile prefers medium then small", () => {
  assert.equal(pickPixabayFile({ id: 1, pageURL: "", user: "", videos: { small: { url: "s", width: 1, height: 1 }, medium: { url: "m", width: 1, height: 1 } } }), "m");
  assert.equal(pickPixabayFile({ id: 1, pageURL: "", user: "", videos: { small: { url: "s", width: 1, height: 1 } } }), "s");
  assert.equal(pickPixabayFile({ id: 1, pageURL: "", user: "", videos: {} }), null);
});

test("search URLs encode the query and use the right endpoints", () => {
  assert.match(pexelsSearchUrl("small shop", "portrait"), /^https:\/\/api\.pexels\.com\/videos\/search\?query=small\+shop&orientation=portrait/);
  assert.match(pixabaySearchUrl("a&b", "K"), /^https:\/\/pixabay\.com\/api\/videos\/\?key=K&q=a%26b/);
});

test("creditLines de-duplicates", () => {
  const c = { source: "Pexels" as const, author: "Ana", url: "" };
  assert.deepEqual(creditLines([c, c, { ...c, source: "Pixabay" }]), ["Ana on Pexels", "Ana on Pixabay"]);
});

test("buildMessages asks for facts-only JSON in the chosen language", () => {
  const m = buildMessages("cold email", "ur", 30);
  assert.match(m[0].content, /Facts only/);
  assert.match(m[1].content, /Urdu/);
  assert.match(m[1].content, /6 scenes/);
  assert.equal(PROVIDERS.length, 3);
});

test("every sample script parses into 5-6 scenes with keywords", () => {
  const dir = new URL("../samples/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 4);
  for (const f of files) {
    const s = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
    const scenes = parseScript(s.script);
    assert.ok(scenes.length >= 5 && scenes.length <= 6, f);
    assert.ok(["story", "pop", "clean", "neon", "chat", "news", "cartoon", "real"].includes(s.style), f);
    assert.ok(scenes.every((x) => x.keywords.length > 0), f);
  }
});

test("site copy and metadata use our own name only, and target generic searches", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /reelora|moneyprinter|mediabunny/i);
  assert.match(html, /<title>[^<]*Kahanio<\/title>/);
  for (const k of ["free AI reel maker", "topic to video", "AI short video generator free", "Urdu reel maker"]) assert.ok(html.includes(k), k);
  assert.match(html, /kahanio\.clientorahq\.com/);
});

test("easing curves start at 0, end at 1, and clamp", async () => {
  const { easeOutCubic, easeInOutCubic, easeOutBack, segmentFills } = await import("../src/ease.ts");
  for (const f of [easeOutCubic, easeInOutCubic, easeOutBack]) {
    assert.ok(Math.abs(f(0)) < 1e-9);
    assert.ok(Math.abs(f(1) - 1) < 1e-9);
    assert.equal(f(5), f(1));
  }
  assert.ok(easeOutBack(0.7) > 1, "overshoots");
  assert.deepEqual(segmentFills(4, 2, 0.5), [1, 1, 0.5, 0]);
});

test("templates and goals are complete and their starters parse", async () => {
  const { TEMPLATES, GOALS, sampleScenes } = await import("../src/templates.ts");
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, 8);
  for (const t of TEMPLATES) assert.ok(sampleScenes(t).length >= 3, t.id);
  for (const g of GOALS) {
    assert.ok(TEMPLATES.some((t) => t.id === g.style), g.id);
    assert.ok(parseScript(g.starter("cold email").join("\n")).length >= 4, g.id);
  }
});

test("photo motion: eased, small, smooth camera moves", async () => {
  const { motionAt, MOTIONS, motionForScene } = await import("../src/motion.ts");
  for (const k of MOTIONS) {
    let prev = motionAt(k, 0);
    for (let i = 1; i <= 100; i++) {
      const m = motionAt(k, i / 100);
      assert.ok(Math.abs(m.dx) <= 0.02 && Math.abs(m.dy) <= 0.02, k);
      assert.ok(m.zoom >= 1.05 && m.zoom <= 1.15, k);
      // No jumps between consecutive frames (smooth, never shaky).
      assert.ok(Math.abs(m.dx - prev.dx) < 0.002 && Math.abs(m.dy - prev.dy) < 0.002 && Math.abs(m.zoom - prev.zoom) < 0.004, k);
      prev = m;
    }
  }
  assert.equal(motionForScene(0), MOTIONS[0]);
  assert.equal(motionForScene(MOTIONS.length), MOTIONS[0]);
});

test("coverUV crops the long side and centres", async () => {
  const { coverUV } = await import("../src/motion.ts");
  const wide = coverUV(1920, 1080, 1080, 1920);
  assert.ok(Math.abs(wide.sx - (1080 / 1920) / (1920 / 1080)) < 1e-9);
  assert.equal(wide.sy, 1);
  assert.ok(Math.abs(wide.ox - (1 - wide.sx) / 2) < 1e-9);
  const tall = coverUV(1080, 1920, 1920, 1080);
  assert.equal(tall.sx, 1);
  assert.ok(tall.sy < 1 && Math.abs(tall.oy - (1 - tall.sy) / 2) < 1e-9);
  assert.deepEqual(coverUV(100, 100, 100, 100), { sx: 1, sy: 1, ox: 0, oy: 0 });
});

test("fitLongSide caps the long side and never upscales", async () => {
  const { fitLongSide } = await import("../src/motion.ts");
  assert.deepEqual(fitLongSide(4000, 3000, 1920), { w: 1920, h: 1440 });
  assert.deepEqual(fitLongSide(800, 600, 1920), { w: 800, h: 600 });
});

test("cartoon: lip-sync opens only while a word is spoken", async () => {
  const { mouthFromWords } = await import("../src/cartoon-motion.ts");
  const words = [{ w: "hello", start: 1, end: 1.5 }, { w: "there", start: 2, end: 2.5 }];
  assert.equal(mouthFromWords(words, 0.5), 0);
  assert.equal(mouthFromWords(words, 1.7), 0);
  const open = [1.05, 1.15, 1.25, 1.35].map((t) => mouthFromWords(words, t));
  assert.ok(open.every((v) => v > 0.1 && v <= 0.8));
  assert.ok(Math.max(...open) > 0.5);
});

test("cartoon: voice envelope follows loudness and ignores silence", async () => {
  const { voiceEnvelope } = await import("../src/cartoon-motion.ts");
  const sr = 3000;
  const s = new Float32Array(sr * 2);
  for (let i = sr; i < sr * 2; i++) s[i] = Math.sin(i / 3) * 0.5;
  const env = voiceEnvelope(s, sr, 30);
  assert.equal(env.length, 60);
  assert.ok(env[5] < 0.01, "silent first second");
  assert.ok(env[50] > 0.8, "loud second second");
  assert.ok(env.every((v) => v >= 0 && v <= 1));
});

test("cartoon: blinks are short and occasional; pose stays in range", async () => {
  const { blinkAt, cartoonPose } = await import("../src/cartoon-motion.ts");
  let closed = 0;
  for (let i = 0; i < 3000; i++) if (blinkAt(i / 100) > 0.5) closed++;
  assert.ok(closed > 5 && closed < 200, `closed frames: ${closed}`);
  for (let t = 0; t < 6; t += 0.05) {
    const p = cartoonPose({ t, sceneIndex: 1, sceneCount: 3, sceneStart: 0, sceneEnd: 6, words: [{ w: "word", start: 0, end: 6 }] });
    for (const v of [p.open, p.blink, p.happy, p.gesture, p.brow]) assert.ok(v >= 0 && v <= 1);
    assert.ok(Math.abs(p.tilt) <= 3 && Math.abs(p.bob) <= 3);
  }
  const end = cartoonPose({ t: 5.9, sceneIndex: 2, sceneCount: 3, sceneStart: 0, sceneEnd: 6, words: [] });
  assert.equal(end.happy, 1);
});

test("cartoon: every ported character has artwork and a pose function", async () => {
  const { CHARACTER_LIST, CHARACTER_SVGS, CHARACTER_POSERS } = await import("../src/characters.generated.ts");
  assert.ok(CHARACTER_LIST.length >= 4);
  for (const c of CHARACTER_LIST) {
    assert.match((CHARACTER_SVGS as Record<string, string>)[c.id], /^<svg[\s\S]*<\/svg>$/);
    assert.equal(typeof (CHARACTER_POSERS as Record<string, unknown>)[c.id], "function");
  }
});

test("voice: scene spans follow measured durations exactly", async () => {
  const { spansFromDurations } = await import("../src/timing.ts");
  assert.deepEqual(spansFromDurations([1.5, 2, 0.5]), [{ start: 0, end: 1.5 }, { start: 1.5, end: 3.5 }, { start: 3.5, end: 4 }]);
});

test("worker: only allowed FameSpeak free voices pass, text is cleaned and capped", async () => {
  const { validateTts, ONLINE_VOICES, MAX_CHARS } = await import("../worker/core.ts");
  assert.ok(ONLINE_VOICES.some((v) => v.lang === "ur") && ONLINE_VOICES.some((v) => v.lang === "en"));
  assert.ok(ONLINE_VOICES.every((v) => /^fs_voice_[0-9a-f]{20}$/.test(v.fsId)));
  assert.equal(new Set(ONLINE_VOICES.map((v) => v.id)).size, ONLINE_VOICES.length);
  assert.deepEqual(validateTts({ text: "  hi  there ", voice: "ur-uzma", session: "s" }), { text: "hi there", voice: "ur-uzma", session: "s" });
  assert.ok("error" in validateTts({ text: "x".repeat(MAX_CHARS + 1), voice: "ur-uzma", session: "s" }));
  assert.ok("error" in validateTts({ text: "hi", voice: "fs_voice_9d9edf25712584d15d09", session: "s" }), "raw FameSpeak ids are not accepted");
  assert.ok("error" in validateTts({ text: "", voice: "ur-uzma", session: "s" }));
  assert.ok("error" in validateTts(null));
});

test("Hindi script converts to Urdu script for the Urdu voice", async () => {
  const { devanagariToUrdu, hasDevanagari } = await import("../src/translit.ts");
  const cases: [string, string][] = [
    ["है", "ہے"], ["हैं", "ہیں"], ["में", "میں"], ["नहीं", "نہیں"], ["आप", "آپ"], ["क्या", "کیا"], ["एक", "ایک"],
    ["वेबसाइट", "ویبسائٹ"], ["आइए", "آئیے"], ["जाओ", "جاؤ"], ["ज़िंदगी", "زندگی"], ["ख़ुश", "خش"], ["कहानी", "کہانی"],
    ["लोग", "لوگ"], ["पूछते", "پوچھتے"], ["करें", "کریں"], ["देंगे", "دینگے"], ["टॉपिक", "ٹاپک"],
  ];
  for (const [hi, ur] of cases) assert.equal(devanagariToUrdu(hi), ur, hi);
  assert.equal(devanagariToUrdu("सलाम! क्या हाल है?"), "سلام! کیا ہال ہے؟"); // ہال and حال sound the same
  assert.equal(devanagariToUrdu("Kahanio में।"), "Kahanio میں۔");
  assert.equal(hasDevanagari("hello"), false);
  assert.equal(hasDevanagari("hello है"), true);
});

test("Hindi-script videos use the Urdu voices; script writer asks for Devanagari", async () => {
  const { buildMessages } = await import("../src/llm.ts");
  assert.match(buildMessages("cold email", "hi", 30)[1].content, /Devanagari/);
});

test("worker: session tokens are signed, IP-bound and expire", async () => {
  const { signSession, verifySession, SESSION_SECONDS } = await import("../worker/core.ts");
  const now = 1_800_000_000_000;
  const tok = await signSession("secret-1", "1.2.3.4", now);
  assert.equal(await verifySession("secret-1", tok, "1.2.3.4", now + 1000), true);
  assert.equal(await verifySession("secret-1", tok, "5.6.7.8", now), false, "other IP");
  assert.equal(await verifySession("secret-2", tok, "1.2.3.4", now), false, "other secret");
  assert.equal(await verifySession("secret-1", tok, "1.2.3.4", now + (SESSION_SECONDS + 5) * 1000), false, "expired");
  assert.equal(await verifySession("secret-1", tok.slice(0, -2) + "xx", "1.2.3.4", now), false, "tampered");
});

test("worker: CORS answers only allowed origins", async () => {
  const { corsHeaders } = await import("../worker/core.ts");
  const allowed = "https://kahanio.clientorahq.com,http://localhost:4830";
  assert.equal(corsHeaders("http://localhost:4830", allowed)["Access-Control-Allow-Origin"], "http://localhost:4830");
  assert.equal(corsHeaders("https://evil.example", allowed)["Access-Control-Allow-Origin"], "https://kahanio.clientorahq.com");
});

test("voice languages: English, Urdu, Hindi script with Urdu voice, and Hindi; greetings are Islamic", async () => {
  const { ONLINE_VOICES } = await import("../worker/core.ts");
  for (const l of ["en", "ur", "hi"]) assert.ok(ONLINE_VOICES.some((v) => v.lang === l), l);
  const { buildMessages } = await import("../src/llm.ts");
  assert.match(buildMessages("x", "en", 30)[0].content, /Assalam o Alaikum/);
  const { TEMPLATES, GOALS } = await import("../src/templates.ts");
  const all = [...TEMPLATES.flatMap((t) => t.sample), ...GOALS.flatMap((g) => g.starter("topic"))].join(" ");
  assert.doesNotMatch(all, /\b(Salaam|Namaste|Hello)\b|नमस्ते/);
});

test("worker stock: search words are cleaned; only Pexels video files can be streamed", async () => {
  const { validateStock, isPexelsVideoUrl } = await import("../worker/core.ts");
  assert.deepEqual(validateStock({ q: " laptop <b>office</b>!! ", orientation: "portrait", session: "s" }), { q: "laptop b office b", orientation: "portrait", session: "s" });
  assert.ok("error" in validateStock({ q: "", orientation: "portrait", session: "s" }));
  assert.ok("error" in validateStock({ q: "x", orientation: "square", session: "s" }));
  assert.equal(isPexelsVideoUrl("https://videos.pexels.com/video-files/123/123-hd_1080_1920_25fps.mp4"), true);
  assert.equal(isPexelsVideoUrl("http://videos.pexels.com/a.mp4"), false);
  assert.equal(isPexelsVideoUrl("https://evil.example/videos.pexels.com/a.mp4"), false);
  assert.equal(isPexelsVideoUrl("https://videos.pexels.com.evil.example/a.mp4"), false);
  assert.equal(isPexelsVideoUrl("https://videos.pexels.com/a.html"), false);
});

test("SEO guide pages: titles under 60, descriptions under 160, one H1, FAQ in schema, in the sitemap", async () => {
  const { GUIDES } = await import("../scripts/build-guides.mjs");
  const sitemap = readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8");
  const llms = readFileSync(new URL("../public/llms.txt", import.meta.url), "utf8");
  for (const g of GUIDES as { slug: string; title: string; description: string; faq: string[][]; answer: string }[]) {
    assert.ok(g.title.length < 60, g.title);
    assert.ok(g.description.length < 160, g.slug);
    const words = g.answer.split(/\s+/).length;
    assert.ok(words >= 40 && words <= 65, `${g.slug} answer ${words} words`);
    const html = readFileSync(new URL(`../${g.slug}.html`, import.meta.url), "utf8");
    assert.equal(html.match(/<h1[ >]/g)?.length, 1, g.slug);
    assert.match(html, /"@type":"FAQPage"/);
    assert.ok(g.faq.every(([q]) => html.includes(q.replace(/&/g, "&amp;"))), g.slug);
    assert.ok(sitemap.includes(`/${g.slug}<`) && llms.includes(`/${g.slug})`), g.slug);
    assert.doesNotMatch(html, /reelora|moneyprinter/i);
  }
});

test("checkScript: a good script is ready, problems are named in plain words", async () => {
  const { checkScript, recipeExample } = await import("../src/scriptcheck.ts");
  const good = checkScript(parseScript(recipeExample("cold email").join("\n")));
  assert.equal(good.verdict, "ready", JSON.stringify(good.items));
  assert.ok(good.seconds >= 10 && good.seconds <= 45);
  const bad = checkScript(parseScript("Hello everyone, welcome to my channel and today we talk about websites\nVisit www.example.com for $99 #web 🚀"), { platformSafe: true });
  assert.equal(bad.verdict, "fix");
  const text = bad.items.map((i) => i.text).join(" ");
  assert.match(text, /greeting/);
  assert.match(text, /emojis and hashtags/);
  assert.match(text, /link or web address/);
  assert.match(text, /price/);
  assert.equal(checkScript([]).verdict, "fix");
  const urdu = checkScript(parseScript("کیا آپ کو کلائنٹ نہیں مل رہے؟\nلوگ روز سروس مانگتے ہیں۔\nانہیں پہلے جواب دیں۔\nمزید کے لیے فالو کریں۔"));
  assert.notEqual(urdu.verdict, "fix", JSON.stringify(urdu.items));
});

test("buildMessages carries the viral rules and the platform-safe switch; parseExtras reads caption and hashtags", async () => {
  const { buildMessages, parseExtras, VIRAL_RULES } = await import("../src/llm.ts");
  const m = buildMessages("cold email", "en", 30, { platformSafe: true });
  assert.ok(VIRAL_RULES.every((r) => m[0].content.includes(r)));
  assert.match(m[0].content, /no digits, no prices/);
  assert.doesNotMatch(buildMessages("x", "en", 30)[0].content, /no digits/);
  assert.deepEqual(parseExtras('```json\n{"scenes":[],"caption":"Hi there","hashtags":["#freelance","web design"]}\n```'), { caption: "Hi there", hashtags: ["freelance", "webdesign"] });
  assert.deepEqual(parseExtras("not json"), { caption: "", hashtags: [] });
});

test("worker validateScript accepts a clean request and refuses bad ones", async () => {
  const { validateScript, SCRIPT_MODELS } = await import("../worker/core.ts");
  assert.deepEqual(validateScript({ topic: "  Cold\nemail tips ", lang: "ur", seconds: 30, platformSafe: true, session: "s" }), { topic: "Cold email tips", lang: "ur", seconds: 30, platformSafe: true, session: "s" });
  assert.ok("error" in validateScript({ topic: "a", lang: "en", seconds: 30, session: "s" }));
  assert.ok("error" in validateScript({ topic: "valid topic", lang: "fr", seconds: 30, session: "s" }));
  assert.ok("error" in validateScript({ topic: "valid topic", lang: "en", seconds: 999, session: "s" }));
  assert.ok("error" in validateScript({ topic: "valid topic", lang: "en", seconds: 30 }));
  assert.equal(validateScript({ topic: "x".repeat(500), lang: "en", seconds: 20, session: "s" }).hasOwnProperty("topic") && (validateScript({ topic: "x".repeat(500), lang: "en", seconds: 20, session: "s" }) as { topic: string }).topic.length, 160);
  assert.deepEqual(SCRIPT_MODELS.map((m) => m.keyName), ["GROQ_KEY", "GEMINI_KEY"]);
});

test("ClientoraHQ ad: trial price switches after 5 Jan 2027, links carry the placement", async () => {
  const { trialPrice, chqLink, promoCopy } = await import("../src/promo.ts");
  assert.equal(trialPrice(Date.UTC(2026, 10, 18)), "$7.50");
  assert.equal(trialPrice(Date.UTC(2027, 0, 5, 12)), "$7.50");
  assert.equal(trialPrice(Date.UTC(2027, 0, 6, 1)), "$25");
  assert.match(chqLink("after_video"), /^https:\/\/clientorahq\.com\/\?utm_source=kahanio&utm_medium=referral&utm_campaign=after_video$/);
  assert.match(promoCopy(Date.UTC(2027, 1, 1)).sponsor.cta, /\$25/);
});
