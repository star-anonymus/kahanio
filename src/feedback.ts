// Required feedback after every video (owner: "bilkul lazmi"). A 1-5 rating is required before the next video;
// the comment is optional; the download is never blocked. No personal data is sent: tool, rating, comment, a few
// settings and the time. If sending fails, the answer is kept in this browser and sent again later, so a visitor
// who did answer is never stuck.

export type FeedbackContext = { template?: string; format?: string; voice?: string; lang?: string };
export type FeedbackPayload = { tool: "kahanio"; rating: number; comment: string; context: FeedbackContext; at: string };

export const MAX_COMMENT = 500;
const PENDING = "kahanio.feedback.pending";
const OUTBOX = "kahanio.feedback.outbox";

/** Minimal storage interface so the logic is testable without a browser. */
export type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

export function safeStore(): Store {
  try {
    const s = window.localStorage;
    s.setItem("kahanio.t", "1");
    s.removeItem("kahanio.t");
    return s;
  } catch {
    const m = new Map<string, string>(); // private mode: keep it for this page only
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  }
}

/** Builds the payload, or says what is missing. */
export function buildFeedback(rating: unknown, comment: unknown, context: FeedbackContext, now = new Date()): FeedbackPayload | { error: string } {
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) return { error: "Please tap 1 to 5 stars." };
  const c = typeof comment === "string" ? comment.replace(/\s+/g, " ").trim().slice(0, MAX_COMMENT) : "";
  const ctx: FeedbackContext = {};
  for (const k of ["template", "format", "voice", "lang"] as const) if (context[k]) ctx[k] = String(context[k]).slice(0, 40);
  return { tool: "kahanio", rating: r, comment: c, context: ctx, at: now.toISOString() };
}

export function markPending(store: Store, context: FeedbackContext) {
  store.setItem(PENDING, JSON.stringify(context));
}
export function pending(store: Store): FeedbackContext | null {
  try {
    return JSON.parse(store.getItem(PENDING) ?? "null");
  } catch {
    return null;
  }
}
export function clearPending(store: Store) {
  store.removeItem(PENDING);
}

export function outbox(store: Store): FeedbackPayload[] {
  try {
    const v = JSON.parse(store.getItem(OUTBOX) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function queue(store: Store, p: FeedbackPayload) {
  store.setItem(OUTBOX, JSON.stringify([...outbox(store), p].slice(-20)));
}

/** Sends every queued answer; keeps the ones that still fail. Returns how many were sent. */
export async function flush(store: Store, send: (p: FeedbackPayload) => Promise<boolean>): Promise<number> {
  const items = outbox(store);
  const left: FeedbackPayload[] = [];
  let sent = 0;
  for (const p of items) {
    if (await send(p).catch(() => false)) sent++;
    else left.push(p);
  }
  if (left.length) store.setItem(OUTBOX, JSON.stringify(left));
  else store.removeItem(OUTBOX);
  return sent;
}
