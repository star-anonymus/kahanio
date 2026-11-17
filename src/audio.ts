// Mixes the soundtrack offline (faster than real time): generated music, ducked under the user's own voice.
import { midiToHz, planMusic } from "./music.ts";

export const SAMPLE_RATE = 48000;

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export async function buildSoundtrack(duration: number, opts: { music: boolean; seed: number; voice?: AudioBuffer }): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  if (opts.music) {
    const master = ctx.createGain();
    const level = opts.voice ? 0.1 : 0.3;
    master.gain.setValueAtTime(0, 0);
    master.gain.linearRampToValueAtTime(level, 1);
    master.gain.setValueAtTime(level, Math.max(1, duration - 1.8));
    master.gain.linearRampToValueAtTime(0, duration);
    master.connect(ctx.destination);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    lp.connect(master);

    const plan = planMusic(duration, opts.seed);
    for (const c of plan.chords) {
      const notes = [...c.notes, c.notes[0] - 12];
      notes.forEach((n, i) => {
        const osc = ctx.createOscillator();
        osc.type = i === notes.length - 1 ? "sine" : "triangle";
        osc.frequency.value = midiToHz(n);
        osc.detune.value = (i % 2 ? 6 : -6);
        const g = ctx.createGain();
        const peak = i === notes.length - 1 ? 0.22 : 0.09;
        g.gain.setValueAtTime(0, c.t);
        g.gain.linearRampToValueAtTime(peak, c.t + 0.35);
        g.gain.setValueAtTime(peak, c.t + c.dur - 0.3);
        g.gain.linearRampToValueAtTime(0, c.t + c.dur + 0.05);
        osc.connect(g).connect(lp);
        osc.start(c.t);
        osc.stop(c.t + c.dur + 0.1);
      });
    }
    for (const t of plan.kicks) {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.7, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.3);
    }
    const noise = noiseBuffer(ctx);
    for (const t of plan.hats) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      src.connect(hp).connect(g).connect(master);
      src.start(t);
      src.stop(t + 0.08);
    }
  }
  if (opts.voice) {
    const v = ctx.createBufferSource();
    v.buffer = opts.voice;
    v.connect(ctx.destination);
    v.start(0);
  }
  return ctx.startRendering();
}

export async function decodeVoice(file: Blob): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, SAMPLE_RATE, SAMPLE_RATE);
  try {
    return await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error("Could not read that audio file. Try an MP3, WAV, M4A or WebM recording.");
  }
}
