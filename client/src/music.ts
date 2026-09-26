// Procedural chiptune-style BGM engine (Web Audio, no audio files).
// Tracks are written as 16th-note step strings per channel:  "c4 - - . e4"  -> note, hold, hold, rest, note
// Chords use "+" (c4+e4+g4). Drum channels use "x" for a hit.
import { useEffect, useRef } from 'react';
import { getAudioContext, setDuckHook } from './audio';
import { useStore } from './store';

export type TrackName = 'home' | 'explore' | 'battle' | 'boss' | 'catch' | 'result';

type Voice = 'lead' | 'lead2' | 'bass' | 'chords' | 'arp' | 'kick' | 'snare' | 'hat' | 'ohat' | 'crash';
interface Track { bpm: number; swing?: number; channels: Partial<Record<Voice, string>>; }
interface Step { notes: number[]; len: number; }

const NOTE_IDX: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
function midi(tok: string): number {
  const m = /^([a-g])(#|b)?(-?\d)$/.exec(tok); if (!m) throw new Error('bad note ' + tok);
  return 12 * (parseInt(m[3]) + 1) + NOTE_IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function parse(pattern: string): Step[] {
  const toks = pattern.trim().split(/\s+/).filter(Boolean);
  const steps: Step[] = [];
  let last: Step | null = null;
  for (const t of toks) {
    if (t === '-') { if (last) last.len++; steps.push({ notes: [], len: 0 }); continue; }
    if (t === '.') { steps.push({ notes: [], len: 0 }); last = null; continue; }
    const notes = t === 'x' ? [0] : t.split('+').map(midi);
    last = { notes, len: 1 }; steps.push(last);
  }
  return steps;
}

// ------------------------------------------------------------------ compositions
const bar = (s: string) => s + ' ';
const TRACKS: Record<TrackName, Track> = {
  // Bright, bouncy town theme (C major, 4 bars)
  home: {
    bpm: 118,
    channels: {
      chords: bar('c4+e4+g4 - - - - - - - - - - - - - - -') + bar('g3+b3+d4 - - - - - - - - - - - - - - -') + bar('a3+c4+e4 - - - - - - - - - - - - - - -') + bar('f3+a3+c4 - - - - - - - - - - - - - - -'),
      bass: bar('c2 - . c2 - . g2 - c2 - . c2 - . g2 -') + bar('g2 - . g2 - . d2 - g2 - . g2 - . b2 -') + bar('a2 - . a2 - . e2 - a2 - . a2 - . e3 -') + bar('f2 - . f2 - . c2 - f2 - . f2 - . g2 -'),
      lead: bar('e5 - - - g5 - - - c6 - - - b5 - g5 -') + bar('d5 - - - g5 - - - b5 - - - a5 - g5 -') + bar('e5 - - - a5 - - - c6 - - - e6 - - -') + bar('d6 - c6 - a5 - g5 - f5 - - - g5 - - -'),
      arp: bar('c5 . e5 . g5 . e5 . c5 . e5 . g5 . e5 .') + bar('b4 . d5 . g5 . d5 . b4 . d5 . g5 . d5 .') + bar('a4 . c5 . e5 . c5 . a4 . c5 . e5 . c5 .') + bar('a4 . c5 . f5 . c5 . a4 . c5 . f5 . c5 .'),
      kick: bar('x . . . x . . . x . . . x . . .').repeat(4),
      snare: bar('. . . . x . . . . . . . x . . .').repeat(4),
      hat: bar('x . x . x . x . x . x . x . x x').repeat(4),
    },
  },
  // Adventurous overworld (D major, lively arps)
  explore: {
    bpm: 132,
    channels: {
      chords: bar('d4+f#4+a4 - - - - - - - - - - - - - - -') + bar('a3+c#4+e4 - - - - - - - - - - - - - - -') + bar('b3+d4+f#4 - - - - - - - - - - - - - - -') + bar('g3+b3+d4 - - - - - - - - - - - - - - -'),
      bass: bar('d2 - d2 - a2 - d2 - d2 - d2 - a2 - d3 -') + bar('a2 - a2 - e2 - a2 - a2 - a2 - e2 - a2 -') + bar('b2 - b2 - f#2 - b2 - b2 - b2 - f#2 - b2 -') + bar('g2 - g2 - d2 - g2 - g2 - g2 - a2 - b2 -'),
      lead: bar('f#5 - a5 - d6 - - - c#6 - a5 - f#5 - - -') + bar('e5 - a5 - c#6 - - - e6 - - - c#6 - a5 -') + bar('f#5 - b5 - d6 - - - f#6 - - - d6 - b5 -') + bar('g5 - b5 - d6 - b5 - a5 - - - - - - - -'),
      arp: bar('d5 f#5 a5 d6 a5 f#5 d5 f#5 a5 d6 a5 f#5 d5 f#5 a5 d6') + bar('c#5 e5 a5 c#6 a5 e5 c#5 e5 a5 c#6 a5 e5 c#5 e5 a5 c#6') + bar('d5 f#5 b5 d6 b5 f#5 d5 f#5 b5 d6 b5 f#5 d5 f#5 b5 d6') + bar('d5 g5 b5 d6 b5 g5 d5 g5 b5 d6 b5 g5 b5 g5 d5 b4'),
      kick: bar('x . . . . . x . x . . . . . x .').repeat(4),
      snare: bar('. . . . x . . . . . . . x . . .').repeat(4),
      hat: bar('x . x x x . x . x . x x x . x .').repeat(4),
    },
  },
  // Driving wild battle theme (A minor)
  battle: {
    bpm: 168,
    channels: {
      chords: bar('a3+c4+e4 - - - - - - - . . a3+c4+e4 - - - - -') + bar('f3+a3+c4 - - - - - - - . . f3+a3+c4 - - - - -') + bar('g3+b3+d4 - - - - - - - . . g3+b3+d4 - - - - -') + bar('e3+g#3+b3 - - - - - - - e3+g#3+b3 - - - - - - -'),
      bass: bar('a2 a2 a3 a2 a2 a2 a3 a2 a2 a2 a3 a2 g2 g2 g3 g2') + bar('f2 f2 f3 f2 f2 f2 f3 f2 f2 f2 f3 f2 e2 e2 e3 e2') + bar('g2 g2 g3 g2 g2 g2 g3 g2 g2 g2 g3 g2 f2 f2 f3 f2') + bar('e2 e2 e3 e2 e2 e2 e3 e2 e2 e2 e3 e2 e3 - d3 - '),
      lead: bar('e5 - a5 - c6 - b5 - a5 - e5 - - - a5 c6') + bar('f5 - - - a5 - c6 - d6 - c6 - a5 - - -') + bar('g5 - b5 - d6 - - - b5 - g5 - - - d5 e5') + bar('g#5 - b5 - e6 - - - d6 - b5 - g#5 - e5 -'),
      lead2: bar('. . . . . . . . . . . . . . . .').repeat(3) + bar('e4 - - - - - - - e4 - - - - - - -'),
      arp: bar('a4 c5 e5 a5 e5 c5 a4 c5 a4 c5 e5 a5 e5 c5 a4 c5') + bar('f4 a4 c5 f5 c5 a4 f4 a4 f4 a4 c5 f5 c5 a4 f4 a4') + bar('g4 b4 d5 g5 d5 b4 g4 b4 g4 b4 d5 g5 d5 b4 g4 b4') + bar('e4 g#4 b4 e5 b4 g#4 e4 g#4 e4 g#4 b4 e5 b4 g#4 e4 g#4'),
      kick: bar('x . . . x . . . x . . . x . x .').repeat(4),
      snare: bar('. . . . x . . . . . . . x . . x').repeat(4),
      hat: bar('x x x x x x x x x x x x x x x x').repeat(4),
    },
  },
  // Epic boss raid (E minor, half-time)
  boss: {
    bpm: 150,
    channels: {
      chords: bar('e3+b3+e4 - - - - - - - - - - - - - - -') + bar('c3+g3+c4 - - - - - - - - - - - - - - -') + bar('d3+a3+d4 - - - - - - - - - - - - - - -') + bar('b2+f#3+b3 - - - - - - - c3+g3+c4 - - - d3+a3+d4 - - -'),
      bass: bar('e2 - - e2 - - e2 - e2 - - e2 - - e2 e3') + bar('c2 - - c2 - - c2 - c2 - - c2 - - c2 c3') + bar('d2 - - d2 - - d2 - d2 - - d2 - - d2 d3') + bar('b1 - - b1 - - b1 - c2 - - c2 d2 - d2 -'),
      lead: bar('e5 - - - - - - - g5 - f#5 - e5 - - -') + bar('g5 - - - - - - - b5 - a5 - g5 - - -') + bar('a5 - - - - - - - d6 - c6 - b5 - a5 -') + bar('b5 - - - - - c6 - d6 - - - e6 - - -'),
      lead2: bar('e4 - - - - - - - - - - - - - - -') + bar('c4 - - - - - - - - - - - - - - -') + bar('d4 - - - - - - - - - - - - - - -') + bar('b3 - - - - - - - c4 - - - d4 - - -'),
      arp: bar('e5 b5 e6 b5 e5 b5 e6 b5 e5 b5 e6 b5 e5 b5 e6 b5') + bar('c5 g5 c6 g5 c5 g5 c6 g5 c5 g5 c6 g5 c5 g5 c6 g5') + bar('d5 a5 d6 a5 d5 a5 d6 a5 d5 a5 d6 a5 d5 a5 d6 a5') + bar('b4 f#5 b5 f#5 b4 f#5 b5 f#5 c5 g5 c6 g5 d5 a5 d6 a5'),
      kick: bar('x . . . . . x . . . x . . . . .').repeat(3) + bar('x . . . . . x . x . . x . . x x'),
      snare: bar('. . . . . . . . x . . . . . . .').repeat(3) + bar('. . . . . . . . x . . . x . x x'),
      hat: bar('x . x . x . x . x . x . x . x .').repeat(4),
      crash: bar('x . . . . . . . . . . . . . . .') + bar('. . . . . . . . . . . . . . . .').repeat(3),
    },
  },
  // Tense get-chance loop (D minor, sparse)
  catch: {
    bpm: 104,
    channels: {
      chords: bar('d3+f3+a3 - - - - - - - - - - - - - - -') + bar('bb2+d3+f3 - - - - - - - - - - - - - - -'),
      bass: bar('d2 - - - . . d2 - . . . . d2 - . .') + bar('bb1 - - - . . bb1 - . . . . a1 - - -'),
      arp: bar('d5 . a5 . d6 . a5 . f5 . a5 . d6 . a5 .') + bar('d5 . f5 . bb5 . f5 . e5 . g5 . c#6 . e5 .'),
      kick: bar('x . . . . . . . x . . . . . . .').repeat(2),
      hat: bar('x . x . x . x . x . x . x . x x').repeat(2),
    },
  },
  // Calm result / trade screen (C major)
  result: {
    bpm: 96,
    channels: {
      chords: bar('c4+e4+g4 - - - - - - - - - - - - - - -') + bar('f3+a3+c4 - - - - - - - - - - - - - - -') + bar('a3+c4+e4 - - - - - - - - - - - - - - -') + bar('g3+b3+d4 - - - - - - - - - - - - - - -'),
      bass: bar('c2 - - - - - - - g2 - - - - - - -') + bar('f2 - - - - - - - c3 - - - - - - -') + bar('a2 - - - - - - - e2 - - - - - - -') + bar('g2 - - - - - - - d2 - - - - - - -'),
      lead: bar('g5 - - - e5 - - - c5 - - - - - - -') + bar('a5 - - - f5 - - - c5 - - - - - - -') + bar('e5 - - - g5 - - - a5 - - - c6 - - -') + bar('b5 - - - g5 - - - d5 - - - - - - -'),
      arp: bar('c5 . e5 . g5 . c6 . g5 . e5 . c5 . . .') + bar('c5 . f5 . a5 . c6 . a5 . f5 . c5 . . .') + bar('c5 . e5 . a5 . c6 . a5 . e5 . c5 . . .') + bar('b4 . d5 . g5 . b5 . g5 . d5 . b4 . . .'),
      hat: bar('. . x . . . x . . . x . . . x .').repeat(4),
    },
  },
};

// ------------------------------------------------------------------ engine
class Music {
  private ctx: AudioContext | null = null;
  private master!: GainNode; private comp!: DynamicsCompressorNode; private delay!: DelayNode; private delayGain!: GainNode;
  private current: TrackName | null = null;
  private trackGain: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0; private nextTime = 0; private parsed: Partial<Record<Voice, Step[]>> = {}; private length = 0; private bpm = 120;
  private ready = false;
  private wanted: TrackName | null = null;

  private ensure(): boolean {
    if (this.ready) return true;
    const ctx = getAudioContext(); if (!ctx) return false;
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.55;
    setDuckHook((ms, depth) => this.duck(ms, depth));
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -18; this.comp.ratio.value = 4; this.comp.attack.value = 0.005; this.comp.release.value = 0.2;
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = 0.28; this.delayGain = ctx.createGain(); this.delayGain.gain.value = 0.28;
    this.delay.connect(this.delayGain).connect(this.delay); this.delayGain.connect(this.comp);
    this.master.connect(this.comp).connect(ctx.destination);
    document.addEventListener('visibilitychange', () => { if (!this.ctx) return; const g = this.master.gain; g.cancelScheduledValues(this.ctx.currentTime); g.linearRampToValueAtTime(document.hidden ? 0 : 0.55, this.ctx.currentTime + 0.3); });
    this.ready = true;
    return true;
  }

  /** Request a track. Safe to call before any user gesture; playback starts once audio is unlocked. */
  play(name: TrackName | null) {
    this.wanted = name;
    if (!useStore.getState().bgm) { this.stop(); return; }
    if (!name) { this.stop(); return; }
    if (!this.ensure()) return;
    if (this.ctx!.state !== 'running') { const retry = () => { this.ctx!.removeEventListener('statechange', retry); if (this.wanted) this.play(this.wanted); }; this.ctx!.addEventListener('statechange', retry); return; }
    if (this.current === name) return;
    this.fadeOutCurrent();
    this.start(name);
  }

  stop() { this.fadeOutCurrent(); this.current = null; }

  /** Test hook: also route the music bus into an extra node (e.g. a recorder). */
  tapInto(node: AudioNode) { if (this.ensure()) this.comp.connect(node); }

  /** Briefly lower the music so a heavy hit punches through. */
  duck(ms: number, depth = 0.35) {
    if (!this.ctx || !this.current || document.hidden) return;
    const g = this.master.gain; const t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.55 * depth, t + 0.03); g.linearRampToValueAtTime(0.55, t + ms / 1000);
  }

  private fadeOutCurrent() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.trackGain && this.ctx) { const g = this.trackGain; const t = this.ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.7); setTimeout(() => g.disconnect(), 900); }
    this.trackGain = null;
  }

  private start(name: TrackName) {
    const ctx = this.ctx!; const tr = TRACKS[name];
    this.current = name; this.bpm = tr.bpm;
    this.parsed = {}; this.length = 0;
    for (const [v, pat] of Object.entries(tr.channels) as [Voice, string][]) { const st = parse(pat); this.parsed[v] = st; this.length = Math.max(this.length, st.length); }
    this.trackGain = ctx.createGain(); this.trackGain.gain.setValueAtTime(0, ctx.currentTime); this.trackGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.6); this.trackGain.connect(this.master);
    this.step = 0; this.nextTime = ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  private schedule() {
    const ctx = this.ctx!; const stepDur = 60 / this.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const i = this.step % this.length;
      for (const [v, steps] of Object.entries(this.parsed) as [Voice, Step[]][]) {
        const s = steps[i % steps.length]; if (!s || !s.notes.length) continue;
        this.trigger(v, s.notes, this.nextTime, s.len * stepDur);
      }
      this.nextTime += stepDur; this.step++;
    }
  }

  private osc(type: OscillatorType, freq: number, t: number, dur: number, gain: number, out: AudioNode, opts: { attack?: number; release?: number; detune?: number; slide?: number; filter?: number; vibrato?: boolean } = {}) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (opts.detune) o.detune.value = opts.detune;
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
    const g = ctx.createGain(); const a = opts.attack ?? 0.005, r = opts.release ?? 0.05;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + a); g.gain.setValueAtTime(gain, Math.max(t + a, t + dur - r)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.01);
    let node: AudioNode = o;
    if (opts.filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.filter; f.Q.value = 1; o.connect(f); node = f; }
    if (opts.vibrato) { const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5; const lg = ctx.createGain(); lg.gain.value = 4; lfo.connect(lg).connect(o.detune); lfo.start(t + 0.1); lfo.stop(t + dur + 0.05); }
    node.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  private noiseBuf?: AudioBuffer;
  private noise(t: number, dur: number, gain: number, out: AudioNode, filter: { type: BiquadFilterType; freq: number }) {
    const ctx = this.ctx!;
    if (!this.noiseBuf) { this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; const f = ctx.createBiquadFilter(); f.type = filter.type; f.frequency.value = filter.freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + dur + 0.02);
  }

  private trigger(v: Voice, notes: number[], t: number, len: number) {
    const out = this.trackGain!; const d = Math.max(0.05, len);
    switch (v) {
      case 'lead': for (const n of notes) { this.osc('square', hz(n), t, d * 0.9, 0.09, out, { vibrato: true, release: 0.08, filter: 3500 }); this.osc('square', hz(n), t, d * 0.9, 0.05, out, { detune: 7, release: 0.08, filter: 3500 }); const send = this.ctx!.createGain(); send.gain.value = 0.5; this.osc('square', hz(n), t, d * 0.9, 0.06, send, { release: 0.08, filter: 2500 }); send.connect(this.delay); } break;
      case 'lead2': for (const n of notes) this.osc('sawtooth', hz(n), t, d * 0.95, 0.07, out, { attack: 0.2, release: 0.3, filter: 1200 }); break;
      case 'bass': for (const n of notes) { this.osc('sawtooth', hz(n), t, d * 0.85, 0.16, out, { filter: 700, release: 0.06 }); this.osc('square', hz(n) / 2, t, d * 0.85, 0.05, out, { filter: 300, release: 0.06 }); } break;
      case 'chords': for (const n of notes) { this.osc('sawtooth', hz(n), t, d, 0.035, out, { attack: 0.08, release: 0.2, detune: -6, filter: 1800 }); this.osc('sawtooth', hz(n), t, d, 0.035, out, { attack: 0.08, release: 0.2, detune: 6, filter: 1800 }); } break;
      case 'arp': for (const n of notes) this.osc('triangle', hz(n), t, Math.min(d, 0.18), 0.08, out, { release: 0.05 }); break;
      case 'kick': this.osc('sine', 150, t, 0.16, 0.6, out, { slide: 40, release: 0.1 }); this.noise(t, 0.03, 0.25, out, { type: 'lowpass', freq: 800 }); break;
      case 'snare': this.noise(t, 0.16, 0.35, out, { type: 'highpass', freq: 1500 }); this.osc('triangle', 190, t, 0.1, 0.25, out, { slide: 120 }); break;
      case 'hat': this.noise(t, 0.035, 0.12, out, { type: 'highpass', freq: 7000 }); break;
      case 'ohat': this.noise(t, 0.15, 0.1, out, { type: 'highpass', freq: 6000 }); break;
      case 'crash': this.noise(t, 1.2, 0.2, out, { type: 'highpass', freq: 4000 }); break;
    }
  }
}

export const music = new Music();

// react to the BGM toggle
let prevBgm = useStore.getState().bgm;
useStore.subscribe(s => { if (s.bgm !== prevBgm) { prevBgm = s.bgm; if (!s.bgm) music.stop(); else music.play(currentTop()); } });

// ------------------------------------------------------------------ React helper: a stack so nested screens override the app-level track
const stack: { id: number; track: TrackName | null }[] = [];
let idSeq = 0;
const currentTop = () => (stack.length ? stack[stack.length - 1].track : null);
const apply = () => music.play(currentTop());

/** Declare which BGM this screen wants while mounted. The most recently mounted screen wins. */
export function useBgm(track: TrackName | null) {
  const id = useRef(0);
  useEffect(() => { id.current = ++idSeq; stack.push({ id: id.current, track }); apply(); return () => { const i = stack.findIndex(e => e.id === id.current); if (i >= 0) stack.splice(i, 1); apply(); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const e = stack.find(x => x.id === id.current); if (e && e.track !== track) { e.track = track; apply(); } }, [track]);
}
