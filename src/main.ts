import { decodeVoice } from "./audio.ts";
import { setupFeedback } from "./feedback-ui.ts";
import { type Goal, TEMPLATES } from "./templates.ts";
import { findStockClip, onlineAvailable, StockUnavailable, workerScript } from "./tts.ts";
import { checkScript, RECIPE, recipeExample } from "./scriptcheck.ts";
import { chqLink, heroKind, promoCopy } from "./promo.ts";
import { setupVoice } from "./voice-ui.ts";
import { type CharacterId, CHARACTERS, DEFAULT_CHARACTER } from "./cartoon.ts";
import type { PhotoLayer } from "./parallax.ts";
import { setupPhotos } from "./photos.ts";
import type { StyleId } from "./styles.ts";
import { BRAND } from "./brand.ts";
import { FONT } from "./draw.ts";
import { parseExtras, PROVIDERS, type ScriptLang, writeScript } from "./llm.ts";
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
  /** Real stock footage through our Worker when the visitor has no key of their own. */
  autoStock?: boolean;
  photos?: PhotoLayer[];
  character?: CharacterId;
  sceneDurations?: number[];
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
  } else if (job.autoStock && onlineAvailable() && !(job.photos && job.photos.length)) {
    const used = new Set<string>();
    const orientation = job.format === "9:16" ? "portrait" : "landscape";
    for (let i = 0; i < job.scenes.length; i++) {
      onProgress(0.01, `Finding real footage ${i + 1}/${job.scenes.length}`);
      try {
        const c = await findStockClip(job.scenes[i].keywords, orientation, used, (m) => onProgress(0.01, m), `${job.topic ?? ""} ${job.scenes.map((x) => x.text).join(" ")}`);
        if (c) used.add(c.id);
        else warnings.push(`No clip found for scene ${i + 1}; it uses the template background.`);
        clips.push(c);
      } catch (e) {
        warnings.push(e instanceof StockUnavailable ? `${e.message} The video uses the template background.` : `Footage for scene ${i + 1}: ${(e as Error).message}`);
        clips.push(null);
        if (e instanceof StockUnavailable) {
          while (clips.length < job.scenes.length) clips.push(null);
          break;
        }
      }
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
      $("draft").textContent = v === "template" ? "Fill the recipe" : "✦ Write my script";
      $("draftStatus").textContent = "";
      $("srcHint").textContent =
        v === "own"
          ? "Your own words work best: platforms favour original voices. The check below helps you."
          : v === "ai"
            ? "Free, no key needed. Read it and make it yours before you post."
            : "Fills a proven hook, problem, tips and ending for your topic. Then make it yours.";
    };
  });

  const scriptBox = $<HTMLTextAreaElement>("script");
  const topicBox = $<HTMLInputElement>("topic");
  document.querySelectorAll<HTMLButtonElement>("[data-topic]").forEach((b) => {
    b.onclick = () => {
      topicBox.value = b.dataset.topic ?? "";
      if (srcValue() === "ai" && onlineAvailable()) $<HTMLButtonElement>("draft").click();
      else {
        scriptBox.value = recipeExample(topicBox.value).join("\n");
        scriptBox.dispatchEvent(new Event("input"));
      }
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
  // Presets from guide pages, e.g. /?lang=ur&template=clean#make
  {
    const q = new URLSearchParams(location.search);
    const t = q.get("template");
    if (t && TEMPLATES.some((x) => x.id === t)) {
      style = t as StyleId;
      syncPicker();
    }
    const l = q.get("lang");
    if (l && ["en", "ur", "hiur", "hi"].includes(l)) {
      const vl = document.getElementById("voiceLang") as HTMLSelectElement;
      vl.value = l;
      vl.dispatchEvent(new Event("change"));
      const ai = document.querySelector('input[name="vmode"][value="ai"]') as HTMLInputElement;
      ai.checked = true;
      ai.dispatchEvent(new Event("change"));
    }
  }
  const goMake = () => document.getElementById("make")?.scrollIntoView({ behavior: "smooth", block: "start" });

  // "Start from an idea": say what happened, and fill the starter only once there is a real topic.
  let pendingGoal: Goal | null = null;
  const showIdea = (text: string) => {
    $("ideaText").textContent = text;
    $("ideaBanner").hidden = false;
  };
  $("ideaClose").onclick = () => ($("ideaBanner").hidden = true);
  const fillIdea = (g: Goal) => {
    scriptBox.value = g.starter(topicBox.value.trim()).join("\n");
    scriptBox.dispatchEvent(new Event("input"));
  };
  const usePending = () => {
    if (!pendingGoal || !topicBox.value.trim()) return;
    const g = pendingGoal;
    pendingGoal = null;
    topicBox.classList.remove("need");
    fillIdea(g);
    showIdea(`✓ Idea loaded: ${g.title}. Edit the script below, then press Make my video.`);
  };
  topicBox.addEventListener("change", usePending);
  topicBox.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && pendingGoal) {
      e.preventDefault();
      usePending();
    }
  });

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
      const tName = TEMPLATES.find((t) => t.id === g.style)?.name ?? g.style;
      goMake();
      const photoNote = g.style === "ad" ? " Add your product photo in step 2 (Your photos)." : "";
      if (topicBox.value.trim()) {
        fillIdea(g);
        showIdea(`✓ Idea loaded: ${g.title} · ${tName} template.${photoNote} Edit the script, then press Make my video.`);
      } else {
        // No topic yet: ask for it first, then write the starter for that topic (no "your topic" placeholder).
        pendingGoal = g;
        showIdea(
          g.style === "ad"
            ? `✓ ${g.title} chosen. Type your product name above and press Enter, then add its photo in step 2 (Your photos).`
            : g.occasion
              ? `✓ ${g.title} chosen. Type your business name above and press Enter.`
              : `✓ ${g.title} · ${tName} template chosen. Now type what your video is about, then press Enter.`,
        );
        topicBox.classList.add("need");
        setTimeout(() => topicBox.focus({ preventScroll: true }), 400);
      }
    },
  );
  $("heroForm").onsubmit = (e) => {
    e.preventDefault();
    const t = $<HTMLInputElement>("heroTopic").value.trim();
    if (!t) return;
    topicBox.value = t;
    goMake();
    // Easiest path: the free AI writes the first draft right away; without it, the simple recipe.
    if (!scriptBox.value.trim()) {
      if (onlineAvailable()) $<HTMLButtonElement>("draft").click();
      else {
        scriptBox.value = recipeExample(t).join("\n");
        scriptBox.dispatchEvent(new Event("input"));
      }
    }
  };
  document.querySelectorAll<HTMLButtonElement>("[data-hero-topic]").forEach((b) => {
    b.onclick = () => {
      $<HTMLInputElement>("heroTopic").value = b.dataset.heroTopic ?? "";
      $<HTMLFormElement>("heroForm").requestSubmit();
    };
  });
  if (!onlineAvailable()) $("stockAutoRow").hidden = true;
  const photoBox = setupPhotos(() => undefined);
  const voiceUi = setupVoice(() => parseScript(scriptBox.value));
  const fb = setupFeedback();
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
    const topic = topicBox.value.trim();
    if (!topic) return topicBox.reportValidity();
    if (srcValue() === "template") {
      scriptBox.value = recipeExample(topic).join("\n");
      scriptBox.dispatchEvent(new Event("input"));
      return;
    }
    const lang = $<HTMLSelectElement>("lang").value as ScriptLang;
    const seconds = Number($<HTMLSelectElement>("seconds").value);
    const platformSafe = $<HTMLInputElement>("platformSafe").checked;
    const key = $<HTMLInputElement>("aiKey").value.trim();
    const status = $("draftStatus");
    draftBtn.disabled = true;
    draftBtn.textContent = "Writing…";
    status.textContent = "";
    try {
      let raw: string;
      if (key) raw = await writeScript(PROVIDERS.find((x) => x.id === provider.value)!, key, topic, lang, seconds, undefined, { platformSafe });
      else if (onlineAvailable()) raw = await workerScript({ topic, lang, seconds, platformSafe }, (m) => (status.textContent = m), status);
      else throw new Error("Free AI is not available on this copy of the site. Open \"Use my own AI key instead\", or write the script yourself.");
      const scenes = parseScript(raw);
      if (!scenes.length) throw new Error("The AI answer had no usable scenes. Press Write my script again.");
      scriptBox.value = scenesToText(scenes);
      scriptBox.dispatchEvent(new Event("input"));
      const ex = parseExtras(raw);
      const cap = [ex.caption, ex.hashtags.map((h) => "#" + h).join(" ")].filter(Boolean).join("\n\n");
      $<HTMLTextAreaElement>("aiCaption").value = cap;
      $("captionBox").hidden = !cap;
      status.textContent = "Done. Read it, change anything that is not true for you, then make the video.";
    } catch (e) {
      status.textContent = (e as Error).message;
    } finally {
      draftBtn.disabled = false;
      draftBtn.textContent = "✦ Write my script";
    }
  };

  $("copyCaption").onclick = () => void navigator.clipboard?.writeText($<HTMLTextAreaElement>("aiCaption").value).catch(() => undefined);

  // Hero reel: real footage, then cartoon, then animated templates. The chip names what is on screen.
  {
    const v = document.querySelector<HTMLVideoElement>(".hero-bg video");
    const kind = document.getElementById("nowKind");
    if (v && kind) v.addEventListener("timeupdate", () => (kind.textContent = heroKind(v.currentTime)));
  }

  // ClientoraHQ ads: copy and the trial price come from promo.ts (the price switches by itself on 5 Jan 2027).
  {
    const copy = promoCopy() as unknown as Record<string, Record<string, string>>;
    document.querySelectorAll<HTMLElement>("[data-promo]").forEach((el) => {
      const [k, f] = (el.dataset.promo ?? "").split(".");
      el.textContent = copy[k]?.[f] ?? "";
    });
    $<HTMLAnchorElement>("chqSponsor").href = chqLink("sponsor_card");
    $<HTMLAnchorElement>("chqAfter").href = chqLink("after_video");
  }

  // The recipe guide and the live script check.
  $("recipe").innerHTML = RECIPE.map((r) => `<li><strong>${r.step}</strong>: ${r.hint}</li>`).join("");
  $("useRecipe").onclick = () => {
    scriptBox.value = recipeExample(topicBox.value).join("\n");
    scriptBox.dispatchEvent(new Event("input"));
  };
  let checkTimer = 0;
  const runCheck = () => {
    const scenes = parseScript(scriptBox.value);
    const box = $("checkBox");
    box.hidden = !scriptBox.value.trim();
    if (box.hidden) return;
    const r = checkScript(scenes, { platformSafe: $<HTMLInputElement>("platformSafe").checked });
    const v = $("checkVerdict");
    v.className = "check-verdict v-" + r.verdict;
    v.textContent = r.verdict === "ready" ? "✓ Script looks ready" : r.verdict === "almost" ? "Almost there: small tips below" : "Fix these first";
    $("checkList").innerHTML = r.items.map((i) => `<li class="c-${i.level}">${i.text.replace(/</g, "&lt;")}</li>`).join("");
  };
  scriptBox.addEventListener("input", () => {
    clearTimeout(checkTimer);
    checkTimer = window.setTimeout(runCheck, 250);
  });
  $("platformSafe").addEventListener("change", runCheck);


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
    if (fb.blocked()) return; // owner rule: a rating for the last video is required first
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
    if (style === "ad" && !photoBox.get().length) {
      errBox.textContent = "The Product Ad template needs your product photo: add it in step 2 (Your photos), then press Make my video.";
      errBox.hidden = false;
      document.getElementById("photoFiles")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    controller = new AbortController();
    ($("go") as HTMLButtonElement).disabled = true;
    try {
      const notes: string[] = [];
      let voice: AudioBuffer | undefined;
      let sceneDurations: number[] | undefined;
      if (voiceUi.mode() === "ai") {
        const spoken = await voiceUi.speak(scenes, (m) => ($("statusText").textContent = m));
        voice = spoken.buffer;
        sceneDurations = spoken.durations;
        if (spoken.note) notes.push(spoken.note);
      } else if (voiceUi.mode() === "mine") {
        if (!voiceBlob) throw new Error("Record or upload your voice first, or pick No voice.");
        voice = await decodeVoice(voiceBlob);
      }
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
        sceneDurations,
        autoStock: ($("stockAuto") as HTMLInputElement | null)?.checked ?? false,
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
        voiceUi.mode() === "ai" ? `AI voice: ${voiceUi.label()}.` : "",
        job.aiLabel ? "AI-assisted video." : "",
      ]
        .filter(Boolean)
        .join("\n");
      $("warnings").innerHTML = [...notes, ...res.warnings].map((w) => `<li>${w.replace(/</g, "&lt;")}</li>`).join("");
      $("statusText").textContent = `Done: ${Math.round(res.seconds)} seconds.`;
      $("result").hidden = false;
      showVideo(true);
      fb.ask({ template: job.style ?? "story", format: job.format, voice: voiceUi.mode(), lang: (document.getElementById("voiceLang") as HTMLSelectElement | null)?.value });
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
