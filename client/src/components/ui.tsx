import { useState, type ReactNode } from 'react';
import { artworkUrl, getSpecies, getMove, TYPE_COLOR, TYPE_JA, levelFromExp, displayName, expToNext, gradeOf, pokeEne, speedLevel, calcStats, SPECIAL_JA, type TypeName, type OwnedPokemon } from '@pkfriend/shared';
import { useToast } from '../toast';

export function Sprite({ id, shiny, size = 96, className = '', silhouette = false, style }: { id: number; shiny?: boolean; size?: number | string; className?: string; silhouette?: boolean; style?: React.CSSProperties }) {
  const [err, setErr] = useState(false);
  const s = getSpecies(id);
  const dim = typeof size === 'number' ? `${size}px` : size;
  if (err) return <div className={`sprite-fallback ${className}`} style={{ width: dim, height: dim, background: TYPE_COLOR[s.types[0]], ...style }}>{s.ja}</div>;
  return <img className={`sprite ${silhouette ? 'silhouette' : ''} ${className}`} style={{ width: dim, height: dim, ...style }} src={artworkUrl(id, shiny)} alt={s.ja} onError={() => setErr(true)} draggable={false} />;
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
