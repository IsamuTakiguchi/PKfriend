import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { getMove, getSpecies, artworkUrl, TYPE_COLOR, effectivenessText, type Battler, type BattleEvent, type StatStages, type MoveFx } from '@pkfriend/shared';
import { FxEngine } from './effects';
import { sfx } from '../audio';
import { HpBar, Sprite } from '../components/ui';

export type BannerKind = '' | 'big' | 'gold' | 'info';
export interface Pop { id: number; uid: string; text: string; cls: string; }
export interface StageView {
  allies: Battler[]; foes: Battler[];
  cls: Record<string, string>;
  banner: { text: string; kind: BannerKind } | null;
  cutin: { moveId: string; userUid: string; speciesId: number; shiny: boolean } | null;
  shake: '' | 'shake' | 'shake-big';
  flash: '' | 'on' | 'on crit' | 'on dark';
  pops: Pop[];
  log: string;
  zoom: string;
}
const STAT_JA: Record<keyof StatStages, string> = { atk: 'こうげき', def: 'ぼうぎょ', spa: 'とくこう', spd: 'とくぼう', spe: 'すばやさ' };
const FX_SFX: Record<MoveFx, keyof typeof sfx> = { impact: 'hit', slash: 'slash', beam: 'beam', burst: 'burst', shock: 'shock', wave: 'wave', leaf: 'wind', ice: 'ice', aura: 'psychic', quake: 'quake', wind: 'wind', poison: 'wave', psychic: 'psychic', heal: 'heal', buff: 'buff' };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let popSeq = 0;

export interface StageApi {
  view: StageView;
  setBattlers: (allies: Battler[], foes: Battler[]) => void;
  play: (events: BattleEvent[], opts?: { speed?: number; myOwnerId?: string }) => Promise<void>;
  setClass: (uid: string, cls: string, ms?: number) => void;
  banner: (text: string, kind?: BannerKind, ms?: number) => Promise<void>;
  flash: (kind?: StageView['flash']) => void;
  shake: (big?: boolean) => void;
  pop: (uid: string, text: string, cls?: string) => void;
  posOf: (uid: string) => { x: number; y: number };
  playFx: (fx: MoveFx, from: string, to: string, color: string) => void;
  setLog: (s: string) => void;
  busy: boolean;
  refs: { root: RefObject<HTMLDivElement>; canvas: RefObject<HTMLCanvasElement>; engine: RefObject<FxEngine | null> };
}

const initial: StageView = { allies: [], foes: [], cls: {}, banner: null, cutin: null, shake: '', flash: '', pops: [], log: '', zoom: '' };

export function useBattleStage(): StageApi {
  const [view, setView] = useState<StageView>(initial);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null); const canvas = useRef<HTMLCanvasElement>(null); const engine = useRef<FxEngine | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!canvas.current) return;
    engine.current = new FxEngine(canvas.current);
    const ro = new ResizeObserver(() => engine.current?.resize()); ro.observe(canvas.current);
    return () => { ro.disconnect(); engine.current?.destroy(); engine.current = null; };
  }, []);

  const posOf = useCallback((uid: string) => {
    const r = root.current; const el = r?.querySelector(`[data-uid="${uid}"] .art`) as HTMLElement | null;
    if (!r || !el) return { x: (r?.clientWidth ?? 300) / 2, y: (r?.clientHeight ?? 300) / 2 };
    const rr = r.getBoundingClientRect(), er = el.getBoundingClientRect();
    return { x: er.left - rr.left + er.width / 2, y: er.top - rr.top + er.height / 2 };
  }, []);

  const setClass = useCallback((uid: string, cls: string, ms?: number) => {
    setView(v => ({ ...v, cls: { ...v.cls, [uid]: cls } }));
    if (timers.current[uid]) clearTimeout(timers.current[uid]);
    if (ms) timers.current[uid] = setTimeout(() => setView(v => (v.cls[uid] === cls ? { ...v, cls: { ...v.cls, [uid]: '' } } : v)), ms);
  }, []);
  const banner = useCallback(async (text: string, kind: BannerKind = '', ms = 900) => { setView(v => ({ ...v, banner: { text, kind } })); await sleep(ms); setView(v => (v.banner?.text === text ? { ...v, banner: null } : v)); }, []);
  const flash = useCallback((kind: StageView['flash'] = 'on') => { setView(v => ({ ...v, flash: '' })); requestAnimationFrame(() => setView(v => ({ ...v, flash: kind }))); setTimeout(() => setView(v => ({ ...v, flash: '' })), 700); }, []);
  const shake = useCallback((big = false) => { setView(v => ({ ...v, shake: '' })); requestAnimationFrame(() => setView(v => ({ ...v, shake: big ? 'shake-big' : 'shake' }))); setTimeout(() => setView(v => ({ ...v, shake: '' })), 700); }, []);
  const pop = useCallback((uid: string, text: string, cls = '') => { const id = ++popSeq; setView(v => ({ ...v, pops: [...v.pops, { id, uid, text, cls }] })); setTimeout(() => setView(v => ({ ...v, pops: v.pops.filter(p => p.id !== id) })), 1100); }, []);
  const playFx = useCallback((fx: MoveFx, from: string, to: string, color: string) => { engine.current?.play(fx, posOf(from), posOf(to), color); }, [posOf]);
  const setLog = useCallback((log: string) => setView(v => ({ ...v, log })), []);
  const setBattlers = useCallback((allies: Battler[], foes: Battler[]) => setView(v => ({ ...v, allies: allies.map(a => ({ ...a })), foes: foes.map(f => ({ ...f })) })), []);

  const updateB = (uid: string, patch: Partial<Battler>) => setView(v => ({ ...v, allies: v.allies.map(b => b.uid === uid ? { ...b, ...patch } : b), foes: v.foes.map(b => b.uid === uid ? { ...b, ...patch } : b) }));
  const nameOf = (v: StageView, uid: string) => [...v.allies, ...v.foes].find(b => b.uid === uid);

  const viewRef = useRef(view); viewRef.current = view;

  const play = useCallback(async (events: BattleEvent[], opts: { speed?: number } = {}) => {
    const sp = opts.speed ?? 1; const wait = (ms: number) => sleep(ms / sp);
    setBusy(true);
    for (const e of events) {
      const v = viewRef.current;
      switch (e.kind) {
        case 'turn_start': setLog(`ターン ${e.turn}`); break;
        case 'move_used': {
          const u = nameOf(v, e.userUid); const t = nameOf(v, e.targetUid); if (!u) break;
          const m = getMove(e.moveId); const color = TYPE_COLOR[m.type];
          setLog(`${u.name}の ${m.ja}！`);
          if (m.power >= 90) { sfx.cutin(); setView(x => ({ ...x, cutin: { moveId: m.id, userUid: u.uid, speciesId: u.speciesId, shiny: u.shiny } })); await wait(950); setView(x => ({ ...x, cutin: null })); }
          if (m.category === 'physical') { sfx.lunge(); setClass(u.uid, u.side === 'ally' ? 'lunge-right' : 'lunge-left', 600); await wait(260); }
          else { sfx.cast(); setClass(u.uid, 'charge', 700); await wait(300); }
          playFx(m.fx, u.uid, (t ?? u).uid, color);
          sfx[FX_SFX[m.fx]]();
          await wait(m.fx === 'beam' || m.fx === 'wave' ? 450 : 300);
          break;
        }
        case 'miss': sfx.miss(); await banner('しかし はずれた！', '', 700 / sp); break;
        case 'damage': {
          const t = nameOf(v, e.targetUid); if (!t) break;
          const big = e.effectiveness >= 2 || e.crit || e.amount >= t.maxHp * 0.3;
          setClass(t.uid, 'hit', 500); shake(big);
          if (e.crit) { flash('on crit'); sfx.crit(); } else if (e.effectiveness >= 2) { flash('on'); sfx.superEff(); }
          if (big) sfx.hitBig(); else sfx.hit();
          pop(t.uid, `${e.amount}`, e.effectiveness >= 2 ? 'super' : e.crit ? 'crit' : e.effectiveness < 1 ? 'weak' : '');
          updateB(t.uid, { hp: e.hpAfter });
          await wait(450);
          const txt = effectivenessText(e.effectiveness);
          if (e.crit) await banner('きゅうしょに あたった！', '', 650 / sp);
          if (txt) await banner(txt, e.effectiveness >= 2 ? 'gold' : '', 750 / sp);
          if (!txt && !e.crit) await wait(250);
          break;
        }
        case 'heal': { pop(e.targetUid, `+${e.amount}`, 'heal'); sfx.heal(); playFx('heal', e.targetUid, e.targetUid, '#7dff9a'); updateB(e.targetUid, { hp: e.hpAfter }); await wait(700); break; }
        case 'stat_change': { const t = nameOf(v, e.targetUid); if (!t) break; e.delta > 0 ? sfx.buff() : sfx.debuff(); playFx('buff', t.uid, t.uid, e.delta > 0 ? '#ffc371' : '#66e0ff'); await banner(`${t.name}の ${STAT_JA[e.stat]}が ${e.delta > 0 ? 'あがった！' : 'がくっと さがった！'}`, '', 700 / sp); break; }
        case 'faint': { const t = nameOf(v, e.targetUid); if (!t) break; sfx.faint(); setClass(t.uid, 'faint'); updateB(t.uid, { hp: 0, fainted: true }); await banner(`${t.name}は たおれた！`, '', 1000 / sp); setClass(t.uid, 'gone'); break; }
        case 'join': { setView(x => ({ ...x, allies: [...x.allies.filter(a => a.uid !== e.battler.uid), { ...e.battler }] })); sfx.join(); await banner(`${e.battler.ownerName}が さんせん！`, 'info', 1200 / sp); break; }
        case 'swap': { setView(x => ({ ...x, allies: x.allies.map(a => a.uid === e.outUid ? { ...e.battler } : a) })); sfx.join(); await banner(`いけっ！ ${e.battler.name}！`, 'info', 900 / sp); break; }
        case 'boss_enrage': { const b = nameOf(v, e.bossUid); flash('on dark'); shake(true); sfx.enrage(); setClass(e.bossUid, 'charge', 900); await banner(`${b?.name ?? 'ボス'}は いかりくるった！`, 'big', 1300 / sp); break; }
        case 'chain': { sfx.chain(); flash('on crit'); await banner(`チェイン ×${e.count}！`, 'gold', 700 / sp); break; }
        case 'battle_end': { if (e.winner === 'ally') { sfx.victory(); await banner('WIN！', 'gold', 1600 / sp); } else { sfx.lose(); await banner('まけてしまった…', '', 1600 / sp); } break; }
      }
    }
    setBusy(false);
  }, [banner, flash, playFx, pop, setClass, setLog, shake]);

  return useMemo(() => ({ view, setBattlers, play, setClass, banner, flash, shake, pop, posOf, playFx, setLog, busy, refs: { root, canvas, engine } }), [view, setBattlers, play, setClass, banner, flash, shake, pop, posOf, playFx, setLog, busy]);
}

// ------------------------------------------------------------------ presentational stage
export interface EmoteBubble { id: number; playerId: string; emote: string; }

export function BattleStage({ api, bg, myOwnerId, pendingUids = [], emotes = [], children }: { api: StageApi; bg: string; myOwnerId?: string; pendingUids?: string[]; emotes?: EmoteBubble[]; children?: React.ReactNode }) {
  const v = api.view;
  const allyN = Math.max(1, v.allies.length);
  const allySize = allyN === 1 ? 150 : allyN === 2 ? 120 : 96;
  const foeSize = v.foes[0]?.isBoss ? 210 : 160;
  return (
    <div ref={api.refs.root} className={`stage ${v.shake}`}>
      <div className="bg" style={{ background: bg }} />
      <div className="zoom" style={{ transform: v.zoom }}>
        {v.foes.map((f, i) => (
          <Combatant key={f.uid} b={f} cls={v.cls[f.uid] ?? ''} size={foeSize} style={{ right: `${6 + i * 30}%`, top: `${4 + i * 4}%` }} pops={v.pops} />
        ))}
        {v.allies.map((a, i) => (
          <Combatant key={a.uid} b={a} cls={v.cls[a.uid] ?? ''} size={allySize} mine={!!myOwnerId && a.ownerId === myOwnerId} pending={pendingUids.includes(a.uid)}
            style={{ left: `${3 + i * (allyN <= 2 ? 40 : 23)}%`, bottom: `${6 + (i % 2) * 5}%` }} pops={v.pops}
            emotes={emotes.filter(e => e.playerId === a.ownerId)} />
        ))}
      </div>
      <canvas ref={api.refs.canvas} className="fxcanvas" />
      <div className={`flash ${v.flash}`} />
      {v.cutin && <CutIn moveId={v.cutin.moveId} speciesId={v.cutin.speciesId} shiny={v.cutin.shiny} />}
      {v.banner && <div className={`banner ${v.banner.kind}`}><span>{v.banner.text}</span></div>}
      {children}
    </div>
  );
}

function Combatant({ b, cls, size, style, mine, pending, pops, emotes = [] }: { b: Battler; cls: string; size: number; style: React.CSSProperties; mine?: boolean; pending?: boolean; pops: Pop[]; emotes?: EmoteBubble[] }) {
  const s = getSpecies(b.speciesId);
  return (
    <div className={`combatant ${b.side} ${cls} ${mine ? 'mine' : ''} ${b.isBoss ? 'boss' : ''}`} data-uid={b.uid} style={{ ...style, width: size }}>
      <div className="art" style={{ width: size, height: size }}>
        <Sprite id={b.speciesId} shiny={b.shiny} size="100%" />
        {emotes.map(e => <div key={e.id} className="emote" style={{ left: '50%', top: 0 }}>{e.emote}</div>)}
        {pops.filter(p => p.uid === b.uid).map(p => <div key={p.id} className={`dmg ${p.cls}`} style={{ left: '50%', top: '40%' }}>{p.text}</div>)}
      </div>
      <div className="plate">
        <div className="nm"><span>{b.isBoss && '👑'}{b.name}{b.shiny && '✨'}</span><span>Lv.{b.level}</span></div>
        {b.ownerId !== 'wild' && <div className="own">{b.ownerName} {pending && <span className="pending-dot" title="えらんでいます" />}</div>}
        <HpBar hp={b.hp} max={b.maxHp} />
        <div className="hpn">{b.side === 'ally' || b.isBoss ? `${b.hp} / ${b.maxHp}` : `${Math.ceil((b.hp / b.maxHp) * 100)}%`} <span style={{ color: TYPE_COLOR[s.types[0]] }}>●</span></div>
      </div>
    </div>
  );
}

function CutIn({ moveId, speciesId, shiny }: { moveId: string; speciesId: number; shiny: boolean }) {
  const m = getMove(moveId);
  return (
    <div className="cutin" style={{ '--c': TYPE_COLOR[m.type] } as React.CSSProperties}>
      <div className="band" />
      <img src={artworkUrl(speciesId, shiny)} alt="" />
      <div className="txt"><small>{getSpecies(speciesId).ja}の</small>{m.ja}</div>
    </div>
  );
}
