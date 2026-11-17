// The video templates beyond "story": each paints its own background and text for one frame.
import { BRAND } from "./brand.ts";
import { cover, dotGrid, FONT, type Frame, RTL, URDU_FONT, wipe } from "./draw.ts";
import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic } from "./ease.ts";
import { type Word, wrapWords } from "./timing.ts";

export type StyleId = "story" | "pop" | "clean" | "neon" | "chat" | "news" | "cartoon";
const C = BRAND.colors;

function words(f: Frame): Word[] {
  return f.captions.flatMap((c) => c.words);
}

/** Largest font size (down from `start`) whose wrapped lines fit the box. */
function fit(ctx: CanvasRenderingContext2D, ws: string[], font: (s: number) => string, maxW: number, maxH: number, start: number, lh = 1.15) {
  let size = start;
  let lines: string[][] = [];
  for (; size > 12; size *= 0.92) {
    ctx.font = font(size);
    lines = wrapWords(ws, maxW, (s) => ctx.measureText(s).width);
    if (lines.length * size * lh <= maxH && lines.every((l) => ctx.measureText(l.join(" ")).width <= maxW)) break;
  }
  ctx.font = font(size);
  return { size, lines };
}

function clipOr(ctx: CanvasRenderingContext2D, f: Frame, local: number, tint: string, paint: () => void) {
  if (f.clip) {
    cover(ctx, f.clip, f.w, f.h, 1 + 0.06 * local);
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, f.w, f.h);
  } else paint();
}

/** Draws full-scene text word by word; each word appears when it is spoken. Urdu is drawn whole, right to left. */
function revealText(
  ctx: CanvasRenderingContext2D,
  f: Frame,
  box: { x: number; y: number; w: number; h: number; align: "left" | "center" },
  o: { weight: number; color: string; dim?: string; active?: string; upper?: boolean; start: number; pop?: boolean },
) {
  const ws = words(f);
  const text = ws.map((w) => w.w).join(" ");
  if (RTL.test(text)) {
    const fam = (s: number) => `700 ${s}px ${URDU_FONT}`;
    const { size, lines } = fit(ctx, ws.map((w) => w.w), fam, box.w, box.h, o.start * 0.8, 1.9);
    ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = box.align === "left" ? "right" : "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = o.color;
    ctx.globalAlpha = clamp01((f.t - f.sceneStart) / 0.4);
    const x = box.align === "left" ? box.x + box.w : box.x + box.w / 2;
    lines.forEach((l, i) => ctx.fillText(l.join(" "), x, box.y + box.h / 2 + (i - (lines.length - 1) / 2) * size * 1.9));
    ctx.restore();
    return;
  }
  const fam = (s: number) => `${o.weight} ${s}px ${FONT}`;
  const shown = ws.map((w) => (o.upper ? w.w.toUpperCase() : w.w));
  const { size, lines } = fit(ctx, shown, fam, box.w, box.h, o.start);
  const lh = size * 1.15;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  let wi = 0;
  const top = box.y + box.h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((line, li) => {
    const lw = ctx.measureText(line.join(" ")).width;
    let x = box.align === "left" ? box.x : box.x + (box.w - lw) / 2;
    const y = top + li * lh;
    for (const word of line) {
      const tw = ws[wi++];
      const ww = ctx.measureText(word).width;
      const age = f.t - tw.start;
      const on = age >= -0.05;
      const active = f.t >= tw.start && f.t < tw.end;
      if (o.pop) {
        if (on) {
          const k = easeOutBack(age / 0.25);
          ctx.save();
          ctx.translate(x + ww / 2, y);
          ctx.scale(k, k);
          ctx.fillStyle = active && o.active ? o.active : o.color;
          ctx.fillText(word, -ww / 2, 0);
          ctx.restore();
        }
      } else {
        ctx.fillStyle = on ? (active && o.active ? o.active : o.color) : (o.dim ?? "transparent");
        ctx.fillText(word, x, y);
      }
      x += ww + ctx.measureText(" ").width;
    }
  });
  ctx.restore();
}

// Bold Pop: flat colour per scene, huge words that pop in as they are spoken.
const POP = [
  { bg: C.coral, fg: "#fff", accent: C.ink },
  { bg: C.amber, fg: C.ink, accent: C.coral },
  { bg: C.ink, fg: C.cream, accent: C.amber },
  { bg: C.cream, fg: C.ink, accent: C.coral },
];
function pop(ctx: CanvasRenderingContext2D, f: Frame, local: number) {
  const p = POP[f.sceneIndex % POP.length];
  const { w, h } = f;
  const u = Math.min(w, h);
  clipOr(ctx, f, local, "rgba(20,20,43,0.55)", () => {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    // Big rotating ring and a dot: simple shapes in the accent colour.
    ctx.save();
    ctx.translate(w * 0.86, h * 0.14);
    ctx.rotate(f.t * 0.6);
    ctx.strokeStyle = p.accent;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = u * 0.05;
    ctx.setLineDash([u * 0.08, u * 0.05]);
    ctx.beginPath();
    ctx.arc(0, 0, u * 0.22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = p.accent;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.arc(w * 0.12, h * 0.9, u * (0.12 + 0.02 * Math.sin(f.t * 2)), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
  const fg = f.clip ? "#fff" : p.fg;
  revealText(ctx, f, { x: w * 0.08, y: h * 0.2, w: w * 0.84, h: h * 0.6, align: "center" }, { weight: 800, color: fg, active: f.clip ? C.amber : p.accent, upper: true, start: u * 0.14, pop: true });
  const since = f.t - f.sceneStart;
  if (f.sceneIndex > 0 && since < 0.35) {
    // Circle reveal of the new colour from the centre.
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.hypot(w, h) * 0.6 * easeOutCubic(since / 0.35), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    const prev = POP[(f.sceneIndex - 1) % POP.length];
    ctx.fillStyle = prev.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

// Clean: cream page, calm ink type that darkens word by word, a coral rule that grows.
function clean(ctx: CanvasRenderingContext2D, f: Frame, local: number) {
  const { w, h } = f;
  const u = Math.min(w, h);
  clipOr(ctx, f, local, "rgba(255,244,230,0.82)", () => {
    ctx.fillStyle = C.cream;
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w * 0.9, h * 0.1, 0, w * 0.9, h * 0.1, u * 0.9);
    g.addColorStop(0, "rgba(255,183,3,0.18)");
    g.addColorStop(1, "rgba(255,183,3,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  const mx = w * 0.1;
  const since = f.t - f.sceneStart;
  const a = easeOutCubic(since / 0.6);
  ctx.save();
  ctx.font = `600 ${Math.round(u * 0.032)}px ${FONT}`;
  ctx.fillStyle = C.coral;
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = a;
  ctx.fillText(`${BRAND.name.toLowerCase()} · ${String(f.sceneIndex + 1).padStart(2, "0")}`, mx, h * 0.3);
  ctx.fillRect(mx, h * 0.3 + u * 0.03, (w - mx * 2) * 0.35 * a, Math.max(2, u * 0.006));
  ctx.restore();
  revealText(ctx, f, { x: mx, y: h * 0.33, w: w - mx * 2, h: h * 0.45, align: "left" }, { weight: 700, color: C.ink, dim: "rgba(20,20,43,0.14)", active: C.coral, start: u * 0.09 });
}

// Neon Night: dark synth grid in perspective, glowing captions.
function neon(ctx: CanvasRenderingContext2D, f: Frame, local: number) {
  const { w, h } = f;
  const u = Math.min(w, h);
  clipOr(ctx, f, local, "rgba(10,10,20,0.6)", () => {
    ctx.fillStyle = "#0A0A14";
    ctx.fillRect(0, 0, w, h);
    const hz = h * 0.58;
    const sky = ctx.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, "#0A0A14");
    sky.addColorStop(1, "rgba(255,77,109,0.35)");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, hz);
    ctx.strokeStyle = "rgba(255,77,109,0.55)";
    ctx.lineWidth = Math.max(1, u * 0.003);
    for (let i = -10; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + i * w * 0.02, hz);
      ctx.lineTo(w / 2 + i * w * 0.25, h);
      ctx.stroke();
    }
    const off = (f.t * 0.6) % 1;
    for (let k = 0; k < 12; k++) {
      const z = (k + off) / 12;
      const y = hz + (h - hz) * z * z;
      ctx.globalAlpha = z;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.amber;
    ctx.shadowColor = C.amber;
    ctx.shadowBlur = u * 0.08;
    ctx.beginPath();
    ctx.arc(w / 2, hz, u * 0.16, Math.PI, 0);
    ctx.fill();
    ctx.shadowBlur = 0;
  });
  const cap = f.captions.find((c) => f.t >= c.start && f.t < c.end) ?? f.captions[f.captions.length - 1];
  if (!cap) return;
  const size = Math.round(u * 0.085);
  const rtl = RTL.test(cap.text);
  ctx.save();
  ctx.font = rtl ? `700 ${Math.round(size * 0.8)}px ${URDU_FONT}` : `800 ${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const k = easeOutCubic((f.t - cap.start) / 0.2);
  ctx.globalAlpha = k;
  const lines = rtl ? [[cap.text]] : wrapWords(cap.words.map((x) => x.w.toUpperCase()), w * 0.86, (s) => ctx.measureText(s).width);
  if (rtl) ctx.direction = "rtl";
  lines.forEach((l, i) => {
    const y = h * 0.32 + (i - (lines.length - 1) / 2) * size * 1.2;
    const active = !rtl && l.some((wd) => cap.words.find((cw) => cw.w.toUpperCase() === wd && f.t >= cw.start && f.t < cw.end));
    ctx.shadowColor = active ? C.amber : C.coral;
    ctx.shadowBlur = size * 0.6;
    ctx.fillStyle = "#fff";
    ctx.fillText(l.join(" "), w / 2, y);
    ctx.shadowBlur = size * 0.25;
    ctx.fillText(l.join(" "), w / 2, y);
  });
  ctx.restore();
}

// Chat: each scene arrives as a message bubble after a short "typing" moment.
function chat(ctx: CanvasRenderingContext2D, f: Frame, local: number) {
  const { w, h } = f;
  const u = Math.min(w, h);
  clipOr(ctx, f, local, "rgba(20,20,43,0.7)", () => {
    ctx.fillStyle = "#1B1B36";
    ctx.fillRect(0, 0, w, h);
    dotGrid(ctx, w, h, f.t * 0.3);
  });
  const size = Math.round(u * (w > h ? 0.05 : 0.055));
  const maxW = w * 0.68;
  const pad = size * 0.7;
  const since = f.t - f.sceneStart;
  const text = words(f).map((x) => x.w).join(" ");
  const rtl = RTL.test(text);
  ctx.save();
  ctx.font = rtl ? `600 ${size}px ${URDU_FONT}` : `600 ${size}px ${FONT}`;
  const lines = wrapWords(text.split(" "), maxW - pad * 2, (s) => ctx.measureText(s).width);
  const lh = size * (rtl ? 1.9 : 1.3);
  const bw = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l.join(" ")).width)) + pad * 2);
  const bh = lines.length * lh + pad * 1.4;
  const right = f.sceneIndex % 2 === 1;
  const x = right ? w - w * 0.07 - bw : w * 0.07;
  const typing = since < 0.55;
  const k = easeOutBack((since - 0.55) / 0.3);
  const cy = h * 0.55;
  // The previous message drifts up and fades.
  if (f.sceneIndex > 0) {
    ctx.globalAlpha = 0.35 * (1 - clamp01(since / 1.2)) + 0.12;
    ctx.fillStyle = f.sceneIndex % 2 === 0 ? C.coral : "#2C2C4D";
    ctx.beginPath();
    ctx.roundRect(f.sceneIndex % 2 === 0 ? w - w * 0.07 - maxW * 0.7 : w * 0.07, cy - bh / 2 - u * 0.12 - size * 2.2, maxW * 0.7, size * 1.8, size * 0.6);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Avatar dot and name.
  ctx.fillStyle = right ? C.coral : C.amber;
  ctx.beginPath();
  ctx.arc(right ? w - w * 0.07 - size * 0.5 : w * 0.07 + size * 0.5, cy - bh / 2 - size * 1.1, size * 0.5, 0, Math.PI * 2);
  ctx.fill();
  if (typing) {
    const tw = size * 3.2;
    const tx = right ? w - w * 0.07 - tw : w * 0.07;
    ctx.fillStyle = right ? C.coral : "#2C2C4D";
    ctx.beginPath();
    ctx.roundRect(tx, cy - size, tw, size * 2, size);
    ctx.fill();
    for (let d = 0; d < 3; d++) {
      ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * Math.abs(Math.sin(f.t * 6 + d))})`;
      ctx.beginPath();
      ctx.arc(tx + size * (0.9 + d * 0.7), cy, size * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.translate(right ? x + bw : x, cy + bh / 2);
    ctx.scale(k, k);
    ctx.translate(-(right ? x + bw : x), -(cy + bh / 2));
    ctx.fillStyle = right ? C.coral : "#2C2C4D";
    ctx.beginPath();
    ctx.roundRect(x, cy - bh / 2, bw, bh, [size * 0.8, size * 0.8, right ? size * 0.15 : size * 0.8, right ? size * 0.8 : size * 0.15]);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    if (rtl) {
      ctx.direction = "rtl";
      ctx.textAlign = "right";
    }
    lines.forEach((l, i) => ctx.fillText(l.join(" "), rtl ? x + bw - pad : x + pad, cy - bh / 2 + pad * 0.7 + lh * (i + 0.5)));
  }
  ctx.restore();
}

// Headline: a lower-third headline card, a label and a ticker with the topic.
function news(ctx: CanvasRenderingContext2D, f: Frame, local: number) {
  const { w, h } = f;
  const u = Math.min(w, h);
  clipOr(ctx, f, local, "rgba(20,20,43,0.35)", () => {
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = C.coral;
    const s = u * 0.08;
    const off = (f.t * s * 0.5) % (s * 2);
    for (let x = -h - s * 2 + off; x < w; x += s * 2) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + h, 0);
      ctx.lineTo(x + h + s, 0);
      ctx.lineTo(x + s, h);
      ctx.fill();
    }
    ctx.restore();
  });
  const since = f.t - f.sceneStart;
  const slide = easeOutCubic(since / 0.45);
  const boxY = h * (h > w ? 0.5 : 0.52);
  const boxH = h * (h > w ? 0.3 : 0.32);
  const bx = w * 0.05 - (1 - slide) * w;
  const bw = w * 0.9;
  // Label pill.
  ctx.save();
  ctx.font = `800 ${Math.round(u * 0.034)}px ${FONT}`;
  const label = "QUICK FACTS";
  const lw = ctx.measureText(label).width + u * 0.05;
  ctx.fillStyle = C.amber;
  ctx.beginPath();
  ctx.roundRect(bx, boxY - u * 0.07, lw, u * 0.06, u * 0.012);
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.textBaseline = "middle";
  ctx.fillText(label, bx + u * 0.025, boxY - u * 0.04);
  // Headline card.
  ctx.fillStyle = "rgba(255,255,255,0.97)";
  ctx.beginPath();
  ctx.roundRect(bx, boxY, bw, boxH, u * 0.02);
  ctx.fill();
  ctx.fillStyle = C.coral;
  ctx.fillRect(bx, boxY, u * 0.018, boxH);
  ctx.restore();
  if (slide > 0.6) revealText(ctx, f, { x: bx + u * 0.06, y: boxY + u * 0.02, w: bw - u * 0.1, h: boxH - u * 0.04, align: "left" }, { weight: 800, color: C.ink, dim: "rgba(20,20,43,0.15)", active: C.coral, start: u * 0.075 });
  // Ticker with the topic.
  const th = u * 0.07;
  ctx.save();
  ctx.fillStyle = C.coral;
  ctx.fillRect(0, h - th, w, th);
  ctx.font = `700 ${Math.round(th * 0.42)}px ${FONT}`;
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  const item = `${(f.topic || BRAND.tagline).toUpperCase()}   •   `;
  const iw = ctx.measureText(item).width;
  for (let x = -((f.t * u * 0.15) % iw); x < w; x += iw) ctx.fillText(item, x, h - th / 2);
  ctx.restore();
}

const PAINTERS: Record<Exclude<StyleId, "story">, (ctx: CanvasRenderingContext2D, f: Frame, local: number) => void> = { pop, clean, neon, chat, news, cartoon };

export function paintStyle(style: Exclude<StyleId, "story">, ctx: CanvasRenderingContext2D, f: Frame, local: number) {
  ctx.save();
  PAINTERS[style](ctx, f, local);
  ctx.restore();
  const since = f.t - f.sceneStart;
  if (style !== "pop" && f.sceneIndex > 0 && since < 0.5) wipe(ctx, f.w, f.h, easeInOutCubic(clamp01(since / 0.5)));
}

// ---- Cartoon: one of our own characters presents the script from a speech bubble, in a flat 2D room. ----

type Room = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string, r = 0) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

const office: Room = (ctx, w, h, t) => {
  rect(ctx, 0, 0, w, h, "#FFE8D6");
  rect(ctx, 0, h * 0.78, w, h * 0.22, "#E9C4A6");
  const ww = w * 0.36;
  const wx = w * 0.58;
  rect(ctx, wx, h * 0.12, ww, h * 0.34, "#14142B", w * 0.02);
  const sky = ctx.createLinearGradient(0, h * 0.13, 0, h * 0.45);
  sky.addColorStop(0, "#8EC5FF");
  sky.addColorStop(1, "#FFD6A5");
  ctx.fillStyle = sky;
  ctx.fillRect(wx + w * 0.012, h * 0.125, ww - w * 0.024, h * 0.33);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  const cx = wx + ((t * w * 0.01) % ww);
  ctx.beginPath();
  ctx.ellipse(Math.min(cx, wx + ww - w * 0.06), h * 0.2, w * 0.045, h * 0.012, 0, 0, Math.PI * 2);
  ctx.fill();
  rect(ctx, wx + ww / 2 - w * 0.004, h * 0.12, w * 0.008, h * 0.34, "#14142B");
  // plant
  rect(ctx, w * 0.06, h * 0.66, w * 0.1, h * 0.12, "#FF4D6D", w * 0.015);
  ctx.fillStyle = "#2E8B57";
  for (let k = 0; k < 5; k++) {
    ctx.beginPath();
    ctx.ellipse(w * 0.11 + Math.cos(k) * w * 0.04, h * 0.62 - k * h * 0.012, w * 0.025, h * 0.04, k - 2, 0, Math.PI * 2);
    ctx.fill();
  }
};

const shop: Room = (ctx, w, h) => {
  rect(ctx, 0, 0, w, h, "#FFF4E6");
  for (let s = 0; s < 3; s++) {
    const y = h * (0.16 + s * 0.17);
    rect(ctx, w * 0.04, y + h * 0.12, w * 0.92, h * 0.015, "#8B5E3C");
    const colors = ["#FF4D6D", "#FFB703", "#2E86AB", "#7B2CBF", "#2E8B57"];
    for (let b = 0; b < 9; b++) rect(ctx, w * (0.06 + b * 0.1), y + h * (0.05 - (b % 3) * 0.01), w * 0.07, h * (0.07 + (b % 3) * 0.01), colors[(b + s) % 5], w * 0.008);
  }
  for (let k = 0; k < 8; k++) rect(ctx, (k * w) / 8, 0, w / 8, h * 0.07, k % 2 ? "#FFFFFF" : "#FF4D6D");
  rect(ctx, 0, h * 0.8, w, h * 0.2, "#D9B48F");
};

const street: Room = (ctx, w, h, t) => {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.7);
  sky.addColorStop(0, "#FFB38A");
  sky.addColorStop(1, "#FFE8D6");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#FFB703";
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.18, Math.min(w, h) * 0.07, 0, Math.PI * 2);
  ctx.fill();
  const tones = ["#7B5BA6", "#5E4B8B", "#8E6CC0", "#6A4F9A"];
  for (let k = 0; k < 7; k++) {
    const bw = w * 0.17;
    const bh = h * (0.28 + ((k * 37) % 5) * 0.05);
    const x = k * w * 0.15 - w * 0.03 + Math.sin(t * 0.05) * 2;
    rect(ctx, x, h * 0.78 - bh, bw, bh, tones[k % 4]);
    ctx.fillStyle = "rgba(255,214,165,0.85)";
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) if ((k + r + c) % 3) ctx.fillRect(x + bw * (0.18 + c * 0.42), h * 0.78 - bh + bh * (0.1 + r * 0.2), bw * 0.22, bh * 0.08);
  }
  rect(ctx, 0, h * 0.78, w, h * 0.22, "#3D3D5C");
  ctx.fillStyle = "#FFF4E6";
  for (let x = ((-t * w * 0.05) % (w * 0.2)) - w * 0.2; x < w; x += w * 0.2) ctx.fillRect(x, h * 0.885, w * 0.1, h * 0.008);
};

const home: Room = (ctx, w, h) => {
  rect(ctx, 0, 0, w, h, "#E3F2EF");
  for (let x = 0; x < w; x += w * 0.06) rect(ctx, x, 0, w * 0.025, h * 0.78, "rgba(46,139,87,0.08)");
  rect(ctx, 0, h * 0.78, w, h * 0.22, "#C9A27E");
  rect(ctx, w * 0.1, h * 0.14, w * 0.26, h * 0.18, "#14142B", w * 0.01);
  rect(ctx, w * 0.115, h * 0.152, w * 0.23, h * 0.156, "#FFB703", w * 0.006);
  ctx.fillStyle = "#FF4D6D";
  ctx.beginPath();
  ctx.arc(w * 0.23, h * 0.24, Math.min(w, h) * 0.04, 0, Math.PI * 2);
  ctx.fill();
  rect(ctx, w * 0.72, h * 0.3, w * 0.012, h * 0.48, "#14142B");
  ctx.fillStyle = "#FFB703";
  ctx.beginPath();
  ctx.moveTo(w * 0.66, h * 0.32);
  ctx.lineTo(w * 0.79, h * 0.32);
  ctx.lineTo(w * 0.75, h * 0.24);
  ctx.lineTo(w * 0.7, h * 0.24);
  ctx.fill();
};

const ROOMS: Room[] = [office, shop, street, home];

function cartoon(ctx: CanvasRenderingContext2D, f: Frame, local: number) {
  const { w, h } = f;
  const u = Math.min(w, h);
  const portrait = h >= w;
  if (f.clip) {
    cover(ctx, f.clip, w, h, 1 + 0.04 * local);
    ctx.fillStyle = "rgba(255,244,230,0.18)";
    ctx.fillRect(0, 0, w, h);
  } else ROOMS[f.sceneIndex % ROOMS.length](ctx, w, h, f.t);

  // The character, standing at the bottom (portrait) or on the left (landscape), with a soft floor shadow.
  const ch = portrait ? h * 0.6 : h * 0.98;
  const cw = ch * (500 / 720);
  const cx = portrait ? (w - cw) / 2 : w * 0.04;
  const cy = h - ch + (portrait ? h * 0.04 : h * 0.06);
  ctx.fillStyle = "rgba(20,20,43,0.18)";
  ctx.beginPath();
  ctx.ellipse(cx + cw / 2, h - u * 0.01, cw * 0.42, u * 0.035, 0, 0, Math.PI * 2);
  ctx.fill();
  if (f.character) ctx.drawImage(f.character, cx, cy, cw, ch);

  // Speech bubble with the words, popping in at each scene.
  const since = f.t - f.sceneStart;
  const k = easeOutBack(since / 0.35);
  const b = portrait ? { x: w * 0.07, y: h * 0.1, w: w * 0.86, h: h * 0.27 } : { x: w * 0.42, y: h * 0.14, w: w * 0.53, h: h * 0.5 };
  const tail = portrait ? { x: w * 0.5, y: b.y + b.h + h * 0.05 } : { x: cx + cw * 0.86, y: h * 0.42 };
  ctx.save();
  const ox = portrait ? w / 2 : b.x;
  const oy = b.y + b.h;
  ctx.translate(ox, oy);
  ctx.scale(k, k);
  ctx.translate(-ox, -oy);
  ctx.shadowColor = "rgba(20,20,43,0.25)";
  ctx.shadowBlur = u * 0.03;
  ctx.shadowOffsetY = u * 0.01;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, u * 0.05);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.beginPath();
  if (portrait) {
    ctx.moveTo(tail.x - w * 0.05, b.y + b.h - 2);
    ctx.lineTo(tail.x, tail.y);
    ctx.lineTo(tail.x + w * 0.05, b.y + b.h - 2);
  } else {
    ctx.moveTo(b.x + 2, b.y + b.h * 0.55);
    ctx.lineTo(tail.x, tail.y);
    ctx.lineTo(b.x + 2, b.y + b.h * 0.8);
  }
  ctx.fill();
  ctx.lineWidth = Math.max(2, u * 0.006);
  ctx.strokeStyle = C.ink;
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, u * 0.05);
  ctx.stroke();
  ctx.restore();
  if (k > 0.5) {
    const pad = u * 0.045;
    revealText(ctx, f, { x: b.x + pad, y: b.y + pad * 0.8, w: b.w - pad * 2, h: b.h - pad * 1.6, align: "center" }, { weight: 800, color: C.ink, dim: "rgba(20,20,43,0.13)", active: C.coral, start: u * (portrait ? 0.075 : 0.08) });
  }
}
