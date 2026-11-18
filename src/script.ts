export type Scene = { text: string; keywords: string[] };

const MAX_SCENES = 12;
const MAX_SCENE_CHARS = 220;

const STOP = new Set(
  "a an the and or but if then so to of in on for with at by from is are was were be been it its this that these those you your we our they their i me my he she his her as not no do does did can will just more most very what how why when who which into out up about than too also get got have has had here there".split(
    " ",
  ),
);

export function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Picks up to two search words from a sentence: the longest words that are not stop words. */
export function guessKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  const unique = [...new Set(words)];
  unique.sort((a, b) => b.length - a.length);
  return unique.slice(0, 2);
}

function clampScene(text: string, keywords: string[]): Scene | null {
  let t = clean(text);
  if (!t) return null;
  if (t.length > MAX_SCENE_CHARS) t = t.slice(0, MAX_SCENE_CHARS).replace(/\s+\S*$/, "") + "…";
  const kw = keywords.map(clean).filter(Boolean).slice(0, 3);
  return { text: t, keywords: kw.length ? kw : guessKeywords(t) };
}

function fromJson(raw: string): Scene[] | null {
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (m ? m[1] : raw).trim();
  if (!body.startsWith("{") && !body.startsWith("[")) return null;
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  const list = Array.isArray(data) ? data : (data as { scenes?: unknown }).scenes;
  if (!Array.isArray(list)) return null;
  const out: Scene[] = [];
  for (const item of list) {
    if (typeof item === "string") {
      const s = clampScene(item, []);
      if (s) out.push(s);
    } else if (item && typeof item === "object") {
      const o = item as { text?: unknown; keywords?: unknown };
      const kws = Array.isArray(o.keywords) ? o.keywords.filter((k): k is string => typeof k === "string") : [];
      const s = typeof o.text === "string" ? clampScene(o.text, kws) : null;
      if (s) out.push(s);
    }
  }
  return out;
}

/**
 * Turns an AI reply or a script the user typed into scenes.
 * Accepts JSON ({scenes:[{text, keywords}]}) or plain text: one scene per line,
 * with optional search words in square brackets at the end, e.g. "Find clients fast [laptop, office]".
 */
export function parseScript(raw: string): Scene[] {
  const json = fromJson(raw);
  if (json && json.length) return json.slice(0, MAX_SCENES);
  const out: Scene[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const l = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "");
    const m = l.match(/^(.*?)\s*\[([^\]]*)\]\s*$/);
    const text = m ? m[1] : l;
    const kws = m ? m[2].split(",") : [];
    const s = clampScene(text, kws);
    if (s) out.push(s);
  }
  return out.slice(0, MAX_SCENES);
}

/** A no-AI starter script so the tool works with no key at all. The page tells the user to edit it. */
export function templateScript(topic: string): Scene[] {
  const t = clean(topic) || "your topic";
  const T = t.charAt(0).toUpperCase() + t.slice(1);
  return [
    `${T}: here is what most people miss.`,
    `First: know exactly who it is for, and what problem it solves.`,
    `Second: start small. One clear step today beats a perfect plan next month.`,
    `Third: measure one number every week, and change one thing at a time.`,
    `Save this, and share it with someone who needs it.`,
  ].map((text, i) => ({ text, keywords: i === 0 ? guessKeywords(t) : guessKeywords(text) }));
}

/** Scenes back to the editable text form ("text [kw, kw]" per line). */
export function scenesToText(scenes: Scene[]): string {
  return scenes.map((s) => (s.keywords.length ? `${s.text} [${s.keywords.join(", ")}]` : s.text)).join("\n");
}
