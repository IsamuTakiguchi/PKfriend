// Canvas particle effects for moves. Imperative API used by BattleStage.
import type { MoveFx } from '@pkfriend/shared';

interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; shape: 'dot' | 'leaf' | 'crystal' | 'ring' | 'spark' | 'star' | 'arrow'; rot: number; vr: number; grav: number; }
interface Beam { x1: number; y1: number; x2: number; y2: number; t: number; dur: number; color: string; width: number; jag: boolean; }

export class FxEngine {
  private ps: P[] = []; private beams: Beam[] = []; private raf = 0; private last = 0;
  constructor(private canvas: HTMLCanvasElement) { this.resize(); }
  resize() { const r = this.canvas.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1); this.canvas.width = r.width * dpr; this.canvas.height = r.height * dpr; this.canvas.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0); }
  private start() { if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(t => this.tick(t)); } }
  destroy() { cancelAnimationFrame(this.raf); this.raf = 0; }

  private emit(n: number, f: (i: number) => Partial<P> & { x: number; y: number }) {
    for (let i = 0; i < n; i++) { const p = f(i); this.ps.push({ vx: 0, vy: 0, life: 0, max: 0.8, size: 4, color: '#fff', shape: 'dot', rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 6, grav: 0, ...p }); }
    this.start();
  }
  private beam(b: Omit<Beam, 't'>) { this.beams.push({ ...b, t: 0 }); this.start(); }

  play(fx: MoveFx, from: { x: number; y: number }, to: { x: number; y: number }, color: string) {
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    switch (fx) {
      case 'impact':
        this.emit(26, () => ({ x: to.x, y: to.y, vx: rnd(-320, 320), vy: rnd(-320, 320), size: rnd(3, 8), color: Math.random() < 0.5 ? '#fff' : color, max: rnd(0.3, 0.6), shape: 'spark' }));
        this.emit(6, i => ({ x: to.x, y: to.y, vx: Math.cos(i) * 60, vy: Math.sin(i) * 60, size: 18, color: '#fff', max: 0.35, shape: 'star' }));
        break;
      case 'slash':
        for (let k = 0; k < 3; k++) setTimeout(() => { const o = (k - 1) * 28; this.beam({ x1: to.x - 60 + o, y1: to.y - 70 + o, x2: to.x + 60 + o, y2: to.y + 70 + o, dur: 0.25, color: '#fff', width: 6, jag: false }); this.emit(10, () => ({ x: to.x + o, y: to.y + o, vx: rnd(-200, 200), vy: rnd(-200, 200), size: 3, color, max: 0.4, shape: 'spark' })); }, k * 90);
        break;
      case 'beam':
        this.beam({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, dur: 0.7, color, width: 26, jag: false });
        this.emit(40, () => ({ x: to.x, y: to.y, vx: rnd(-260, 260), vy: rnd(-260, 260), size: rnd(3, 7), color: Math.random() < 0.4 ? '#fff' : color, max: rnd(0.4, 0.8), shape: 'dot' }));
        break;
      case 'shock':
        for (let k = 0; k < 4; k++) setTimeout(() => this.beam({ x1: from.x, y1: from.y, x2: to.x + rnd(-30, 30), y2: to.y + rnd(-30, 30), dur: 0.18, color: k % 2 ? '#fff' : color, width: 5, jag: true }), k * 110);
        this.emit(30, () => ({ x: to.x, y: to.y, vx: rnd(-300, 300), vy: rnd(-300, 300), size: rnd(2, 5), color, max: 0.5, shape: 'spark' }));
        setTimeout(() => this.emit(12, i => ({ x: to.x, y: to.y, vx: Math.cos(i / 12 * 6.28) * 200, vy: Math.sin(i / 12 * 6.28) * 200, size: 10, color, max: 0.4, shape: 'ring' })), 300);
        break;
      case 'wave':
        this.emit(14, i => ({ x: from.x + Math.cos(ang) * i * 12, y: from.y + Math.sin(ang) * i * 12, vx: Math.cos(ang) * 420, vy: Math.sin(ang) * 420, size: 20 + i * 4, color, max: 0.9, shape: 'ring' }));
        setTimeout(() => this.emit(40, () => ({ x: to.x, y: to.y, vx: rnd(-200, 200), vy: rnd(-350, -50), size: rnd(3, 8), color: Math.random() < 0.5 ? '#fff' : color, max: rnd(0.5, 1), grav: 700, shape: 'dot' })), 350);
        break;
      case 'leaf':
        this.emit(28, i => ({ x: from.x + rnd(-30, 30), y: from.y + rnd(-30, 30), vx: Math.cos(ang) * rnd(380, 560) + rnd(-80, 80), vy: Math.sin(ang) * rnd(380, 560) + rnd(-80, 80), size: rnd(8, 14), color: i % 3 ? color : '#c8ff9a', max: rnd(0.5, 0.8), shape: 'leaf', vr: rnd(-14, 14) }));
        break;
      case 'ice':
        this.emit(24, () => ({ x: to.x + rnd(-40, 40), y: to.y + rnd(-40, 40), vx: rnd(-60, 60), vy: rnd(-120, -20), size: rnd(10, 22), color: '#cfffff', max: rnd(0.7, 1.1), shape: 'crystal', vr: rnd(-2, 2) }));
        this.emit(40, () => ({ x: to.x, y: to.y, vx: rnd(-250, 250), vy: rnd(-250, 250), size: rnd(2, 5), color: '#fff', max: 0.8, shape: 'dot' }));
        break;
      case 'aura':
        this.emit(18, i => ({ x: from.x, y: from.y, vx: Math.cos(ang) * rnd(300, 500) + Math.cos(i) * 60, vy: Math.sin(ang) * rnd(300, 500) + Math.sin(i) * 60, size: rnd(10, 22), color: i % 2 ? color : '#2a0a3a', max: rnd(0.6, 0.9), shape: 'dot' }));
        setTimeout(() => this.emit(20, () => ({ x: to.x, y: to.y, vx: rnd(-200, 200), vy: rnd(-200, 200), size: rnd(8, 18), color, max: 0.7, shape: 'dot' })), 400);
        break;
      case 'quake':
        this.emit(60, () => ({ x: rnd(0, this.canvas.clientWidth), y: this.canvas.clientHeight, vx: rnd(-80, 80), vy: rnd(-500, -150), size: rnd(4, 12), color: Math.random() < 0.5 ? '#c9a36b' : '#7a5a2e', max: rnd(0.8, 1.4), grav: 900, shape: 'dot' }));
        this.emit(20, () => ({ x: to.x + rnd(-50, 50), y: to.y + 40, vx: rnd(-60, 60), vy: rnd(-400, -200), size: rnd(8, 16), color: '#a67c52', max: 1, grav: 800, shape: 'star' }));
        break;
      case 'wind':
        this.emit(30, i => ({ x: from.x + rnd(-40, 40), y: from.y + rnd(-40, 40), vx: Math.cos(ang) * rnd(400, 600), vy: Math.sin(ang) * rnd(400, 600), size: rnd(14, 30), color: i % 2 ? '#fff' : color, max: rnd(0.5, 0.8), shape: 'ring' }));
        break;
      case 'poison':
        this.emit(22, () => ({ x: to.x + rnd(-40, 40), y: to.y + rnd(-20, 40), vx: rnd(-40, 40), vy: rnd(-160, -60), size: rnd(8, 18), color: Math.random() < 0.5 ? color : '#c96bff', max: rnd(0.8, 1.2), shape: 'ring' }));
        break;
      case 'psychic':
        this.emit(16, i => ({ x: to.x, y: to.y, vx: 0, vy: 0, size: 20 + i * 14, color: i % 2 ? color : '#fff', max: 0.9, shape: 'ring' }));
        this.emit(24, () => ({ x: to.x, y: to.y, vx: rnd(-220, 220), vy: rnd(-220, 220), size: rnd(3, 6), color: '#fff', max: 0.6, shape: 'spark' }));
        break;
      case 'burst':
        this.emit(60, () => { const a = rnd(0, 6.28), v = rnd(80, 420); return { x: to.x, y: to.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: rnd(4, 14), color: Math.random() < 0.35 ? '#fff' : Math.random() < 0.5 ? color : '#ffd54a', max: rnd(0.4, 0.9), grav: 200, shape: 'dot' }; });
        this.emit(8, i => ({ x: to.x, y: to.y, vx: 0, vy: 0, size: 30 + i * 20, color: '#fff', max: 0.35, shape: 'ring' }));
        break;
      case 'heal':
        this.emit(30, () => ({ x: from.x + rnd(-50, 50), y: from.y + rnd(-10, 60), vx: rnd(-20, 20), vy: rnd(-200, -80), size: rnd(4, 9), color: Math.random() < 0.5 ? '#7dff9a' : '#fff', max: rnd(0.8, 1.3), shape: 'star' }));
        break;
      case 'buff':
        this.emit(20, () => ({ x: from.x + rnd(-50, 50), y: from.y + rnd(0, 60), vx: 0, vy: rnd(-260, -120), size: rnd(8, 14), color, max: rnd(0.6, 1), shape: 'arrow' }));
        break;
    }
  }

  private tick(t: number) {
    const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
    const ctx = this.canvas.getContext('2d')!; const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    // beams
    for (const b of this.beams) {
      b.t += dt; const k = Math.min(1, b.t / (b.dur * 0.35)); const fade = b.t > b.dur * 0.6 ? 1 - (b.t - b.dur * 0.6) / (b.dur * 0.4) : 1;
      const x2 = b.x1 + (b.x2 - b.x1) * k, y2 = b.y1 + (b.y2 - b.y1) * k;
      ctx.globalAlpha = Math.max(0, fade); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const draw = (w: number, c: string) => {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(b.x1, b.y1);
        if (b.jag) { const segs = 9; for (let i = 1; i <= segs; i++) { const f = i / segs; const nx = -(y2 - b.y1), ny = x2 - b.x1; const L = Math.hypot(nx, ny) || 1; const off = (Math.random() - 0.5) * 50 * (i < segs ? 1 : 0); ctx.lineTo(b.x1 + (x2 - b.x1) * f + nx / L * off, b.y1 + (y2 - b.y1) * f + ny / L * off); } }
        else ctx.lineTo(x2, y2);
        ctx.stroke();
      };
      ctx.shadowBlur = 24; ctx.shadowColor = b.color;
      draw(b.width, b.color); draw(b.width * 0.4, '#fff');
      ctx.shadowBlur = 0;
    }
    this.beams = this.beams.filter(b => b.t < b.dur);
    // particles
    for (const p of this.ps) {
      p.life += dt; p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.vx *= 0.985; p.vy *= 0.985;
      const a = 1 - p.life / p.max; if (a <= 0) continue;
      ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.strokeStyle = p.color;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      switch (p.shape) {
        case 'dot': ctx.shadowBlur = 12; ctx.shadowColor = p.color; ctx.beginPath(); ctx.arc(0, 0, p.size, 0, 6.28); ctx.fill(); break;
        case 'spark': ctx.beginPath(); ctx.moveTo(-p.size * 2, 0); ctx.lineTo(0, -p.size * 0.6); ctx.lineTo(p.size * 2, 0); ctx.lineTo(0, p.size * 0.6); ctx.fill(); break;
        case 'leaf': ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, 6.28); ctx.fill(); break;
        case 'crystal': ctx.beginPath(); for (let i = 0; i < 6; i++) { const A = i / 6 * 6.28; ctx.lineTo(Math.cos(A) * p.size, Math.sin(A) * p.size); } ctx.closePath(); ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = a * 0.4; ctx.fill(); break;
        case 'ring': { const r = p.size * (1 + p.life / p.max * 2); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.28); ctx.stroke(); break; }
        case 'star': ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? p.size * 0.45 : p.size; const A = i / 10 * 6.28; ctx.lineTo(Math.cos(A) * r, Math.sin(A) * r); } ctx.closePath(); ctx.fill(); break;
        case 'arrow': ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.8, 0); ctx.lineTo(p.size * 0.3, 0); ctx.lineTo(p.size * 0.3, p.size); ctx.lineTo(-p.size * 0.3, p.size); ctx.lineTo(-p.size * 0.3, 0); ctx.lineTo(-p.size * 0.8, 0); ctx.closePath(); ctx.fill(); break;
      }
      ctx.restore();
    }
    this.ps = this.ps.filter(p => p.life < p.max);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (this.ps.length || this.beams.length) this.raf = requestAnimationFrame(tt => this.tick(tt)); else { this.raf = 0; ctx.clearRect(0, 0, W, H); }
  }
}
