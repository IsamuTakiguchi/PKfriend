// Synthesized sound effects (no external assets). Layered arcade-style hits with sub bass,
// distortion, reverb and BGM ducking. Respects the sound toggle in the store.
import { useStore } from './store';

let ctx: AudioContext | null = null;
/** Shared AudioContext for SFX and BGM (created lazily, resumed on user gestures). */
export function getAudioContext(): AudioContext | null {
  try { ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); if (ctx.state === 'suspended') void ctx.resume(); return ctx; } catch { return null; }
}
export function unlockAudio() { getAudioContext(); }

// ------------------------------------------------------------------ FX bus (dry -> compressor, reverb send, distortion)
interface Bus { dry: GainNode; wet: GainNode; dist: WaveShaperNode; distOut: GainNode; comp: DynamicsCompressorNode; }
let bus: Bus | null = null;
let duckHook: ((ms: number, depth: number) => void) | null = null;
/** BGM registers a ducking callback so heavy hits punch through the music. */
export function setDuckHook(fn: (ms: number, depth: number) => void) { duckHook = fn; }
const duck = (ms: number, depth = 0.35) => duckHook?.(ms, depth);

function ac(): AudioContext | null {
  if (!useStore.getState().sound) return null;
  return getAudioContext();
}
export function getBus(c: AudioContext): Bus {
  if (bus) return bus;
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.15;
  const master = c.createGain(); master.gain.value = 1.0;
  comp.connect(master).connect(c.destination);
  const dry = c.createGain(); dry.connect(comp);
  // reverb: synthetic impulse response (1.6s exponential decay, slightly bright)
  const len = Math.floor(c.sampleRate * 1.6); const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  const conv = c.createConvolver(); conv.buffer = ir;
  const wet = c.createGain(); wet.gain.value = 1; const wetOut = c.createGain(); wetOut.gain.value = 0.35;
  wet.connect(conv).connect(wetOut).connect(comp);
  // distortion for impacts
  const dist = c.createWaveShaper(); const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = (i / 511.5) - 1; curve[i] = Math.tanh(x * 4) * 0.8; } dist.curve = curve; dist.oversample = '2x';
  const distOut = c.createGain(); distOut.gain.value = 0.6; dist.connect(distOut).connect(comp);
  bus = { dry, wet, dist, distOut, comp };
  return bus;
}

// ------------------------------------------------------------------ primitives
type Wave = OscillatorType;
interface ToneOpts { type?: Wave; gain?: number; slide?: number; delay?: number; attack?: number; release?: number; wet?: number; dist?: boolean; detune?: number; fm?: { ratio: number; depth: number }; tremolo?: number; lp?: number; hp?: number; }
function tone(freq: number, dur: number, o: ToneOpts = {}) {
  const c = ac(); if (!c) return; const b = getBus(c);
  const t0 = c.currentTime + (o.delay ?? 0);
  const osc = c.createOscillator(); osc.type = o.type ?? 'square'; osc.frequency.setValueAtTime(freq, t0); if (o.detune) osc.detune.value = o.detune;
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(15, o.slide), t0 + dur);
  const g = c.createGain(); const gain = o.gain ?? 0.12; const a = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + a);
  if (o.release !== undefined) { g.gain.setValueAtTime(gain, Math.max(t0 + a, t0 + dur - o.release)); }
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node: AudioNode = osc;
  if (o.fm) { const m = c.createOscillator(); m.frequency.value = freq * o.fm.ratio; const mg = c.createGain(); mg.gain.value = freq * o.fm.depth; m.connect(mg).connect(osc.frequency); m.start(t0); m.stop(t0 + dur + 0.05); }
  if (o.tremolo) { const l = c.createOscillator(); l.frequency.value = o.tremolo; const lg = c.createGain(); lg.gain.value = gain * 0.5; l.connect(lg).connect(g.gain); l.start(t0); l.stop(t0 + dur + 0.05); }
  if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
  if (o.hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.hp; node.connect(f); node = f; }
  node.connect(g);
  g.connect(o.dist ? b.dist : b.dry);
  if (o.wet) { const w = c.createGain(); w.gain.value = o.wet; g.connect(w).connect(b.wet); }
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}
interface NoiseOpts { gain?: number; delay?: number; lp?: number; hp?: number; bp?: number; q?: number; sweep?: number; attack?: number; wet?: number; dist?: boolean; }
let noiseBuf: AudioBuffer | null = null;
function noise(dur: number, o: NoiseOpts = {}) {
  const c = ac(); if (!c) return; const b = getBus(c);
  const t0 = c.currentTime + (o.delay ?? 0);
  if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  let node: AudioNode = src;
  const mk = (type: BiquadFilterType, f: number, q = 1) => { const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t0); fl.Q.value = q; if (o.sweep) fl.frequency.exponentialRampToValueAtTime(Math.max(30, o.sweep), t0 + dur); node.connect(fl); node = fl; };
  if (o.bp) mk('bandpass', o.bp, o.q ?? 1.5); if (o.lp) mk('lowpass', o.lp); if (o.hp) mk('highpass', o.hp);
  const g = c.createGain(); const gain = o.gain ?? 0.2; const a = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  node.connect(g); g.connect(o.dist ? b.dist : b.dry);
  if (o.wet) { const w = c.createGain(); w.gain.value = o.wet; g.connect(w).connect(b.wet); }
  src.start(t0); src.stop(t0 + dur + 0.02);
}
/** Heavy low thud: sub sine drop + distorted click. */
function boom(delay = 0, size = 1) {
  tone(160 * size, 0.35, { type: 'sine', gain: 0.9, slide: 32, delay, release: 0.2 });
  tone(90, 0.5, { type: 'sine', gain: 0.6, slide: 24, delay, attack: 0.01 });
  noise(0.12, { gain: 0.6, lp: 1200, delay, dist: true });
  noise(0.4, { gain: 0.25, lp: 300, delay, wet: 0.6 });
}
/** Air-cutting swoosh. */
function whoosh(dur = 0.25, delay = 0, up = false, gain = 0.35) { noise(dur, { gain, bp: up ? 400 : 3000, sweep: up ? 4000 : 500, q: 1.2, delay, attack: dur * 0.4, wet: 0.3 }); }
/** Rising charge before a big move. */
function charge(dur = 0.35, delay = 0) { tone(200, dur, { type: 'sawtooth', gain: 0.1, slide: 1600, delay, attack: dur * 0.6, lp: 3000, fm: { ratio: 2, depth: 0.5 } }); noise(dur, { gain: 0.2, bp: 600, sweep: 6000, delay, attack: dur * 0.7 }); }

// ------------------------------------------------------------------ sound bank
export const sfx = {
  click: () => tone(880, 0.06, { type: 'triangle', gain: 0.06 }),
  select: () => { tone(660, 0.06, { type: 'triangle', gain: 0.06 }); tone(990, 0.08, { type: 'triangle', gain: 0.06, delay: 0.06 }); },
  tick: () => tone(1000, 0.03, { type: 'square', gain: 0.04 }),
  emote: () => tone(1200, 0.08, { type: 'triangle', gain: 0.05 }),

  // --- attack launch (start of a physical lunge / special cast)
  lunge: () => { whoosh(0.3, 0, true, 0.4); },
  cast: () => { charge(0.3); },

  // --- move effects (timed so the peak lands ~0.1-0.3s after the call, when particles arrive)
  hit: () => { whoosh(0.12, 0, false, 0.3); boom(0.08, 0.9); noise(0.18, { gain: 0.4, hp: 2000, delay: 0.08 }); duck(250, 0.5); },
  hitBig: () => { whoosh(0.15, 0, false, 0.4); boom(0.1, 1.2); tone(55, 0.7, { type: 'sine', gain: 0.8, slide: 20, delay: 0.1 }); noise(0.5, { gain: 0.6, lp: 900, delay: 0.1, dist: true, wet: 0.7 }); noise(0.25, { gain: 0.5, hp: 1500, delay: 0.1 }); duck(450, 0.25); },
  slash: () => { for (let i = 0; i < 3; i++) { noise(0.16, { gain: 0.45, bp: 5000, sweep: 800, q: 2, delay: i * 0.09, wet: 0.4 }); tone(2400 + i * 300, 0.12, { type: 'sawtooth', gain: 0.08, slide: 600, delay: i * 0.09 + 0.02, hp: 1500 }); } boom(0.3, 0.7); duck(300, 0.4); },
  beam: () => { charge(0.3); tone(90, 0.95, { type: 'sawtooth', gain: 0.35, slide: 260, delay: 0.25, attack: 0.05, lp: 2200, tremolo: 28, dist: true }); tone(400, 0.9, { type: 'square', gain: 0.12, slide: 1900, delay: 0.25, attack: 0.1, lp: 5000, wet: 0.5 }); noise(0.95, { gain: 0.45, bp: 1200, sweep: 5000, q: 0.8, delay: 0.25, attack: 0.08, wet: 0.5 }); boom(0.55, 0.9); noise(0.5, { gain: 0.4, hp: 3000, delay: 1.0, wet: 0.8 }); duck(1000, 0.3); },
  shock: () => { for (let i = 0; i < 10; i++) { const d = i * 0.045; noise(0.03, { gain: 0.5, hp: 4000 + Math.random() * 3000, delay: d }); tone(1800 + Math.random() * 2500, 0.05, { type: 'square', gain: 0.09, delay: d, hp: 1000 }); } tone(58, 0.55, { type: 'sawtooth', gain: 0.35, delay: 0.05, lp: 500, tremolo: 55, dist: true }); tone(3200, 0.5, { type: 'sawtooth', gain: 0.08, slide: 200, delay: 0.4, fm: { ratio: 0.5, depth: 6 }, wet: 0.6 }); boom(0.42, 1); duck(600, 0.3); },
  burst: () => { charge(0.2); boom(0.18, 1.4); tone(48, 0.9, { type: 'sine', gain: 0.9, slide: 18, delay: 0.18 }); noise(0.9, { gain: 0.7, lp: 1500, sweep: 200, delay: 0.18, dist: true, wet: 0.9 }); noise(0.3, { gain: 0.6, hp: 1200, delay: 0.18 }); noise(1.2, { gain: 0.25, lp: 400, delay: 0.4, wet: 1 }); duck(900, 0.2); },
  wave: () => { noise(1.0, { gain: 0.55, bp: 500, sweep: 2500, q: 0.7, attack: 0.3, wet: 0.7 }); tone(140, 0.9, { type: 'sine', gain: 0.35, slide: 60, attack: 0.3 }); boom(0.5, 0.8); noise(0.7, { gain: 0.5, hp: 2500, delay: 0.5, wet: 0.8 }); for (let i = 0; i < 6; i++) tone(600 + Math.random() * 900, 0.08, { type: 'sine', gain: 0.06, slide: 300, delay: 0.5 + i * 0.05 }); duck(700, 0.35); },
  ice: () => { noise(0.8, { gain: 0.35, hp: 6000, attack: 0.2, wet: 0.8 }); [1568, 2093, 2637, 3136, 3951].forEach((f, i) => tone(f, 0.5, { type: 'sine', gain: 0.1, delay: i * 0.06, wet: 1, attack: 0.005 })); noise(0.08, { gain: 0.6, bp: 3500, q: 4, delay: 0.35 }); noise(0.06, { gain: 0.5, bp: 5000, q: 4, delay: 0.45 }); boom(0.4, 0.6); duck(500, 0.4); },
  psychic: () => { tone(300, 0.9, { type: 'sine', gain: 0.25, slide: 2400, fm: { ratio: 1.5, depth: 2 }, wet: 1, attack: 0.1 }); tone(302, 0.9, { type: 'triangle', gain: 0.15, slide: 2500, wet: 1, attack: 0.1 }); noise(0.9, { gain: 0.15, bp: 900, sweep: 9000, q: 3, attack: 0.4, wet: 1 }); tone(1200, 0.4, { type: 'sine', gain: 0.25, slide: 150, delay: 0.75, fm: { ratio: 2, depth: 1 }, wet: 0.8 }); boom(0.78, 0.7); duck(700, 0.35); },
  quake: () => { tone(38, 1.3, { type: 'sine', gain: 1.0, tremolo: 9, attack: 0.05 }); noise(1.3, { gain: 0.7, lp: 220, attack: 0.05, dist: true }); for (let i = 0; i < 5; i++) boom(0.1 + i * 0.18, 0.8 + Math.random() * 0.4); noise(0.6, { gain: 0.3, bp: 800, q: 1, delay: 0.6, wet: 0.8 }); duck(1300, 0.2); },
  wind: () => { noise(0.9, { gain: 0.5, bp: 300, sweep: 3500, q: 0.6, attack: 0.25, wet: 0.5 }); noise(0.7, { gain: 0.4, bp: 2500, sweep: 400, q: 0.8, delay: 0.35, wet: 0.5 }); for (let i = 0; i < 3; i++) whoosh(0.2, 0.3 + i * 0.12, false, 0.35); boom(0.6, 0.6); duck(600, 0.4); },
  leaf: () => { for (let i = 0; i < 6; i++) { noise(0.1, { gain: 0.35, bp: 3000 + Math.random() * 3000, sweep: 800, q: 2, delay: i * 0.06, wet: 0.3 }); } noise(0.5, { gain: 0.3, hp: 5000, attack: 0.1, wet: 0.4 }); boom(0.38, 0.7); noise(0.2, { gain: 0.4, bp: 2500, q: 1.5, delay: 0.38 }); duck(400, 0.4); },
  poison: () => { for (let i = 0; i < 7; i++) tone(200 + Math.random() * 300, 0.12, { type: 'sine', gain: 0.18, slide: 900, delay: i * 0.07, wet: 0.6 }); noise(0.8, { gain: 0.25, lp: 1500, attack: 0.1, wet: 0.7 }); noise(0.4, { gain: 0.4, lp: 600, delay: 0.5, dist: true }); boom(0.5, 0.7); duck(600, 0.4); },
  aura: () => { tone(150, 0.9, { type: 'sawtooth', gain: 0.2, slide: 40, fm: { ratio: 0.51, depth: 3 }, lp: 900, wet: 1, attack: 0.15 }); noise(0.9, { gain: 0.25, bp: 400, sweep: 150, q: 2, attack: 0.2, wet: 1 }); tone(900, 0.6, { type: 'sine', gain: 0.15, slide: 100, delay: 0.5, wet: 1 }); boom(0.55, 0.9); duck(700, 0.35); },
  heal: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.5, { type: 'sine', gain: 0.1, delay: i * 0.09, wet: 1 })); noise(0.8, { gain: 0.12, hp: 7000, attack: 0.2, wet: 1 }); },
  buff: () => { tone(300, 0.45, { type: 'triangle', gain: 0.12, slide: 1200, wet: 0.8 }); tone(600, 0.45, { type: 'square', gain: 0.05, slide: 2400, delay: 0.05, wet: 0.8 }); noise(0.4, { gain: 0.15, bp: 800, sweep: 6000, attack: 0.2, wet: 0.6 }); },
  debuff: () => { tone(900, 0.45, { type: 'triangle', gain: 0.12, slide: 250, wet: 0.8 }); noise(0.4, { gain: 0.12, bp: 4000, sweep: 300, attack: 0.05, wet: 0.5 }); },

  // --- result stingers
  superEff: () => { tone(2200, 0.35, { type: 'sine', gain: 0.35, slide: 1800, fm: { ratio: 3.1, depth: 1.2 }, wet: 1 }); tone(1100, 0.3, { type: 'square', gain: 0.1, delay: 0.02, wet: 0.8 }); tone(70, 0.6, { type: 'sine', gain: 0.7, slide: 25, delay: 0.03 }); noise(0.3, { gain: 0.35, hp: 3000, wet: 0.8 }); duck(500, 0.25); },
  crit: () => { noise(0.06, { gain: 0.8, hp: 2500 }); tone(3000, 0.25, { type: 'square', gain: 0.18, slide: 5000, wet: 0.9 }); tone(1500, 0.3, { type: 'sawtooth', gain: 0.12, slide: 3000, delay: 0.03, hp: 800, wet: 0.9 }); boom(0.04, 1.1); duck(500, 0.25); },
  miss: () => { whoosh(0.35, 0, false, 0.3); tone(500, 0.25, { type: 'triangle', gain: 0.06, slide: 250, delay: 0.1 }); },
  faint: () => { tone(400, 0.7, { type: 'sawtooth', gain: 0.15, slide: 50, lp: 1500, wet: 0.6 }); tone(200, 0.7, { type: 'square', gain: 0.08, slide: 30, delay: 0.05 }); boom(0.5, 1.0); noise(0.6, { gain: 0.3, lp: 500, delay: 0.5, wet: 0.8 }); duck(800, 0.3); },
  cutin: () => { noise(0.9, { gain: 0.5, bp: 300, sweep: 8000, q: 0.9, attack: 0.5, wet: 0.5 }); tone(80, 0.9, { type: 'sawtooth', gain: 0.25, slide: 900, attack: 0.4, lp: 2500, dist: true }); tone(120, 0.9, { type: 'square', gain: 0.1, slide: 1300, attack: 0.5, wet: 0.7 }); boom(0.85, 1.3); noise(0.3, { gain: 0.6, hp: 2000, delay: 0.85, wet: 0.9 }); duck(1200, 0.25); },
  enrage: () => { tone(60, 1.2, { type: 'sawtooth', gain: 0.4, slide: 240, lp: 700, dist: true, tremolo: 12 }); noise(1.2, { gain: 0.5, lp: 500, dist: true, wet: 0.8 }); tone(180, 0.9, { type: 'sawtooth', gain: 0.15, slide: 90, delay: 0.2, fm: { ratio: 0.5, depth: 4 }, wet: 1 }); boom(0.0, 1.5); boom(0.6, 1.5); duck(1200, 0.2); },
  join: () => { [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.18, { type: 'square', gain: 0.08, delay: i * 0.07, wet: 0.6 })); boom(0.28, 0.8); noise(0.4, { gain: 0.3, hp: 3000, delay: 0.28, wet: 0.8 }); },
  chain: () => { [880, 1175, 1760].forEach((f, i) => tone(f, 0.25, { type: 'square', gain: 0.12, delay: i * 0.06, wet: 0.8 })); boom(0.15, 1.0); },

  // --- catching
  throwBall: () => { tone(600, 0.45, { type: 'sine', gain: 0.1, slide: 1400, wet: 0.5 }); whoosh(0.45, 0, true, 0.3); },
  ballHit: () => { tone(900, 0.12, { type: 'square', gain: 0.1, slide: 300 }); noise(0.12, { gain: 0.25, hp: 1500 }); tone(1800, 0.4, { type: 'sine', gain: 0.12, slide: 4000, delay: 0.1, wet: 1 }); },
  shake: () => { tone(320, 0.14, { type: 'square', gain: 0.1, slide: 200 }); noise(0.08, { gain: 0.25, lp: 1500 }); },
  breakOut: () => { noise(0.35, { gain: 0.5, lp: 2500, dist: true }); tone(700, 0.3, { type: 'sawtooth', gain: 0.12, slide: 150 }); boom(0.0, 0.8); },
  caught: () => { [523, 523, 523, 659, 784, 1047].forEach((f, i) => tone(f, i === 5 ? 0.8 : 0.14, { type: 'square', gain: 0.1, delay: [0, 0.12, 0.24, 0.36, 0.48, 0.6][i], wet: 0.6 })); noise(0.6, { gain: 0.2, hp: 5000, delay: 0.6, wet: 1 }); },

  // --- jingles
  victory: () => { [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i === 6 ? 1.0 : 0.15, { type: 'square', gain: 0.09, delay: i * 0.13, wet: 0.6 })); boom(0.78, 1.0); },
  lose: () => { [440, 415, 392, 330].forEach((f, i) => tone(f, 0.4, { type: 'triangle', gain: 0.09, delay: i * 0.3, wet: 0.7 })); },
  levelUp: () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.2, { type: 'square', gain: 0.09, delay: i * 0.08, wet: 0.7 })); noise(0.5, { gain: 0.15, hp: 6000, delay: 0.3, wet: 1 }); },
  evolve: () => { for (let i = 0; i < 12; i++) tone(300 + i * 90, 0.18, { type: 'triangle', gain: 0.08, delay: i * 0.12, wet: 0.8 }); tone(1568, 1.0, { type: 'square', gain: 0.1, delay: 1.5, wet: 1 }); boom(1.5, 1.0); },
  encounter: () => { tone(220, 0.12, { gain: 0.12 }); tone(330, 0.12, { gain: 0.12, delay: 0.1 }); tone(440, 0.3, { gain: 0.12, delay: 0.2, wet: 0.6 }); boom(0.2, 0.9); noise(0.4, { gain: 0.3, bp: 1500, sweep: 300, delay: 0.2, wet: 0.5 }); },
};
export type SfxName = keyof typeof sfx;
