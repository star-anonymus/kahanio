// Draws one video frame on a canvas: background (stock clip or our animated gradient), captions, end card.
import { BRAND } from "./brand.ts";
import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic, segmentFills } from "./ease.ts";
import { type Caption, wrapWords } from "./timing.ts";

const C = BRAND.colors;
export const FONT = '"Poppins", "Segoe UI", system-ui, sans-serif';
const RTL = /[֐-ࣿ]/;

export type Frame = {
  w: number;
  h: number;
  t: number;
  total: number;
  sceneIndex: number;
  sceneCount: number;
  sceneStart: number;
  sceneEnd: number;
  clip: HTMLVideoElement | null;
  captions: Caption[];
  aiLabel: boolean;
};

function cover(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, w: number, h: number, zoom: number) {
  const vw = v.videoWidth || w;
  const vh = v.videoHeight || h;
  const s = Math.max(w / vw, h / vh) * zoom;
  const dw = vw * s;
  const dh = vh * s;
  ctx.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function gradientBackground(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, i: number) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, w, h);
  const blobs = [
    { c: C.coral, x: 0.25, y: 0.3, r: 0.55, sp: 0.21 },
    { c: "#7B2CBF", x: 0.8, y: 0.7, r: 0.6, sp: 0.17 },
    { c: C.amber, x: 0.6, y: 0.15, r: 0.35, sp: 0.29 },
  ];
  const m = Math.max(w, h);
  blobs.forEach((b, k) => {
    const ph = t * b.sp + k * 2.1 + i * 0.7;
    const x = (b.x + Math.sin(ph) * 0.12) * w;
    const y = (b.y + Math.cos(ph * 1.3) * 0.1) * h;
    const g = ctx.createRadialGradient(x, y, 0, x, y, b.r * m);
    g.addColorStop(0, b.c + "AA");
    g.addColorStop(1, b.c + "00");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  ctx.fillStyle = "rgba(20,20,43,0.25)";
  ctx.fillRect(0, 0, w, h);
}

function drawCaption(ctx: CanvasRenderingContext2D, f: Frame) {
  const cap = f.captions.find((c) => f.t >= c.start && f.t < c.end) ?? f.captions[f.captions.length - 1];
  if (!cap) return;
  const portrait = f.h > f.w;
  const size = Math.round((portrait ? f.w : f.h) * (portrait ? 0.082 : 0.085));
  const pop = (f.t - cap.start) / 0.22;
  const scale = 0.86 + 0.14 * easeOutBack(pop);
  const rise = (1 - easeOutCubic(pop)) * size * 0.45;
  ctx.save();
  ctx.globalAlpha = clamp01(pop * 2.5);
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = size * 0.35;
  ctx.shadowOffsetY = size * 0.06;
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const rtl = RTL.test(cap.text);
  const maxW = f.w * 0.84;
  const lines = rtl ? [[cap.text]] : wrapWords(cap.words.map((w) => w.w.toUpperCase()), maxW, (s) => ctx.measureText(s).width);
  const lh = size * 1.18;
  const cy = f.h * (portrait ? 0.64 : 0.74);
  ctx.translate(f.w / 2, cy + rise);
  ctx.scale(scale, scale);
  let wi = 0;
  lines.forEach((line, li) => {
    const y = (li - (lines.length - 1) / 2) * lh;
    if (rtl) {
      ctx.direction = "rtl";
      ctx.textAlign = "center";
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(line[0], 0, y);
      ctx.fillStyle = "#fff";
      ctx.fillText(line[0], 0, y);
      return;
    }
    ctx.textAlign = "left";
    const text = line.join(" ");
    let x = -ctx.measureText(text).width / 2;
    for (const word of line) {
      const timed = cap.words[wi++];
      const active = timed && f.t >= timed.start && f.t < timed.end;
      const ww = ctx.measureText(word).width;
      if (active) {
        ctx.fillStyle = C.coral;
        const pad = size * 0.14;
        ctx.beginPath();
        ctx.roundRect(x - pad, y - size * 0.62, ww + pad * 2, size * 1.2, size * 0.2);
        ctx.fill();
      }
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(word, x, y);
      ctx.fillStyle = active ? "#fff" : timed && f.t >= timed.end ? C.amber : "#fff";
      ctx.fillText(word, x, y);
      x += ww + ctx.measureText(" ").width;
    }
  });
  ctx.restore();
}

export function drawScene(ctx: CanvasRenderingContext2D, f: Frame) {
  const { w, h } = f;
  const local = (f.t - f.sceneStart) / Math.max(0.001, f.sceneEnd - f.sceneStart);
  if (f.clip) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    cover(ctx, f.clip, w, h, 1 + 0.06 * local);
    const g = ctx.createLinearGradient(0, h * 0.35, 0, h);
    g.addColorStop(0, "rgba(20,20,43,0)");
    g.addColorStop(1, "rgba(20,20,43,0.75)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } else {
    gradientBackground(ctx, w, h, f.t, f.sceneIndex);
    dotGrid(ctx, w, h, f.t);
  }
  const unit = Math.min(w, h);
  const since = f.t - f.sceneStart;

  sceneNumber(ctx, f, unit, since);
  drawCaption(ctx, f);
  if (f.sceneIndex > 0 && since < 0.5) wipe(ctx, w, h, since / 0.5);

  // Story-style progress: one segment per scene.
  const m = unit * 0.04;
  const gap = unit * 0.012;
  const bh = Math.max(3, unit * 0.007);
  const fills = segmentFills(f.sceneCount, f.sceneIndex, local);
  const segW = (w - m * 2 - gap * (fills.length - 1)) / fills.length;
  fills.forEach((fill, i) => {
    const x = m + i * (segW + gap);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.roundRect(x, m, segW, bh, bh / 2);
    ctx.fill();
    if (fill > 0) {
      ctx.fillStyle = i === f.sceneIndex ? C.coral : "#fff";
      ctx.beginPath();
      ctx.roundRect(x, m, Math.max(bh, segW * fill), bh, bh / 2);
      ctx.fill();
    }
  });

  if (f.aiLabel) {
    ctx.save();
    const s = Math.round(unit * 0.026);
    ctx.font = `600 ${s}px ${FONT}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    const label = "AI-assisted";
    const tw = ctx.measureText(label).width;
    const top = m + bh + unit * 0.025;
    ctx.fillStyle = "rgba(20,20,43,0.55)";
    ctx.beginPath();
    ctx.roundRect(w - m - tw - s * 1.6, top, tw + s * 1.6, s * 1.8, s * 0.9);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(label, w - m - s * 0.8, top + s * 0.4);
    ctx.restore();
  }
}

function dotGrid(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const step = Math.min(w, h) * 0.055;
  const r = Math.max(1, step * 0.045);
  const drift = (t * step * 0.15) % step;
  ctx.fillStyle = "rgba(255,244,230,0.07)";
  for (let y = -step + drift; y < h + step; y += step)
    for (let x = step / 2; x < w; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
}

/** A large outlined scene number ("01") with "/06", sliding in at each scene. */
function sceneNumber(ctx: CanvasRenderingContext2D, f: Frame, unit: number, since: number) {
  const k = easeOutCubic(since / 0.6);
  const size = unit * (f.clip ? 0.2 : 0.34);
  const x = unit * 0.06 - (1 - k) * unit * 0.2;
  const y = unit * 0.1 + size * 0.85 + (f.h > f.w ? unit * 0.08 : 0);
  ctx.save();
  ctx.globalAlpha = k;
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const num = String(f.sceneIndex + 1).padStart(2, "0");
  ctx.lineWidth = Math.max(2, unit * 0.004);
  ctx.strokeStyle = f.clip ? "rgba(255,255,255,0.55)" : "rgba(255,244,230,0.22)";
  ctx.strokeText(num, x, y);
  const nw = ctx.measureText(num).width;
  ctx.font = `700 ${Math.round(size * 0.2)}px ${FONT}`;
  ctx.fillStyle = C.amber;
  ctx.fillText(`/${String(f.sceneCount).padStart(2, "0")}`, x + nw + unit * 0.015, y);
  ctx.restore();
}

/** Brand wipe between scenes: a coral band with an amber edge sweeps across on a slant. */
function wipe(ctx: CanvasRenderingContext2D, w: number, h: number, p: number) {
  const e = easeInOutCubic(p);
  const band = w * 0.55;
  const skew = h * 0.35;
  const x0 = -band - skew + e * (w + band * 2 + skew * 2);
  const poly = (x: number, bw: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + skew, 0);
    ctx.lineTo(x + skew + bw, 0);
    ctx.lineTo(x + bw, h);
    ctx.closePath();
    ctx.fill();
  };
  poly(x0 - band * 0.12, band * 0.12, C.amber);
  poly(x0, band, C.coral);
}

// Same paths as public/logo-mark.svg (100x100 box): a story bubble with a play button and an amber spark.
const MARK_BUBBLE = "M30 6h40a24 24 0 0 1 24 24v28a24 24 0 0 1-24 24H44L24 97V82a24 24 0 0 1-18-23V30A24 24 0 0 1 30 6Z";
const MARK_PLAY = "M41 28.5 68 44 41 59.5Z";

/** The logo mark, drawn from the SVG paths so the video end card matches the site. */
export function drawMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 100, size / 100);
  ctx.fillStyle = C.coral;
  ctx.fill(new Path2D(MARK_BUBBLE));
  const play = new Path2D(MARK_PLAY);
  ctx.fillStyle = C.cream;
  ctx.strokeStyle = C.cream;
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.fill(play);
  ctx.stroke(play);
  ctx.beginPath();
  ctx.arc(84, 14, 10, 0, Math.PI * 2);
  ctx.fillStyle = C.amber;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.restore();
}

export function drawEndCard(ctx: CanvasRenderingContext2D, w: number, h: number, local: number, credits: string[], aiLabel: boolean) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, w, h);
  const unit = Math.min(w, h);
  const glow = ctx.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, Math.max(w, h) * 0.6);
  glow.addColorStop(0, "rgba(255,77,109,0.28)");
  glow.addColorStop(1, "rgba(255,77,109,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  dotGrid(ctx, w, h, local);
  const a = clamp01((local - 0.25) / 0.35);
  ctx.globalAlpha = a;
  const top = h * (h > w ? 0.34 : 0.26);
  drawMark(ctx, w / 2, top, unit * 0.2 * (0.6 + 0.4 * easeOutBack((local - 0.25) / 0.5)));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.font = `800 ${Math.round(unit * 0.1)}px ${FONT}`;
  ctx.fillText(BRAND.name.toLowerCase(), w / 2, top + unit * 0.2);
  ctx.fillStyle = C.amber;
  ctx.font = `600 ${Math.round(unit * 0.04)}px ${FONT}`;
  ctx.fillText(`by ${BRAND.maker}`, w / 2, top + unit * 0.29);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `500 ${Math.round(unit * 0.03)}px ${FONT}`;
  const lines = [
    ...(aiLabel ? ["AI-assisted video"] : []),
    ...(credits.length ? ["Footage: " + credits.slice(0, 4).join(", ") + (credits.length > 4 ? " and others" : "")] : []),
    `Music made by ${BRAND.name}`,
  ];
  lines.forEach((l, i) => ctx.fillText(l, w / 2, top + unit * (0.42 + i * 0.05), w * 0.9));
  // Call to action pill.
  const cta = `Make yours free: ${BRAND.url.replace("https://", "")}`;
  ctx.font = `700 ${Math.round(unit * 0.032)}px ${FONT}`;
  const cw = ctx.measureText(cta).width + unit * 0.08;
  const cy = top + unit * (0.42 + lines.length * 0.05 + 0.06);
  ctx.fillStyle = C.coral;
  ctx.beginPath();
  ctx.roundRect(w / 2 - cw / 2, cy - unit * 0.04, cw, unit * 0.08, unit * 0.04);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(cta, w / 2, cy, w * 0.9);
  ctx.globalAlpha = 1;
  if (local < 0.5) wipe(ctx, w, h, local / 0.5);
}
