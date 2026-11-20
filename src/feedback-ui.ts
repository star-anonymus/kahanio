// The feedback card: stars (required) + optional comment, shown after every video.
import { onlineAvailable } from "./tts.ts";
import { buildFeedback, clearPending, type FeedbackContext, type FeedbackPayload, flush, markPending, pending, queue, safeStore } from "./feedback.ts";

const URL_ = ((import.meta.env.VITE_FEEDBACK_URL as string | undefined) || ((import.meta.env.VITE_TTS_URL as string | undefined)?.replace(/\/$/, "") ?? "") + "/feedback").replace(/^\/feedback$/, "");

async function send(p: FeedbackPayload): Promise<boolean> {
  if (!URL_ || !onlineAvailable()) return false;
  const r = await fetch(URL_, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
  return r.ok;
}

export function setupFeedback() {
  const store = safeStore();
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const card = $("feedback");
  const msg = $("fbMsg");
  const sendBtn = $<HTMLButtonElement>("fbSend");
  const retry = $<HTMLButtonElement>("fbRetry");
  const comment = $<HTMLTextAreaElement>("fbComment");
  let rating = 0;

  const stars = [...card.querySelectorAll<HTMLButtonElement>("[data-star]")];
  const paint = () => stars.forEach((b) => b.setAttribute("aria-checked", String(Number(b.dataset.star) <= rating)));
  stars.forEach((b) => (b.onclick = () => ((rating = Number(b.dataset.star)), paint(), (msg.textContent = ""))));

  const show = () => {
    card.hidden = false;
    $("fbForm").hidden = false;
    $("fbDone").hidden = true;
    rating = 0;
    comment.value = "";
    msg.textContent = "";
    retry.hidden = true;
    paint();
  };

  sendBtn.onclick = async () => {
    const ctx = pending(store) ?? {};
    const p = buildFeedback(rating, comment.value, ctx);
    if ("error" in p) {
      msg.textContent = p.error;
      return;
    }
    // The answer counts as given now; delivery is retried if the network fails.
    clearPending(store);
    queue(store, p);
    sendBtn.disabled = true;
    msg.textContent = "Sending…";
    const sent = await flush(store, send);
    sendBtn.disabled = false;
    $("fbForm").hidden = true;
    $("fbDone").hidden = false;
    $("fbDoneText").textContent = sent
      ? "Thank you! Your feedback helps us make Kahanio better."
      : "Thank you! We could not send it right now; it is saved and will be sent next time.";
    retry.hidden = !!sent;
  };
  retry.onclick = async () => {
    retry.disabled = true;
    const sent = await flush(store, send);
    retry.disabled = false;
    if (sent) {
      $("fbDoneText").textContent = "Sent. Thank you!";
      retry.hidden = true;
    } else $("fbDoneText").textContent = "Still could not send. It stays saved and goes next time.";
  };

  void flush(store, send); // earlier answers that could not be sent
  if (pending(store)) show();

  return {
    /** Call after a video is ready. */
    ask(ctx: FeedbackContext) {
      markPending(store, ctx);
      show();
    },
    /** True when the visitor still owes a rating for the last video. */
    blocked(): boolean {
      if (!pending(store)) return false;
      show();
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      msg.textContent = "Please rate your last video first (one tap on the stars). Then make the next one.";
      return true;
    },
  };
}
