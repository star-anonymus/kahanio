import { decodeVoice } from "./audio.ts";
import { type CharacterId, CHARACTERS, DEFAULT_CHARACTER } from "./cartoon.ts";
import type { PhotoLayer } from "./parallax.ts";
import { setupPhotos } from "./photos.ts";
import type { StyleId } from "./styles.ts";
import { BRAND } from "./brand.ts";
import { FONT } from "./draw.ts";
import { PROVIDERS, type ScriptLang, writeScript } from "./llm.ts";
import { type Format, browserCanRender, renderVideo } from "./render.ts";
import { type Scene, parseScript, scenesToText, templateScript } from "./script.ts";
import { type Clip, findClip } from "./stock.ts";
import { buildGallery, buildStylePicker } from "./gallery.ts";
import { startPreview } from "./preview.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export type Job = {
  scenes: Scene[];
  format: Format;
  voice?: AudioBuffer;
  music: boolean;
  aiLabel: boolean;
  style?: StyleId;
  topic?: string;
  keys: { pexels?: string; pixabay?: string };
  photos?: PhotoLayer[];
  character?: CharacterId;
  seed: number;
};

/** Finds footage, then renders. Every failure ends in a visible message with a Retry (never silent). */
export async function runJob(job: Job, onProgress: (f: number, label: string) => void, signal?: AbortSignal) {
  await document.fonts.load(`800 40px ${FONT}`).catch(() => undefined);
  const clips: (Clip | null)[] = [];
  const warnings: string[] = [];
  if (job.keys.pexels || job.keys.pixabay) {
    const used = new Set<string>();
    for (let i = 0; i < job.scenes.length; i++) {
      onProgress(0.01, `Finding footage ${i + 1}/${job.scenes.length}`);
      const c = await findClip(job.scenes[i].keywords, job.format === "9:16" ? "portrait" : "landscape", job.keys, used);
      if (c) used.add(c.id);
      else warnings.push(`No clip found for scene ${i + 1}; it uses the animated background.`);
      clips.push(c);
    }
  } else job.scenes.forEach(() => clips.push(null));
  const res = await renderVideo({ ...job, clips }, onProgress, signal);
  return { ...res, warnings: [...warnings, ...res.warnings] };
}

function init() {
  document.querySelectorAll("[data-brand-name]").forEach((el) => (el.textContent = BRAND.name));
  if (!browserCanRender()) {
    $("unsupported").hidden = false;
    ($("go") as HTMLButtonElement).disabled = true;
  }

  const provider = $<HTMLSelectElement>("provider");
  for (const p of PROVIDERS) provider.add(new Option(p.name, p.id));
  const showNote = () => {
    const p = PROVIDERS.find((x) => x.id === provider.value)!;
    $("providerNote").innerHTML = `${p.note} <a href="${p.keyUrl}" target="_blank" rel="noopener">Get a free key</a>`;
  };
  provider.onchange = showNote;
  showNote();

  const srcValue = () => (document.querySelector('input[name="src"]:checked') as HTMLInputElement).value;
  document.querySelectorAll<HTMLInputElement>('input[name="src"]').forEach((r) => {
    r.onchange = () => {
      const v = srcValue();
      $("aiBox").hidden = v !== "ai";
      $("draft").hidden = v === "own";
      $("srcHint").textContent =
        v === "own"
          ? "Your own words work best: platforms favour original voices."
          : v === "ai"
            ? "Uses a free AI tier with your own key. Always read and fix the script before you post."
            : "A simple five-scene starter. Make it yours before you post.";
    };
  });
  $("draft").hidden = true;

  const scriptBox = $<HTMLTextAreaElement>("script");
  const topicBox = $<HTMLInputElement>("topic");
  document.querySelectorAll<HTMLButtonElement>("[data-topic]").forEach((b) => {
    b.onclick = () => {
      topicBox.value = b.dataset.topic ?? "";
      if (!scriptBox.value.trim()) scriptBox.value = scenesToText(templateScript(topicBox.value));
    };
  });

  // Live preview in the phone frame; follows the script, template, format and label as they change.
  const fmtValue = () => (document.querySelector('input[name="fmt"]:checked') as HTMLInputElement).value as Format;
  const phone = $("phone");
  const syncPhone = () => {
    phone.classList.toggle("tall", fmtValue() === "9:16");
    phone.classList.toggle("wide", fmtValue() === "16:9");
  };
  const setFormat = (f: Format) => {
    (document.querySelector(`input[name="fmt"][value="${f}"]`) as HTMLInputElement).checked = true;
    syncPhone();
  };
  document.querySelectorAll<HTMLInputElement>('input[name="fmt"]').forEach((r) => (r.onchange = syncPhone));
  let style: StyleId = "story";
  let character: CharacterId = DEFAULT_CHARACTER;
  const charPicker = $("charPicker");
  charPicker.innerHTML = CHARACTERS.map((c) => `<button type="button" class="style-opt" data-char="${c.id}" aria-pressed="false">${c.name} <span class="hint">${c.role}</span></button>`).join("");
  const syncChars = () => {
    $("charBox").hidden = style !== "cartoon";
    charPicker.querySelectorAll<HTMLButtonElement>("[data-char]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.char === character)));
  };
  charPicker.querySelectorAll<HTMLButtonElement>("[data-char]").forEach((b) => (b.onclick = () => ((character = b.dataset.char as CharacterId), syncChars())));
  const stylePicker = buildStylePicker(
    () => style,
    (id) => ((style = id), syncChars()),
  );
  const syncPicker = () => (stylePicker(), syncChars());
  syncChars();
  const goMake = () => document.getElementById("make")?.scrollIntoView({ behavior: "smooth", block: "start" });
  buildGallery(
    (id) => {
      style = id;
      syncPicker();
      goMake();
    },
    (g) => {
      style = g.style;
      syncPicker();
      setFormat(g.format);
      scriptBox.value = g.starter(topicBox.value.trim() || "your topic").join("\n");
      goMake();
    },
  );
  $("heroForm").onsubmit = (e) => {
    e.preventDefault();
    const t = $<HTMLInputElement>("heroTopic").value.trim();
    if (!t) return;
    topicBox.value = t;
    if (!scriptBox.value.trim()) scriptBox.value = scenesToText(templateScript(t));
    goMake();
  };
  document.querySelectorAll<HTMLButtonElement>("[data-hero-topic]").forEach((b) => {
    b.onclick = () => {
      $<HTMLInputElement>("heroTopic").value = b.dataset.heroTopic ?? "";
      $<HTMLFormElement>("heroForm").requestSubmit();
    };
  });
  const photoBox = setupPhotos(() => undefined);
  if (import.meta.env.DEV) (window as unknown as { __photos?: typeof photoBox }).__photos = photoBox;
  startPreview($<HTMLCanvasElement>("live"), () => {
    const typed = parseScript(scriptBox.value);
    const topic = topicBox.value.trim() || "your topic";
    return {
      scenes: typed.length ? typed : templateScript(topic),
      format: fmtValue(),
      aiLabel: $<HTMLInputElement>("aiLabel").checked,
      style,
      topic,
      photos: photoBox.get(),
      character,
    };
  });
  const showVideo = (on: boolean) => {
    $("live").hidden = on;
    $("preview").hidden = !on;
    $("liveHint").textContent = on ? "Your finished video." : "Live preview. Edit the script and watch it change.";
    if (!on) $<HTMLVideoElement>("preview").pause();
  };
  $("back").onclick = () => showVideo(false);

  const draftBtn = $<HTMLButtonElement>("draft");
  draftBtn.onclick = async () => {
    const topic = $<HTMLInputElement>("topic").value.trim();
    if (!topic) return $<HTMLInputElement>("topic").reportValidity();
    if (srcValue() === "template") {
      scriptBox.value = scenesToText(templateScript(topic));
      return;
    }
    const key = $<HTMLInputElement>("aiKey").value.trim();
    if (!key) return alert("Paste your free API key first, or write the script yourself.");
    draftBtn.disabled = true;
    draftBtn.textContent = "Writing…";
    try {
      const p = PROVIDERS.find((x) => x.id === provider.value)!;
      const raw = await writeScript(p, key, topic, $<HTMLSelectElement>("lang").value as ScriptLang, Number($<HTMLSelectElement>("seconds").value));
      const scenes = parseScript(raw);
      if (!scenes.length) throw new Error("The AI answer had no usable scenes. Press Get script again.");
      scriptBox.value = scenesToText(scenes);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      draftBtn.disabled = false;
      draftBtn.textContent = "✦ Get script";
    }
  };

  // Voice: an uploaded file or a recording made here. It never leaves the browser.
  let voiceBlob: Blob | null = null;
  $<HTMLInputElement>("voiceFile").onchange = (e) => {
    voiceBlob = (e.target as HTMLInputElement).files?.[0] ?? null;
    $("recState").textContent = voiceBlob ? "Voice file ready." : "";
  };
  let rec: MediaRecorder | null = null;
  $("rec").onclick = async () => {
    if (rec && rec.state === "recording") {
      rec.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const parts: BlobPart[] = [];
      rec = new MediaRecorder(stream);
      rec.ondataavailable = (ev) => parts.push(ev.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        voiceBlob = new Blob(parts, { type: rec?.mimeType || "audio/webm" });
        $("rec").textContent = "● Record again";
        $("recState").textContent = "Recording ready.";
      };
      rec.start();
      $("rec").textContent = "■ Stop recording";
      $("recState").textContent = "Recording… read your script.";
    } catch {
      $("recState").textContent = "Microphone not allowed. You can upload a recording instead.";
    }
  };

  let controller: AbortController | null = null;
  const go = async () => {
    const scenes = parseScript(scriptBox.value);
    const errBox = $("error");
    $("status").hidden = false;
    $("result").hidden = true;
    showVideo(false);
    errBox.hidden = true;
    $("retry").hidden = true;
    $("warnings").innerHTML = "";
    if (!scenes.length) {
      errBox.textContent = "The script is empty. Write one scene per line, or press Get script.";
      errBox.hidden = false;
      return;
    }
    controller = new AbortController();
    ($("go") as HTMLButtonElement).disabled = true;
    try {
      const voice = voiceBlob ? await decodeVoice(voiceBlob) : undefined;
      const job: Job = {
        scenes,
        format: (document.querySelector('input[name="fmt"]:checked') as HTMLInputElement).value as Format,
        voice,
        music: $<HTMLInputElement>("music").checked,
        aiLabel: $<HTMLInputElement>("aiLabel").checked,
        style,
        topic: topicBox.value.trim(),
        photos: photoBox.get(),
        character,
        keys: { pexels: $<HTMLInputElement>("pexelsKey").value.trim() || undefined, pixabay: $<HTMLInputElement>("pixabayKey").value.trim() || undefined },
        seed: Math.floor(Math.random() * 1e9),
      };
      const res = await runJob(
        job,
        (f, label) => {
          $<HTMLProgressElement>("bar").value = f;
          $("statusText").textContent = label;
        },
        controller.signal,
      );
      const url = URL.createObjectURL(res.blob);
      $<HTMLVideoElement>("preview").src = url;
      $<HTMLAnchorElement>("download").href = url;
      const slug = $<HTMLInputElement>("topic").value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "video";
      $<HTMLAnchorElement>("download").download = `${slug}.mp4`;
      $<HTMLAnchorElement>("srt").href = URL.createObjectURL(new Blob([res.srt], { type: "text/plain" }));
      $<HTMLTextAreaElement>("credits").value = [
        res.credits.length ? `Footage: ${res.credits.join(", ")}.` : "",
        `Made with ${BRAND.name} by ${BRAND.maker}. Music made by ${BRAND.name}.`,
        job.aiLabel ? "AI-assisted video." : "",
      ]
        .filter(Boolean)
        .join("\n");
      $("warnings").innerHTML = res.warnings.map((w) => `<li>${w.replace(/</g, "&lt;")}</li>`).join("");
      $("statusText").textContent = `Done: ${Math.round(res.seconds)} seconds.`;
      $("result").hidden = false;
      showVideo(true);
    } catch (e) {
      errBox.textContent = (e as Error).message || "Something went wrong.";
      errBox.hidden = false;
      $("retry").hidden = false;
    } finally {
      ($("go") as HTMLButtonElement).disabled = false;
      controller = null;
    }
  };
  $("form").onsubmit = (e) => {
    e.preventDefault();
    void go();
  };
  $("retry").onclick = () => void go();
  $("stop").onclick = () => controller?.abort();

  if (import.meta.env.DEV) void import("./dev-autorun.ts").then((m) => m.autorun(runJob));
}

init();
