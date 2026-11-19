// Product ad helpers (pure, tested): which scenes carry an offer, the starter ad script, the call-to-action presets.

/** True when a scene talks about an offer, so the ad shows an "OFFER" badge (no numbers drawn: TikTok-safe). */
export function isOfferScene(text: string): boolean {
  return /\b(off|sale|discount|offer|deal|free delivery|free shipping|limited|today only)\b|%|رعایت|آفر|سیل|ڈسکاؤنٹ|छूट|ऑफ़र|सेल/i.test(text);
}

export const AD_CTAS = ["Order now on WhatsApp.", "Send us a message to order.", "Visit our shop today.", "Comment 'price' and we will reply."];

/** A five-scene ad that works with any product name. The product is a label, never glued into a sentence. */
export function adStarter(product: string, cta = AD_CTAS[0]): string[] {
  const p = product.trim() ? product.trim().charAt(0).toUpperCase() + product.trim().slice(1) : "Our product";
  return [`${p}: have you seen it yet?`, "Made with care, ready for every day.", "Look closer: the details make the difference.", "Special offer for this week only.", cta];
}

/** Text for the final call-to-action button: the last scene, kept short. */
export function ctaLabel(lastScene: string): string {
  const t = lastScene.trim().replace(/[.!]+$/, "");
  return t.length > 42 ? t.slice(0, 40).replace(/\s+\S*$/, "") + "…" : t;
}
