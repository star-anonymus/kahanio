// On-device depth maps with Depth Anything V2 Small (Apache-2.0) through transformers.js.
// Loaded only when someone turns on 3D motion; the model (about 27 MB) is cached by the browser after the first time.
import { fitLongSide } from "./motion.ts";

const MODEL = "onnx-community/depth-anything-v2-small";
type DepthFn = (input: unknown) => Promise<{ depth: { data: Uint8Array | Uint8ClampedArray; width: number; height: number; channels: number } }>;
let pipe: Promise<DepthFn> | null = null;

function load(onProgress: (label: string) => void): Promise<DepthFn> {
  if (pipe) return pipe;
  pipe = (async () => {
    const { pipeline } = await import("@huggingface/transformers");
    const progress = (e: { status?: string; progress?: number; file?: string }) => {
      if (e.status === "progress" && typeof e.progress === "number" && e.file?.endsWith(".onnx")) onProgress(`Downloading the 3D model (once): ${Math.round(e.progress)}%`);
    };
    const hasGpu = typeof navigator !== "undefined" && "gpu" in navigator;
    try {
      if (hasGpu) return (await pipeline("depth-estimation", MODEL, { device: "webgpu", dtype: "fp16", progress_callback: progress })) as unknown as DepthFn;
    } catch {
      /* fall back to WASM below */
    }
    return (await pipeline("depth-estimation", MODEL, { device: "wasm", dtype: "q8", progress_callback: progress })) as unknown as DepthFn;
  })();
  pipe.catch(() => (pipe = null));
  return pipe;
}

/** Returns a softened greyscale depth canvas (bright = near) at the photo's size. */
export async function estimateDepth(photo: ImageBitmap, onProgress: (label: string) => void): Promise<HTMLCanvasElement> {
  let run: DepthFn;
  try {
    run = await load(onProgress);
  } catch {
    throw new Error("The 3D model could not be loaded. Check your connection and press Retry, or turn off 3D motion.");
  }
  onProgress("Reading depth from your photo…");
  const small = fitLongSide(photo.width, photo.height, 640);
  const c = document.createElement("canvas");
  c.width = small.w;
  c.height = small.h;
  c.getContext("2d")!.drawImage(photo, 0, 0, small.w, small.h);
  const { RawImage } = await import("@huggingface/transformers");
  const out = await run(RawImage.fromCanvas(c));
  const d = out.depth;
  const img = new ImageData(d.width, d.height);
  for (let i = 0, j = 0; i < d.width * d.height; i++, j += d.channels) {
    const v = d.data[j];
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  const raw = document.createElement("canvas");
  raw.width = d.width;
  raw.height = d.height;
  raw.getContext("2d")!.putImageData(img, 0, 0);
  // Blur a little so edges stretch smoothly instead of tearing.
  const soft = document.createElement("canvas");
  soft.width = photo.width;
  soft.height = photo.height;
  const sctx = soft.getContext("2d")!;
  sctx.filter = `blur(${Math.max(2, Math.round(photo.width / 160))}px)`;
  sctx.drawImage(raw, 0, 0, soft.width, soft.height);
  return soft;
}
