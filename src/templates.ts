// The template gallery: visual styles, and goal presets that pick a style plus a starter script.
import { guessKeywords, type Scene } from "./script.ts";
import type { StyleId } from "./styles.ts";
import { adStarter } from "./adcopy.ts";

export type Template = { id: StyleId; name: string; blurb: string; sample: string[] };

export const TEMPLATES: Template[] = [
  { id: "story", name: "Story", blurb: "Story bars, scene numbers, word-by-word captions.", sample: ["Clients are already asking for your service.", "Find them before your competitors do.", "Reply with a real, helpful message."] },
  { id: "ad", name: "Product Ad", blurb: "Your product photo moving in 3D, ad copy, an offer badge and an order button.", sample: ["New arrival: have you seen it yet?", "Special offer for this week only.", "Order now on WhatsApp."] },
  { id: "real", name: "Real", blurb: "Real footage, full screen, calm film-style captions. No graphics.", sample: ["Every shop on this street has a story.", "Most of them are not online yet.", "A simple website changes that."] },
  { id: "pop", name: "Bold Pop", blurb: "Flat colours and huge words that pop in.", sample: ["Stop scrolling.", "Three tips that get you replies.", "Save this for later."] },
  { id: "clean", name: "Clean", blurb: "Calm cream page, words that darken as they are read.", sample: ["Good work speaks quietly.", "Show one clear result.", "Let the client ask for more."] },
  { id: "neon", name: "Neon Night", blurb: "Glowing captions over a moving synth grid.", sample: ["Late night idea.", "Build it before morning.", "Ship it tomorrow."] },
  { id: "chat", name: "Chat", blurb: "Each scene arrives as a chat message.", sample: ["Can anyone build me a website?", "Yes! Here are three examples of my work.", "Perfect, let us talk today."] },
  { id: "cartoon", name: "Cartoon", blurb: "A 2D cartoon character says your script, with lip-sync.", sample: ["Assalam o Alaikum! Want more clients?", "People ask for your service online every day.", "Answer them first, and answer well."] },
  { id: "news", name: "Headline", blurb: "Headline card, label and a ticker with your topic.", sample: ["Most small shops still have no website.", "Customers search online before they visit.", "A simple site can change that."] },
];

/** The topic is used as a label, so any phrase reads well ("cold email tips", "How to find clients"). */
const cap = (t: string) => (t.trim() ? t.trim().charAt(0).toUpperCase() + t.trim().slice(1) : "Your topic");

export type Goal = { id: string; title: string; text: string; style: StyleId; format: "9:16" | "16:9"; starter: (topic: string) => string[]; occasion?: boolean };

export const GOALS: Goal[] = [
  {
    id: "ad",
    title: "Product ad from a photo",
    text: "Add your product photo: get a moving ad with an order button.",
    style: "ad",
    format: "9:16",
    starter: (t) => adStarter(t),
  },
  {
    id: "tips",
    title: "Tips and how-to",
    text: "Teach one useful thing in 30 seconds.",
    style: "story",
    format: "9:16",
    starter: (t) => [`${cap(t)}: three quick tips.`, "Tip one: start with the problem, not the product.", "Tip two: keep one clear next step.", "Tip three: check one number every week.", "Follow for more short tips."],
  },
  {
    id: "promo",
    title: "Promote your service",
    text: "Show what you do and who it is for.",
    style: "pop",
    format: "9:16",
    starter: (t) => [`${cap(t)}? Here is how I can help.`, "Here is what you get.", "Clear price. Fast delivery. Real support.", "Message me today."],
  },
  {
    id: "urdu",
    title: "Urdu kahani",
    text: "اردو میں کہانی، کیپشن کے ساتھ۔",
    style: "clean",
    format: "9:16",
    starter: (t) => [`آج کی کہانی: ${t}`, "سب کچھ ایک چھوٹے سے قدم سے شروع ہوا۔", "راستے میں مشکلیں آئیں، مگر ہمت نہیں ہاری۔", "ہر دن تھوڑا سا بہتر کیا۔", "آپ کی کہانی کیا ہے؟ کمنٹ میں بتائیں۔"],
  },
  {
    id: "dialogue",
    title: "Question and answer",
    text: "A client asks, you answer: as a chat.",
    style: "chat",
    format: "9:16",
    starter: (t) => [`Quick question: ${cap(t)}?`, "Sure, ask away!", "Where do I even start?", "Start small: one clear step today.", "That helps, thanks!"],
  },
  {
    id: "facts",
    title: "Quick facts",
    text: "Facts and updates as headlines.",
    style: "news",
    format: "16:9",
    starter: (t) => [`${cap(t)}: what you should know.`, "Point one: the basics, in one line.", "Point two: the common mistake.", "Point three: what to do next."],
  },
  {
    id: "cartoon",
    title: "Cartoon explainer",
    text: "A 2D cartoon character explains it for you.",
    style: "cartoon",
    format: "9:16",
    starter: (t) => [`Assalam o Alaikum! Today: ${cap(t)}.`, "Here is the simple version.", "Start with one small step today.", "Then do it again tomorrow.", "Follow for more!"],
  },
  {
    id: "quote",
    title: "Night thoughts",
    text: "One idea, big and glowing.",
    style: "neon",
    format: "9:16",
    starter: (t) => [`${cap(t)}: one thought.`, "Small steps, every day.", "Nobody sees the practice.", "Everybody sees the result."],
  },
  // ---- Pakistan occasions: the topic box holds the business name; greetings stay Islamic and respectful. ----
  {
    id: "eid",
    title: "Eid Mubarak",
    text: "A warm Eid greeting from your business.",
    style: "pop",
    format: "9:16",
    occasion: true,
    starter: (t) => ["Eid Mubarak!", "May this Eid bring peace, joy and blessings to your home.", `With warm wishes from ${cap(t)}.`, "Share this greeting with someone you love."],
  },
  {
    id: "eid-ur",
    title: "عید مبارک",
    text: "اردو میں عید کی مبارکباد، آپ کے کاروبار کی طرف سے۔",
    style: "clean",
    format: "9:16",
    occasion: true,
    starter: (t) => ["عید مبارک!", "اللہ آپ کے گھر میں خوشیاں اور برکتیں لائے۔", `${t.trim() || "ہماری"} کی طرف سے دلی مبارکباد۔`, "یہ پیغام اپنے پیاروں کے ساتھ شیئر کریں۔"],
  },
  {
    id: "ramzan",
    title: "Ramzan Kareem",
    text: "A calm Ramzan message for your customers.",
    style: "clean",
    format: "9:16",
    occasion: true,
    starter: (t) => ["Ramzan Kareem.", "A month of patience, prayer and kindness.", `${cap(t)} wishes you and your family a blessed Ramzan.`, "Remember us in your duas."],
  },
  {
    id: "jumma",
    title: "Jumma Mubarak",
    text: "A short Friday greeting, every week.",
    style: "clean",
    format: "9:16",
    occasion: true,
    starter: (t) => ["Jumma Mubarak.", "Take a moment today for gratitude and dua.", `With best wishes from ${cap(t)}.`, "Share it with your family and friends."],
  },
  {
    id: "azadi",
    title: "14 August",
    text: "Independence Day wishes from your team.",
    style: "pop",
    format: "9:16",
    occasion: true,
    starter: (t) => ["Happy Independence Day, Pakistan!", "Proud of our people, our work and our future.", `${cap(t)} celebrates with you.`, "Pakistan Zindabad!"],
  },
];

export function sampleScenes(t: Template): Scene[] {
  return t.sample.map((text) => ({ text, keywords: guessKeywords(text) }));
}
