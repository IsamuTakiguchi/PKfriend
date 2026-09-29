import { useEffect, useRef, useState, type ReactNode } from 'react';
import { loadSmooth, frameAt, type SmoothAnim } from '../smoothsprite';
import { loadHdList, hdEntry, hdUrl } from '../hdsprites';
import { artworkUrl, animatedUrl, getSpecies, getMove, TYPE_COLOR, TYPE_JA, levelFromExp, displayName, expToNext, gradeOf, pokeEne, speedLevel, calcStats, SPECIAL_JA, type TypeName, type OwnedPokemon } from '@pkfriend/shared';
import { useToast } from '../toast';

export function Sprite({ id, shiny, size = 96, className = '', silhouette = false, style }: { id: number; shiny?: boolean; size?: number | string; className?: string; silhouette?: boolean; style?: React.CSSProperties }) {
  const [err, setErr] = useState(false);
  const s = getSpecies(id);
  const dim = typeof size === 'number' ? `${size}px` : size;
  if (err) return <div className={`sprite-fallback ${className}`} style={{ width: dim, height: dim, background: TYPE_COLOR[s.types[0]], ...style }}>{s.ja}</div>;
  return <img className={`sprite ${silhouette ? 'silhouette' : ''} ${className}`} style={{ width: dim, height: dim, ...style }} src={artworkUrl(id, shiny)} alt={s.ja} onError={() => setErr(true)} draggable={false} />;
}

/**
 * Animated battle sprite: keeps its natural proportions (a Pikachu stays smaller than a Charizard),
 * scaled up to fill at most `box` px and anchored to the bottom of the box so it stands on the ground.
 * Plays the AI-upscaled HD animation when the site has one; otherwise the GIF is smoothed at runtime
 * (the plain GIF shows while that is prepared) and, if even the GIF is missing, the official artwork is used.
 */
export function BattleSprite(props: { id: number; shiny?: boolean; box: number; maxScale?: number; formId?: number; form?: 'mega' | 'tera' | 'dyna'; tera?: string }) {
  const sid = props.formId ?? props.id;
  const [, setReady] = useState(0);
  const [hdFailed, setHdFailed] = useState<string | null>(null);
  useEffect(() => { let alive = true; void loadHdList().then(() => alive && setReady(n => n + 1)); return () => { alive = false; }; }, []);
  const hd = hdEntry(sid, props.shiny);
  const hdKey = `${sid}:${props.shiny}`;
  if (hd === undefined) return null; // HD list still loading (one small request, usually already cached)
  // テラスタル draws crystal facets onto the frames, which needs the canvas player
  if (hd && !props.tera && hdFailed !== hdKey) {
    const { box, maxScale = 3.4, form } = props;
    const k = Math.min((box * 0.94) / Math.max(hd.w, hd.h), maxScale); const cw = Math.round(hd.w * k), ch = Math.round(hd.h * k);
    return <><img className="sprite ani hd" src={hdUrl(sid, props.shiny)} alt={getSpecies(props.id).ja} draggable={false} style={{ width: cw, height: ch }} onError={() => setHdFailed(hdKey)} />{form ? <FormOverlay form={form} w={cw} h={ch} /> : null}</>;
  }
  return <SmoothSprite {...props} />;
}

function SmoothSprite({ id, shiny, box, maxScale = 3.4, formId, form, tera }: { id: number; shiny?: boolean; box: number; maxScale?: number; formId?: number; form?: 'mega' | 'tera' | 'dyna'; tera?: string }) {
  const url = animatedUrl(formId ?? id, shiny);
  const [state, setState] = useState<{ url: string; failed: boolean; nat: { w: number; h: number } | null; anim: SmoothAnim | null }>({ url, failed: false, nat: null, anim: null });
  const st = state.url === url ? state : { url, failed: false, nat: null, anim: null };
  if (st !== state) setState(st);
  useEffect(() => {
    let alive = true;
    loadSmooth(url).then(anim => { if (alive) setState(s => (s.url === url ? { ...s, anim, nat: { w: anim.w, h: anim.h } } : s)); }).catch(() => {});
    return () => { alive = false; };
  }, [url]);
  const nat = st.nat; const k = nat ? Math.min((box * 0.94) / Math.max(nat.w, nat.h), maxScale) : 0;
  const cw = nat ? Math.round(nat.w * k) : 0, ch = nat ? Math.round(nat.h * k) : 0;
  const cref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const a = st.anim, c = cref.current; if (!a || !c || !cw) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1); const bw = Math.min(1100, Math.round(cw * dpr)), bh = Math.round((bw * ch) / cw);
    c.width = bw; c.height = bh; const ctx = c.getContext('2d')!; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    let raf = 0, last = -1;
    const tex = tera ? crystalTex(tera) : null;
    const tick = (t: number) => {
      const i = frameAt(a, t);
      if (i !== last || tex) {
        last = i; ctx.clearRect(0, 0, bw, bh); ctx.drawImage(a.frames[i], 0, 0, bw, bh);
        if (tex) { // テラスタル: crystal facets clipped to the pokémon's silhouette + a travelling glint
          ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = 0.62; ctx.drawImage(tex, 0, 0, bw, bh);
          const x = (((t / 1700) % 1.6) - 0.3) * bw; const g = ctx.createLinearGradient(x - bw * 0.12, 0, x + bw * 0.12, bh * 0.3);
          g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, bw, bh); ctx.globalCompositeOperation = 'source-over';
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [st.anim, cw, ch, tera]);
  const overlay = nat && form ? <FormOverlay form={form} w={cw} h={ch} tera={tera} /> : null;
  if (st.failed && !st.anim) return <Sprite id={id} shiny={shiny} size="100%" className="static" />;
  if (st.anim) return <><canvas ref={cref} className="sprite ani" style={{ width: cw, height: ch }} aria-label={getSpecies(id).ja} />{overlay}</>;
  return (
    <>
    <img className="sprite ani" src={url} alt={getSpecies(id).ja} draggable={false} crossOrigin="anonymous"
      style={nat ? { width: cw, height: ch } : { width: box * 0.6, height: box * 0.6, visibility: 'hidden' }}
      onLoad={e => { const im = e.currentTarget; if (im.naturalWidth) setState(s => (s.url === url && !s.nat ? { ...s, nat: { w: im.naturalWidth, h: im.naturalHeight } } : s)); }}
      onError={() => setState(s => (s.url === url ? { ...s, failed: true } : s))} />
    {overlay}
    </>
  );
}

/** Faceted crystal texture in the tera type's colour (cached per colour). */
const crystalCache = new Map<string, HTMLCanvasElement>();
function crystalTex(color: string): HTMLCanvasElement {
  const hit = crystalCache.get(color); if (hit) return hit;
  const S = 256, N = 7, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')!;
  g.fillStyle = color; g.fillRect(0, 0, S, S);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pts: { x: number; y: number }[][] = [];
  for (let j = 0; j <= N; j++) { pts.push([]); for (let i = 0; i <= N; i++) { const edge = i === 0 || j === 0 || i === N || j === N; pts[j].push({ x: (i / N) * S + (edge ? 0 : (rnd() - 0.5) * (S / N) * 0.7), y: (j / N) * S + (edge ? 0 : (rnd() - 0.5) * (S / N) * 0.7) }); } }
  const tri = (a: { x: number; y: number }, b: { x: number; y: number }, d: { x: number; y: number }) => {
    const l = rnd(); g.fillStyle = l < 0.5 ? `rgba(255,255,255,${0.15 + l * 0.9})` : `rgba(0,10,40,${(l - 0.5) * 0.55})`;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(d.x, d.y); g.closePath(); g.fill(); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.6; g.stroke();
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const p = pts[j][i], q = pts[j][i + 1], r = pts[j + 1][i], t = pts[j + 1][i + 1]; if ((i + j) % 2) { tri(p, q, t); tri(p, t, r); } else { tri(p, q, r); tri(q, t, r); } }
  crystalCache.set(color, c); return c;
}

/** Decorations of a transformed pokémon, placed relative to the sprite (which stands on the bottom of its box). */
function FormOverlay({ form, w, h, tera }: { form: 'mega' | 'tera' | 'dyna'; w: number; h: number; tera?: string }) {
  if (form === 'tera') return (
    <svg className="tera-crown" viewBox="0 0 120 80" style={{ width: Math.max(56, w * 0.46), bottom: h * 0.86, '--tera': tera } as React.CSSProperties} aria-hidden>
      <polygon points="60,2 74,34 60,46 46,34" fill={tera} /><polygon points="60,2 74,34 60,20" fill="#fff" opacity=".55" />
      <polygon points="30,14 46,34 40,52 22,40" fill={tera} /><polygon points="30,14 46,34 34,32" fill="#fff" opacity=".45" />
      <polygon points="90,14 98,40 80,52 74,34" fill={tera} /><polygon points="90,14 98,40 86,30" fill="#fff" opacity=".45" />
      <polygon points="8,34 22,40 24,62 6,54" fill={tera} opacity=".9" /><polygon points="112,34 114,54 96,62 98,40" fill={tera} opacity=".9" />
      <polygon points="22,40 40,52 60,46 80,52 98,40 96,62 60,76 24,62" fill={tera} /><polygon points="22,40 40,52 60,46 60,76 24,62" fill="#fff" opacity=".3" />
      <polyline points="22,40 40,52 60,46 80,52 98,40" fill="none" stroke="#fff" strokeWidth="2" opacity=".8" />
    </svg>
  );
  if (form === 'dyna') return <div className="dyna-clouds" style={{ width: w * 0.8, height: h * 0.26, bottom: h * 0.8 }} aria-hidden><i /><i /><i /><i /></div>;
  return <div className="mega-mark" style={{ bottom: h * 0.9 }} aria-hidden><span>M</span></div>;
}
/** Fetch a battler's animation ahead of time (the HD file, or decode + smooth the GIF when there is none). */
export function preloadAnimated(id: number, shiny?: boolean) {
  void loadHdList().then(() => { if (hdEntry(id, shiny)) { const im = new Image(); im.src = hdUrl(id, shiny); } else void loadSmooth(animatedUrl(id, shiny)).catch(() => {}); });
}

export function TypeBadge({ t }: { t: TypeName }) { return <span className="pill" style={{ background: TYPE_COLOR[t] }}>{TYPE_JA[t]}</span>; }
export function Types({ id }: { id: number }) { return <span className="row" style={{ gap: 4 }}>{getSpecies(id).types.map(t => <TypeBadge key={t} t={t} />)}</span>; }

export function HpBar({ hp, max }: { hp: number; max: number }) {
  const r = max ? hp / max : 0;
  return <div className={`hpbar ${r <= 0.2 ? 'low' : r <= 0.5 ? 'mid' : ''}`}><i style={{ width: `${Math.max(0, r * 100)}%` }} /></div>;
}
export function ExpBar({ exp }: { exp: number }) { const e = expToNext(exp); return <div className="expbar"><i style={{ width: `${(e.cur / e.need) * 100}%` }} /></div>; }

export function PokeCard({ p, selected, onClick, dim, tag, size = 72 }: { p: OwnedPokemon; selected?: boolean; onClick?: () => void; dim?: boolean; tag?: string; size?: number }) {
  return (
    <button className={`pokecard ${selected ? 'sel' : ''} ${dim ? 'dim' : ''}`} onClick={onClick} disabled={!onClick}>
      <span className="lv">Lv.{levelFromExp(p.exp)}</span>
      {p.shiny && <span className="shiny">✨</span>}
      <Sprite id={p.speciesId} shiny={p.shiny} size={size} />
      <span className="nm">{displayName(p)}</span>
      <Types id={p.speciesId} />
      <span className="small" style={{ fontSize: 10, color: TYPE_COLOR[getMove(p.moves[0]).type], fontWeight: 900 }}>{getMove(p.moves[0]).ja}</span>
      {p.mark && <Mark p={p} />}
      {tag && <span className="badge" style={{ marginTop: 2 }}>{tag}</span>}
    </button>
  );
}

export function Modal({ children, onClose, title }: { children: ReactNode; onClose?: () => void; title?: string }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {title && <div className="row between" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>{title}</h2>{onClose && <button className="btn sm ghost" onClick={onClose}>とじる</button>}</div>}
        {children}
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useToast(s => s.toasts);
  return <div className="toast-wrap">{toasts.map(t => <div key={t.id} className={`toast ${t.kind ?? ''}`}>{t.text}</div>)}</div>;
}

/** Frienda-pick style collectable card shown when you catch / receive a pokémon. */
export const ORIGIN_JA: Record<OwnedPokemon['origin'], string> = { wild: 'バトルでゲット', raid: 'タッグバトル', trade: 'ともだちと こうかん', starter: 'さいしょのパートナー', rental: 'レンタル', bonus: 'ボーナスゲット', exchange: 'こうかんチャンス' };
export function Grade({ id }: { id: number }) { const g = gradeOf(id); return <span className="grade" title={`グレード ★${g}`}>{'★'.repeat(g)}<span style={{ opacity: .25 }}>{'★'.repeat(5 - g)}</span></span>; }
export function Mark({ p }: { p: { mark?: OwnedPokemon['mark'] } }) { return p.mark ? <span className="mark">{{ tera: '💎', z: '🌀', mega: '🧬', tag: '🤝', dyna: '🔺' }[p.mark]} {SPECIAL_JA[p.mark]}</span> : null; }

/** Frienda-pick style collectable card shown when you catch / receive a pokémon. */
export function PickCard({ p }: { p: OwnedPokemon }) {
  const s = getSpecies(p.speciesId);
  const c1 = TYPE_COLOR[s.types[0]], c2 = TYPE_COLOR[s.types[1] ?? s.types[0]];
  const lv = levelFromExp(p.exp); const st = calcStats(s.stats, p.ivs, lv); const mv = getMove(p.moves[0]); const g = gradeOf(p.speciesId);
  return (
    <div className={`pick ${p.shiny || g === 5 ? 'shiny' : ''}`} style={{ '--c1': c1, '--c2': c2 } as React.CSSProperties}>
      <div className="inner">
        <div className="row between" style={{ width: '100%', fontSize: 11, fontWeight: 900, color: '#444' }}><span>No.{String(s.id).padStart(3, '0')} <Grade id={s.id} /></span><span>Lv.{lv} {p.shiny && '✨'}</span></div>
        <Sprite id={p.speciesId} shiny={p.shiny} size="62%" />
        <div className="name">{displayName(p)}</div>
        <div className="row" style={{ gap: 6, fontSize: 11, color: '#333', fontWeight: 900 }}><span>ポケエネ {pokeEne(p)}</span><span>すばやさLv.{speedLevel(st.spe)}</span></div>
        <div className="row" style={{ gap: 4 }}><Types id={p.speciesId} /><Mark p={p} /></div>
        <div style={{ fontSize: 12, fontWeight: 900, color: '#222', background: 'rgba(0,0,0,.06)', borderRadius: 8, padding: '3px 8px' }}><span style={{ color: TYPE_COLOR[mv.type] }}>●</span> わざ: {mv.ja}（{TYPE_JA[mv.type]} / いりょく{mv.power || '—'}）</div>
        <div className="meta">トレーナー: {p.caughtByName}<br />{new Date(p.caughtAt).toLocaleDateString('ja-JP')} / {ORIGIN_JA[p.origin] ?? 'やせい'}</div>
      </div>
    </div>
  );
}

export function Confetti({ n = 60 }: { n?: number }) {
  const colors = ['#ff5f6d', '#ffc371', '#66e0ff', '#4cd964', '#f7d02c', '#a98ff3'];
  return <div className="confetti">{Array.from({ length: n }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 10) * 0.15}s`, animationDuration: `${2 + (i % 5) * 0.3}s`, transform: `rotate(${i * 23}deg)` }} />)}</div>;
}
