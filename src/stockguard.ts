// Keeps stock footage true to the video's subject (pure, tested).
// A Jumma video once got a church and a church candle for "prayer" and "hands praying", and calendars showing
// other dates for "calendar, date". Islamic topics now search Muslim scenes and can never use another faith's
// worship imagery; calendar and number words are swapped for neutral scenes, since they show wrong dates.

const ISLAMIC = /\b(jumm?ah?|juma|jumuah|friday prayer|eid|ramadan|ramzan|iftar|suhoor|sehri|allah|masjid|mosque|quran|qur'an|dua|namaz|salah|salat|islam|islamic|muslim|hajj|umrah|mubarak|assalam)\b|عید|جمعہ|جمعة|رمضان|اللہ|الله|مسجد|قرآن|دعا|نماز|اسلام|مبارک/i;

export function isIslamicContext(text: string): boolean {
  return ISLAMIC.test(text);
}

// Words that pull in pictures of dates, numbers or calendars (which then show the wrong date).
const DATEY = /^(calendar|date|dates|day|page|number|numbers|clock|time|planner|schedule|today)$/i;
// Worship words that, without context, Pexels mostly answers with churches and candles.
const WORSHIP = /^(prayer|praying|pray|congregation|worship|faith|blessing|blessings|church|god|lord|hands|candle|spiritual|holy|believers?)$/i;

/** Better search words for one scene: Muslim scenes for Islamic topics; no calendar/number footage. */
export function refineKeywords(keywords: string[], islamic: boolean): string[] {
  const out: string[] = [];
  for (const raw of keywords) {
    const k = raw.trim().toLowerCase();
    if (!k) continue;
    if (DATEY.test(k)) continue;
    if (islamic && WORSHIP.test(k)) {
      out.push(k === "hands" ? "muslim dua hands" : "muslim prayer mosque");
      continue;
    }
    out.push(k);
  }
  if (islamic && !out.some((k) => /mosque|muslim|quran|masjid|dua|islam/.test(k))) out.unshift("mosque");
  if (!out.length) out.push(islamic ? "mosque" : "city sunrise");
  return [...new Set(out)].slice(0, 3);
}

// Clip pages on Pexels carry the description in the address, e.g. /video/woman-praying-in-a-church-123/.
const OTHER_WORSHIP = /church|cathedral|chapel|cross|crucifix|christ|jesus|bible|nun|priest|candle|rosary|temple|buddh|hindu|shiva|ganesh|krishna|diwali|holi|christmas|easter|halloween|wine|beer|alcohol|cocktail|pork|pig/i;

/** True when a clip must not be used for this video. */
export function blockedClip(pageUrl: string, islamic: boolean): boolean {
  return islamic && OTHER_WORSHIP.test(pageUrl);
}
