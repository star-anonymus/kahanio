// ClientoraHQ ads on Kahanio ("from the makers of"). Facts and prices from SLG_Website/llms.txt (18 Nov 2026):
// 30-day trial $7.50 until 5 January 2027, then $25 for 30 days. The offer switches by itself on that date.

export const TRIAL_PROMO_END = Date.UTC(2027, 0, 5, 23, 59, 59); // end of 5 Jan 2027

export function trialPrice(now: number = Date.now()): string {
  return now <= TRIAL_PROMO_END ? "$7.50" : "$25";
}

export function chqLink(placement: "sponsor_card" | "after_video"): string {
  const p = new URLSearchParams({ utm_source: "kahanio", utm_medium: "referral", utm_campaign: placement });
  return `https://clientorahq.com/?${p}`;
}

export function promoCopy(now: number = Date.now()) {
  const price = trialPrice(now);
  return {
    sponsor: {
      title: "Need clients, not just content?",
      text: "ClientoraHQ finds people who are already asking for your service on LinkedIn, Instagram and Facebook, and local businesses without a website. It drafts the reply; you approve what goes out.",
      cta: `Try 30 days for ${price}`,
    },
    after: {
      title: "Your video is ready. Now find the people who need it.",
      text: "ClientoraHQ finds posts where people ask for what you do, scores each lead and drafts a personal message. Nothing is sent until you approve it.",
      cta: `Try ClientoraHQ: 30 days for ${price}`,
    },
  };
}
