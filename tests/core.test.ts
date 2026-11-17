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
    assert.ok(["story", "pop", "clean", "neon", "chat", "news"].includes(s.style), f);
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
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, 6);
  for (const t of TEMPLATES) assert.ok(sampleScenes(t).length >= 3, t.id);
  for (const g of GOALS) {
    assert.ok(TEMPLATES.some((t) => t.id === g.style), g.id);
    assert.ok(parseScript(g.starter("cold email").join("\n")).length >= 4, g.id);
  }
});
