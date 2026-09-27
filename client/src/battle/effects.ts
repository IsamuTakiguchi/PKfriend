// Canvas move animations. Two layers:
//   back  = behind the pokémon (auras, ground cracks, shadows, waves rising behind)
//   front = in front of it (projectiles, beams, lightning, claws, impacts, screen tints)
// BattleStage drives it imperatively: charge() while the attacker powers up, launch() when the attack
// leaves the attacker, impact() when it arrives at the target (returns when the hit lands).
import { getMove, TYPE_COLOR, type MoveFx, type TypeName, type Move } from '@pkfriend/shared';

export type Pt = { x: number; y: number };
/** A pokémon on screen: center, rough radius of the visible sprite and the y of its feet. */
export interface Body extends Pt { r: number; ground: number }
export type Reaction = 'burn' | 'freeze' | 'shock' | 'warp' | 'poison' | 'wet' | 'dark' | 'shine';
/** How the attacker's body moves when it attacks. */
export type Act = 'dash' | 'blast' | 'throw' | 'stomp' | 'burrow' | 'swipe' | 'rise' | 'roar';
export interface ImpactInfo { hitAt: number; react?: Reaction; heavy?: boolean }

const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
const easeOut = (k: number) => 1 - Math.pow(1 - clamp01(k), 3);
const easeIn = (k: number) => Math.pow(clamp01(k), 2.2);

// ------------------------------------------------------------------ colours & cached glow sprites
const FIRE = ['#fffbe0', '#ffe066', '#ffa726', '#ff5722', '#c62828', '#4e2a1e'];
const DRAGON = ['#ffffff', '#d6c8ff', '#9a7bff', '#6a3cff', '#3b1f9e', '#1a0c45'];
const FIGHT = ['#fff3e0', '#ffcc80', '#ff8a50', '#e64a19', '#8d1f0f', '#3a1008'];
const SUN = ['#ffffff', '#fffde0', '#fff176', '#dce775', '#9ccc65', '#33691e'];

function rgb(hex: string): [number, number, number] {
  let h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const texCache = new Map<string, HTMLCanvasElement>();
/** Soft round glow of one colour (drawn with drawImage — far cheaper than shadowBlur on phones). */
function glowTex(color: string, core = 0.18): HTMLCanvasElement {
  const key = color + core; const hit = texCache.get(key); if (hit) return hit;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  const [r, gg, b] = rgb(color); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${r},${gg},${b},1)`); gr.addColorStop(core, `rgba(${r},${gg},${b},.9)`); gr.addColorStop(0.55, `rgba(${r},${gg},${b},.3)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); texCache.set(key, c); return c;
}

// ------------------------------------------------------------------ particles
type Shape = 'glow' | 'flame' | 'spark' | 'leaf' | 'snow' | 'bubble' | 'rock' | 'drop' | 'star' | 'ring' | 'feather' | 'wisp' | 'shard' | 'needle' | 'note' | 'dust' | 'blob';
interface P {
  x: number; y: number; vx: number; vy: number; g: number; drag: number; life: number; max: number; size: number; grow: number;
  color: string; shape: Shape; rot: number; vr: number; layer: 0 | 1; ramp?: string[]; floor?: number; pts?: Pt[]; delay: number;
}
type PInit = Partial<P> & { x: number; y: number };

interface Fx { t: number; dur: number; layer: 0 | 1; delay: number; step?: (dt: number, t: number) => void; draw: (ctx: CanvasRenderingContext2D, t: number, k: number) => void; }

function boltPath(a: Pt, b: Pt, jitter: number, depth = 5): Pt[] {
  let pts: Pt[] = [a, b]; let d = jitter;
  for (let i = 0; i < depth; i++) {
    const np: Pt[] = [pts[0]];
    for (let j = 0; j < pts.length - 1; j++) {
      const p = pts[j], q = pts[j + 1]; const nx = -(q.y - p.y), ny = q.x - p.x; const L = Math.hypot(nx, ny) || 1; const o = (Math.random() - 0.5) * d;
      np.push({ x: (p.x + q.x) / 2 + (nx / L) * o, y: (p.y + q.y) / 2 + (ny / L) * o }, q);
    }
    pts = np; d *= 0.55;
  }
  return pts;
}
function polyline(ctx: CanvasRenderingContext2D, pts: Pt[]) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke(); }
function rockPts(size: number): Pt[] { const n = 7 + Math.floor(Math.random() * 3); return Array.from({ length: n }, (_, i) => { const a = (i / n) * TAU; const r = size * rnd(0.7, 1.05); return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.85 }; }); }

export class FxEngine {
  private ps: P[] = []; private fxs: Fx[] = []; private q: { at: number; fn: () => void }[] = [];
  private clock = 0; private raf = 0; private last = 0;
  W = 390; H = 600;
  private ro: ResizeObserver | null = null;
  constructor(private front: HTMLCanvasElement, private back: HTMLCanvasElement | null = null) { this.attach(front, back); }
  /** (Re)bind to the stage canvases — the stage swaps its DOM between the solo and the team layout. */
  attach(front: HTMLCanvasElement, back: HTMLCanvasElement | null) {
    this.front = front; this.back = back; this.ro?.disconnect();
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(front); }
    this.resize();
  }
  isAttached(front: HTMLCanvasElement | null, back: HTMLCanvasElement | null) { return this.front === front && this.back === back; }

  resize() {
    const r = this.front.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = r.width || this.W; this.H = r.height || this.H;
    for (const c of [this.front, this.back]) { if (!c) continue; c.width = this.W * dpr; c.height = this.H * dpr; c.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0); }
  }
  destroy() { cancelAnimationFrame(this.raf); this.raf = 0; this.ro?.disconnect(); }
  clear() { this.ps = []; this.fxs = []; this.q = []; }
  private start() { if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(t => this.tick(t)); } }

  // ---------------------------------------------------------------- building blocks
  at(ms: number, fn: () => void) { if (ms <= 0) { fn(); return; } this.q.push({ at: this.clock + ms / 1000, fn }); this.start(); }
  p(init: PInit) { this.ps.push({ vx: 0, vy: 0, g: 0, drag: 0.985, life: 0, max: 0.8, size: 4, grow: 0, color: '#fff', shape: 'glow', rot: Math.random() * TAU, vr: 0, layer: 1, delay: 0, ...init }); this.start(); }
  emit(n: number, f: (i: number) => PInit) { for (let i = 0; i < n; i++) this.p(f(i)); }
  fx(f: Omit<Fx, 't' | 'delay' | 'layer'> & { layer?: 0 | 1; delay?: number }) { this.fxs.push({ t: 0, layer: 1, delay: 0, ...f }); this.start(); }
  /** Continuous emitter: calls make(progress) `rate` times per second for `dur` seconds. */
  stream(dur: number, rate: number, make: (k: number) => PInit | PInit[] | null, delay = 0) {
    let acc = 0;
    this.fx({ dur, delay, layer: 1, step: (dt, t) => { acc += dt * rate; while (acc >= 1) { acc -= 1; const r = make(t / dur); if (!r) continue; for (const x of Array.isArray(r) ? r : [r]) this.p(x); } }, draw: () => {} });
  }
  tint(color: string, alpha: number, dur: number, delay = 0, fadeIn = 0.12) {
    this.fx({ dur, delay, draw: (ctx, t, k) => { const a = t < fadeIn ? t / fadeIn : k > 0.6 ? (1 - k) / 0.4 : 1; ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha * a; ctx.fillStyle = color; ctx.fillRect(0, 0, this.W, this.H); } });
  }
  ring(c: Pt, r0: number, r1: number, color: string, dur: number, width = 6, delay = 0, flat = 1, layer: 0 | 1 = 1) {
    this.fx({ dur, delay, layer, draw: (ctx, _t, k) => { const e = easeOut(k); ctx.globalAlpha = 1 - k; ctx.strokeStyle = color; ctx.lineWidth = Math.max(0.5, width * (1 - k * 0.7)); ctx.beginPath(); ctx.ellipse(c.x, c.y, r0 + (r1 - r0) * e, (r0 + (r1 - r0) * e) * flat, 0, 0, TAU); ctx.stroke(); } });
  }
  glowAt(c: Pt, size: number, color: string, dur: number, delay = 0, layer: 0 | 1 = 1, pulse = 0) {
    this.fx({ dur, delay, layer, draw: (ctx, t, k) => { const s = size * (1 + Math.sin(t * 9) * pulse) * (k < 0.15 ? k / 0.15 : 1); ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1; ctx.drawImage(glowTex(color), c.x - s, c.y - s, s * 2, s * 2); } });
  }
  /** Comic "impact star": spiky white burst with a coloured rim. */
  starBurst(c: Pt, r: number, color: string, dur = 0.4, delay = 0, spikes = 12) {
    const rot = Math.random() * TAU; const jag = Array.from({ length: spikes * 2 }, () => rnd(0.75, 1.15));
    this.fx({ dur, delay, draw: (ctx, _t, k) => {
      const R = r * (0.35 + 1.1 * easeOut(k / 0.5)); ctx.globalAlpha = k > 0.45 ? Math.max(0, (1 - k) / 0.55) : 1;
      ctx.beginPath(); for (let i = 0; i < spikes * 2; i++) { const a = rot + (i / (spikes * 2)) * TAU; const rr = (i % 2 ? R * 0.42 : R) * jag[i]; ctx.lineTo(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr); } ctx.closePath();
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = color; ctx.stroke();
      ctx.drawImage(glowTex(color), c.x - R * 1.4, c.y - R * 1.4, R * 2.8, R * 2.8);
    } });
  }
  bolt(a: Pt, b: Pt, o: { w?: number; color?: string; dur?: number; delay?: number; jitter?: number; branches?: number; flicker?: number } = {}) {
    const w = o.w ?? 5, color = o.color ?? '#ffe14d', jitter = o.jitter ?? Math.hypot(b.x - a.x, b.y - a.y) * 0.28;
    let path = boltPath(a, b, jitter); let br: Pt[][] = []; let since = 99;
    const regen = () => {
      path = boltPath(a, b, jitter); br = [];
      for (let i = 0; i < (o.branches ?? 3); i++) { const s = path[Math.floor(rnd(0.2, 0.8) * path.length)]; const L = Math.hypot(b.x - a.x, b.y - a.y) * rnd(0.12, 0.3); const ang = Math.atan2(b.y - a.y, b.x - a.x) + rnd(-1.1, 1.1); br.push(boltPath(s, { x: s.x + Math.cos(ang) * L, y: s.y + Math.sin(ang) * L }, L * 0.4, 3)); }
    };
    regen();
    this.fx({ dur: o.dur ?? 0.35, delay: o.delay ?? 0, step: dt => { since += dt; if (since > (o.flicker ?? 0.05)) { since = 0; regen(); } }, draw: (ctx, _t, k) => {
      const base = (k > 0.7 ? (1 - k) / 0.3 : 1) * (Math.random() < 0.15 ? 0.55 : 1); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const [lw, col, al] of [[w * 4.5, color, 0.22], [w * 1.7, color, 1], [w * 0.6, '#ffffff', 1]] as [number, string, number][]) { ctx.globalAlpha = base * al; ctx.strokeStyle = col; ctx.lineWidth = lw; polyline(ctx, path); ctx.lineWidth = lw * 0.5; for (const q of br) polyline(ctx, q); }
      ctx.globalAlpha = base; ctx.drawImage(glowTex(color), b.x - w * 7, b.y - w * 7, w * 14, w * 14);
    } });
  }
  /** Crackling arcs around a body (charged with electricity). */
  crackle(b: Body, dur: number, color = '#ffe14d', delay = 0, count = 3) {
    let arcs: Pt[][] = []; let since = 99;
    this.fx({ dur, delay, step: dt => { since += dt; if (since > 0.07) { since = 0; arcs = Array.from({ length: count }, () => { const a1 = rnd(0, TAU), a2 = a1 + rnd(0.6, 1.8); const R = b.r * rnd(0.6, 1.0); return boltPath({ x: b.x + Math.cos(a1) * R, y: b.y + Math.sin(a1) * R }, { x: b.x + Math.cos(a2) * R, y: b.y + Math.sin(a2) * R }, b.r * 0.5, 4); }); } }, draw: ctx => {
      ctx.lineJoin = 'round'; for (const arc of arcs) { ctx.globalAlpha = 0.3; ctx.strokeStyle = color; ctx.lineWidth = 8; polyline(ctx, arc); ctx.globalAlpha = 1; ctx.lineWidth = 3; polyline(ctx, arc); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; polyline(ctx, arc); }
    } });
  }
  beam(a: Pt, b: Pt, o: { w: number; color: string; core?: string; dur: number; delay?: number; grow?: number; style?: 'plain' | 'rings' | 'ice' | 'spiral' | 'flame' }) {
    const len = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x); const grow = o.grow ?? 0.18; let spawn = 0;
    this.fx({ dur: o.dur, delay: o.delay ?? 0, step: (dt, t) => {
      if (o.style !== 'ice' && o.style !== 'flame') return; spawn += dt; if (spawn < 0.03) return; spawn = 0;
      const L = len * Math.min(1, t / grow); const d = rnd(0, L); const x = a.x + Math.cos(ang) * d, y = a.y + Math.sin(ang) * d;
      if (o.style === 'ice') this.p({ x, y, vx: rnd(-30, 30), vy: rnd(-60, 20), size: rnd(6, 13), shape: 'shard', color: '#e0ffff', max: rnd(0.5, 0.9), rot: rnd(0, TAU), vr: rnd(-3, 3) });
      else this.p({ x, y, vx: Math.cos(ang) * 200 + rnd(-40, 40), vy: rnd(-90, 20), size: rnd(8, 16), grow: 1.2, shape: 'flame', ramp: FIRE, max: rnd(0.3, 0.5) });
    }, draw: (ctx, t, k) => {
      const L = len * Math.min(1, t / grow); const fade = k > 0.75 ? (1 - k) / 0.25 : 1; const thick = o.w * (k > 0.75 ? fade : 1) * (1 + Math.sin(t * 40) * 0.08);
      ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ang); ctx.lineCap = 'round';
      ctx.globalAlpha = 0.28 * fade; ctx.strokeStyle = o.color; ctx.lineWidth = thick * 2.1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, 0); ctx.stroke();
      ctx.globalAlpha = fade; ctx.lineWidth = thick; ctx.stroke();
      ctx.strokeStyle = o.core ?? '#ffffff'; ctx.lineWidth = thick * 0.42; ctx.stroke();
      if (o.style === 'rings') for (let i = 0; i < 7; i++) { const x = ((t * 520 + i * (L / 7)) % Math.max(1, L)); ctx.strokeStyle = `hsl(${(i * 52 + t * 400) % 360},100%,70%)`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, 0, thick * 0.35, thick * 1.1, 0, 0, TAU); ctx.stroke(); }
      if (o.style === 'spiral') for (const s of [1, -1]) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); for (let x = 0; x <= L; x += 8) ctx.lineTo(x, Math.sin(x / 26 - t * 30) * thick * 0.75 * s); ctx.stroke(); }
      ctx.restore();
      ctx.globalAlpha = fade; const hx = a.x + Math.cos(ang) * L, hy = a.y + Math.sin(ang) * L; const hs = thick * 2.4; ctx.drawImage(glowTex(o.color), hx - hs, hy - hs, hs * 2, hs * 2); ctx.drawImage(glowTex('#ffffff'), hx - hs * 0.5, hy - hs * 0.5, hs, hs);
      const ms = thick * 1.6; ctx.drawImage(glowTex(o.color), a.x - ms, a.y - ms, ms * 2, ms * 2);
    } });
  }
  /** Tapered crescent claw/blade stroke that is drawn in and then wiped out. */
  slash(c: Pt, ang: number, len: number, w: number, color: string, dur = 0.32, delay = 0, curve = 0.18) {
    const dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2; const p0 = { x: c.x - dx, y: c.y - dy }, p2 = { x: c.x + dx, y: c.y + dy }; const p1 = { x: c.x - Math.sin(ang) * len * curve, y: c.y + Math.cos(ang) * len * curve };
    const at = (u: number) => ({ x: (1 - u) * (1 - u) * p0.x + 2 * (1 - u) * u * p1.x + u * u * p2.x, y: (1 - u) * (1 - u) * p0.y + 2 * (1 - u) * u * p1.y + u * u * p2.y });
    this.fx({ dur, delay, draw: (ctx, _t, k) => {
      const head = easeOut(k / 0.4), tail = clamp01((k - 0.45) / 0.55); if (head - tail < 0.01) return;
      for (const [W, col] of [[w * 2.2, color], [w, '#ffffff']] as [number, string][]) {
        const L: Pt[] = [], R: Pt[] = [];
        for (let i = 0; i <= 18; i++) { const u = tail + (head - tail) * (i / 18); const q = at(u), q2 = at(Math.min(1, u + 0.01)); const nx = -(q2.y - q.y), ny = q2.x - q.x; const nl = Math.hypot(nx, ny) || 1; const th = W * Math.sin(Math.PI * (i / 18)) / 2; L.push({ x: q.x + nx / nl * th, y: q.y + ny / nl * th }); R.push({ x: q.x - nx / nl * th, y: q.y - ny / nl * th }); }
        ctx.globalAlpha = col === '#ffffff' ? 1 : 0.75; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(L[0].x, L[0].y); for (const q of L) ctx.lineTo(q.x, q.y); for (const q of R.reverse()) ctx.lineTo(q.x, q.y); ctx.closePath(); ctx.fill();
      }
    } });
  }
  fangs(c: Pt, size: number, color: string, dur = 0.7, delay = 0) {
    this.fx({ dur, delay, draw: (ctx, _t, k) => {
      ctx.globalCompositeOperation = 'source-over'; const close = easeIn(k / 0.32); const gap = size * 1.25 * (1 - close); const shake = k > 0.32 && k < 0.5 ? rnd(-4, 4) : 0;
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1; const n = 5, W = size * 2, tw = W / n;
      for (const s of [-1, 1]) {
        const y0 = c.y + s * (gap + size * 0.28) + shake; ctx.fillStyle = '#fbfbff'; ctx.strokeStyle = '#3a3a48'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(c.x - W / 2 - 10, y0 + s * size * 0.22); ctx.quadraticCurveTo(c.x, y0 + s * size * 0.5, c.x + W / 2 + 10, y0 + s * size * 0.22); ctx.lineTo(c.x + W / 2 + 10, y0); ctx.lineTo(c.x - W / 2 - 10, y0); ctx.closePath(); ctx.fillStyle = color; ctx.globalAlpha *= 0.85; ctx.fill(); ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        for (let i = 0; i < n; i++) { const x = c.x - W / 2 + tw * i; const long = i === 0 || i === n - 1 ? 1.25 : 1; ctx.fillStyle = '#fbfbff'; ctx.beginPath(); ctx.moveTo(x + 2, y0); ctx.lineTo(x + tw / 2, y0 - s * size * 0.5 * long); ctx.lineTo(x + tw - 2, y0); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      }
    } });
  }
  cracks(b: Body, len: number, dur = 1.6, delay = 0, color = '#2b1a0e') {
    const branches = Array.from({ length: 7 }, (_, i) => { const side = i % 2 ? 1 : -1; const a = (side > 0 ? 0 : Math.PI) + rnd(-0.45, 0.45); const L = len * rnd(0.55, 1); const end = { x: b.x + Math.cos(a) * L, y: b.ground + Math.sin(a) * L * 0.3 + 4 }; return boltPath({ x: b.x + rnd(-10, 10), y: b.ground + 2 }, end, L * 0.2, 4); });
    this.fx({ dur, delay, layer: 0, draw: (ctx, _t, k) => {
      ctx.globalCompositeOperation = 'source-over'; const grow = easeOut(k / 0.25); ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1; ctx.lineJoin = 'round';
      for (const br of branches) { const n = Math.max(2, Math.floor(br.length * grow)); const part = br.slice(0, n); ctx.strokeStyle = 'rgba(255,230,180,.55)'; ctx.lineWidth = 7; polyline(ctx, part); ctx.strokeStyle = color; ctx.lineWidth = 4; polyline(ctx, part); }
    } });
  }
  /** A big wave sweeping across the screen in `dir`. */
  wave(dir: number, crestY: number, dur = 1.3, delay = 0, layer: 0 | 1 = 1) {
    const W = this.W, H = this.H; const crest = H - crestY;
    this.fx({ dur, delay, layer, step: (_dt, t) => {
      const edge = this.waveEdge(dir, t / dur); if (Math.random() < 0.8) this.p({ x: edge + rnd(-20, 30) * dir, y: crestY + rnd(-10, 30), vx: dir * rnd(100, 300), vy: rnd(-260, -80), g: 700, size: rnd(3, 7), shape: 'drop', color: '#ffffff', max: rnd(0.4, 0.8), layer });
    }, draw: (ctx, t, k) => {
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 0.93; const edge = this.waveEdge(dir, k); const L = W * 1.3;
      const top: Pt[] = []; for (let i = 0; i <= 40; i++) { const s = i / 40; top.push({ x: edge - dir * L * (1 - s), y: H - crest * (0.3 + 0.7 * Math.pow(s, 1.6)) + Math.sin(s * 16 + t * 7) * 7 }); }
      const lip = [{ x: edge + dir * crest * 0.18, y: H - crest * 0.96 }, { x: edge + dir * crest * 0.26, y: H - crest * 0.8 }, { x: edge + dir * crest * 0.16, y: H - crest * 0.62 }, { x: edge + dir * crest * 0.1, y: H }];
      const gr = ctx.createLinearGradient(0, H - crest, 0, H); gr.addColorStop(0, '#c6f4ff'); gr.addColorStop(0.25, '#42a5f5'); gr.addColorStop(1, '#0d3c8a'); ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(edge - dir * L, H); for (const q of top) ctx.lineTo(q.x, q.y); for (const q of lip) ctx.lineTo(q.x, q.y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); for (const q of top.slice(18)) ctx.lineTo(q.x, q.y); for (const q of lip.slice(0, 2)) ctx.lineTo(q.x, q.y); ctx.stroke();
      ctx.globalAlpha *= 0.35; ctx.strokeStyle = '#e3fbff'; ctx.lineWidth = 3; for (let j = 1; j < 4; j++) { ctx.beginPath(); for (const q of top.slice(10 + j * 4)) ctx.lineTo(q.x - dir * j * 18, q.y + j * 26); ctx.stroke(); }
    } });
  }
  private waveEdge(dir: number, k: number) { const e = easeOut(k * 1.05); return dir > 0 ? -this.W * 0.2 + e * this.W * 1.65 : this.W * 1.2 - e * this.W * 1.65; }
  vortex(b: Body, dur: number, color = '#e8f3ff', delay = 0) {
    const h = b.r * 3.2;
    this.fx({ dur, delay, step: () => { if (Math.random() < 0.6) { const a = rnd(0, TAU); this.p({ x: b.x + Math.cos(a) * b.r, y: b.ground - rnd(0, h), vx: -Math.sin(a) * 320, vy: rnd(-160, -60), size: rnd(4, 8), shape: pick(['leaf', 'dust', 'feather'] as Shape[]), color: pick(['#9ccc65', '#d7ccc8', '#ffffff']), max: 0.7, vr: 12 }); } }, draw: (ctx, t, k) => {
      const a = (k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1); ctx.lineCap = 'round';
      for (let i = 0; i < 10; i++) { const y = b.ground - (i / 10) * h; const rx = b.r * (0.35 + i * 0.13); const cx = b.x + Math.sin(t * 5 + i * 0.7) * b.r * 0.12; ctx.globalAlpha = a * 0.75; ctx.strokeStyle = color; ctx.lineWidth = 3 + (i % 3); ctx.beginPath(); ctx.ellipse(cx, y, rx, rx * 0.22, 0, t * 9 + i, t * 9 + i + 3.6); ctx.stroke(); }
    } });
  }
  orb(from: Pt, to: Pt, o: { r: number; color: string; dur: number; delay?: number; style?: 'glow' | 'shadow' | 'fire' | 'sludge' | 'moon' | 'meteor' | 'electric'; arc?: number }) {
    const pos = (k: number) => { const e = easeIn(k); return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e - Math.sin(Math.PI * e) * (o.arc ?? 0) }; };
    this.fx({ dur: o.dur, delay: o.delay ?? 0, step: (_dt, t) => {
      const q = pos(t / o.dur);
      if (o.style === 'fire' || o.style === 'meteor') this.emit(2, () => ({ x: q.x + rnd(-o.r, o.r) * 0.5, y: q.y + rnd(-o.r, o.r) * 0.5, vx: rnd(-40, 40), vy: rnd(-60, 20), size: o.r * rnd(0.5, 0.9), grow: 0.6, shape: 'flame', ramp: o.style === 'meteor' ? DRAGON : FIRE, max: rnd(0.25, 0.45) }));
      else if (o.style === 'shadow') this.p({ x: q.x + rnd(-o.r, o.r) * 0.6, y: q.y + rnd(-o.r, o.r) * 0.6, vx: rnd(-50, 50), vy: rnd(-50, 50), size: o.r * rnd(0.5, 0.9), grow: 0.8, shape: 'wisp', color: '#2a0f45', max: 0.45 });
      else if (o.style === 'sludge') this.p({ x: q.x, y: q.y, vx: rnd(-30, 30), vy: rnd(20, 80), g: 400, size: o.r * rnd(0.2, 0.4), shape: 'blob', color: '#8e3fbf', max: 0.5 });
      else if (o.style === 'electric' && Math.random() < 0.5) this.p({ x: q.x, y: q.y, vx: rnd(-200, 200), vy: rnd(-200, 200), size: 4, shape: 'spark', color: '#ffe14d', max: 0.2 });
      else if (Math.random() < 0.6) this.p({ x: q.x, y: q.y, vx: rnd(-40, 40), vy: rnd(-40, 40), size: o.r * 0.5, shape: 'glow', color: o.color, max: 0.35 });
    }, draw: (ctx, t, k) => {
      const q = pos(k); const s = o.r * (1 + Math.sin(t * 20) * 0.06);
      if (o.style === 'shadow') { ctx.drawImage(glowTex('#9c4dff'), q.x - s * 2.4, q.y - s * 2.4, s * 4.8, s * 4.8); ctx.globalCompositeOperation = 'source-over'; const g = ctx.createRadialGradient(q.x - s * 0.3, q.y - s * 0.3, s * 0.1, q.x, q.y, s); g.addColorStop(0, '#5b2a86'); g.addColorStop(0.7, '#1b0930'); g.addColorStop(1, 'rgba(10,0,20,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, s, 0, TAU); ctx.fill(); return; }
      if (o.style === 'sludge') { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#7b2fa8'; ctx.beginPath(); ctx.arc(q.x, q.y, s, 0, TAU); ctx.fill(); ctx.fillStyle = '#c77dff'; ctx.beginPath(); ctx.arc(q.x - s * 0.3, q.y - s * 0.35, s * 0.35, 0, TAU); ctx.fill(); return; }
      ctx.drawImage(glowTex(o.color), q.x - s * 2.2, q.y - s * 2.2, s * 4.4, s * 4.4); ctx.drawImage(glowTex('#ffffff'), q.x - s * 0.9, q.y - s * 0.9, s * 1.8, s * 1.8);
    } });
    return o.dur + (o.delay ?? 0);
  }
  /** Energy particles converging into a point (charging up). */
  gather(c: Pt, R: number, color: string, dur: number, delay = 0, coreColor = '#ffffff') {
    this.stream(dur, 60, () => { const a = rnd(0, TAU), d = R * rnd(0.8, 1.3); return { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d, vx: -Math.cos(a) * d / 0.38, vy: -Math.sin(a) * d / 0.38, drag: 1, size: rnd(3, 6), shape: 'spark', color, max: 0.38 }; }, delay);
    this.glowAt(c, R * 0.5, color, dur + 0.2, delay, 1, 0.12); this.glowAt(c, R * 0.22, coreColor, dur + 0.2, delay, 1, 0.2);
  }
  /** Coloured aura behind the body + a type-flavoured particle emitter around it. */
  aura(b: Body, color: string, dur: number, make?: (k: number) => PInit | PInit[] | null, rate = 40) {
    this.glowAt({ x: b.x, y: b.y }, b.r * 1.5, color, dur, 0, 0, 0.07);
    this.stream(dur, 3, () => ({ x: b.x, y: b.ground, vx: 0, vy: 0, size: b.r * 0.8, grow: 1.8, shape: 'ring', color, max: 0.7, layer: 0 }));
    if (make) this.stream(dur, rate, make);
  }
  /** Things orbiting around the body on a tilted ellipse (drawn in front on the near half, behind on the far half). */
  orbit(b: Body, n: number, dur: number, drawItem: (ctx: CanvasRenderingContext2D, x: number, y: number, i: number, t: number) => void, speed = 3) {
    for (const layer of [0, 1] as const) this.fx({ dur, layer, draw: (ctx, t, k) => {
      ctx.globalAlpha = k < 0.15 ? k / 0.15 : k > 0.85 ? (1 - k) / 0.15 : 1;
      for (let i = 0; i < n; i++) { const a = t * speed + (i / n) * TAU; const near = Math.sin(a) > 0; if (near !== (layer === 1)) continue; drawItem(ctx, b.x + Math.cos(a) * b.r * 1.05, b.y + Math.sin(a) * b.r * 0.35 + Math.sin(t * 2 + i) * b.r * 0.1, i, t); }
    } });
  }
  /** Diagonal metallic gleam sweeping over the body. */
  shine(b: Body, dur = 0.5, delay = 0) {
    this.fx({ dur, delay, draw: (ctx, _t, k) => {
      const x = b.x - b.r * 1.4 + k * b.r * 2.8; ctx.save(); ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.95, 0, TAU); ctx.clip();
      const g = ctx.createLinearGradient(x - 30, 0, x + 30, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.translate(x, b.y); ctx.rotate(0.5); ctx.fillStyle = g; ctx.translate(-x, -b.y); ctx.fillRect(x - 30, b.y - b.r * 2, 60, b.r * 4); ctx.restore();
    } });
    this.emit(4, i => ({ x: b.x + rnd(-b.r, b.r) * 0.7, y: b.y + rnd(-b.r, b.r) * 0.7, size: rnd(10, 18), shape: 'star', color: '#ffffff', max: 0.5, delay: delay + i * 0.08 }));
  }
  whip(b: Body, dir: number, color = '#43a047', dur = 0.45, delay = 0, high = 1) {
    const sx = dir > 0 ? -60 : this.W + 60; const sy = b.y - b.r * 0.9 * high;
    this.fx({ dur, delay, draw: (ctx, _t, k) => {
      const reach = easeOut(k / 0.45) - clamp01((k - 0.6) / 0.4); if (reach <= 0) return;
      const ex = sx + dir * (Math.abs(b.x - sx) + b.r * 1.1) * reach, ey = b.y + b.r * 0.6 * high * Math.sin(Math.PI * reach);
      const cx = (sx + ex) / 2, cy = Math.min(sy, ey) - b.r * 1.2 * (1 - k);
      ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round';
      ctx.strokeStyle = '#1b5e20'; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.stroke(); ctx.strokeStyle = '#a5d6a7'; ctx.lineWidth = 2; ctx.stroke();
    } });
  }
  drill(from: Pt, b: Body, dir: number, dur = 0.45, delay = 0, color = '#ffe082') {
    this.fx({ dur, delay, draw: (ctx, t, k) => {
      const e = easeIn(k); const x = from.x + (b.x - dir * b.r * 0.4 - from.x) * e, y = from.y + (b.y - from.y) * e; const L = b.r * 1.3, R = b.r * 0.38;
      ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1); ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-L, -R); ctx.lineTo(-L, R); ctx.closePath(); const g = ctx.createLinearGradient(0, -R, 0, R); g.addColorStop(0, '#fff8e1'); g.addColorStop(0.5, color); g.addColorStop(1, '#a1887f'); ctx.fillStyle = g; ctx.fill(); ctx.clip();
      ctx.strokeStyle = 'rgba(80,50,20,.55)'; ctx.lineWidth = 4; for (let i = -6; i < 8; i++) { const o = ((t * 900) % 24) + i * 24; ctx.beginPath(); ctx.moveTo(-o, -R); ctx.lineTo(-o + 16, R); ctx.stroke(); }
      ctx.restore();
      this.p({ x: x - dir * L, y: y + rnd(-R, R), vx: -dir * rnd(200, 400), vy: rnd(-50, 50), size: 3, shape: 'spark', color: '#ffffff', max: 0.2 });
    } });
  }
  sound(c: Pt, dir: number, dur = 0.9, color = '#ffffff', delay = 0) {
    this.fx({ dur, delay, draw: (ctx, t, k) => {
      ctx.lineCap = 'round'; for (let i = 0; i < 4; i++) { const kk = ((t * 1.6 + i / 4) % 1); const R = 30 + kk * 180; ctx.globalAlpha = (1 - kk) * (k > 0.8 ? (1 - k) / 0.2 : 1); ctx.strokeStyle = color; ctx.lineWidth = 6 * (1 - kk) + 1; const base = dir > 0 ? 0 : Math.PI; ctx.beginPath(); ctx.arc(c.x, c.y, R, base - 0.6, base + 0.6); ctx.stroke(); }
    } });
    this.stream(dur, 7, () => ({ x: c.x, y: c.y, vx: dir * rnd(120, 240), vy: rnd(-120, -30), size: rnd(18, 26), shape: 'note', color: pick(['#ffffff', '#ffe082', '#ff8a80']), max: 0.9 }), delay);
  }

  // ---------------------------------------------------------------- per-move choreography
  actOf(moveId: string): Act { return ANIMS[moveId]?.act ?? defaultAct(getMove(moveId)); }
  /** Power-up while the camera is on the attacker. */
  charge(moveId: string, b: Body, dir: number, ms: number) { const m = getMove(moveId); const a = ANIMS[moveId]; (a?.charge ?? chargeByType)(this, b, dir, ms / 1000, m); }
  /** The attack leaves the attacker. Returns ms until it is out of frame. */
  launch(moveId: string, b: Body, dir: number): number { const m = getMove(moveId); const a = ANIMS[moveId]; return Math.round(((a?.launch ?? defaultLaunch)(this, b, dir, m)) * 1000); }
  /** The attack reaches the target (coming in along `dir`). hitAt is ms until contact. */
  impact(moveId: string, b: Body, dir: number): ImpactInfo { const m = getMove(moveId); const a = ANIMS[moveId]; const r = (a?.impact ?? defaultImpact)(this, b, dir, m); return { ...r, hitAt: Math.round(r.hitAt * 1000) }; }
  exitPt(b: Body, dir: number): Pt { return { x: dir > 0 ? this.W + 90 : -90, y: b.y - b.r * 0.1 }; }
  entryPt(b: Body, dir: number): Pt { return { x: dir > 0 ? -90 : this.W + 90, y: b.y - b.r * 0.1 }; }

  /** Generic effect by category — used for assists, stat changes and heals. */
  play(fx: MoveFx, from: Pt, to: Pt, color: string) {
    const b: Body = { x: to.x, y: to.y, r: 60, ground: to.y + 55 }; const dir = to.x >= from.x ? 1 : -1;
    switch (fx) {
      case 'heal': this.aura({ ...b, x: from.x, y: from.y, ground: from.y + 55 }, '#7dff9a', 1.0, () => ({ x: from.x + rnd(-50, 50), y: from.y + rnd(-10, 60), vy: rnd(-200, -80), size: rnd(8, 13), shape: 'star', color: pick(['#7dff9a', '#ffffff']), max: rnd(0.8, 1.2) }), 30); break;
      case 'buff': this.stream(0.6, 30, () => ({ x: from.x + rnd(-50, 50), y: from.y + rnd(0, 60), vy: rnd(-260, -120), size: rnd(10, 16), color, max: rnd(0.6, 1), shape: 'glow' })); this.shine({ x: from.x, y: from.y, r: 60, ground: from.y + 55 }, 0.5); break;
      case 'aura': this.glowAt(from, 70, color, 0.6, 0, 0, 0.1); this.stream(0.6, 30, () => ({ x: from.x + rnd(-50, 50), y: from.y + rnd(-20, 50), vy: rnd(-160, -60), size: rnd(10, 18), shape: 'glow', color, max: 0.6 })); break;
      default: { this.starBurst(to, 50, color, 0.4); this.ring(to, 20, 110, color, 0.45, 6); this.emit(18, () => ({ x: to.x, y: to.y, vx: rnd(-320, 320), vy: rnd(-320, 320), size: rnd(3, 6), shape: 'spark', color: Math.random() < 0.5 ? '#fff' : color, max: 0.4 })); void dir; }
    }
  }

  // ---------------------------------------------------------------- frame loop
  private tick(now: number) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.clock += dt;
    if (this.q.length) { const due = this.q.filter(x => x.at <= this.clock); this.q = this.q.filter(x => x.at > this.clock); for (const d of due) d.fn(); }
    const fctx = this.front.getContext('2d')!; const bctx = this.back?.getContext('2d') ?? null;
    fctx.clearRect(0, 0, this.W, this.H); bctx?.clearRect(0, 0, this.W, this.H);
    for (const f of this.fxs) {
      if (f.delay > 0) { f.delay -= dt; continue; }
      f.t += dt; f.step?.(dt, f.t); const ctx = f.layer === 0 && bctx ? bctx : fctx;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1; f.draw(ctx, f.t, clamp01(f.t / f.dur)); ctx.restore();
    }
    this.fxs = this.fxs.filter(f => f.delay > 0 || f.t < f.dur);
    for (const p of this.ps) {
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.vx *= p.drag; p.vy *= p.drag;
      if (p.floor !== undefined && p.y > p.floor) { p.y = p.floor; p.vy *= -0.35; p.vx *= 0.7; p.vr *= 0.6; }
      const k = p.life / p.max; if (k >= 1) continue;
      this.drawP(p.layer === 0 && bctx ? bctx : fctx, p, k);
    }
    this.ps = this.ps.filter(p => p.delay > 0 || p.life < p.max);
    if (this.ps.length || this.fxs.length || this.q.length) this.raf = requestAnimationFrame(t => this.tick(t));
    else { this.raf = 0; fctx.clearRect(0, 0, this.W, this.H); bctx?.clearRect(0, 0, this.W, this.H); }
  }
  private drawP(ctx: CanvasRenderingContext2D, p: P, k: number) {
    const s = p.size * (1 + p.grow * k); const a = k < 0.08 ? k / 0.08 : 1 - Math.pow(k, 2.2);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x, p.y);
    const additive = p.shape !== 'wisp' && p.shape !== 'rock' && p.shape !== 'blob' && p.shape !== 'dust' && p.shape !== 'leaf' && p.shape !== 'note' && p.shape !== 'feather';
    ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
    switch (p.shape) {
      case 'glow': ctx.drawImage(glowTex(p.color), -s, -s, s * 2, s * 2); break;
      case 'flame': { const ramp = p.ramp ?? FIRE; const c = ramp[Math.min(ramp.length - 1, Math.floor(k * ramp.length))]; ctx.drawImage(glowTex(c, 0.3), -s, -s, s * 2, s * 2); break; }
      case 'wisp': ctx.globalAlpha = a * 0.85; ctx.drawImage(glowTex(p.color, 0.35), -s, -s, s * 2, s * 2); break;
      case 'dust': ctx.globalAlpha = a * 0.55; ctx.drawImage(glowTex(p.color, 0.4), -s, -s, s * 2, s * 2); break;
      case 'spark': { const v = Math.hypot(p.vx, p.vy); const L = Math.max(s * 3, v * 0.045); ctx.rotate(Math.atan2(p.vy, p.vx)); ctx.lineCap = 'round'; ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1.5, s * 0.6); ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(0, 0); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, s * 0.25); ctx.stroke(); break; }
      case 'leaf': { ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.rot * 1.7) * 0.8 + 0.2); ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 0.6, s, 0); ctx.quadraticCurveTo(0, s * 0.6, -s, 0); ctx.fill(); ctx.strokeStyle = 'rgba(20,70,10,.8)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.stroke(); break; }
      case 'feather': { ctx.rotate(p.rot); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.28, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#90a4ae'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.stroke(); break; }
      case 'snow': { ctx.rotate(p.rot); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.2, s * 0.18); ctx.beginPath(); for (let i = 0; i < 3; i++) { const A = (i / 3) * Math.PI; ctx.moveTo(-Math.cos(A) * s, -Math.sin(A) * s); ctx.lineTo(Math.cos(A) * s, Math.sin(A) * s); } ctx.stroke(); break; }
      case 'shard': { ctx.rotate(p.rot); ctx.fillStyle = 'rgba(210,250,255,.75)'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.35, 0); ctx.lineTo(0, s * 0.6); ctx.lineTo(-s * 0.35, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); break; }
      case 'bubble': { ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(180,230,255,.18)'; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill(); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, s * 0.65, -2.4, -1.5); ctx.stroke(); break; }
      case 'drop': { const ang = Math.atan2(p.vy, p.vx); const st = Math.min(3, 1 + Math.hypot(p.vx, p.vy) / 400); ctx.rotate(ang); ctx.fillStyle = p.color; ctx.beginPath(); ctx.ellipse(0, 0, s * st, s, 0, 0, TAU); ctx.fill(); break; }
      case 'blob': { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(-s * 0.3, -s * 0.3, s * 0.3, 0, TAU); ctx.fill(); break; }
      case 'rock': { ctx.rotate(p.rot); const pts = p.pts ?? (p.pts = rockPts(s)); ctx.globalAlpha = Math.min(1, a * 1.5); ctx.fillStyle = p.color; ctx.strokeStyle = '#3e2f22'; ctx.lineWidth = 2; ctx.beginPath(); for (const q of pts) ctx.lineTo(q.x, q.y); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(-s * 0.3, -s * 0.3, s * 0.3, 0, TAU); ctx.fill(); break; }
      case 'star': { ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? s * 0.22 : s; const A = (i / 8) * TAU; ctx.lineTo(Math.cos(A) * r, Math.sin(A) * r); } ctx.closePath(); ctx.fill(); ctx.drawImage(glowTex(p.color), -s * 0.8, -s * 0.8, s * 1.6, s * 1.6); break; }
      case 'ring': { ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, 4 * (1 - k)); ctx.beginPath(); ctx.ellipse(0, 0, s, p.layer === 0 ? s * 0.3 : s, 0, 0, TAU); ctx.stroke(); break; }
      case 'needle': { ctx.rotate(Math.atan2(p.vy, p.vx)); ctx.strokeStyle = '#9c27b0'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-s * 2, 0); ctx.lineTo(0, 0); ctx.stroke(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-s * 0.6, 0); ctx.lineTo(s * 0.3, 0); ctx.stroke(); break; }
      case 'note': { ctx.fillStyle = p.color; ctx.font = `900 ${s}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3; ctx.strokeText('♪', 0, 0); ctx.fillText('♪', 0, 0); break; }
    }
    ctx.restore();
  }
}

// ==================================================================== move choreography table
type Charge = (e: FxEngine, b: Body, dir: number, sec: number, m: Move) => void;
type Launch = (e: FxEngine, b: Body, dir: number, m: Move) => number; // seconds until out of frame
type Impact = (e: FxEngine, b: Body, dir: number, m: Move) => { hitAt: number; react?: Reaction; heavy?: boolean };
interface MoveAnim { act: Act; charge?: Charge; launch: Launch; impact: Impact; }

const mouth = (b: Body, dir: number): Pt => ({ x: b.x + dir * b.r * 0.45, y: b.y - b.r * 0.15 });

// ---- charge-up by type (camera on the attacker, ~1.8s)
const chargeByType: Charge = (e, b, _dir, sec, m) => {
  const c = TYPE_COLOR[m.type];
  const rising = (shape: Shape, color: string | string[], size: [number, number], extra: Partial<P> = {}) => () => ({ x: b.x + rnd(-b.r, b.r) * 0.9, y: b.ground - rnd(0, b.r * 0.6), vx: rnd(-20, 20), vy: rnd(-220, -90), size: rnd(size[0], size[1]), shape, color: Array.isArray(color) ? pick(color) : color, max: rnd(0.6, 1.0), ...extra });
  switch (m.type as TypeName) {
    case 'fire': e.aura(b, '#ff6d00', sec, rising('flame', '#fff', [8, 16], { ramp: FIRE, grow: 0.8, vr: 0 }), 55); break;
    case 'water': e.aura(b, '#2f8cff', sec, rising('bubble', '#bfefff', [4, 10]), 18); e.orbit(b, 8, sec, (ctx, x, y) => { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#64c8ff'; ctx.beginPath(); ctx.ellipse(x, y, 7, 10, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 2, y - 3, 2.5, 0, TAU); ctx.fill(); }, 3.4); break;
    case 'grass': e.aura(b, '#5bd13c', sec); e.orbit(b, 10, sec, (ctx, x, y, i, t) => { ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.translate(x, y); ctx.rotate(t * 6 + i); ctx.fillStyle = i % 2 ? '#7cd34a' : '#aee571'; ctx.beginPath(); ctx.moveTo(-11, 0); ctx.quadraticCurveTo(0, -7, 11, 0); ctx.quadraticCurveTo(0, 7, -11, 0); ctx.fill(); ctx.restore(); }, 4); break;
    case 'electric': e.aura(b, '#ffd400', sec, () => ({ x: b.x + rnd(-b.r, b.r), y: b.y + rnd(-b.r, b.r), vx: rnd(-260, 260), vy: rnd(-260, 260), size: 4, shape: 'spark', color: '#fff59d', max: 0.2 }), 40); e.crackle(b, sec, '#ffe14d', 0, 3); break;
    case 'ice': e.aura(b, '#8ff4ff', sec, rising('snow', '#fff', [5, 9], { vr: 2, vy: -60 }), 25); e.orbit(b, 7, sec, (ctx, x, y, _i, t) => { ctx.save(); ctx.translate(x, y); ctx.rotate(t); ctx.fillStyle = 'rgba(210,250,255,.8)'; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(5, 0); ctx.lineTo(0, 8); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }, 2.4); break;
    case 'fighting': e.aura(b, '#ff5a36', sec, rising('flame', '#fff', [10, 18], { ramp: FIGHT, grow: 0.6 }), 45); break;
    case 'poison': e.aura(b, '#b04fd8', sec, rising('bubble', '#e1a6ff', [5, 11], { vy: -110 }), 25); break;
    case 'ground': e.aura(b, '#c99a55', sec, () => [{ x: b.x + rnd(-b.r * 1.3, b.r * 1.3), y: b.ground, vx: rnd(-40, 40), vy: rnd(-260, -120), g: 380, size: rnd(4, 8), shape: 'rock', color: '#8d6e63', max: 0.9, vr: rnd(-4, 4) }, { x: b.x + rnd(-b.r, b.r), y: b.ground, vx: rnd(-60, 60), vy: rnd(-40, -10), size: rnd(14, 24), grow: 1, shape: 'dust', color: '#bcaaa4', max: 0.9 }], 14); break;
    case 'rock': e.aura(b, '#b59a6a', sec); e.orbit(b, 6, sec, (ctx, x, y, i, t) => { ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.translate(x, y); ctx.rotate(t * 2 + i); ctx.fillStyle = '#9e8467'; ctx.strokeStyle = '#3e2f22'; ctx.lineWidth = 2; ctx.beginPath(); for (let j = 0; j < 7; j++) { const A = (j / 7) * TAU; const r = 9 + ((i * 7 + j * 3) % 5); ctx.lineTo(Math.cos(A) * r, Math.sin(A) * r * 0.85); } ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }, 2.2); break;
    case 'flying': e.aura(b, '#a8c8ff', sec, () => ({ x: b.x + rnd(-b.r, b.r), y: b.y + rnd(-b.r, b.r) * 0.6, vx: rnd(-240, 240), vy: rnd(-60, 60), size: rnd(8, 12), shape: 'feather', color: '#fff', max: 0.8, vr: rnd(-6, 6) }), 10); e.vortex({ ...b, r: b.r * 0.9 }, sec, '#e3f2fd'); break;
    case 'psychic': e.aura(b, '#ff5fa2', sec, () => ({ x: b.x, y: b.y - b.r * 0.4, size: b.r * 0.4, grow: 2.5, shape: 'ring', color: pick(['#ff80c0', '#c080ff']), max: 0.8 }), 4); e.orbit(b, 6, sec, (ctx, x, y) => ctx.drawImage(glowTex('#ff80c0'), x - 12, y - 12, 24, 24), 2.8); break;
    case 'ghost': case 'dark': e.tint('#12001f', 0.3, sec); e.aura(b, '#6a3fb0', sec, rising('wisp', '#2a0f45', [16, 28], { grow: 1, vy: -80 }), 30); break;
    case 'dragon': e.aura(b, '#6b5cff', sec, rising('flame', '#fff', [10, 18], { ramp: DRAGON, grow: 0.7 }), 50); break;
    case 'steel': e.aura(b, '#c0c8d8', sec); for (let i = 0; i < 3; i++) e.shine(b, 0.45, i * sec / 3); break;
    case 'fairy': e.aura(b, '#ff9ad5', sec, () => ({ x: b.x + rnd(-b.r, b.r) * 1.2, y: b.y + rnd(-b.r, b.r), vy: rnd(-60, -10), size: rnd(8, 14), shape: 'star', color: pick(['#ffffff', '#ffc1e3', '#fff59d']), max: rnd(0.4, 0.8) }), 30); break;
    default: e.aura(b, m.type === 'normal' ? '#fff5d0' : c, sec, rising('glow', ['#ffffff', '#fff5d0'], [6, 12], { vy: -160 }), 30);
  }
};
const chargeGather = (color: string, core = '#ffffff'): Charge => (e, b, dir, sec, m) => { chargeByType(e, b, dir, sec, m); e.gather(mouth(b, dir), b.r * 1.6, color, sec * 0.9, sec * 0.1, core); };

// ---- defaults by category
function defaultAct(m: Move): Act { return m.category === 'physical' ? 'dash' : m.category === 'status' ? 'roar' : 'blast'; }
const defaultLaunch: Launch = (e, b, dir, m) => {
  const c = TYPE_COLOR[m.type];
  if (m.category === 'physical') { dashTrail(e, b, dir, c); return 0.85; }
  e.orb(mouth(b, dir), e.exitPt(b, dir), { r: b.r * 0.3, color: c, dur: 0.55, delay: 0.15 }); return 0.8;
};
const defaultImpact: Impact = (e, b, dir, m) => {
  const c = TYPE_COLOR[m.type];
  if (m.category === 'physical') { streakIn(e, b, dir, c); hitBurst(e, b, c, 0.22); return { hitAt: 0.22 }; }
  const t = e.orb(e.entryPt(b, dir), b, { r: b.r * 0.32, color: c, dur: 0.4 }); hitBurst(e, b, c, t); return { hitAt: t };
};

// ---- shared pieces
function dashTrail(e: FxEngine, b: Body, dir: number, color: string, delay = 0.28) {
  e.stream(0.5, 70, () => ({ x: b.x - dir * b.r * rnd(0.2, 1.2), y: b.y + rnd(-b.r, b.r) * 0.8, vx: -dir * rnd(900, 1500), vy: 0, drag: 1, size: rnd(3, 7), shape: 'spark', color: Math.random() < 0.5 ? '#ffffff' : color, max: 0.25 }), delay);
  e.emit(10, () => ({ x: b.x + rnd(-b.r, b.r) * 0.6, y: b.ground, vx: -dir * rnd(60, 220), vy: rnd(-90, -20), size: rnd(14, 26), grow: 1.2, shape: 'dust', color: '#d7ccc8', max: 0.8, delay }));
}
/** Speed lines racing in from the side, converging on the target. */
function streakIn(e: FxEngine, b: Body, dir: number, color: string, dur = 0.25) {
  e.stream(dur, 90, () => { const y = b.y + rnd(-b.r, b.r) * 0.9; const x0 = dir > 0 ? rnd(-200, b.x - b.r) : rnd(b.x + b.r, e.W + 200); return { x: x0, y, vx: dir * rnd(1600, 2400), vy: 0, drag: 1, size: rnd(3, 6), shape: 'spark', color: Math.random() < 0.6 ? '#ffffff' : color, max: 0.18 }; });
}
function hitBurst(e: FxEngine, b: Body, color: string, at: number, scale = 1) {
  e.starBurst({ x: b.x, y: b.y }, b.r * 0.75 * scale, color, 0.42, at);
  e.ring({ x: b.x, y: b.y }, b.r * 0.3, b.r * 1.8 * scale, '#ffffff', 0.45, 7, at);
  e.emit(Math.round(22 * scale), () => { const a = rnd(0, TAU), v = rnd(200, 520) * scale; return { x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: rnd(3, 6), shape: 'spark', color: Math.random() < 0.5 ? '#ffffff' : color, max: rnd(0.3, 0.5), delay: at }; });
}
function flameEngulf(e: FxEngine, b: Body, at: number, dur = 1.1, ramp = FIRE) {
  e.stream(dur, 80, k => ({ x: b.x + rnd(-b.r, b.r) * (1 - k * 0.3), y: b.ground - rnd(0, b.r * 0.5), vx: rnd(-30, 30), vy: rnd(-330, -170), size: rnd(12, 24), grow: 0.9, shape: 'flame', ramp, max: rnd(0.45, 0.75) }), at);
  e.glowAt({ x: b.x, y: b.y }, b.r * 1.6, ramp[3], dur, at, 0, 0.1);
}
function splash(e: FxEngine, b: Body, at: number, n = 40, dir = 0) {
  e.emit(n, () => { const a = rnd(-Math.PI, 0) + (dir ? -dir * 0.4 : 0); const v = rnd(200, 520); return { x: b.x + rnd(-b.r, b.r) * 0.4, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900, size: rnd(3, 7), shape: 'drop', color: Math.random() < 0.4 ? '#ffffff' : '#7fd4ff', max: rnd(0.6, 1), delay: at }; });
  e.ring({ x: b.x, y: b.ground }, b.r * 0.4, b.r * 2, '#bfefff', 0.8, 5, at, 0.28, 0);
}
function rockFall(e: FxEngine, b: Body, n: number, at: number, spread = 1, size: [number, number] = [14, 26]) {
  for (let i = 0; i < n; i++) {
    const t = at + i * 0.09; const x = b.x + rnd(-b.r, b.r) * spread; const sz = rnd(size[0], size[1]);
    e.p({ x: x + rnd(-40, 40), y: -40 - rnd(0, 120), vx: rnd(-40, 40), vy: rnd(700, 950), g: 1400, drag: 1, size: sz, shape: 'rock', color: pick(['#9e8467', '#8d7a5f', '#a1887f']), max: 1.6, vr: rnd(-6, 6), floor: b.ground - sz * 0.5, delay: t - 0.3 });
    e.emit(4, () => ({ x, y: b.ground, vx: rnd(-150, 150), vy: rnd(-120, -20), size: rnd(14, 24), grow: 1.3, shape: 'dust', color: '#bcaaa4', max: 0.8, delay: t }));
  }
}
function needles(e: FxEngine, b: Body, dir: number, n: number, at = 0) {
  const from = e.entryPt(b, dir); const tt = 0.28;
  for (let i = 0; i < n; i++) { const ty = b.y + rnd(-b.r, b.r) * 0.5, tx = b.x - dir * rnd(0, b.r * 0.3); const sy = from.y + rnd(-40, 40); e.p({ x: from.x, y: sy, vx: (tx - from.x) / tt, vy: (ty - sy) / tt, drag: 1, size: 12, shape: 'needle', color: '#9c27b0', max: tt, delay: at + i * 0.07 }); e.glowAt({ x: tx, y: ty }, 26, '#c06bff', 0.3, at + tt + i * 0.07); }
  return at + tt;
}
function blobs(e: FxEngine, b: Body, dir: number, color: string, style: 'sludge' | 'mud', n = 3, at = 0) {
  let hit = 0;
  for (let i = 0; i < n; i++) { const d = at + i * 0.12; const to = { x: b.x + rnd(-b.r, b.r) * 0.4, y: b.y + rnd(-b.r, b.r) * 0.3 }; hit = e.orb(e.entryPt(b, dir), to, { r: b.r * 0.2, color, dur: 0.42, delay: d, style: 'sludge', arc: b.r * 1.2 });
    e.emit(14, () => { const a = rnd(0, TAU), v = rnd(100, 330); return { x: to.x, y: to.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, g: 700, size: rnd(4, 9), shape: 'blob', color: style === 'mud' ? pick(['#6d4c41', '#8d6e63']) : pick(['#7b2fa8', '#9c4dcc', '#ce93d8']), max: rnd(0.6, 1.0), delay: hit }; }); }
  if (style === 'sludge') e.stream(1.0, 20, () => ({ x: b.x + rnd(-b.r, b.r) * 0.8, y: b.ground - rnd(0, b.r * 0.6), vy: rnd(-120, -60), size: rnd(5, 10), shape: 'bubble', color: '#e1a6ff', max: 0.8 }), at + 0.45);
  return at + 0.42;
}

// ---- the table
const A: Record<string, MoveAnim> = {};
const set = (ids: string[], a: MoveAnim) => { for (const id of ids) A[id] = a; };

// NORMAL ------------------------------------------------------------
set(['tackle'], { act: 'dash', launch: (e, b, dir) => { dashTrail(e, b, dir, '#ffffff'); return 0.85; }, impact: (e, b, dir) => { streakIn(e, b, dir, '#ffffff'); hitBurst(e, b, '#ffd54a', 0.2); e.emit(10, () => ({ x: b.x, y: b.ground, vx: rnd(-200, 200), vy: rnd(-80, -20), size: rnd(14, 24), grow: 1.2, shape: 'dust', color: '#d7ccc8', max: 0.8, delay: 0.2 })); return { hitAt: 0.2 }; } });
set(['scratch'], { act: 'dash', launch: (e, b, dir) => { for (let i = 0; i < 3; i++) e.slash({ x: b.x + dir * b.r * 0.6, y: b.y + (i - 1) * 14 }, -Math.PI / 2 + dir * 0.5, b.r * 1.2, 7, '#ffffff', 0.28, 0.08 + i * 0.03); dashTrail(e, b, dir, '#ffffff', 0.4); return 0.85; },
  impact: (e, b, dir) => { for (let i = 0; i < 3; i++) e.slash({ x: b.x + (i - 1) * b.r * 0.3, y: b.y }, Math.PI / 2 + dir * 0.45, b.r * 2.2, 13, '#ffcdd2', 0.34, i * 0.05, 0.14); hitBurst(e, b, '#ffffff', 0.16, 0.8); return { hitAt: 0.16 }; } });
set(['quick-attack'], { act: 'dash', launch: (e, b, dir) => { dashTrail(e, b, dir, '#ffffff', 0.12); e.stream(0.4, 40, () => ({ x: b.x + rnd(-b.r, b.r), y: b.y + rnd(-b.r, b.r), vx: dir * 2400, drag: 1, size: 5, shape: 'spark', color: '#ffffff', max: 0.2 }), 0.15); return 0.55; },
  impact: (e, b, dir) => { for (let i = 0; i < 3; i++) e.slash({ x: b.x, y: b.y + (i - 1) * b.r * 0.35 }, dir > 0 ? 0.05 : Math.PI - 0.05, b.r * 3.2, 10, '#e0f7ff', 0.22, i * 0.04, 0.02); hitBurst(e, b, '#ffffff', 0.14, 0.8); return { hitAt: 0.14 }; } });
set(['body-slam'], { act: 'stomp', launch: (e, b, dir) => { e.emit(16, () => ({ x: b.x + rnd(-b.r, b.r), y: b.ground, vx: rnd(-240, 240), vy: rnd(-120, -30), size: rnd(16, 28), grow: 1.3, shape: 'dust', color: '#d7ccc8', max: 0.9, delay: 0.45 })); dashTrail(e, b, dir, '#ffffff', 0.55); return 0.9; },
  impact: (e, b) => { e.fx({ dur: 0.45, layer: 0, draw: (ctx, _t, k) => { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.5 * k; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(b.x, b.ground, b.r * (0.4 + k * 1.2), b.r * (0.12 + k * 0.3), 0, 0, TAU); ctx.fill(); } });
    hitBurst(e, { ...b, y: b.y - b.r * 0.3 }, '#ffd54a', 0.45, 1.3); e.ring({ x: b.x, y: b.ground }, b.r * 0.5, b.r * 3, '#ffffff', 0.6, 8, 0.45, 0.25, 0); e.emit(24, () => ({ x: b.x + rnd(-b.r, b.r), y: b.ground, vx: rnd(-420, 420), vy: rnd(-120, -20), size: rnd(18, 30), grow: 1.4, shape: 'dust', color: '#d7ccc8', max: 1, delay: 0.45 })); return { hitAt: 0.45, heavy: true }; } });
set(['hyper-beam'], { act: 'blast', charge: chargeGather('#ffb74d'), launch: (e, b, dir) => { e.beam(mouth(b, dir), e.exitPt(b, dir), { w: b.r * 0.55, color: '#ff9800', core: '#fffde7', dur: 0.85, grow: 0.12, style: 'spiral' }); return 0.85; },
  impact: (e, b, dir) => { e.beam(e.entryPt(b, dir), b, { w: b.r * 0.6, color: '#ff9800', core: '#fffde7', dur: 0.9, grow: 0.12, style: 'spiral' }); e.tint('#fff3e0', 0.35, 0.5, 0.12); hitBurst(e, b, '#ff9800', 0.14, 1.6); flameEngulf(e, b, 0.3, 0.7); return { hitAt: 0.14, heavy: true }; } });
set(['growl'], { act: 'roar', launch: (e, b, dir) => { e.sound(mouth(b, dir), dir, 0.9, '#ffffff'); return 0.8; }, impact: (e, b, dir) => { e.sound({ x: dir > 0 ? -40 : e.W + 40, y: b.y - b.r * 0.2 }, dir, 0.8, '#ffffff'); return { hitAt: 0.45, react: 'shine' }; } });
set(['harden'], { act: 'roar', launch: (e, b) => { e.shine(b, 0.5); e.shine(b, 0.5, 0.35); e.glowAt({ x: b.x, y: b.y }, b.r * 1.4, '#cfd8dc', 0.9, 0, 0, 0.1); return 0.9; }, impact: (_e, _b) => ({ hitAt: 0.1 }) });
set(['recover'], { act: 'rise', launch: (e, b) => { e.play('heal', b, b, '#7dff9a'); e.ring({ x: b.x, y: b.ground }, b.r * 0.3, b.r * 1.6, '#7dff9a', 0.9, 5, 0, 0.3, 0); return 1.0; }, impact: () => ({ hitAt: 0.1 }) });
// FIRE --------------------------------------------------------------
set(['ember'], { act: 'blast', launch: (e, b, dir) => { for (let i = 0; i < 3; i++) e.orb(mouth(b, dir), { x: e.exitPt(b, dir).x, y: b.y - b.r * (0.4 - i * 0.3) }, { r: b.r * 0.16, color: '#ff7a1a', dur: 0.5, delay: 0.1 + i * 0.12, style: 'fire' }); return 0.85; },
  impact: (e, b, dir) => { let h = 0; for (let i = 0; i < 3; i++) { const to = { x: b.x + rnd(-b.r, b.r) * 0.4, y: b.y + rnd(-b.r, b.r) * 0.4 }; h = e.orb({ x: e.entryPt(b, dir).x, y: to.y - 40 }, to, { r: b.r * 0.16, color: '#ff7a1a', dur: 0.36, delay: i * 0.12, style: 'fire' }); e.emit(16, () => { const a = rnd(0, TAU), v = rnd(80, 260); return { x: to.x, y: to.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, size: rnd(8, 14), grow: 0.8, shape: 'flame', ramp: FIRE, max: 0.5, delay: h }; }); } flameEngulf(e, b, 0.4, 0.7); return { hitAt: 0.36, react: 'burn' }; } });
set(['flamethrower'], { act: 'blast', launch: (e, b, dir) => { const m0 = mouth(b, dir); e.stream(0.85, 110, k => ({ x: m0.x, y: m0.y, vx: dir * rnd(750, 950), vy: rnd(-90, 90) * (0.4 + k), drag: 0.99, size: rnd(9, 15), grow: 2.2, shape: 'flame', ramp: FIRE, max: rnd(0.5, 0.7) })); e.glowAt(m0, b.r * 0.5, '#ffb74d', 0.85, 0, 1, 0.2); return 0.9; },
  impact: (e, b, dir) => { const from = e.entryPt(b, dir); e.stream(0.75, 120, () => ({ x: from.x, y: from.y + rnd(-15, 15), vx: dir * rnd(1100, 1300), vy: rnd(-40, 40) + (b.y - from.y) * 2, drag: 0.985, size: rnd(14, 22), grow: 1.6, shape: 'flame', ramp: FIRE, max: rnd(0.35, 0.5), floor: b.ground })); flameEngulf(e, b, 0.3, 1.2); e.tint('#ff6d00', 0.14, 1.2, 0.2); return { hitAt: 0.32, react: 'burn' }; } });
set(['flame-wheel'], { act: 'dash', launch: (e, b, dir) => { e.stream(0.9, 70, k => { const a = k * 30 + rnd(0, 0.5); return { x: b.x + Math.cos(a) * b.r * 0.9, y: b.y + Math.sin(a) * b.r * 0.9, vx: -dir * 120, vy: -60, size: rnd(12, 18), grow: 1, shape: 'flame', ramp: FIRE, max: 0.4 }; }); dashTrail(e, b, dir, '#ff7a1a', 0.45); return 0.9; },
  impact: (e, b, dir) => { const from = e.entryPt(b, dir); e.fx({ dur: 0.3, draw: (ctx, t, k) => { const x = from.x + (b.x - from.x) * easeIn(k); for (let i = 0; i < 14; i++) { const a = t * 26 + (i / 14) * TAU; const s = b.r * 0.35; ctx.drawImage(glowTex(FIRE[i % 4], 0.3), x + Math.cos(a) * b.r * 0.6 - s / 2, b.y + Math.sin(a) * b.r * 0.6 - s / 2, s, s); } } }); hitBurst(e, b, '#ff7a1a', 0.3); flameEngulf(e, b, 0.3, 0.8); return { hitAt: 0.3, react: 'burn' }; } });
set(['fire-blast'], { act: 'blast', charge: chargeGather('#ff7a1a', '#fff3c4'), launch: (e, b, dir) => { e.orb(mouth(b, dir), e.exitPt(b, dir), { r: b.r * 0.45, color: '#ff6d00', dur: 0.6, delay: 0.1, style: 'fire' }); return 0.8; },
  impact: (e, b, dir) => { const h = e.orb(e.entryPt(b, dir), b, { r: b.r * 0.45, color: '#ff6d00', dur: 0.35, style: 'fire' });
    // 大 : five flame arms bursting out of the target
    for (const a of [-Math.PI / 2, Math.PI, 0, Math.PI * 0.75, Math.PI * 0.25]) e.stream(0.7, 60, k => ({ x: b.x + Math.cos(a) * b.r * 1.9 * easeOut(k * 1.4), y: b.y + Math.sin(a) * b.r * 1.9 * easeOut(k * 1.4), vx: rnd(-20, 20), vy: rnd(-60, 0), size: b.r * rnd(0.22, 0.34), grow: 0.6, shape: 'flame', ramp: FIRE, max: 0.55 }), h);
    e.tint('#ff3d00', 0.22, 1.1, h); hitBurst(e, b, '#ff6d00', h, 1.4); flameEngulf(e, b, h + 0.3, 0.9); return { hitAt: h, react: 'burn', heavy: true }; } });
// WATER -------------------------------------------------------------
const jet = (thick: number): MoveAnim => ({ act: 'blast',
  launch: (e, b, dir) => { const m0 = mouth(b, dir); e.stream(0.8, 140, () => ({ x: m0.x, y: m0.y + rnd(-thick, thick) * b.r * 0.12, vx: dir * rnd(1100, 1300), vy: rnd(-20, 20), drag: 1, size: rnd(4, 7) * thick, shape: 'drop', color: Math.random() < 0.3 ? '#ffffff' : '#4fc3f7', max: 0.5 })); e.glowAt(m0, b.r * 0.35 * thick, '#81d4fa', 0.8, 0, 1, 0.2); return 0.85; },
  impact: (e, b, dir) => { const from = e.entryPt(b, dir); const to = { x: b.x - dir * b.r * 0.2, y: b.y }; const T = 0.28; e.stream(0.7, 150, () => { const y = from.y + rnd(-1, 1) * b.r * 0.12 * thick; return { x: from.x, y, vx: (to.x - from.x) / T, vy: (to.y - y) / T + rnd(-20, 20), drag: 1, size: rnd(4, 7) * thick, shape: 'drop', color: Math.random() < 0.3 ? '#ffffff' : '#29b6f6', max: T }; });
    e.stream(0.8, 50, () => { const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05) + (dir > 0 ? 0.3 : -0.3); const v = rnd(200, 480); return { x: to.x, y: to.y, vx: Math.cos(a) * v + dir * 120, vy: Math.sin(a) * v, g: 1000, size: rnd(3, 6) * Math.sqrt(thick), shape: 'drop', color: Math.random() < 0.4 ? '#ffffff' : '#81d4fa', max: 0.8 }; }, T);
    splash(e, b, T + 0.3, 20 * thick); return { hitAt: T, react: 'wet', heavy: thick > 1.5 }; } });
A['water-gun'] = jet(1); A['hydro-pump'] = jet(2.2); A['hydro-pump'].charge = chargeGather('#29b6f6');
set(['bubble-beam'], { act: 'blast', launch: (e, b, dir) => { const m0 = mouth(b, dir); e.stream(0.8, 26, () => ({ x: m0.x, y: m0.y, vx: dir * rnd(420, 640), vy: rnd(-90, 90), drag: 1, size: rnd(8, 18), shape: 'bubble', color: '#b3e5fc', max: 1.0 })); return 0.9; },
  impact: (e, b, dir) => { const from = e.entryPt(b, dir); for (let i = 0; i < 14; i++) { const ty = b.y + rnd(-b.r, b.r) * 0.6, tx = b.x + rnd(-b.r, b.r) * 0.4; const sy = from.y + rnd(-60, 60); const T = rnd(0.3, 0.45); const d = i * 0.04; e.p({ x: from.x, y: sy, vx: (tx - from.x) / T, vy: (ty - sy) / T, drag: 1, size: rnd(9, 18), shape: 'bubble', color: '#b3e5fc', max: T, delay: d }); e.ring({ x: tx, y: ty }, 8, 30, '#e1f5fe', 0.25, 3, d + T); e.emit(5, () => ({ x: tx, y: ty, vx: rnd(-160, 160), vy: rnd(-160, 160), size: 3, shape: 'drop', color: '#e1f5fe', max: 0.3, delay: d + T })); } return { hitAt: 0.35, react: 'wet' }; } });
set(['surf'], { act: 'rise', charge: chargeGather('#29b6f6'), launch: (e, b, dir) => { e.wave(dir, b.y - b.r * 1.6, 1.1, 0.05, 0); return 1.0; },
  impact: (e, b, dir) => { e.wave(dir, b.y - b.r * 1.9, 1.3, 0, 1); const hit = 0.42; splash(e, b, hit + 0.2, 40, dir); return { hitAt: hit, react: 'wet', heavy: true }; } });
// GRASS -------------------------------------------------------------
set(['razor-leaf'], { act: 'throw', charge: (e, b, dir, sec, m) => { chargeByType(e, b, dir, sec, m); e.orbit({ ...b, r: b.r * 1.3 }, 12, sec, (ctx, x, y, i, t) => { ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.translate(x, y); ctx.rotate(t * 8 + i); ctx.fillStyle = i % 2 ? '#43a047' : '#8bc34a'; ctx.beginPath(); ctx.moveTo(-16, 0); ctx.quadraticCurveTo(0, -10, 16, 0); ctx.quadraticCurveTo(0, 10, -16, 0); ctx.fill(); ctx.strokeStyle = '#1b5e20'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.stroke(); ctx.restore(); }, 5); },
  launch: (e, b, dir) => { e.stream(0.75, 34, k => ({ x: b.x + rnd(-b.r, b.r) * 0.5, y: b.y + rnd(-b.r, b.r) * 0.6, vx: dir * rnd(650, 900), vy: rnd(-200, 200) * (1 - k), drag: 1, size: rnd(15, 22), shape: 'leaf', color: pick(['#7cd34a', '#aee571', '#43a047']), max: 0.9, vr: rnd(12, 20) })); return 0.85; },
  impact: (e, b, dir) => { const from = e.entryPt(b, dir); const T = 0.3;
    for (let i = 0; i < 16; i++) { const d = i * 0.045; const ty = b.y + rnd(-b.r, b.r) * 0.7; const sy = from.y + rnd(-140, 140); e.p({ x: from.x, y: sy, vx: (b.x - from.x) / T, vy: (ty - sy) / T, drag: 1, size: rnd(16, 24), shape: 'leaf', color: pick(['#7cd34a', '#aee571', '#43a047']), max: T + 0.35, vr: 20, delay: d }); if (i % 3 === 0) e.slash({ x: b.x, y: ty }, (dir > 0 ? 0 : Math.PI) + rnd(-0.6, 0.6), b.r * 1.9, 9, '#b9f6ca', 0.26, d + T); }
    e.emit(12, () => ({ x: b.x, y: b.y, vx: rnd(-260, 260), vy: rnd(-260, 120), g: 300, size: rnd(8, 13), shape: 'leaf', color: pick(['#7cd34a', '#aee571']), max: 1, vr: rnd(-12, 12), delay: T + 0.4 }));
    return { hitAt: T }; } });
set(['vine-whip'], { act: 'swipe', launch: (e, b, dir) => { e.fx({ dur: 0.7, delay: 0.1, draw: (ctx, t, k) => { const reach = easeOut(k / 0.5); ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round'; for (const s of [-1, 1]) { const sx = b.x + dir * b.r * 0.3, sy = b.y + s * b.r * 0.2; const ex = sx + dir * (e.W) * reach, ey = sy + s * 40 * Math.sin(t * 12); ctx.strokeStyle = '#1b5e20'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo((sx + ex) / 2, sy - s * 80, ex, ey); ctx.stroke(); ctx.strokeStyle = '#66bb6a'; ctx.lineWidth = 6; ctx.stroke(); } } }); return 0.8; },
  impact: (e, b, dir) => { e.whip(b, dir, '#43a047', 0.45, 0, 1); e.whip(b, dir, '#43a047', 0.45, 0.25, -0.4); e.slash({ x: b.x, y: b.y - b.r * 0.1 }, dir > 0 ? 0.6 : Math.PI - 0.6, b.r * 2, 10, '#c5e1a5', 0.3, 0.2); e.slash({ x: b.x, y: b.y + b.r * 0.2 }, dir > 0 ? -0.5 : Math.PI + 0.5, b.r * 2, 10, '#c5e1a5', 0.3, 0.45); hitBurst(e, b, '#66bb6a', 0.22, 0.7); return { hitAt: 0.22 }; } });
set(['giga-drain'], { act: 'blast', launch: (e, b, dir) => { e.stream(0.8, 50, () => ({ x: b.x + rnd(-b.r, b.r), y: b.y + rnd(-b.r, b.r), vx: dir * rnd(500, 700), vy: rnd(-100, 100), drag: 1, size: rnd(8, 14), shape: 'glow', color: '#76ff03', max: 0.7 })); return 0.85; },
  impact: (e, b, dir) => { e.orbit(b, 12, 1.2, (ctx, x, y, i, t) => { ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.translate(x, y); ctx.rotate(t * 5 + i); ctx.fillStyle = i % 2 ? '#43a047' : '#7cd34a'; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.quadraticCurveTo(0, -7, 12, 0); ctx.quadraticCurveTo(0, 7, -12, 0); ctx.fill(); ctx.restore(); }, 5);
    e.stream(1.1, 26, () => ({ x: b.x + rnd(-b.r, b.r) * 0.6, y: b.y + rnd(-b.r, b.r) * 0.6, vx: -dir * rnd(250, 420), vy: rnd(-220, -80), drag: 0.99, size: rnd(10, 16), shape: 'glow', color: '#b2ff59', max: 0.9 }), 0.25); e.tint('#1b5e20', 0.18, 1.2); return { hitAt: 0.25 }; } });
set(['solar-beam'], { act: 'blast', charge: (e, b, dir, sec, m) => { chargeByType(e, b, dir, sec, m); e.tint('#fffde7', 0.18, sec); e.gather(mouth(b, dir), b.r * 2, '#fff176', sec, 0, '#ffffff'); e.stream(sec, 12, () => { const x = b.x + rnd(-b.r * 2, b.r * 2); return { x, y: -20, vx: (b.x - x) * 1.4, vy: 520, drag: 1, size: 5, shape: 'spark', color: '#fff9c4', max: 0.5 }; }); },
  launch: (e, b, dir) => { e.beam(mouth(b, dir), e.exitPt(b, dir), { w: b.r * 0.6, color: '#d4e157', core: '#ffffff', dur: 0.85, grow: 0.1 }); e.tint('#ffffff', 0.35, 0.35); return 0.85; },
  impact: (e, b, dir) => { e.beam(e.entryPt(b, dir), b, { w: b.r * 0.7, color: '#d4e157', core: '#ffffff', dur: 0.95, grow: 0.1 }); e.tint('#fffde7', 0.4, 0.6, 0.1); hitBurst(e, b, '#c0ca33', 0.12, 1.5); e.stream(0.8, 60, () => ({ x: b.x, y: b.y, vx: rnd(-300, 300), vy: rnd(-300, 300), size: rnd(8, 14), shape: 'flame', ramp: SUN, max: 0.5 }), 0.15); return { hitAt: 0.12, heavy: true }; } });
// ELECTRIC ----------------------------------------------------------
set(['thunder-shock'], { act: 'blast', launch: (e, b, dir) => { e.crackle(b, 0.8, '#ffe14d', 0, 4); for (let i = 0; i < 3; i++) e.bolt(mouth(b, dir), { x: e.exitPt(b, dir).x, y: b.y + rnd(-b.r, b.r) }, { w: 4, dur: 0.22, delay: 0.15 + i * 0.18 }); return 0.8; },
  impact: (e, b, dir) => { for (let i = 0; i < 3; i++) e.bolt({ x: e.entryPt(b, dir).x, y: b.y + rnd(-b.r * 1.5, b.r * 1.5) }, { x: b.x + rnd(-b.r, b.r) * 0.3, y: b.y + rnd(-b.r, b.r) * 0.3 }, { w: 4, dur: 0.25, delay: i * 0.14 }); e.crackle(b, 0.9, '#ffe14d', 0.1, 3); e.tint('#fff59d', 0.18, 0.4, 0.05); return { hitAt: 0.08, react: 'shock' }; } });
set(['thunderbolt'], { act: 'blast', charge: chargeGather('#ffe14d'), launch: (e, b, dir) => { e.crackle(b, 0.9, '#ffe14d', 0, 5); for (let i = 0; i < 5; i++) e.bolt({ x: b.x, y: b.y - b.r * 0.2 }, { x: e.exitPt(b, dir).x, y: b.y + rnd(-b.r * 2, b.r * 1.2) }, { w: 6, dur: 0.3, delay: 0.1 + i * 0.13, branches: 4 }); e.tint('#fff59d', 0.25, 0.8); return 0.85; },
  impact: (e, b, dir) => { const srcs = [e.entryPt(b, dir), { x: e.entryPt(b, dir).x, y: b.y - b.r * 2 }, { x: b.x - dir * b.r, y: -30 }, { x: e.entryPt(b, dir).x, y: b.y + b.r * 1.5 }]; srcs.forEach((s, i) => e.bolt(s, { x: b.x + rnd(-b.r, b.r) * 0.2, y: b.y + rnd(-b.r, b.r) * 0.2 }, { w: 7, dur: 0.35, delay: i * 0.1, branches: 5 })); e.crackle(b, 1.2, '#ffe14d', 0.1, 5); e.tint('#fff59d', 0.3, 0.9, 0.05); hitBurst(e, b, '#ffd400', 0.12, 1.1); return { hitAt: 0.1, react: 'shock' }; } });
set(['thunder'], { act: 'blast', charge: (e, b, dir, sec, m) => { chargeByType(e, b, dir, sec, m); e.tint('#050814', 0.45, sec + 3.5); },
  launch: (e, b) => { e.bolt({ x: b.x, y: b.y - b.r * 0.5 }, { x: b.x + rnd(-20, 20), y: -60 }, { w: 9, dur: 0.6, delay: 0.1, branches: 6 }); e.tint('#ffffff', 0.5, 0.25, 0.1); return 0.8; },
  impact: (e, b) => { e.tint('#050814', 0.45, 1.6); e.bolt({ x: b.x + rnd(-60, 60), y: -80 }, { x: b.x, y: b.y }, { w: 14, dur: 0.7, delay: 0.25, branches: 8, jitter: 120 }); e.bolt({ x: b.x + 90, y: -80 }, { x: b.x + 20, y: b.y }, { w: 6, dur: 0.4, delay: 0.35, branches: 3 }); e.tint('#ffffff', 0.85, 0.25, 0.25, 0.02); e.crackle(b, 1.2, '#ffe14d', 0.3, 6); hitBurst(e, b, '#ffd400', 0.28, 1.6); e.ring({ x: b.x, y: b.ground }, b.r * 0.4, b.r * 3.2, '#fff59d', 0.7, 8, 0.28, 0.25, 0); return { hitAt: 0.28, react: 'shock', heavy: true }; } });
set(['spark'], { act: 'dash', launch: (e, b, dir) => { e.crackle(b, 0.9, '#ffe14d', 0, 4); dashTrail(e, b, dir, '#ffe14d', 0.4); return 0.85; },
  impact: (e, b, dir) => { streakIn(e, b, dir, '#ffe14d'); e.orb(e.entryPt(b, dir), b, { r: b.r * 0.5, color: '#ffd400', dur: 0.24, style: 'electric' }); hitBurst(e, b, '#ffd400', 0.24); e.crackle(b, 0.9, '#ffe14d', 0.24, 4); return { hitAt: 0.24, react: 'shock' }; } });
// ICE ---------------------------------------------------------------
set(['powder-snow'], { act: 'blast', launch: (e, b, dir) => { const m0 = mouth(b, dir); e.stream(0.85, 60, () => ({ x: m0.x, y: m0.y, vx: dir * rnd(420, 620), vy: rnd(-120, 120), drag: 0.99, size: rnd(4, 8), shape: 'snow', color: '#fff', max: 0.9, vr: rnd(-4, 4) })); return 0.9; },
  impact: (e, b, dir) => { const from = e.entryPt(b, dir); e.stream(0.8, 80, () => ({ x: from.x, y: b.y + rnd(-b.r * 1.5, b.r * 1.5), vx: dir * rnd(700, 900), vy: rnd(-40, 40), drag: 1, size: rnd(4, 8), shape: 'snow', color: '#fff', max: 0.7, vr: rnd(-4, 4) })); e.glowAt({ x: b.x, y: b.y }, b.r * 1.3, '#b2ebf2', 1.0, 0.3, 0); return { hitAt: 0.3, react: 'freeze' }; } });
set(['ice-beam'], { act: 'blast', charge: chargeGather('#80deea'), launch: (e, b, dir) => { e.beam(mouth(b, dir), e.exitPt(b, dir), { w: b.r * 0.3, color: '#80deea', core: '#ffffff', dur: 0.85, style: 'ice' }); return 0.85; },
  impact: (e, b, dir) => { e.beam(e.entryPt(b, dir), b, { w: b.r * 0.32, color: '#80deea', core: '#ffffff', dur: 0.8, style: 'ice' }); for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; e.p({ x: b.x + Math.cos(a) * b.r * 0.8, y: b.y + Math.sin(a) * b.r * 0.75, size: rnd(16, 26), shape: 'shard', color: '#e0ffff', max: 1.2, rot: a + Math.PI / 2, delay: 0.2 + i * 0.03, drag: 1 }); } e.glowAt({ x: b.x, y: b.y }, b.r * 1.3, '#b2ebf2', 1.2, 0.2, 0); return { hitAt: 0.18, react: 'freeze' }; } });
set(['blizzard'], { act: 'blast', charge: chargeGather('#e0f7fa'), launch: (e, b, dir) => { const m0 = mouth(b, dir); e.stream(0.9, 120, () => ({ x: m0.x, y: m0.y, vx: dir * rnd(700, 1000), vy: rnd(-200, 200), drag: 1, size: rnd(4, 9), shape: Math.random() < 0.8 ? 'snow' : 'shard', color: '#fff', max: 0.8, vr: rnd(-6, 6) })); e.tint('#e0f7fa', 0.25, 0.9); return 0.9; },
  impact: (e, b, dir) => { e.tint('#eefcff', 0.55, 1.5); const from = e.entryPt(b, dir); e.stream(1.3, 160, () => ({ x: from.x, y: rnd(0, e.H), vx: dir * rnd(900, 1300), vy: rnd(60, 180), drag: 1, size: rnd(4, 10), shape: Math.random() < 0.8 ? 'snow' : 'shard', color: '#fff', max: 0.8, vr: rnd(-6, 6) })); for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; e.p({ x: b.x + Math.cos(a) * b.r * 0.8, y: b.y + Math.sin(a) * b.r * 0.75, size: rnd(18, 28), shape: 'shard', color: '#e0ffff', max: 1.2, rot: a + Math.PI / 2, delay: 0.4 + i * 0.03, drag: 1 }); } return { hitAt: 0.35, react: 'freeze', heavy: true }; } });
// FIGHTING ----------------------------------------------------------
set(['karate-chop'], { act: 'swipe', launch: (e, b, dir) => { e.slash({ x: b.x + dir * b.r * 0.6, y: b.y }, -Math.PI / 2 + dir * 0.3, b.r * 1.6, 12, '#ffab91', 0.35, 0.15); dashTrail(e, b, dir, '#ffab91', 0.45); return 0.85; },
  impact: (e, b, dir) => { e.slash({ x: b.x, y: b.y }, Math.PI / 2 + dir * 0.25, b.r * 2.6, 20, '#ff7043', 0.36, 0.05, 0.1); hitBurst(e, b, '#ff7043', 0.16); return { hitAt: 0.16 }; } });
set(['brick-break'], { act: 'swipe', launch: (e, b, dir) => { e.slash({ x: b.x + dir * b.r * 0.6, y: b.y }, -Math.PI / 2 + dir * 0.3, b.r * 1.6, 12, '#ffab91', 0.35, 0.15); dashTrail(e, b, dir, '#ff7043', 0.45); return 0.85; },
  impact: (e, b, dir) => { e.slash({ x: b.x, y: b.y }, Math.PI / 2 + dir * 0.2, b.r * 2.8, 24, '#ff5722', 0.38, 0, 0.08); hitBurst(e, b, '#ff5722', 0.16, 1.2); e.fx({ dur: 0.9, delay: 0.16, draw: (ctx, _t, k) => { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + Math.cos(a) * b.r * 0.4, b.y + Math.sin(a) * b.r * 0.4); ctx.lineTo(b.x + Math.cos(a + 0.2) * b.r * 0.8, b.y + Math.sin(a + 0.2) * b.r * 0.8); ctx.stroke(); } } }); return { hitAt: 0.16 }; } });
set(['close-combat'], { act: 'dash', launch: (e, b, dir) => { dashTrail(e, b, dir, '#ff5722', 0.3); return 0.85; },
  impact: (e, b, dir) => { streakIn(e, b, dir, '#ff8a65', 0.9); for (let i = 0; i < 7; i++) { const c = { x: b.x + rnd(-b.r, b.r) * 0.6, y: b.y + rnd(-b.r, b.r) * 0.6 }; e.starBurst(c, b.r * rnd(0.35, 0.55), '#ff5722', 0.25, 0.1 + i * 0.1); e.ring(c, 6, b.r * 0.7, '#ffffff', 0.25, 4, 0.1 + i * 0.1); } hitBurst(e, b, '#ff3d00', 0.85, 1.4); return { hitAt: 0.1, heavy: true }; } });
// POISON / GROUND / ROCK -------------------------------------------
set(['poison-sting'], { act: 'throw', launch: (e, b, dir) => { const m0 = mouth(b, dir); for (let i = 0; i < 4; i++) e.p({ x: m0.x, y: m0.y + (i - 1.5) * 12, vx: dir * 1500, vy: 0, drag: 1, size: 12, shape: 'needle', color: '#9c27b0', max: 0.5, delay: 0.15 + i * 0.08 }); return 0.7; },
  impact: (e, b, dir) => { const h = needles(e, b, dir, 5); e.stream(0.8, 18, () => ({ x: b.x + rnd(-b.r, b.r) * 0.6, y: b.y + rnd(-b.r, b.r) * 0.3, vy: rnd(-120, -60), size: rnd(5, 10), shape: 'bubble', color: '#e1a6ff', max: 0.8 }), h + 0.1); return { hitAt: h, react: 'poison' }; } });
set(['sludge-bomb'], { act: 'throw', launch: (e, b, dir) => { for (let i = 0; i < 3; i++) e.orb(mouth(b, dir), { x: e.exitPt(b, dir).x, y: b.y - b.r * 0.8 }, { r: b.r * 0.22, color: '#8e3fbf', dur: 0.55, delay: 0.1 + i * 0.12, style: 'sludge', arc: b.r * 1.5 }); return 0.9; }, impact: (e, b, dir) => ({ hitAt: blobs(e, b, dir, '#8e3fbf', 'sludge', 3), react: 'poison' }) });
set(['mud-slap'], { act: 'throw', launch: (e, b, dir) => { for (let i = 0; i < 3; i++) e.orb(mouth(b, dir), { x: e.exitPt(b, dir).x, y: b.y - b.r * 0.5 }, { r: b.r * 0.16, color: '#6d4c41', dur: 0.5, delay: 0.1 + i * 0.1, style: 'sludge', arc: b.r }); return 0.8; }, impact: (e, b, dir) => ({ hitAt: blobs(e, b, dir, '#6d4c41', 'mud', 3) }) });
set(['earthquake'], { act: 'stomp', launch: (e, b) => { e.cracks(b, b.r * 2.4, 1.2, 0.45); e.emit(20, () => ({ x: b.x + rnd(-b.r * 1.5, b.r * 1.5), y: b.ground, vx: rnd(-80, 80), vy: rnd(-320, -120), g: 900, size: rnd(5, 10), shape: 'rock', color: '#8d6e63', max: 1, vr: rnd(-6, 6), delay: 0.45 })); e.ring({ x: b.x, y: b.ground }, b.r * 0.4, b.r * 3.2, '#d7ccc8', 0.7, 8, 0.45, 0.25, 0); return 0.95; },
  impact: (e, b) => { e.cracks(b, b.r * 3, 1.8, 0.05); e.emit(30, () => ({ x: b.x + rnd(-b.r * 2, b.r * 2), y: b.ground, vx: rnd(-120, 120), vy: rnd(-520, -220), g: 1100, size: rnd(6, 14), shape: 'rock', color: pick(['#8d6e63', '#a1887f', '#6d4c41']), max: 1.3, vr: rnd(-8, 8), floor: b.ground, delay: 0.1 })); e.emit(16, () => ({ x: b.x + rnd(-b.r * 1.5, b.r * 1.5), y: b.ground, vx: rnd(-200, 200), vy: rnd(-80, -20), size: rnd(20, 34), grow: 1.4, shape: 'dust', color: '#bcaaa4', max: 1.1, delay: 0.1 })); e.tint('#5d4037', 0.18, 1.2); return { hitAt: 0.12, heavy: true }; } });
set(['dig'], { act: 'burrow', launch: (e, b) => { e.emit(30, () => ({ x: b.x + rnd(-b.r, b.r) * 0.7, y: b.ground, vx: rnd(-260, 260), vy: rnd(-420, -160), g: 1000, size: rnd(4, 9), shape: 'rock', color: pick(['#8d6e63', '#6d4c41']), max: 1, vr: rnd(-8, 8), delay: 0.15 })); e.emit(12, () => ({ x: b.x + rnd(-b.r, b.r) * 0.6, y: b.ground, vx: rnd(-120, 120), vy: rnd(-60, -10), size: rnd(18, 28), grow: 1.2, shape: 'dust', color: '#bcaaa4', max: 0.9, delay: 0.15 })); return 0.9; },
  impact: (e, b) => { e.cracks(b, b.r * 1.6, 1.2, 0); e.emit(36, () => ({ x: b.x + rnd(-b.r, b.r) * 0.6, y: b.ground, vx: rnd(-240, 240), vy: rnd(-700, -360), g: 1200, size: rnd(6, 13), shape: 'rock', color: pick(['#8d6e63', '#a1887f', '#6d4c41']), max: 1.2, vr: rnd(-8, 8), floor: b.ground, delay: 0.3 })); hitBurst(e, { ...b, y: b.ground - b.r * 0.3 }, '#a1887f', 0.3, 1.1); return { hitAt: 0.3, heavy: true }; } });
set(['rock-throw'], { act: 'throw', launch: (e, b, dir) => { for (let i = 0; i < 2; i++) e.p({ x: b.x + dir * b.r * 0.4, y: b.y - b.r * 0.3, vx: dir * rnd(700, 850), vy: rnd(-420, -320), g: 900, drag: 1, size: rnd(16, 22), shape: 'rock', color: '#9e8467', max: 0.9, vr: rnd(-8, 8), delay: 0.15 + i * 0.15 }); return 0.85; },
  impact: (e, b, dir) => { const from = e.entryPt(b, dir); for (let i = 0; i < 3; i++) { const T = 0.42, d = i * 0.1; const tx = b.x + rnd(-b.r, b.r) * 0.3, ty = b.y + rnd(-b.r, b.r) * 0.3; const sy = b.y - b.r * 1.5; e.p({ x: from.x, y: sy, vx: (tx - from.x) / T, vy: (ty - sy) / T - 0.5 * 900 * T, g: 900, drag: 1, size: rnd(16, 24), shape: 'rock', color: pick(['#9e8467', '#8d7a5f']), max: T + 0.5, vr: rnd(-8, 8), floor: b.ground, delay: d }); e.starBurst({ x: tx, y: ty }, b.r * 0.4, '#bcaaa4', 0.3, d + T); } return { hitAt: 0.42 }; } });
set(['rock-slide'], { act: 'throw', launch: (e, b) => { e.emit(8, () => ({ x: b.x + rnd(-b.r, b.r), y: b.ground, vx: rnd(-80, 80), vy: rnd(-900, -700), drag: 1, size: rnd(14, 22), shape: 'rock', color: '#9e8467', max: 0.9, vr: rnd(-6, 6), delay: rnd(0.1, 0.4) })); return 0.9; },
  impact: (e, b) => { rockFall(e, b, 9, 0.3, 1.3); return { hitAt: 0.3, heavy: true }; } });
// FLYING ------------------------------------------------------------
set(['gust'], { act: 'swipe', launch: (e, b, dir) => { for (let i = 0; i < 4; i++) e.slash({ x: b.x + dir * b.r * 1.2, y: b.y + (i - 1.5) * b.r * 0.4 }, dir > 0 ? 0.1 : Math.PI - 0.1, b.r * 2, 8, '#e3f2fd', 0.4, 0.1 + i * 0.1, 0.35); return 0.8; },
  impact: (e, b, dir) => { e.vortex(b, 1.0, '#e3f2fd', 0.1); for (let i = 0; i < 4; i++) e.slash({ x: b.x, y: b.y + (i - 1.5) * b.r * 0.4 }, dir > 0 ? 0.15 : Math.PI - 0.15, b.r * 2.4, 8, '#e3f2fd', 0.35, i * 0.08, 0.35); return { hitAt: 0.15 }; } });
set(['hurricane'], { act: 'rise', charge: (e, b, dir, sec, m) => { chargeByType(e, b, dir, sec, m); e.tint('#263238', 0.3, sec + 3); },
  launch: (e, b, dir) => { e.vortex({ ...b, x: b.x + dir * b.r * 0.4 }, 0.9, '#eceff1'); e.stream(0.9, 60, () => ({ x: rnd(0, e.W), y: -20, vx: dir * 300, vy: 1200, drag: 1, size: 3, shape: 'spark', color: '#b0bec5', max: 0.6 })); return 0.9; },
  impact: (e, b, dir) => { e.tint('#263238', 0.3, 1.6); e.vortex(b, 1.4, '#eceff1', 0); e.vortex({ ...b, r: b.r * 1.3 }, 1.4, '#cfd8dc', 0.1); e.stream(1.4, 70, () => ({ x: rnd(0, e.W), y: -20, vx: dir * 300, vy: 1300, drag: 1, size: 3, shape: 'spark', color: '#b0bec5', max: 0.6 })); return { hitAt: 0.3, heavy: true }; } });
set(['wing-attack'], { act: 'swipe', launch: (e, b, dir) => { e.emit(12, () => ({ x: b.x + rnd(-b.r, b.r), y: b.y + rnd(-b.r, b.r) * 0.5, vx: dir * rnd(200, 500), vy: rnd(-100, 100), size: rnd(8, 12), shape: 'feather', color: '#fff', max: 0.9, vr: rnd(-6, 6), delay: 0.2 })); dashTrail(e, b, dir, '#ffffff', 0.35); return 0.85; },
  impact: (e, b, dir) => { e.slash({ x: b.x, y: b.y }, dir > 0 ? 0.35 : Math.PI - 0.35, b.r * 2.8, 22, '#e3f2fd', 0.38, 0.05, 0.3); e.slash({ x: b.x, y: b.y + 10 }, dir > 0 ? -0.35 : Math.PI + 0.35, b.r * 2.8, 22, '#e3f2fd', 0.38, 0.22, -0.3); e.emit(14, () => ({ x: b.x, y: b.y, vx: rnd(-300, 300), vy: rnd(-300, 100), size: rnd(8, 12), shape: 'feather', color: '#fff', max: 1, vr: rnd(-8, 8), g: 200, delay: 0.2 })); hitBurst(e, b, '#90caf9', 0.2, 0.8); return { hitAt: 0.2 }; } });
set(['drill-peck'], { act: 'dash', launch: (e, b, dir) => { dashTrail(e, b, dir, '#ffe082', 0.3); return 0.85; }, impact: (e, b, dir) => { e.drill(e.entryPt(b, dir), b, dir, 0.35); e.stream(0.4, 60, () => ({ x: b.x - dir * b.r * 0.4, y: b.y, vx: rnd(-300, 300), vy: rnd(-300, 300), size: 4, shape: 'spark', color: '#fff8e1', max: 0.3 }), 0.35); hitBurst(e, b, '#ffca28', 0.35); return { hitAt: 0.35 }; } });
// PSYCHIC -----------------------------------------------------------
const psyRings = (e: FxEngine, b: Body, dur: number, delay: number, strong: boolean) => { e.stream(dur, strong ? 10 : 6, () => ({ x: b.x, y: b.y, size: b.r * 2.2, grow: -0.85, shape: 'ring', color: pick(['#ff80c0', '#c080ff', '#80d8ff']), max: 0.6 }), delay); e.glowAt({ x: b.x, y: b.y }, b.r * 1.5, '#ff5fa2', dur, delay, 0, 0.15); if (strong) e.tint('#4a0072', 0.25, dur, delay); };
set(['confusion'], { act: 'rise', launch: (e, b, dir) => { e.stream(0.8, 8, () => ({ x: b.x, y: b.y - b.r * 0.3, vx: dir * 380, size: b.r * 0.5, grow: 1.5, shape: 'ring', color: pick(['#ff80c0', '#c080ff']), max: 0.8 })); return 0.85; }, impact: (e, b) => { psyRings(e, b, 1.0, 0, false); return { hitAt: 0.25, react: 'warp' }; } });
set(['psychic'], { act: 'rise', charge: chargeGather('#ff5fa2', '#ffe0f0'), launch: (e, b, dir) => { e.stream(0.85, 12, () => ({ x: b.x, y: b.y - b.r * 0.3, vx: dir * 420, size: b.r * 0.5, grow: 2, shape: 'ring', color: pick(['#ff80c0', '#c080ff', '#80d8ff']), max: 0.8 })); e.tint('#4a0072', 0.2, 0.85); return 0.85; }, impact: (e, b) => { psyRings(e, b, 1.3, 0, true); e.stream(1.0, 30, () => ({ x: b.x + rnd(-b.r, b.r) * 1.2, y: b.y + rnd(-b.r, b.r), size: rnd(8, 12), shape: 'star', color: '#ffc1e3', max: 0.4 }), 0.2); return { hitAt: 0.3, react: 'warp', heavy: true }; } });
set(['psybeam'], { act: 'blast', launch: (e, b, dir) => { e.beam(mouth(b, dir), e.exitPt(b, dir), { w: b.r * 0.3, color: '#f06292', dur: 0.85, style: 'rings' }); return 0.85; }, impact: (e, b, dir) => { e.beam(e.entryPt(b, dir), b, { w: b.r * 0.32, color: '#f06292', dur: 0.8, style: 'rings' }); psyRings(e, b, 0.8, 0.15, false); return { hitAt: 0.15, react: 'warp' }; } });
// BUG ---------------------------------------------------------------
set(['bug-bite'], { act: 'dash', launch: (e, b, dir) => { dashTrail(e, b, dir, '#9ccc65', 0.35); return 0.85; }, impact: (e, b) => { e.fangs({ x: b.x, y: b.y }, b.r * 0.8, '#7cb342', 0.7); hitBurst(e, b, '#9ccc65', 0.24, 0.8); return { hitAt: 0.24 }; } });
set(['x-scissor'], { act: 'swipe', launch: (e, b, dir) => { e.slash({ x: b.x + dir * b.r * 0.5, y: b.y }, 0.8, b.r * 1.4, 10, '#c5e1a5', 0.3, 0.1); e.slash({ x: b.x + dir * b.r * 0.5, y: b.y }, -0.8, b.r * 1.4, 10, '#c5e1a5', 0.3, 0.2); dashTrail(e, b, dir, '#9ccc65', 0.4); return 0.85; },
  impact: (e, b) => { e.slash({ x: b.x, y: b.y }, 0.8, b.r * 2.8, 20, '#aed581', 0.36, 0, 0.08); e.slash({ x: b.x, y: b.y }, -0.8, b.r * 2.8, 20, '#aed581', 0.36, 0.1, -0.08); hitBurst(e, b, '#9ccc65', 0.2, 1.1); return { hitAt: 0.2 }; } });
// GHOST / DARK ------------------------------------------------------
set(['lick'], { act: 'swipe', launch: (e, b, dir) => { e.stream(0.8, 30, () => ({ x: b.x + rnd(-b.r, b.r), y: b.y + rnd(-b.r, b.r), vx: dir * rnd(300, 500), vy: rnd(-60, 60), size: rnd(16, 26), grow: 1, shape: 'wisp', color: '#2a0f45', max: 0.8 })); return 0.85; },
  impact: (e, b, dir) => { e.fx({ dur: 0.7, draw: (ctx, _t, k) => { const reach = easeOut(k / 0.5) - clamp01((k - 0.6) / 0.4); if (reach <= 0) return; const sx = dir > 0 ? -40 : e.W + 40; const ex = sx + dir * (Math.abs(b.x - sx) + b.r * 0.6) * reach; ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round'; ctx.strokeStyle = '#ad1457'; ctx.lineWidth = b.r * 0.34; ctx.beginPath(); ctx.moveTo(sx, b.y + b.r * 0.4); ctx.quadraticCurveTo((sx + ex) / 2, b.y + b.r * 0.9, ex, b.y - b.r * 0.2 * reach); ctx.stroke(); ctx.strokeStyle = '#f48fb1'; ctx.lineWidth = b.r * 0.24; ctx.stroke(); } }); e.tint('#12001f', 0.3, 1.0); return { hitAt: 0.3, react: 'dark' }; } });
set(['shadow-ball'], { act: 'blast', charge: chargeGather('#7c4dff', '#1b0930'), launch: (e, b, dir) => { e.orb(mouth(b, dir), e.exitPt(b, dir), { r: b.r * 0.42, color: '#7c4dff', dur: 0.6, delay: 0.15, style: 'shadow' }); return 0.85; },
  impact: (e, b, dir) => { const h = e.orb(e.entryPt(b, dir), b, { r: b.r * 0.45, color: '#7c4dff', dur: 0.4, style: 'shadow' }); e.emit(30, () => { const a = rnd(0, TAU), v = rnd(100, 380); return { x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: rnd(18, 30), grow: 1, shape: 'wisp', color: '#2a0f45', max: rnd(0.6, 1), delay: h }; }); e.ring({ x: b.x, y: b.y }, b.r * 0.3, b.r * 2, '#b388ff', 0.5, 7, h); e.tint('#12001f', 0.35, 1.0, h - 0.1); return { hitAt: h, react: 'dark' }; } });
set(['bite'], { act: 'dash', launch: (e, b, dir) => { dashTrail(e, b, dir, '#5e35b1', 0.35); return 0.85; }, impact: (e, b) => { e.fangs({ x: b.x, y: b.y }, b.r * 0.85, '#4527a0', 0.75); hitBurst(e, b, '#7e57c2', 0.25, 0.9); return { hitAt: 0.25 }; } });
set(['crunch'], { act: 'dash', launch: (e, b, dir) => { dashTrail(e, b, dir, '#5e35b1', 0.35); return 0.85; }, impact: (e, b) => { e.tint('#12001f', 0.3, 1.0); e.fangs({ x: b.x, y: b.y }, b.r * 1.05, '#311b92', 0.8); hitBurst(e, b, '#7e57c2', 0.26, 1.3); e.emit(24, () => ({ x: b.x, y: b.y, vx: rnd(-300, 300), vy: rnd(-300, 300), size: rnd(16, 26), grow: 1, shape: 'wisp', color: '#2a0f45', max: 0.8, delay: 0.26 })); return { hitAt: 0.26, react: 'dark', heavy: true }; } });
// DRAGON ------------------------------------------------------------
set(['dragon-breath'], { act: 'blast', launch: (e, b, dir) => { const m0 = mouth(b, dir); e.stream(0.85, 100, k => ({ x: m0.x, y: m0.y, vx: dir * rnd(700, 900), vy: rnd(-80, 80) * (0.4 + k), drag: 0.99, size: rnd(9, 14), grow: 2.2, shape: 'flame', ramp: DRAGON, max: rnd(0.5, 0.7) })); return 0.9; },
  impact: (e, b, dir) => { const from = e.entryPt(b, dir); e.stream(0.7, 110, () => ({ x: from.x, y: from.y + rnd(-15, 15), vx: dir * rnd(1100, 1300), vy: rnd(-40, 40) + (b.y - from.y) * 2, drag: 0.985, size: rnd(14, 22), grow: 1.6, shape: 'flame', ramp: DRAGON, max: rnd(0.35, 0.5) })); flameEngulf(e, b, 0.3, 0.9, DRAGON); return { hitAt: 0.3 }; } });
set(['dragon-claw'], { act: 'swipe', launch: (e, b, dir) => { for (let i = 0; i < 3; i++) e.slash({ x: b.x + dir * b.r * 0.6, y: b.y + (i - 1) * 16 }, -Math.PI / 2 + dir * 0.6, b.r * 1.5, 10, '#7c4dff', 0.3, 0.1 + i * 0.03); dashTrail(e, b, dir, '#7c4dff', 0.4); return 0.85; },
  impact: (e, b, dir) => { for (let i = 0; i < 3; i++) e.slash({ x: b.x + (i - 1) * b.r * 0.35, y: b.y }, Math.PI / 2 + dir * 0.5, b.r * 2.6, 18, '#7c4dff', 0.38, i * 0.05, 0.15); hitBurst(e, b, '#651fff', 0.18, 1.1); flameEngulf(e, b, 0.2, 0.5, DRAGON); return { hitAt: 0.18 }; } });
set(['draco-meteor'], { act: 'blast', charge: chargeGather('#7c4dff'), launch: (e, b) => { e.orb({ x: b.x, y: b.y - b.r * 0.4 }, { x: b.x + rnd(-30, 30), y: -120 }, { r: b.r * 0.4, color: '#7c4dff', dur: 0.6, delay: 0.1, style: 'meteor' }); return 0.85; },
  impact: (e, b, dir) => { e.tint('#0d0630', 0.35, 1.8); let last = 0; for (let i = 0; i < 6; i++) { const to = { x: b.x + rnd(-b.r, b.r) * 1.2, y: b.y + rnd(-b.r, b.r) * 0.6 }; const d = i * 0.14; last = e.orb({ x: to.x - dir * 260, y: -80 }, to, { r: b.r * rnd(0.2, 0.3), color: '#b388ff', dur: 0.4, delay: d, style: 'meteor' }); e.starBurst(to, b.r * 0.55, '#7c4dff', 0.35, last); e.emit(10, () => ({ x: to.x, y: to.y, vx: rnd(-240, 240), vy: rnd(-260, 60), size: rnd(10, 18), grow: 0.6, shape: 'flame', ramp: DRAGON, max: 0.5, delay: last })); } void last; return { hitAt: 0.4, heavy: true }; } });
// STEEL / FAIRY -----------------------------------------------------
set(['iron-head'], { act: 'dash', launch: (e, b, dir) => { e.shine(b, 0.45); e.shine(b, 0.45, 0.3); dashTrail(e, b, dir, '#cfd8dc', 0.45); return 0.9; },
  impact: (e, b, dir) => { streakIn(e, b, dir, '#eceff1'); hitBurst(e, b, '#90a4ae', 0.22, 1.2); e.emit(20, () => ({ x: b.x, y: b.y, vx: rnd(-420, 420), vy: rnd(-420, 200), g: 500, size: rnd(3, 5), shape: 'spark', color: '#fffde7', max: 0.5, delay: 0.22 })); return { hitAt: 0.22 }; } });
set(['dazzling-gleam'], { act: 'rise', launch: (e, b) => { e.glowAt({ x: b.x, y: b.y }, b.r * 2.2, '#ff9ad5', 0.8, 0, 1, 0.15); e.tint('#ffffff', 0.4, 0.5, 0.3); e.emit(24, () => { const a = rnd(0, TAU), v = rnd(200, 500); return { x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: rnd(10, 18), shape: 'star', color: pick(['#ffffff', '#ffc1e3', '#fff59d']), max: 0.7, delay: 0.3 }; }); return 0.9; },
  impact: (e, b) => { e.tint('#ffffff', 0.55, 0.45, 0, 0.02); e.stream(0.9, 50, () => ({ x: b.x + rnd(-b.r, b.r) * 1.5, y: b.y + rnd(-b.r, b.r) * 1.2, size: rnd(12, 22), shape: 'star', color: pick(['#ffffff', '#ffc1e3', '#b3e5fc', '#fff59d']), max: rnd(0.3, 0.6) }), 0.05); e.ring({ x: b.x, y: b.y }, b.r * 0.3, b.r * 2.2, '#ff80c0', 0.6, 8, 0.1); return { hitAt: 0.1, react: 'shine' }; } });
set(['moonblast'], { act: 'blast', charge: (e, b, dir, sec, m) => { chargeByType(e, b, dir, sec, m); e.tint('#1a0033', 0.3, sec); e.glowAt({ x: b.x, y: b.y - b.r * 2 }, b.r * 0.9, '#f8bbd0', sec, 0.2, 1, 0.08); e.gather({ x: b.x, y: b.y - b.r * 2 }, b.r * 1.4, '#ff80c0', sec * 0.8, 0.2); },
  launch: (e, b, dir) => { e.orb({ x: b.x, y: b.y - b.r * 1.6 }, e.exitPt(b, dir), { r: b.r * 0.5, color: '#ff80c0', dur: 0.6, delay: 0.1, style: 'moon' }); return 0.8; },
  impact: (e, b, dir) => { const h = e.orb({ x: e.entryPt(b, dir).x, y: b.y - b.r * 2 }, b, { r: b.r * 0.55, color: '#ff80c0', dur: 0.4, style: 'moon' }); e.tint('#ffffff', 0.5, 0.35, h, 0.02); hitBurst(e, b, '#ff80c0', h, 1.3); e.emit(24, () => ({ x: b.x, y: b.y, vx: rnd(-360, 360), vy: rnd(-360, 360), size: rnd(10, 18), shape: 'star', color: pick(['#ffffff', '#ffc1e3']), max: 0.7, delay: h })); return { hitAt: h, heavy: true }; } });

const ANIMS = A;
/** Moves with a hand-made animation (the rest fall back to a type-coloured generic one). */
export const ANIMATED_MOVES = Object.keys(A);
