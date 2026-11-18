// Script writing on a free AI tier with the visitor's own key. The request goes straight from the browser to the provider.

export type ProviderId = "groq" | "gemini" | "openrouter";
export type Provider = { id: ProviderId; name: string; baseURL: string; model: string; keyUrl: string; note: string };

export const PROVIDERS: Provider[] = [
  { id: "groq", name: "Groq", baseURL: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", keyUrl: "https://console.groq.com/keys", note: "Free plan. Does not train on your data." },
  { id: "gemini", name: "Google Gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-flash-latest", keyUrl: "https://aistudio.google.com/apikey", note: "Free tier. Google may use free-tier prompts to improve its products." },
  { id: "openrouter", name: "OpenRouter (free models)", baseURL: "https://openrouter.ai/api/v1", model: "openrouter/free", keyUrl: "https://openrouter.ai/settings/keys", note: "50 free requests a day. Some free models log prompts." },
];

export type ScriptLang = "en" | "ur" | "hi";

export type ScriptOptions = { platformSafe?: boolean };

/** The rules every AI script follows: a structure that holds attention on short-video feeds, facts only. */
export const VIRAL_RULES = [
  "Scene 1 is the hook, under 10 words: a surprising truth, a question the viewer feels, or a bold claim you can back up. Never open with a greeting or \"In this video\".",
  "Scene 2 opens a loop: name the problem or promise what they will get by the end.",
  "Middle scenes give the value: one clear point, step or example per scene, concrete and specific.",
  "The last scene is a soft call to action: follow, save, comment one word, or try the product. Only one ask.",
  "Talk to one person (\"you\"). Spoken style, short sentences (under 14 words), no filler, no jargon.",
];

export function buildMessages(topic: string, lang: ScriptLang, seconds: number, opts: ScriptOptions = {}) {
  const scenes = Math.max(4, Math.min(10, Math.round(seconds / 5)));
  const language = lang === "ur" ? "Urdu in Urdu script" : lang === "hi" ? "everyday spoken Urdu (Hindustani) written in Hindi Devanagari script" : "simple English";
  const safe = opts.platformSafe
    ? " Platform-safe: no digits, no prices, no currency, no links or website addresses, no QR codes, no phone numbers (write small numbers as words)."
    : "";
  return [
    {
      role: "system",
      content:
        "You write scripts for short vertical videos that people watch to the end and share. Facts only: never invent numbers, quotes, prices, results or studies. " +
        VIRAL_RULES.join(" ") +
        " No hashtags, no emojis in the scenes." +
        safe +
        ' Reply with JSON only: {"scenes":[{"text":"...","keywords":["...","..."]}],"caption":"...","hashtags":["...","..."]}. ' +
        'keywords are 1-3 English words for searching stock video (things a camera can film, e.g. "laptop office"). caption is one or two lines for the post, in the same language; hashtags are 3-5 relevant ones without the # sign. ' +
        'If the script greets the viewer, use the Islamic greeting "Assalam o Alaikum" (in the script of the chosen language), never another greeting.',
    },
    {
      role: "user",
      content: `Topic: ${topic}
Language of the text: ${language}
About ${seconds} seconds, ${scenes} scenes, one or two short sentences each.`,
    },
  ];
}

/** Caption and hashtags from an AI reply (when it sent them). */
export function parseExtras(raw: string): { caption: string; hashtags: string[] } {
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  try {
    const j = JSON.parse((m ? m[1] : raw).trim()) as { caption?: unknown; hashtags?: unknown };
    const caption = typeof j.caption === "string" ? j.caption.trim().slice(0, 600) : "";
    const hashtags = Array.isArray(j.hashtags)
      ? j.hashtags.filter((h): h is string => typeof h === "string").map((h) => h.replace(/^#/, "").replace(/\s+/g, "")).filter(Boolean).slice(0, 5)
      : [];
    return { caption, hashtags };
  } catch {
    return { caption: "", hashtags: [] };
  }
}

export async function writeScript(p: Provider, key: string, topic: string, lang: ScriptLang, seconds: number, signal?: AbortSignal, opts: ScriptOptions = {}): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${p.baseURL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: p.model, messages: buildMessages(topic, lang, seconds, opts), temperature: 0.7 }),
      signal,
    });
  } catch {
    throw new Error(`Could not reach ${p.name}. Check your connection and press Retry.`);
  }
  if (res.status === 401 || res.status === 403) throw new Error(`${p.name} refused the key. Check it and press Retry.`);
  if (res.status === 429) throw new Error(`${p.name}'s free limit is used up for now. Wait, pick another provider, or write the script yourself.`);
  if (!res.ok) throw new Error(`${p.name} did not answer (HTTP ${res.status}). Press Retry.`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${p.name} sent an empty answer. Press Retry.`);
  return text;
}
