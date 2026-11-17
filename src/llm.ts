// Script writing on a free AI tier with the visitor's own key. The request goes straight from the browser to the provider.

export type ProviderId = "groq" | "gemini" | "openrouter";
export type Provider = { id: ProviderId; name: string; baseURL: string; model: string; keyUrl: string; note: string };

export const PROVIDERS: Provider[] = [
  { id: "groq", name: "Groq", baseURL: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", keyUrl: "https://console.groq.com/keys", note: "Free plan. Does not train on your data." },
  { id: "gemini", name: "Google Gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-flash-latest", keyUrl: "https://aistudio.google.com/apikey", note: "Free tier. Google may use free-tier prompts to improve its products." },
  { id: "openrouter", name: "OpenRouter (free models)", baseURL: "https://openrouter.ai/api/v1", model: "openrouter/free", keyUrl: "https://openrouter.ai/settings/keys", note: "50 free requests a day. Some free models log prompts." },
];

export type ScriptLang = "en" | "ur";

export function buildMessages(topic: string, lang: ScriptLang, seconds: number) {
  const scenes = Math.max(4, Math.min(10, Math.round(seconds / 5)));
  const language = lang === "ur" ? "Urdu in Urdu script" : "simple English";
  return [
    {
      role: "system",
      content:
        "You write scripts for short vertical videos. Facts only: never invent numbers, quotes, prices or studies. " +
        'No hashtags, no emojis. Reply with JSON only: {"scenes":[{"text":"...","keywords":["...","..."]}]}. ' +
        'keywords are 1-3 English words for searching stock video (things a camera can film, e.g. "laptop office").',
    },
    {
      role: "user",
      content: `Topic: ${topic}\nLanguage of the text: ${language}\nAbout ${seconds} seconds, ${scenes} scenes, one or two short sentences each. Scene 1 is a hook; the last scene is a soft call to action.`,
    },
  ];
}

export async function writeScript(p: Provider, key: string, topic: string, lang: ScriptLang, seconds: number, signal?: AbortSignal): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${p.baseURL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: p.model, messages: buildMessages(topic, lang, seconds), temperature: 0.7 }),
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
