// Step 3 voice controls: no voice, AI voice (FameSpeak online or Kokoro on device), or the user's own voice.
import type { Scene } from "./script.ts";
import { onlineAvailable, type SpokenScript, speakScenes, type VoiceLang, type VoiceOption, voicesFor } from "./tts.ts";

export type VoiceMode = "none" | "ai" | "mine";

export function setupVoice(getScenes: () => Scene[]) {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const lang = $<HTMLSelectElement>("voiceLang");
  const pick = $<HTMLSelectElement>("voicePick");
  const status = $("voiceStatus");
  const listen = $<HTMLButtonElement>("voiceListen");
  const mode = () => (document.querySelector('input[name="vmode"]:checked') as HTMLInputElement).value as VoiceMode;
  let options: VoiceOption[] = [];

  const fill = () => {
    options = voicesFor(lang.value as VoiceLang);
    pick.innerHTML = "";
    for (const v of options) pick.add(new Option(`${v.label}${v.engine === "online" ? " · online" : " · on your device"}`, `${v.engine}:${v.id}`));
    if (!options.length) {
      pick.add(new Option("This AI voice is coming soon. Use your own voice for now.", ""));
      pick.disabled = true;
    } else pick.disabled = false;
    hint();
  };
  const choice = (): VoiceOption | null => options.find((v) => `${v.engine}:${v.id}` === pick.value) ?? null;
  const hint = () => {
    const c = choice();
    $("voiceHint").textContent = !c
      ? ""
      : c.engine === "online"
        ? lang.value === "hiur"
          ? "Write in Hindi letters; an Urdu voice speaks it in Urdu style. Captions stay in Hindi. Only your script text is sent to make the audio; nothing is stored."
          : "Natural online voice. Only your script text is sent to make the audio; nothing is stored."
        : "Free voice that runs on your device. The first time it downloads about 92 MB, then works offline.";
  };
  const sync = () => {
    $("voiceBox").hidden = mode() !== "ai";
    $("mineBox").hidden = mode() !== "mine";
  };
  document.querySelectorAll<HTMLInputElement>('input[name="vmode"]').forEach((r) => (r.onchange = sync));
  lang.onchange = fill;
  pick.onchange = hint;
  if (onlineAvailable()) (document.querySelector('input[name="vmode"][value="ai"]') as HTMLInputElement).checked = true;
  fill();
  sync();

  listen.onclick = async () => {
    const c = choice();
    const first = getScenes()[0];
    if (!c || !first) {
      status.textContent = first ? "Pick a voice first." : "Write the script first.";
      return;
    }
    listen.disabled = true;
    try {
      const s = await speakScenes([first], c, (m) => (status.textContent = m));
      const ctx = new AudioContext();
      const src = ctx.createBufferSource();
      src.buffer = s.buffer;
      src.connect(ctx.destination);
      src.start();
      status.textContent = s.note ?? "Playing the first scene.";
    } catch (e) {
      status.textContent = (e as Error).message;
    } finally {
      listen.disabled = false;
    }
  };

  return {
    mode,
    /** Makes the AI voice for the whole script, or explains why it cannot. */
    async speak(scenes: Scene[], onStatus: (s: string) => void): Promise<SpokenScript> {
      const c = choice();
      if (!c) throw new Error("Pick an AI voice, or choose No voice / My voice.");
      return speakScenes(scenes, c, onStatus);
    },
    label: () => choice()?.label ?? "",
  };
}
