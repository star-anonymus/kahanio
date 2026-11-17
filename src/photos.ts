// "Your photos": load, scale, optionally add depth for 3D motion. Photos stay in this tab; nothing is uploaded.
import { fitLongSide } from "./motion.ts";
import type { PhotoLayer } from "./parallax.ts";

export const MAX_PHOTOS = 12;
let seq = 0;

export async function loadPhoto(file: File): Promise<PhotoLayer> {
  let probe: ImageBitmap;
  try {
    probe = await createImageBitmap(file);
  } catch {
    throw new Error(`"${file.name}" is not an image this browser can read. Try a JPG, PNG or WebP.`);
  }
  const s = fitLongSide(probe.width, probe.height, 1920);
  const bitmap = s.w === probe.width ? probe : await createImageBitmap(file, { resizeWidth: s.w, resizeHeight: s.h, resizeQuality: "high" });
  if (bitmap !== probe) probe.close();
  return { id: `p${++seq}`, name: file.name, bitmap, depth: null };
}

/** Adds depth maps to the photos that lack one. Loads the model on first use. */
export async function addDepth(layers: PhotoLayer[], onStatus: (s: string) => void) {
  const todo = layers.filter((l) => !l.depth);
  if (!todo.length) return;
  const { estimateDepth } = await import("./depth.ts");
  for (let i = 0; i < todo.length; i++) {
    onStatus(`3D depth ${i + 1}/${todo.length}…`);
    todo[i].depth = await estimateDepth(todo[i].bitmap, onStatus);
  }
}

export function setupPhotos(onChange: () => void) {
  const input = document.getElementById("photoFiles") as HTMLInputElement;
  const list = document.getElementById("photoList")!;
  const status = document.getElementById("photoStatus")!;
  const retry = document.getElementById("photoRetry") as HTMLButtonElement;
  const depthBox = document.getElementById("depth3d") as HTMLInputElement;
  let layers: PhotoLayer[] = [];
  let busy = false;

  const draw = () => {
    list.innerHTML = "";
    layers.forEach((l, i) => {
      const item = document.createElement("div");
      item.className = "thumb";
      const c = document.createElement("canvas");
      // Square, centre-cropped thumbnail (no stretching).
      const side = Math.min(l.bitmap.width, l.bitmap.height);
      c.width = c.height = 148;
      c.getContext("2d")!.drawImage(l.bitmap, (l.bitmap.width - side) / 2, (l.bitmap.height - side) / 2, side, side, 0, 0, 148, 148);
      const tag = document.createElement("span");
      tag.className = "thumb-tag";
      tag.textContent = l.depth ? "3D" : depthBox.checked ? "…" : "2D";
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "thumb-x";
      rm.setAttribute("aria-label", `Remove ${l.name}`);
      rm.textContent = "×";
      rm.onclick = () => {
        layers.splice(i, 1);
        l.bitmap.close();
        draw();
        onChange();
      };
      item.append(c, tag, rm);
      list.append(item);
    });
  };

  const depthPass = async () => {
    retry.hidden = true;
    if (!depthBox.checked || busy) return;
    busy = true;
    try {
      await addDepth(layers, (s) => (status.textContent = s));
      status.textContent = layers.length ? "Photos ready, with 3D motion." : "";
    } catch (e) {
      status.textContent = `${(e as Error).message}`;
      retry.hidden = false;
    } finally {
      busy = false;
      draw();
      onChange();
    }
  };

  input.onchange = async () => {
    const files = [...(input.files ?? [])].slice(0, Math.max(0, MAX_PHOTOS - layers.length));
    input.value = "";
    const errors: string[] = [];
    for (const f of files) {
      try {
        layers.push(await loadPhoto(f));
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    status.textContent = errors.join(" ") || (layers.length ? `${layers.length} photo(s) added.` : "");
    draw();
    onChange();
    void depthPass();
  };
  depthBox.onchange = () => {
    if (!depthBox.checked) layers = layers.map((l) => ({ ...l, depth: null }));
    draw();
    onChange();
    void depthPass();
  };
  retry.onclick = () => void depthPass();

  return {
    get: () => layers,
    /** Dev use: add photos from URLs (served by the dev server). */
    async addFromUrls(urls: string[], depth: boolean) {
      for (const u of urls) {
        const b = await (await fetch(u)).blob();
        layers.push(await loadPhoto(new File([b], u.split("/").pop() ?? "photo", { type: b.type })));
      }
      depthBox.checked = depth;
      draw();
      onChange();
      if (depth) await addDepth(layers, (s) => (status.textContent = s));
      status.textContent = depth ? "Photos ready, with 3D motion." : `${layers.length} photo(s) added.`;
      draw();
      onChange();
    },
  };
}
