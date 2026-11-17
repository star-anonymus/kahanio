// Hindi script (Devanagari) -> Urdu script, so text written in Hindi letters can be spoken by an Urdu voice.
// Spoken Hindi and Urdu are one language (Hindustani); only the alphabet differs. Rule-based: short vowels are
// dropped as Urdu usually writes them, and homophone letters take their most common Urdu form (ज़ -> ز, स -> س).

const CONS: Record<string, string> = {
  क: "ک", ख: "کھ", ग: "گ", घ: "گھ", ङ: "ن", च: "چ", छ: "چھ", ज: "ج", झ: "جھ", ञ: "ن",
  ट: "ٹ", ठ: "ٹھ", ड: "ڈ", ढ: "ڈھ", ण: "ن", त: "ت", थ: "تھ", द: "د", ध: "دھ", न: "ن",
  प: "پ", फ: "پھ", ब: "ب", भ: "بھ", म: "م", य: "ی", र: "ر", ल: "ل", ळ: "ل", व: "و",
  श: "ش", ष: "ش", स: "س", ह: "ہ",
  // precomposed nukta letters
  क़: "ق", ख़: "خ", ग़: "غ", ज़: "ز", ड़: "ڑ", ढ़: "ڑھ", फ़: "ف", य़: "ی",
};
// Consonant + nukta (U+093C) written as two characters.
const NUKTA: Record<string, string> = { क: "ق", ख: "خ", ग: "غ", ज: "ز", ड: "ڑ", ढ: "ڑھ", फ: "ف", य: "ی" };

const INDEP: Record<string, string> = {
  अ: "ا", आ: "آ", इ: "ا", ई: "ای", उ: "ا", ऊ: "او", ऋ: "ر", ए: "اے", ऐ: "اے", ओ: "او", औ: "او", ऑ: "آ",
};
// An independent vowel right after another vowel is carried by hamza in Urdu (साइट -> سائٹ, बनाएगा -> بنائیگا).
const AFTER_VOWEL: Record<string, string> = { अ: "ئ", आ: "آ", इ: "ئ", ई: "ئی", उ: "ؤ", ऊ: "ؤ", ओ: "ؤ", औ: "ؤ" };
const HALANT = "्";
const NUKTA_SIGN = "़";

/** Long-vowel signs. "e"/"ai" are ے at the end of a word (before an optional nasal) and ی inside it. */
function matra(m: string, wordEnd: boolean): string {
  switch (m) {
    case "ा":
      return "ا";
    case "ी":
      return "ی";
    case "ू":
    case "ो":
    case "ौ":
      return "و";
    case "े":
    case "ै":
      return wordEnd ? "ے" : "ی";
    case "ॉ":
      return "ا";
    case "ृ":
      return "ر";
    default:
      return ""; // ि ु and others: short vowels, not written in Urdu
  }
}

const isDeva = (c: string) => c >= "ऀ" && c <= "ॿ";
const isMark = (c: string) => /[ा-ौॢॣँ-ः]/.test(c);

export function hasDevanagari(s: string): boolean {
  return /[ऀ-ॿ]/.test(s);
}

export function devanagariToUrdu(input: string): string {
  const chars = [...input.normalize("NFC")];
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const next = chars[i + 1] ?? "";
    // Word end: the next character that is not a vowel sign or nasal mark is not Devanagari.
    let j = i + 1;
    while (j < chars.length && /[ँं]/.test(chars[j])) j++;
    const atEnd = !isDeva(chars[j] ?? " ") || chars[j] === "।" || chars[j] === "॥";
    if (CONS[c]) {
      out += next === NUKTA_SIGN && NUKTA[c] ? NUKTA[c] : CONS[c];
      if (next === NUKTA_SIGN) i++;
      continue;
    }
    if (INDEP[c]) {
      const prev = chars[i - 1] ?? " ";
      const afterVowel = isDeva(prev) && (isMark(prev) || !!INDEP[prev]) && prev !== "्";
      if (afterVowel && (c === "ए" || c === "ऐ") && /[इईिी]/.test(prev)) out += atEnd ? "یے" : "ی"; // आइए -> آئیے
      else if (afterVowel && (c === "ए" || c === "ऐ")) out += atEnd ? "ئے" : "ئی";
      else if (afterVowel && AFTER_VOWEL[c]) out += AFTER_VOWEL[c];
      else if (c === "ए" || c === "ऐ") out += atEnd ? "اے" : "ای"; // एक -> ایک
      else out += INDEP[c];
      continue;
    }
    if (isMark(c) && c !== "ं" && c !== "ँ" && c !== "ः") {
      // "e"/"ai" before a final nasal is ی + ں (में -> میں, हैं -> ہیں), otherwise ے at the end.
      const nasalEnd = (next === "ं" || next === "ँ") && atEnd;
      out += (c === "े" || c === "ै") && nasalEnd ? "ی" : matra(c, atEnd);
      continue;
    }
    if (c === "ं" || c === "ँ") {
      out += atEnd ? "ں" : "ن";
      continue;
    }
    if (c === "ः") {
      out += "ہ";
      continue;
    }
    if (c === HALANT || c === NUKTA_SIGN) continue;
    if (c === "।" || c === "॥") {
      out += "۔";
      continue;
    }
    if (c >= "०" && c <= "९") {
      out += String(c.charCodeAt(0) - 0x0966);
      continue;
    }
    if (c === "?") {
      out += "؟";
      continue;
    }
    if (c === ",") {
      out += "،";
      continue;
    }
    out += c;
  }
  return out;
}
