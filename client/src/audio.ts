// Synthesized sound effects (no external assets). Respects the sound toggle in the store.
import { useStore } from './store';

let ctx: AudioContext | null = null;
/** Shared AudioContext for SFX and BGM (created lazily, resumed on user gestures). */
export function getAudioContext(): AudioContext | null {
  try { ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); if (ctx.state === 'suspended') void ctx.resume(); return ctx; } catch { return null; }
}
function ac(): AudioContext | null {
  if (!useStore.getState().sound) return null;
  return getAudioContext();
}
export function unlockAudio() { getAudioContext(); }

type Wave = OscillatorType;
function tone(freq: number, dur: number, opts: { type?: Wave; gain?: number; slide?: number; delay?: number; attack?: number } = {}) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const o = c.createOscillator(); const g = c.createGain();
  o.type = opts.type ?? 'square'; o.frequency.setValueAtTime(freq, t0);
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.12, t0 + (opts.attack ?? 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(dur: number, opts: { gain?: number; delay?: number; lp?: number } = {}) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp ?? 1200;
  const g = c.createGain(); g.gain.setValueAtTime(opts.gain ?? 0.2, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(c.destination); src.start(t0);
}

export const sfx = {
  click: () => tone(880, 0.06, { type: 'triangle', gain: 0.06 }),
  select: () => { tone(660, 0.06, { type: 'triangle', gain: 0.06 }); tone(990, 0.08, { type: 'triangle', gain: 0.06, delay: 0.06 }); },
  hit: () => { noise(0.18, { gain: 0.35, lp: 900 }); tone(140, 0.18, { type: 'sawtooth', gain: 0.15, slide: 60 }); },
  hitBig: () => { noise(0.35, { gain: 0.5, lp: 700 }); tone(110, 0.3, { type: 'sawtooth', gain: 0.2, slide: 40 }); tone(55, 0.35, { type: 'sine', gain: 0.25, slide: 30 }); },
  slash: () => { noise(0.12, { gain: 0.3, lp: 4000 }); tone(1800, 0.1, { type: 'sawtooth', gain: 0.05, slide: 400 }); },
  beam: () => { tone(300, 0.6, { type: 'sawtooth', gain: 0.08, slide: 1400, attack: 0.15 }); noise(0.6, { gain: 0.15, lp: 3000 }); },
  shock: () => { for (let i = 0; i < 6; i++) tone(2200 + Math.random() * 1500, 0.05, { type: 'square', gain: 0.05, delay: i * 0.06 }); noise(0.4, { gain: 0.2, lp: 5000 }); },
  wave: () => { noise(0.7, { gain: 0.3, lp: 600 }); tone(200, 0.6, { type: 'sine', gain: 0.1, slide: 90 }); },
  burst: () => { noise(0.4, { gain: 0.4, lp: 1500 }); tone(220, 0.4, { type: 'square', gain: 0.08, slide: 40 }); },
  ice: () => { for (let i = 0; i < 5; i++) tone(1500 + i * 300, 0.12, { type: 'sine', gain: 0.06, delay: i * 0.05 }); noise(0.4, { gain: 0.12, lp: 6000 }); },
  psychic: () => { tone(400, 0.7, { type: 'sine', gain: 0.1, slide: 1600 }); tone(405, 0.7, { type: 'sine', gain: 0.1, slide: 1700 }); },
  quake: () => { noise(0.9, { gain: 0.5, lp: 300 }); tone(45, 0.9, { type: 'sine', gain: 0.35, slide: 30 }); },
  wind: () => noise(0.7, { gain: 0.3, lp: 2500 }),
  heal: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, { type: 'sine', gain: 0.08, delay: i * 0.09 })); },
  buff: () => { tone(300, 0.3, { type: 'triangle', gain: 0.08, slide: 900 }); },
  debuff: () => { tone(900, 0.3, { type: 'triangle', gain: 0.08, slide: 300 }); },
  superEff: () => { tone(880, 0.08, { gain: 0.1 }); tone(1320, 0.12, { gain: 0.1, delay: 0.08 }); },
  crit: () => { tone(1760, 0.05, { gain: 0.1 }); tone(2200, 0.05, { gain: 0.1, delay: 0.05 }); tone(2640, 0.1, { gain: 0.1, delay: 0.1 }); },
  miss: () => tone(500, 0.2, { type: 'triangle', gain: 0.06, slide: 250 }),
  faint: () => { tone(400, 0.5, { type: 'sawtooth', gain: 0.1, slide: 60 }); },
  cutin: () => { noise(0.3, { gain: 0.3, lp: 3000 }); tone(120, 0.5, { type: 'sawtooth', gain: 0.12, slide: 600, attack: 0.2 }); },
  enrage: () => { tone(80, 0.8, { type: 'sawtooth', gain: 0.18, slide: 200 }); noise(0.8, { gain: 0.3, lp: 400 }); },
  join: () => { [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.15, { type: 'square', gain: 0.07, delay: i * 0.07 })); },
  throwBall: () => tone(600, 0.35, { type: 'sine', gain: 0.08, slide: 1200 }),
  ballHit: () => { tone(900, 0.1, { type: 'square', gain: 0.08, slide: 300 }); noise(0.1, { gain: 0.15 }); },
  shake: () => tone(320, 0.12, { type: 'square', gain: 0.07, slide: 200 }),
  breakOut: () => { noise(0.3, { gain: 0.3, lp: 2000 }); tone(700, 0.25, { type: 'sawtooth', gain: 0.1, slide: 150 }); },
  caught: () => { [523, 523, 523, 659, 784, 1047].forEach((f, i) => tone(f, i === 5 ? 0.6 : 0.12, { type: 'square', gain: 0.09, delay: [0, 0.12, 0.24, 0.36, 0.48, 0.6][i] })); },
  victory: () => { [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i === 6 ? 0.8 : 0.14, { type: 'square', gain: 0.08, delay: i * 0.13 })); },
  lose: () => { [440, 415, 392, 330].forEach((f, i) => tone(f, 0.35, { type: 'triangle', gain: 0.08, delay: i * 0.3 })); },
  levelUp: () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.18, { type: 'square', gain: 0.08, delay: i * 0.08 })); },
  evolve: () => { for (let i = 0; i < 12; i++) tone(300 + i * 90, 0.15, { type: 'triangle', gain: 0.07, delay: i * 0.12 }); tone(1568, 0.9, { type: 'square', gain: 0.1, delay: 1.5 }); },
  encounter: () => { tone(220, 0.1, { gain: 0.1 }); tone(330, 0.1, { gain: 0.1, delay: 0.1 }); tone(440, 0.25, { gain: 0.1, delay: 0.2 }); },
  emote: () => tone(1200, 0.08, { type: 'triangle', gain: 0.05 }),
  tick: () => tone(1000, 0.03, { type: 'square', gain: 0.04 }),
};
export type SfxName = keyof typeof sfx;
