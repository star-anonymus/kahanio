// Builds the template gallery, the goal cards and the style picker, each with live canvas previews.
import { startPreview } from "./preview.ts";
import type { StyleId } from "./styles.ts";
import { type Goal, GOALS, sampleScenes, TEMPLATES } from "./templates.ts";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function buildGallery(onUse: (id: StyleId) => void, onGoal: (g: Goal) => void) {
  const grid = document.getElementById("gallery");
  if (grid) {
    grid.innerHTML = TEMPLATES.map(
      (t, i) => `
      <article class="tile ${i === 0 ? "tile-big" : ""} ${t.id === "news" || t.id === "cartoon" ? "tile-wide" : ""}" data-style="${t.id}">
        <canvas aria-label="${esc(t.name)} template preview"></canvas>
        <div class="tile-info">
          <h3>${esc(t.name)}</h3>
          <p>${esc(t.blurb)}</p>
          <button type="button" class="primary small">Use template →</button>
        </div>
      </article>`,
    ).join("");
    grid.querySelectorAll<HTMLElement>(".tile").forEach((el) => {
      const t = TEMPLATES.find((x) => x.id === el.dataset.style)!;
      const scenes = sampleScenes(t);
      startPreview(el.querySelector("canvas")!, () => ({ scenes, format: el.classList.contains("tile-wide") ? "16:9" : "9:16", aiLabel: false, style: t.id, topic: "Your topic here" }));
      el.querySelector("button")!.onclick = () => onUse(t.id);
    });
  }

  const goals = document.getElementById("goals");
  if (goals) {
    goals.innerHTML = GOALS.map(
      (g) => `
      <button type="button" class="goal goal-${g.style}" data-goal="${g.id}">
        <span class="goal-title">${esc(g.title)}</span>
        <span class="goal-text" ${/[؀-ۿ]/.test(g.text) ? 'dir="rtl" lang="ur"' : ""}>${esc(g.text)}</span>
        <span class="goal-go">Start →</span>
      </button>`,
    ).join("");
    goals.querySelectorAll<HTMLButtonElement>(".goal").forEach((b) => (b.onclick = () => onGoal(GOALS.find((g) => g.id === b.dataset.goal)!)));
  }
}

export function buildStylePicker(current: () => StyleId, onPick: (id: StyleId) => void) {
  const box = document.getElementById("stylePicker");
  if (!box) return () => undefined;
  box.innerHTML = TEMPLATES.map((t) => `<button type="button" class="style-opt" data-style="${t.id}" aria-pressed="false"><i class="sw sw-${t.id}"></i>${esc(t.name)}</button>`).join("");
  const sync = () =>
    box.querySelectorAll<HTMLButtonElement>(".style-opt").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.style === current())));
  box.querySelectorAll<HTMLButtonElement>(".style-opt").forEach((b) => (b.onclick = () => (onPick(b.dataset.style as StyleId), sync())));
  sync();
  return sync;
}
