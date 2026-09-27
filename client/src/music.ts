// Procedural chiptune-style BGM engine (Web Audio, no audio files).
// Tracks are written as 16th-note step strings per channel:  "c4 - - . e4"  -> note, hold, hold, rest, note
// Chords use "+" (c4+e4+g4). Drum channels use "x" for a hit.
import { useEffect, useRef } from 'react';
import { getAudioContext, setDuckHook } from './audio';
import { useStore } from './store';

export type TrackName = 'home' | 'explore' | 'battle' | 'boss' | 'catch' | 'result';

type Voice = 'lead' | 'lead2' | 'bass' | 'chords' | 'arp' | 'kick' | 'snare' | 'hat' | 'ohat' | 'crash';
interface Step { notes: number[]; len: number; accent?: boolean; open?: boolean; }

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
    if (t === 'x' || t === 'X' || t === 'o') { last = { notes: [0], len: 1, accent: t === 'X', open: t === 'o' }; steps.push(last); continue; }
    const notes = t.split('+').map(midi);
    last = { notes, len: 1 }; steps.push(last);
  }
  return steps;
}

// ------------------------------------------------------------------ compositions (orchestral, Pokémon-style)
// Drum tokens: x = hit, X = accent, o = open hat, . = rest.  Melodic tokens: note, - hold, . rest, chords with +.
type Voice2 = Voice | 'brass' | 'brassLow' | 'strings' | 'tremolo' | 'flute' | 'piano' | 'pizz' | 'tuba' | 'timpani' | 'march' | 'cymbal' | 'shaker' | 'glock' | 'supersaw' | 'pad' | 'pluck' | 'sub' | 'bass808' | 'clap' | 'riser' | 'keys';
const b4 = (a: string, b: string, c: string, d: string) => `${a} ${b} ${c} ${d} `;
const rep = (s: string, n: number) => Array(n).fill(s).join(' ') + ' ';
const TRACKS: Record<TrackName, { bpm: number; channels: Partial<Record<Voice2, string>> }> = {
  // Town theme: gentle piano arpeggios, flute melody, warm strings, light shaker (F major)
  home: {
    bpm: 100,
    channels: {
      strings: b4('f3+a3+c4 - - - - - - - - - - - - - - -', 'd3+f3+a3 - - - - - - - - - - - - - - -', 'bb2+d3+f3 - - - - - - - - - - - - - - -', 'c3+e3+g3 - - - - - - - - c3+e3+g3+bb3 - - - - - - -'),
      piano: b4('f3 . c4 . f4 . c4 . a3 . c4 . f4 . c4 .', 'd3 . a3 . d4 . a3 . f3 . a3 . d4 . a3 .', 'bb2 . f3 . bb3 . f3 . d3 . f3 . bb3 . f3 .', 'c3 . g3 . c4 . g3 . e3 . g3 . c4 . bb3 .'),
      flute: b4('a4 - - - c5 - - - f5 - - - e5 - c5 -', 'd5 - - - - - c5 - a4 - - - - - - -', 'bb4 - - - d5 - - - f5 - - - g5 - a5 -', 'g5 - - - e5 - - - c5 - - - - - - -'),
      pizz: b4('f2 - - - . . . . c3 - - - . . . .', 'd2 - - - . . . . a2 - - - . . . .', 'bb1 - - - . . . . f2 - - - . . . .', 'c2 - - - . . . . g2 - - - bb2 - - -'),
      shaker: rep('x . x . X . x . x . x . X . x .', 4),
    },
  },
  // Route theme: cheerful march. Woodwind melody, staccato piano chords, walking tuba, snare with rolls (C major)
  explore: {
    bpm: 128,
    channels: {
      tuba: b4('c2 - . . g2 - . . c2 - . . g2 - . .', 'a1 - . . e2 - . . a1 - . . e2 - . .', 'f1 - . . c2 - . . f1 - . . c2 - . .', 'g1 - . . d2 - . . g1 - . . b1 - d2 -'),
      piano: b4('. . c4+e4+g4 . . . c4+e4+g4 . . . c4+e4+g4 . . . c4+e4+g4 .', '. . a3+c4+e4 . . . a3+c4+e4 . . . a3+c4+e4 . . . a3+c4+e4 .', '. . a3+c4+f4 . . . a3+c4+f4 . . . a3+c4+f4 . . . a3+c4+f4 .', '. . b3+d4+g4 . . . b3+d4+g4 . . . b3+d4+g4 . . . b3+d4+g4 .'),
      flute: b4('e5 - g5 - c6 - - - b5 - g5 - e5 - g5 -', 'a5 - - - c6 - - - e6 - - - d6 - c6 -', 'a5 - - - f5 - - - c6 - - - a5 - f5 -', 'g5 - - - b5 - d6 - g6 - - - - - - -'),
      brass: b4('. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . . . . .', 'd5+g5 - - - . . . . b4+d5 - - - g5+b5 - - -'),
      strings: b4('c4+e4 - - - - - - - - - - - - - - -', 'c4+e4 - - - - - - - - - - - - - - -', 'c4+f4 - - - - - - - - - - - - - - -', 'b3+d4 - - - - - - - - - - - - - - -'),
      march: b4('x . . x . . x . x . . x . . x .', 'x . . x . . x . x . . x . . x .', 'x . . x . . x . x . . x . . x .', 'x . . x . . x . x x x x X X X X'),
      timpani: rep('x . . . . . . . x . . . . . . .', 4),
      cymbal: rep('x . . . . . . . . . . . . . . .', 1) + rep('. . . . . . . . . . . . . . . .', 3),
    },
  },
  // Wild battle: driving tuba eighths, string ostinato, heroic brass melody, timpani and snare (A minor -> C major turn)
  battle: {
    bpm: 164,
    channels: {
      tuba: b4('a1 a1 a1 a1 a1 a1 a1 a1 a1 a1 a1 a1 g1 g1 g1 g1', 'f1 f1 f1 f1 f1 f1 f1 f1 e1 e1 e1 e1 e1 e1 e1 e1', 'a1 a1 a1 a1 a1 a1 a1 a1 c2 c2 c2 c2 d2 d2 d2 d2', 'e2 e2 e2 e2 e2 e2 e2 e2 e2 e2 g#1 g#1 b1 b1 e2 e2'),
      strings: b4('a4 c5 e5 c5 a4 c5 e5 c5 a4 c5 e5 c5 g4 b4 d5 b4', 'f4 a4 c5 a4 f4 a4 c5 a4 e4 g#4 b4 g#4 e4 g#4 b4 g#4', 'a4 c5 e5 c5 a4 c5 e5 c5 c5 e5 g5 e5 d5 f5 a5 f5', 'e5 g#5 b5 g#5 e5 g#5 b5 g#5 e5 g#5 b5 g#5 d5 f5 g#5 f5'),
      brass: b4('e5 - - - a5 - - - c6 - b5 - a5 - g5 -', 'a5 - - - - - - - . . e5 - f5 - g#5 -', 'a5 - - - c6 - - - e6 - - - d6 - c6 -', 'b5 - - - g#5 - - - e5 - - - - - . .'),
      brassLow: b4('a3+c4 - - - . . . . a3+c4 - - - . . . .', 'f3+a3 - - - . . . . e3+g#3 - - - . . . .', 'a3+c4 - - - . . . . c4+e4 - - - d4+f4 - - -', 'e3+g#3 - - - - - - - e3+b3 - - - - - - -'),
      timpani: b4('x . . . . . . . x . . . . . . .', 'x . . . . . . . x . . . . . . .', 'x . . . . . . . x . . . . . . .', 'x . . . x . . . x . x . x x x x'),
      march: b4('x . x . X . x . x . x . X . x .', 'x . x . X . x . x . x . X . x .', 'x . x . X . x . x . x . X . x .', 'x . x . X . x . x x x x X X X X'),
      cymbal: 'x . . . . . . . . . . . . . . . ' + rep('. . . . . . . . . . . . . . . .', 3),
    },
  },
  // Boss / legendary: heavy timpani, low brass stabs, tremolo strings, chromatic melody (D minor)
  boss: {
    bpm: 148,
    channels: {
      tuba: b4('d1 - d1 - d1 - d1 - d1 - d1 - c#1 - c#1 -', 'bb0 - bb0 - bb0 - bb0 - a0 - a0 - a0 - a0 -', 'd1 - d1 - d1 - d1 - f1 - f1 - f1 - f1 -', 'g1 - g1 - g#1 - g#1 - a1 - a1 - a1 a1 a1 a1'),
      tremolo: b4('d4+f4+a4 - - - - - - - - - - - - - - -', 'bb3+d4+f4 - - - - - - - a3+c#4+e4 - - - - - - -', 'd4+f4+a4 - - - - - - - f4+a4+c5 - - - - - - -', 'g3+bb3+d4 - - - - - - - a3+c#4+e4 - - - - - - -'),
      brassLow: b4('d3+a3 - - . d3+a3 - - . . . . . d3+a3 - - -', 'bb2+f3 - - . bb2+f3 - - . a2+e3 - - - - - - -', 'd3+a3 - - . d3+a3 - - . f3+c4 - - . f3+c4 - - .', 'g2+d3 - - - g#2+d#3 - - - a2+e3 - - - a2+e3 - - -'),
      brass: b4('. . . . . . . . a5 - - - f5 - d5 -', 'e5 - - - - - - - c#5 - - - - - - -', 'd5 - - - f5 - - - a5 - - - c6 - - -', 'bb5 - - - a5 - - - g5 - - - e5 - - -'),
      timpani: b4('x . . . x . . . x . . . x . x .', 'x . . . x . . . x . . . x . x .', 'x . . . x . . . x . . . x . x .', 'x . x . x . x . x x x x X X X X'),
      march: b4('. . . . x . . . . . . . x . . .', '. . . . x . . . . . . . x . . .', '. . . . x . . . . . . . x . . .', '. . . . x . . . x x x x X X X X'),
      cymbal: 'x . . . . . . . . . . . . . . . ' + rep('. . . . . . . . . . . . . . . .', 3),
    },
  },
  // Get chance: tense tremolo strings, timpani heartbeat, sparse glockenspiel (E minor)
  catch: {
    bpm: 104,
    channels: {
      tremolo: b4('e3+g3+b3 - - - - - - - - - - - - - - -', 'c3+e3+g3 - - - - - - - - - - - - - - -', 'e3+g3+b3 - - - - - - - - - - - - - - -', 'b2+d#3+f#3 - - - - - - - - - - - - - - -'),
      tuba: rep('e1 - . . . . . . e1 - . . . . . .', 2) + rep('c1 - . . . . . . b0 - . . . . . .', 2),
      glock: b4('e5 . . . b5 . . . g5 . . . . . . .', 'c5 . . . g5 . . . e5 . . . . . . .', 'e5 . . . b5 . . . g5 . . . e6 . . .', 'd#5 . . . f#5 . . . b5 . . . . . . .'),
      timpani: rep('x . . x . . . . . . . . . . . .', 4),
      shaker: rep('x . . . x . . . x . . . x . . .', 4),
    },
  },
  // Victory / result: brass fanfare loop with snare rolls, then a warm string cadence (C major)
  result: {
    bpm: 126,
    channels: {
      brass: b4('g5 - g5 - g5 - - - e5 - - - g5 - - -', 'c6 - - - - - - - . . . . . . . .', 'e5 - - - g5 - - - c6 - - - e6 - - -', 'd6 - - - c6 - - - - - - - - - - -'),
      brassLow: b4('c4+e4 - - - c4+e4 - - - . . . . . . . .', 'c4+e4+g4 - - - - - - - . . . . . . . .', 'c4+e4 - - - . . . . a3+c4 - - - . . . .', 'g3+b3+d4 - - - c4+e4+g4 - - - - - - - - - - -'),
      strings: b4('c4+e4+g4 - - - - - - - - - - - - - - -', 'f3+a3+c4 - - - - - - - - - - - - - - -', 'a3+c4+e4 - - - - - - - - - - - - - - -', 'g3+b3+d4 - - - - - - - c4+e4+g4 - - - - - - -'),
      tuba: b4('c2 - - - g1 - - - c2 - - - g1 - - -', 'f1 - - - c2 - - - f1 - - - c2 - - -', 'a1 - - - e1 - - - a1 - - - e1 - - -', 'g1 - - - g1 - - - c2 - - - - - - -'),
      march: b4('x x x x X . . . x . . . x x x x', 'X . . . . . . . x . . . x . . .', 'x . . . x . . . x . . . x x x x', 'X . . . x . . . X . . . . . . .'),
      timpani: b4('x . . . . . . . x . . . . . . .', 'x . . . . . . . . . . . . . . .', 'x . . . . . . . x . . . . . . .', 'x . . . . . . . x . . . . . . .'),
      cymbal: 'x . . . . . . . . . . . . . . . ' + rep('. . . . . . . . . . . . . . . .', 3),
    },
  },
};

// ------------------------------------------------------------------ engine
class Music {
  private ctx: AudioContext | null = null;
  private master!: GainNode; private comp!: DynamicsCompressorNode;
  private pump!: GainNode;            // side-chained bus (pads / leads / plucks duck on every kick)
  private reverb!: ConvolverNode; private reverbSend!: GainNode;
  private delayL!: DelayNode; private delayR!: DelayNode; private delaySend!: GainNode;
  private current: TrackName | null = null;
  private trackGain: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0; private nextTime = 0; private parsed: Partial<Record<Voice2, Step[]>> = {}; private length = 0; private bpm = 120;
  private ready = false;
  private wanted: TrackName | null = null;
  private lastSub: number | null = null;

  private ensure(): boolean {
    if (this.ready) return true;
    const ctx = getAudioContext(); if (!ctx) return false;
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.55;
    setDuckHook((ms, depth) => this.duck(ms, depth));
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.knee.value = 8; this.comp.ratio.value = 4; this.comp.attack.value = 0.004; this.comp.release.value = 0.18;
    this.master.connect(this.comp).connect(ctx.destination);
    this.pump = ctx.createGain(); this.pump.connect(this.master);
    // reverb (synthetic hall, 2.2s) on a send
    const len = Math.floor(ctx.sampleRate * 2.2); const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2) * (i < 800 ? i / 800 : 1); }
    this.reverb = ctx.createConvolver(); this.reverb.buffer = ir; this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = 1;
    const rvOut = ctx.createGain(); rvOut.gain.value = 0.4; this.reverbSend.connect(this.reverb).connect(rvOut).connect(this.master);
    // ping-pong delay send (time set per track)
    this.delaySend = ctx.createGain(); this.delayL = ctx.createDelay(2); this.delayR = ctx.createDelay(2);
    const fb = ctx.createGain(); fb.gain.value = 0.32; const pl = ctx.createStereoPanner(); pl.pan.value = -0.7; const pr = ctx.createStereoPanner(); pr.pan.value = 0.7;
    const dOut = ctx.createGain(); dOut.gain.value = 0.18; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
    this.delaySend.connect(this.delayL); this.delayL.connect(pl).connect(dOut); this.delayL.connect(this.delayR); this.delayR.connect(pr).connect(dOut); this.delayR.connect(fb).connect(this.delayL); dOut.connect(hp).connect(this.master);
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
    if (this.trackGain && this.ctx) { const g = this.trackGain; const t = this.ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.8); setTimeout(() => g.disconnect(), 1000); }
    this.trackGain = null;
  }

  private start(name: TrackName) {
    const ctx = this.ctx!; const tr = TRACKS[name];
    this.current = name; this.bpm = tr.bpm; this.lastSub = null;
    const beat = 60 / tr.bpm; this.delayL.delayTime.value = beat * 0.75; this.delayR.delayTime.value = beat * 0.75;
    this.parsed = {}; this.length = 0;
    for (const [v, pat] of Object.entries(tr.channels) as [Voice2, string][]) { const st = parse(pat); this.parsed[v] = st; this.length = Math.max(this.length, st.length); }
    this.trackGain = ctx.createGain(); this.trackGain.gain.setValueAtTime(0, ctx.currentTime); this.trackGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.8);
    this.trackGain.connect(this.pump);
    this.step = 0; this.nextTime = ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  private schedule() {
    const ctx = this.ctx!; const stepDur = 60 / this.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const i = this.step % this.length;
      for (const [v, steps] of Object.entries(this.parsed) as [Voice2, Step[]][]) {
        const s = steps[i % steps.length]; if (!s || !s.notes.length) continue;
        this.trigger(v, s.notes, this.nextTime, s.len * stepDur, s.accent, s.open);
      }
      this.nextTime += stepDur; this.step++;
    }
  }

  // ---- voices -------------------------------------------------------------------------
  private env(t: number, dur: number, gain: number, a = 0.005, r = 0.05): GainNode {
    const g = this.ctx!.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + a); g.gain.setValueAtTime(gain, Math.max(t + a, t + dur - r)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02); return g;
  }
  private send(node: AudioNode, reverb = 0, delay = 0) { const c = this.ctx!; if (reverb) { const g = c.createGain(); g.gain.value = reverb; node.connect(g).connect(this.reverbSend); } if (delay) { const g = c.createGain(); g.gain.value = delay; node.connect(g).connect(this.delaySend); } }
  private noiseBuf?: AudioBuffer;
  private noise(t: number, dur: number, gain: number, out: AudioNode, filter: { type: BiquadFilterType; freq: number; q?: number; sweep?: number }, attack = 0.001) {
    const ctx = this.ctx!;
    if (!this.noiseBuf) { this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true; const f = ctx.createBiquadFilter(); f.type = filter.type; f.frequency.setValueAtTime(filter.freq, t); if (filter.q) f.Q.value = filter.q; if (filter.sweep) f.frequency.exponentialRampToValueAtTime(filter.sweep, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + dur + 0.02);
  }
  /** side-chain pump (only used by the electronic voices; orchestral tracks do not pump) */
  private pumpKick(_t: number) { /* disabled for the orchestral soundtrack */ }

  private trigger(v: Voice2, notes: number[], t: number, len: number, accent = false, open = false) {
    const ctx = this.ctx!; const out = this.trackGain!; const d = Math.max(0.05, len);
    switch (v) {
      case 'brass': case 'brassLow': for (const n of notes) { // two detuned saws, filter "blat" envelope, vibrato after the onset
        const low = v === 'brassLow'; const bus = ctx.createGain(); bus.gain.value = low ? 0.075 : 0.09;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1.5; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(low ? 1800 : 3200, t + 0.07); f.frequency.exponentialRampToValueAtTime(low ? 1200 : 2000, t + Math.max(0.2, d));
        const g = this.env(t, d, 1, 0.03, Math.min(0.12, d * 0.3)); f.connect(g).connect(bus).connect(out); this.send(g, 0.4, 0.15);
        [-7, 6].forEach((det, i) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = det; const p = ctx.createStereoPanner(); p.pan.value = (i ? 0.25 : -0.25); if (!low) { const l = ctx.createOscillator(); l.frequency.value = 5.5; const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(9, t + 0.25); l.connect(lg).connect(o.detune); l.start(t); l.stop(t + d + 0.05); } o.connect(p).connect(f); o.start(t); o.stop(t + d + 0.05); });
      } break;
      case 'strings': case 'tremolo': for (const n of notes) { // 4 detuned saws, slow bow attack, chorus width; tremolo variant shakes the amplitude
        const bus = ctx.createGain(); bus.gain.value = 0.028;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.7; f.frequency.value = 2600;
        const g = this.env(t, d, 1, v === 'tremolo' ? 0.05 : Math.min(0.25, d * 0.25), Math.min(0.3, d * 0.3)); f.connect(g).connect(bus).connect(out); this.send(g, 0.55);
        if (v === 'tremolo') { const l = ctx.createOscillator(); l.frequency.value = 11; const lg = ctx.createGain(); lg.gain.value = 0.45; l.connect(lg).connect(g.gain); l.start(t); l.stop(t + d + 0.05); }
        [-11, -4, 4, 11].forEach((det, i) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = det; const p = ctx.createStereoPanner(); p.pan.value = (i / 3) * 1.2 - 0.6; o.connect(p).connect(f); o.start(t); o.stop(t + d + 0.1); });
      } break;
      case 'flute': for (const n of notes) { // breathy sine with vibrato
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz(n); const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = hz(n); const g2 = ctx.createGain(); g2.gain.value = 0.25;
        const l = ctx.createOscillator(); l.frequency.value = 5; const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(7, t + 0.2); l.connect(lg).connect(o.detune); l.connect(lg).connect(o2.detune);
        const g = this.env(t, d, 0.11, 0.045, Math.min(0.15, d * 0.3)); o.connect(g); o2.connect(g2).connect(g); g.connect(out); this.send(g, 0.5, 0.1);
        this.noise(t, Math.min(0.12, d), 0.03, out, { type: 'bandpass', freq: hz(n) * 2, q: 3 }, 0.02);
        o.start(t); o2.start(t); l.start(t); o.stop(t + d + 0.05); o2.stop(t + d + 0.05); l.stop(t + d + 0.05);
      } break;
      case 'piano': for (const n of notes) { // bright hammered tone: fundamental + decaying upper partials
        const g = this.env(t, Math.max(0.25, d), 0.11, 0.003, Math.min(0.25, d * 0.5)); g.connect(out); this.send(g, 0.35);
        [[1, 1, 'triangle'], [2, 0.4, 'sine'], [3, 0.15, 'sine']].forEach(([r, a, type]) => { const o = ctx.createOscillator(); o.type = type as OscillatorType; o.frequency.value = hz(n) * (r as number); const pg = ctx.createGain(); pg.gain.setValueAtTime(a as number, t); pg.gain.exponentialRampToValueAtTime(0.001, t + 0.9 / (r as number)); o.connect(pg).connect(g); o.start(t); o.stop(t + d + 0.1); });
      } break;
      case 'pizz': for (const n of notes) { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz(n); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(2500, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.15); const g = this.env(t, 0.22, 0.28, 0.003, 0.15); o.connect(f).connect(g).connect(out); this.send(g, 0.3); o.start(t); o.stop(t + 0.3); } break;
      case 'tuba': for (const n of notes) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n); const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = hz(n); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(900, t + 0.04); f.frequency.exponentialRampToValueAtTime(400, t + Math.max(0.15, d)); const g = this.env(t, Math.max(0.12, d * 0.85), 0.32, 0.015, 0.05); const g2 = this.env(t, Math.max(0.12, d * 0.85), 0.35, 0.01, 0.05); o.connect(f).connect(g).connect(this.master); o2.connect(g2).connect(this.master); o.start(t); o2.start(t); o.stop(t + d + 0.1); o2.stop(t + d + 0.1); } break;
      case 'timpani': { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(72, t + 0.12); const g = this.env(t, accent ? 0.7 : 0.55, accent ? 0.8 : 0.6, 0.004, 0.4); o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.8); this.noise(t, 0.05, 0.25, out, { type: 'lowpass', freq: 900 }); const rv = ctx.createGain(); rv.gain.value = 0.5; this.noise(t, 0.3, 0.2, rv, { type: 'lowpass', freq: 400 }); rv.connect(this.reverbSend); break; }
      case 'march': { this.noise(t, accent ? 0.16 : 0.1, accent ? 0.34 : 0.22, out, { type: 'bandpass', freq: 1900, q: 0.7 }); this.noise(t, 0.05, 0.12, out, { type: 'highpass', freq: 4000 }); const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(230, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08); const g = this.env(t, 0.09, 0.14); o.connect(g).connect(out); o.start(t); o.stop(t + 0.15); break; }
      case 'cymbal': { this.noise(t, 1.8, 0.16, out, { type: 'highpass', freq: 5000 }); const rv = ctx.createGain(); rv.gain.value = 0.7; this.noise(t, 1.2, 0.12, rv, { type: 'highpass', freq: 4000 }); rv.connect(this.reverbSend); break; }
      case 'shaker': { this.noise(t, accent ? 0.08 : 0.05, accent ? 0.11 : 0.07, out, { type: 'bandpass', freq: 8000, q: 1.2 }, 0.01); break; }
      case 'glock': for (const n of notes) { const g = this.env(t, 0.9, 0.09, 0.002, 0.7); g.connect(out); this.send(g, 0.7, 0.2); [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(([r, a]) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz(n) * 2 * r; const pg = ctx.createGain(); pg.gain.setValueAtTime(a, t); pg.gain.exponentialRampToValueAtTime(0.001, t + 0.9 / r); o.connect(pg).connect(g); o.start(t); o.stop(t + 1); }); } break;
      case 'supersaw': for (const n of notes) { // 6 detuned saws spread in stereo, opening lowpass
        const bus = ctx.createGain(); bus.gain.value = 0.035;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(5200, t + Math.min(0.5, d * 0.5)); f.frequency.exponentialRampToValueAtTime(1800, t + d);
        const g = this.env(t, d, 1, 0.03, 0.12); f.connect(g).connect(bus).connect(out); this.send(g, 0.35, 0.3);
        [-18, -11, -4, 4, 11, 18].forEach((det, i) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = det; const p = ctx.createStereoPanner(); p.pan.value = (i / 5) * 1.2 - 0.6; o.connect(p).connect(f); o.start(t); o.stop(t + d + 0.05); });
      } break;
      case 'pad': for (const n of notes) { // wide, slow pad with a breathing filter
        const bus = ctx.createGain(); bus.gain.value = 0.02;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(2200, t + d * 0.6); f.frequency.linearRampToValueAtTime(700, t + d);
        const g = this.env(t, d, 1, Math.min(0.6, d * 0.3), Math.min(0.8, d * 0.3)); f.connect(g).connect(bus).connect(out); this.send(g, 0.6);
        [-9, 0, 9].forEach((det, i) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = det; const p = ctx.createStereoPanner(); p.pan.value = (i - 1) * 0.7; o.connect(p).connect(f); o.start(t); o.stop(t + d + 0.1); });
      } break;
      case 'pluck': for (const n of notes) { // future-bass pluck: saw through a fast-closing filter
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n); const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = hz(n) * 2; o2.detune.value = 5;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 4; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(250, t + 0.28);
        const g = this.env(t, Math.min(d, 0.32), 0.09, 0.002, 0.1); const p = ctx.createStereoPanner(); p.pan.value = (Math.random() - 0.5) * 0.6;
        const g2 = ctx.createGain(); g2.gain.value = 0.25; o.connect(f); o2.connect(g2).connect(f); f.connect(g).connect(p).connect(out); this.send(g, 0.3, 0.45);
        o.start(t); o.stop(t + 0.4); o2.start(t); o2.stop(t + 0.4);
      } break;
      case 'keys': for (const n of notes) { // soft electric-piano-ish keys (FM-ish with two sines)
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz(n); const m = ctx.createOscillator(); m.type = 'sine'; m.frequency.value = hz(n) * 2; const mg = ctx.createGain(); mg.gain.setValueAtTime(hz(n) * 1.2, t); mg.gain.exponentialRampToValueAtTime(1, t + 0.6); m.connect(mg).connect(o.frequency);
        const g = this.env(t, d, 0.12, 0.004, Math.min(0.4, d * 0.5)); o.connect(g).connect(out); this.send(g, 0.5, 0.25); o.start(t); m.start(t); o.stop(t + d + 0.05); m.stop(t + d + 0.05);
      } break;
      case 'sub': for (const n of notes) { // clean sine sub with slight glide from the previous note
        const o = ctx.createOscillator(); o.type = 'sine'; const from = this.lastSub ?? hz(n); o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(hz(n), t + 0.05); this.lastSub = hz(n);
        const g = this.env(t, d * 0.95, 0.5, 0.01, 0.08); o.connect(g).connect(this.master); o.start(t); o.stop(t + d + 0.05);
        const h = ctx.createOscillator(); h.type = 'triangle'; h.frequency.value = hz(n) * 2; const hg = this.env(t, d * 0.95, 0.06, 0.01, 0.08); h.connect(hg).connect(out); h.start(t); h.stop(t + d + 0.05);
      } break;
      case 'bass808': for (const n of notes) { // 808: pitch drop, long sine tail, saturation
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(hz(n) * 2.5, t); o.frequency.exponentialRampToValueAtTime(hz(n), t + 0.06);
        const sh = ctx.createWaveShaper(); const c = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 127.5 - 1; c[i] = Math.tanh(x * 2.5); } sh.curve = c;
        const g = this.env(t, Math.max(0.35, d), 0.6, 0.005, 0.25); o.connect(sh).connect(g).connect(this.master); o.start(t); o.stop(t + Math.max(0.35, d) + 0.1);
        this.noise(t, 0.03, 0.2, out, { type: 'lowpass', freq: 1500 });
      } break;
      case 'kick': { this.pumpKick(t); const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.07); const g = this.env(t, 0.32, accent ? 1.1 : 0.95, 0.001, 0.2); o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.4); this.noise(t, 0.02, 0.35, this.master, { type: 'highpass', freq: 2500 }); break; }
      case 'clap': { for (let k = 0; k < 3; k++) this.noise(t + k * 0.011, 0.045, 0.32, out, { type: 'bandpass', freq: 1800, q: 0.9 }); this.noise(t + 0.03, 0.28, 0.28, out, { type: 'highpass', freq: 1200 }); const rv = ctx.createGain(); rv.gain.value = 0.5; this.noise(t + 0.03, 0.2, 0.25, rv, { type: 'highpass', freq: 1500 }); rv.connect(this.reverbSend); break; }
      case 'snare': { this.noise(t, 0.18, 0.35, out, { type: 'highpass', freq: 1500 }); const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.1); const g = this.env(t, 0.12, 0.25); o.connect(g).connect(out); o.start(t); o.stop(t + 0.2); break; }
      case 'hat': { const p = ctx.createStereoPanner(); p.pan.value = 0.25; p.connect(out); this.noise(t, open ? 0.22 : accent ? 0.06 : 0.035, accent ? 0.16 : open ? 0.12 : 0.09, p, { type: 'highpass', freq: 7500 }); break; }
      case 'ohat': this.noise(t, 0.2, 0.1, out, { type: 'highpass', freq: 6500 }); break;
      case 'crash': this.noise(t, 1.4, 0.18, out, { type: 'highpass', freq: 4000 }); break;
      case 'riser': { const beat = 60 / this.bpm; this.noise(t, beat * 4, 0.22, out, { type: 'bandpass', freq: 300, q: 1.2, sweep: 9000 }, beat * 3); const rv = ctx.createGain(); rv.gain.value = 0.6; this.noise(t, beat * 4, 0.15, rv, { type: 'bandpass', freq: 300, q: 1, sweep: 9000 }, beat * 3); rv.connect(this.reverbSend); break; }
      // legacy voices kept for compatibility
      case 'lead': for (const n of notes) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = hz(n); const g = this.env(t, d * 0.9, 0.08); o.connect(g).connect(out); o.start(t); o.stop(t + d + 0.05); } break;
      case 'lead2': case 'bass': case 'chords': case 'arp': for (const n of notes) { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz(n); const g = this.env(t, d * 0.9, 0.06); o.connect(g).connect(out); o.start(t); o.stop(t + d + 0.05); } break;
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
