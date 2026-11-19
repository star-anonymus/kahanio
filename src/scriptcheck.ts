// Checks a script the way a short-video editor would, and says in plain words what to fix. Pure: tested without a browser.
import type { Scene } from "./script.ts";
import { sceneTimings, wordCount } from "./timing.ts";

export type CheckLevel = "good" | "fix" | "tip";
export type CheckItem = { level: CheckLevel; text: string };
export type CheckResult = { verdict: "ready" | "almost" | "fix"; seconds: number; items: CheckItem[] };

const CTA = /\b(follow|save|share|comment|subscribe|try|search|message|dm|visit|join|download|book|call|reply|tag|link in bio)\b|فالو|سیو|شیئر|کمنٹ|سرچ|میسج|رابطہ|फ़ॉलो|फॉलो|शेयर|कमेंट|सर्च|मैसेज/i;
const HOOKY = /\?|؟|\byou(r)?\b|\bstop\b|\bnever\b|\bwhy\b|\bhow\b|\bsecret\b|\bmistakes?\b|\bwrong\b|\bmost people\b|\bnobody\b|آپ|کیوں|کیسے|غلطی|आप|क्यों|कैसे|गलती/i;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const OPENERS = /^(hi|hello|hey|welcome|in this video|today (i|we))/i;

export function checkScript(scenes: Scene[], opts: { platformSafe?: boolean } = {}): CheckResult {
  const items: CheckItem[] = [];
  if (!scenes.length) return { verdict: "fix", seconds: 0, items: [{ level: "fix", text: "Write at least three lines: a hook, a point, and an ending." }] };

  const spans = sceneTimings(scenes);
  const seconds = Math.round(spans[spans.length - 1].end);
  const all = scenes.map((s) => s.text).join(" ");

  // Length
  if (scenes.length < 3) items.push({ level: "fix", text: `Only ${scenes.length} scene${scenes.length === 1 ? "" : "s"}. Three to eight scenes work best.` });
  else if (scenes.length > 10) items.push({ level: "fix", text: `${scenes.length} scenes is a lot. Keep it to eight or fewer.` });
  if (seconds > 60) items.push({ level: "fix", text: `About ${seconds} seconds: too long for a reel. Aim for 20 to 45 seconds.` });
  else if (seconds < 10) items.push({ level: "tip", text: `About ${seconds} seconds: very short. Add one more useful point.` });
  else items.push({ level: "good", text: `About ${seconds} seconds: a good length.` });

  // Hook
  const first = scenes[0].text;
  if (OPENERS.test(first.trim())) items.push({ level: "fix", text: "Scene 1 opens with a greeting or \"in this video\". Start with the hook instead: people swipe in the first two seconds." });
  else if (wordCount(first) > 14) items.push({ level: "fix", text: "Scene 1 is long. Make the hook short: under ten words." });
  else if (HOOKY.test(first)) items.push({ level: "good", text: "Scene 1 is a hook." });
  else items.push({ level: "tip", text: "Make scene 1 grab attention: ask a question, name a mistake, or speak to \"you\"." });

  // Scene length and repeats
  scenes.forEach((s, i) => {
    if (wordCount(s.text) > 28) items.push({ level: "fix", text: `Scene ${i + 1} is long. Split it in two: one idea per scene.` });
  });
  const seen = new Set<string>();
  scenes.forEach((s, i) => {
    const k = s.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (k && seen.has(k)) items.push({ level: "fix", text: `Scene ${i + 1} repeats an earlier scene.` });
    seen.add(k);
  });

  // Ending
  if (scenes.length > 1 && CTA.test(scenes[scenes.length - 1].text)) items.push({ level: "good", text: "The last scene asks for one action." });
  else items.push({ level: "tip", text: "End with one clear ask: follow, save, comment, or try it." });

  // Things the voice and the platforms do not like
  if (EMOJI.test(all) || /#\w/.test(all)) items.push({ level: "fix", text: "Remove emojis and hashtags from the script: the voice would read them. Put hashtags in the post caption." });
  if (opts.platformSafe) {
    if (/https?:\/\/|www\.|\.com\b|\.pk\b/i.test(all)) items.push({ level: "fix", text: "A link or web address is in the video. TikTok can limit reach: say \"link in bio\" or \"search our name\"." });
    if (/[$€£₹₨]|\b(rs|pkr|usd|price|qr)\b/i.test(all)) items.push({ level: "fix", text: "A price or QR code is mentioned. TikTok can limit promotional videos: keep prices in the caption or DMs." });
    if (/\d/.test(all)) items.push({ level: "tip", text: "There are numbers in the script. For TikTok, write small numbers as words." });
  }

  items.push(...dateProblems(all));

  const fixes = items.filter((x) => x.level === "fix").length;
  const tips = items.filter((x) => x.level === "tip").length;
  return { verdict: fixes ? "fix" : tips ? "almost" : "ready", seconds, items };
}

/** The simple recipe shown under the script box, with a fill-in example for the topic. */
export const RECIPE = [
  { step: "Hook", hint: "Scene 1, under ten words. A question, a mistake, or a surprising truth." },
  { step: "Problem", hint: "Why it matters to the viewer, in one line." },
  { step: "Value", hint: "Two or three scenes: one tip, step or example each." },
  { step: "Ending", hint: "One ask: follow, save, comment, or try it." },
];

export function recipeExample(topic: string): string[] {
  const t = topic.trim() || "your topic";
  const T = t.charAt(0).toUpperCase() + t.slice(1);
  return [
    // Works with any topic phrase ("cold email tips", "How to find clients"): the topic is a label, not part of a sentence.
    `${T}? Most people get this wrong.`,
    "Here is what actually works.",
    "First: start with the one thing your audience needs most.",
    "Second: show a real example, not a promise.",
    "Third: keep doing it every week.",
    "Save this, and follow for more.",
  ];
}

// ---- Date check: a Jumma video once said "the twenty third of November", which was a Monday. ----
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const ORD: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30 };

function ordinalWords(s: string): number | null {
  const t = s.toLowerCase().replace(/-/g, " ").trim();
  if (ORD[t]) return ORD[t];
  const m = t.match(/^(twenty|thirty) (\w+)$/);
  if (m && ORD[m[2]] && ORD[m[2]] < 10) return (m[1] === "twenty" ? 20 : 30) + ORD[m[2]];
  return null;
}

/** Dates written in English in the text: "23 November", "November 23rd", "the twenty third of November". */
export function findDates(text: string): { day: number; month: number }[] {
  const out: { day: number; month: number }[] = [];
  const mon = MONTHS.join("|");
  const ord = "(?:twenty|thirty)?[- ]?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth";
  const re = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?: of)? (${mon})\\b|\\b(${mon}) (\\d{1,2})(?:st|nd|rd|th)?\\b|\\b(${ord})(?: of)? (${mon})\\b`, "gi");
  for (const m of text.matchAll(re)) {
    const day = m[1] ? +m[1] : m[4] ? +m[4] : ordinalWords(m[5] ?? "");
    const month = MONTHS.indexOf((m[2] ?? m[3] ?? m[6] ?? "").toLowerCase());
    if (day && day >= 1 && day <= 31 && month >= 0) out.push({ day, month });
  }
  return out;
}

/** Problems with dates: a date on a different weekday than the script says (e.g. Jumma on a Monday). */
export function dateProblems(text: string, now: Date = new Date()): CheckItem[] {
  const dates = findDates(text);
  if (!dates.length) return [];
  const lower = text.toLowerCase();
  const said = /\b(jumm?ah?|juma|jumuah)\b|جمعہ/.test(lower) ? 5 : DAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(lower));
  const items: CheckItem[] = [];
  for (const { day, month } of dates) {
    const year = now.getFullYear();
    const d = new Date(Date.UTC(year, month, day));
    const wd = d.getUTCDay();
    const label = `${day} ${MONTHS[month][0].toUpperCase()}${MONTHS[month].slice(1)} ${year}`;
    if (said >= 0 && wd !== said) items.push({ level: "fix", text: `${label} is a ${DAYS[wd][0].toUpperCase()}${DAYS[wd].slice(1)}, not a ${DAYS[said][0].toUpperCase()}${DAYS[said].slice(1)}. Fix the date or remove it.` });
    else items.push({ level: "tip", text: `Check the date is right: ${label} is a ${DAYS[wd][0].toUpperCase()}${DAYS[wd].slice(1)}.` });
  }
  return items;
}
