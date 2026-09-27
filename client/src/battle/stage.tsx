import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { getMove, getSpecies, artworkUrl, TYPE_COLOR, effectivenessText, typeMultiplier, SPECIAL_JA, type Battler, type BattleEvent, type StatStages, type MoveFx } from '@pkfriend/shared';
import { FxEngine } from './effects';
import { sfx } from '../audio';
import { say, lines } from '../voice';
import { HpBar, Sprite } from '../components/ui';
import { Scene } from '../scenes';

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
  zoomOrigin: string;
  focusUid: string | null;
  callout: { uid: string; text: string } | null;
  /** cinematic mode: only this combatant is on screen */
  solo: string | null;
  slowmo: boolean;
  speedlines: boolean;
  nameplate: { text: string; sub?: string } | null;
}
const STAT_JA: Record<keyof StatStages, string> = { atk: 'こうげき', def: 'ぼうぎょ', spa: 'とくこう', spd: 'とくぼう', spe: 'すばやさ' };
const FX_SFX: Record<MoveFx, keyof typeof sfx> = { impact: 'hit', slash: 'slash', beam: 'beam', burst: 'burst', shock: 'shock', wave: 'wave', leaf: 'wind', ice: 'ice', aura: 'psychic', quake: 'quake', wind: 'wind', poison: 'wave', psychic: 'psychic', heal: 'heal', buff: 'buff' };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let popSeq = 0;

export interface StageApi {
  view: StageView;
  setBattlers: (allies: Battler[], foes: Battler[]) => void;
  play: (events: BattleEvent[], opts?: { speed?: number; cinematic?: boolean; restoreSolo?: string | null }) => Promise<void>;
  setClass: (uid: string, cls: string, ms?: number) => void;
  banner: (text: string, kind?: BannerKind, ms?: number) => Promise<void>;
  flash: (kind?: StageView['flash']) => void;
  shake: (big?: boolean) => void;
  pop: (uid: string, text: string, cls?: string) => void;
  posOf: (uid: string) => { x: number; y: number };
  playFx: (fx: MoveFx, from: string, to: string, color: string) => void;
  setLog: (s: string) => void;
  /** Camera punch-in on a combatant (short zoom toward it). */
  punch: (uid: string, scale?: number, ms?: number) => void;
  /** Spotlight one combatant (others dim). null clears. */
  focus: (uid: string | null, callout?: string, ms?: number) => Promise<void>;
  /** Cinematic: show only this combatant, big and centered (null = show everyone). */
  solo: (uid: string | null, opts?: { enter?: boolean; callout?: string; nameplate?: { text: string; sub?: string } | null }) => void;
  busy: boolean;
  refs: { root: RefObject<HTMLDivElement>; canvas: RefObject<HTMLCanvasElement>; engine: RefObject<FxEngine | null> };
}

const initial: StageView = { allies: [], foes: [], cls: {}, banner: null, cutin: null, shake: '', flash: '', pops: [], log: '', zoom: '', zoomOrigin: '50% 50%', focusUid: null, callout: null, solo: null, slowmo: false, speedlines: false, nameplate: null };

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
  const punch = useCallback((uid: string, scale = 1.14, ms = 450) => {
    const r = root.current; if (!r) return; const p = posOf(uid);
    setView(v => ({ ...v, zoom: `scale(${scale})`, zoomOrigin: `${(p.x / r.clientWidth) * 100}% ${(p.y / r.clientHeight) * 100}%` }));
    setTimeout(() => setView(v => ({ ...v, zoom: '' })), ms);
  }, [posOf]);
  const solo = useCallback((uid: string | null, opts: { enter?: boolean; callout?: string; nameplate?: { text: string; sub?: string } | null } = {}) => {
    setView(v => ({ ...v, solo: uid, callout: uid && opts.callout ? { uid, text: opts.callout } : null, nameplate: opts.nameplate === undefined ? (uid ? v.nameplate : null) : opts.nameplate, speedlines: false, slowmo: false }));
    if (uid && opts.enter) { setClass(uid, 'stepin', 800); if (opts.callout) setTimeout(() => setView(v => (v.callout?.uid === uid ? { ...v, callout: null } : v)), 1400); }
  }, [setClass]);
  const focus = useCallback(async (uid: string | null, callout?: string, ms = 0) => {
    setView(v => ({ ...v, focusUid: uid, callout: uid && callout ? { uid, text: callout } : null }));
    if (ms) { await sleep(ms); setView(v => (v.focusUid === uid ? { ...v, focusUid: null, callout: null } : v)); }
  }, []);

  const updateB = (uid: string, patch: Partial<Battler>) => setView(v => ({ ...v, allies: v.allies.map(b => b.uid === uid ? { ...b, ...patch } : b), foes: v.foes.map(b => b.uid === uid ? { ...b, ...patch } : b) }));
  const nameOf = (v: StageView, uid: string) => [...v.allies, ...v.foes].find(b => b.uid === uid);

  const viewRef = useRef(view); viewRef.current = view;

  const play = useCallback(async (events: BattleEvent[], opts: { speed?: number; cinematic?: boolean; restoreSolo?: string | null } = {}) => {
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
          say(lines.move(getSpecies(u.speciesId).ja, m.ja), { priority: true });
          const cinematic = viewRef.current.solo !== null || opts.cinematic;
          if (!cinematic) {
            await focus(u.uid, `${m.ja}！`); punch(u.uid, 1.1, 500); await wait(520);
            if (m.power >= 90) { sfx.cutin(); setView(x => ({ ...x, cutin: { moveId: m.id, userUid: u.uid, speciesId: u.speciesId, shiny: u.shiny } })); await wait(950); setView(x => ({ ...x, cutin: null })); }
            if (m.category === 'physical') { sfx.lunge(); setClass(u.uid, u.side === 'ally' ? 'lunge-right' : 'lunge-left', 600); await wait(260); }
            else { sfx.cast(); setClass(u.uid, 'charge', 700); await wait(300); }
            playFx(m.fx, u.uid, (t ?? u).uid, color); sfx[FX_SFX[m.fx]]();
            await wait(m.fx === 'beam' || m.fx === 'wave' ? 450 : 300);
            void focus(null);
            break;
          }
          // ---- 1. close-up on the attacker: name plate, charge-up aura, speed lines (≈2.6s)
          setView(x => ({ ...x, solo: u.uid, callout: null, nameplate: { text: u.name, sub: u.ownerId === 'wild' ? 'やせいの ポケモン' : u.ownerName }, speedlines: false }));
          setClass(u.uid, 'stepin', 700); sfx.lunge();
          await wait(700);
          punch(u.uid, 1.08, 2200);
          setView(x => ({ ...x, speedlines: true, callout: { uid: u.uid, text: `${m.ja}！` } }));
          sfx.cast(); setClass(u.uid, 'charge', 2000);
          for (let k = 0; k < 3; k++) { playFx(m.category === 'physical' ? 'buff' : 'aura', u.uid, u.uid, color); await wait(600); }
          if (u.side === 'ally') sfx.buff(); else sfx.debuff();
          await wait(300);
          // ---- 2. cut-in with the move name (≈1.1s)
          sfx.cutin(); setView(x => ({ ...x, cutin: { moveId: m.id, userUid: u.uid, speciesId: u.speciesId, shiny: u.shiny }, speedlines: false }));
          await wait(1050); setView(x => ({ ...x, cutin: null }));
          // ---- 3. launch: the attacker dashes / fires toward the opponent (≈1.0s)
          const r = root.current; const W = r?.clientWidth ?? 390, H = r?.clientHeight ?? 600;
          const toRight = u.side === 'ally';
          setClass(u.uid, toRight ? 'launch-right' : 'launch-left', 900);
          sfx[FX_SFX[m.fx]]();
          engine.current?.play(m.fx, posOf(u.uid), { x: toRight ? W + 60 : -60, y: H * 0.45 }, color);
          setView(x => ({ ...x, speedlines: true }));
          await wait(850);
          // ---- 4. cut to the target: the attack comes in from the side (≈0.7s)
          if (t && t.uid !== u.uid) {
            flash('on dark');
            setView(x => ({ ...x, solo: t.uid, callout: null, nameplate: { text: t.name, sub: t.ownerId === 'wild' ? 'やせいの ポケモン' : t.ownerName } }));
            await wait(250);
            engine.current?.play(m.fx, { x: toRight ? -60 : W + 60, y: H * 0.45 }, posOf(t.uid), color);
            if (m.fx === 'beam' || m.fx === 'shock' || m.fx === 'wave') sfx[FX_SFX[m.fx]]();
            await wait(450);
          } else { setView(x => ({ ...x, speedlines: false })); }
          break;
        }
        case 'miss': sfx.miss(); await banner('しかし はずれた！', '', 700 / sp); break;
        case 'damage': {
          const t = nameOf(v, e.targetUid); if (!t) break;
          const big = e.effectiveness >= 2 || e.crit || e.amount >= t.maxHp * 0.3;
          const cinematic = viewRef.current.solo !== null || opts.cinematic;
          setClass(t.uid, 'hit', 500); shake(big); punch(t.uid, big ? 1.28 : 1.15, cinematic ? 1400 : 500);
          if (e.crit) { flash('on crit'); sfx.crit(); } else if (e.effectiveness >= 2) { flash('on'); sfx.superEff(); }
          if (big) sfx.hitBig(); else sfx.hit();
          pop(t.uid, `${e.amount}`, `${e.effectiveness >= 2 ? 'super' : e.crit ? 'crit' : e.effectiveness < 1 ? 'weak' : ''}${cinematic ? ' countup' : ''}`);
          if (cinematic) {
            // slow motion on impact, then the HP drains slowly while the number counts up
            setView(x => ({ ...x, slowmo: true, speedlines: false }));
            await wait(650);
            setView(x => ({ ...x, slowmo: false }));
            updateB(t.uid, { hp: e.hpAfter });
            setClass(t.uid, 'reel', 1400);
            await wait(1100);
          } else { updateB(t.uid, { hp: e.hpAfter }); await wait(450); }
          const txt = effectivenessText(e.effectiveness);
          if (e.crit) { say(lines.crit(), { priority: true }); await banner('きゅうしょに あたった！', '', 700 / sp); }
          if (e.effectiveness >= 2) say(lines.superEffective(), { priority: !e.crit });
          if (txt) await banner(txt, e.effectiveness >= 2 ? 'gold' : '', (cinematic ? 1100 : 750) / sp);
          if (!txt && !e.crit) await wait(cinematic ? 500 : 250);
          if (cinematic) { setView(x => ({ ...x, nameplate: null })); await wait(400); }
          break;
        }
        case 'heal': { pop(e.targetUid, `+${e.amount}`, 'heal'); sfx.heal(); playFx('heal', e.targetUid, e.targetUid, '#7dff9a'); updateB(e.targetUid, { hp: e.hpAfter }); await wait(700); break; }
        case 'stat_change': { const t = nameOf(v, e.targetUid); if (!t) break; e.delta > 0 ? sfx.buff() : sfx.debuff(); playFx('buff', t.uid, t.uid, e.delta > 0 ? '#ffc371' : '#66e0ff'); await banner(`${t.name}の ${STAT_JA[e.stat]}が ${e.delta > 0 ? 'あがった！' : 'がくっと さがった！'}`, '', 700 / sp); break; }
        case 'faint': { const t = nameOf(v, e.targetUid); if (!t) break; if (viewRef.current.solo) { setView(x => ({ ...x, solo: t.uid, nameplate: null })); await wait(200); } sfx.faint(); say(lines.faint(getSpecies(t.speciesId).ja), { priority: true }); setClass(t.uid, 'faint'); updateB(t.uid, { hp: 0, fainted: true }); await banner(`${t.name}は たおれた！`, '', 1200 / sp); setClass(t.uid, 'gone'); break; }
        case 'join': { setView(x => ({ ...x, allies: [...x.allies.filter(a => a.uid !== e.battler.uid), { ...e.battler }] })); sfx.join(); say(lines.joined(), { priority: true }); await banner(`${e.battler.ownerName}が さんせん！`, 'info', 1200 / sp); break; }
        case 'swap': { setView(x => ({ ...x, allies: x.allies.map(a => a.uid === e.outUid ? { ...e.battler } : a) })); sfx.join(); await banner(`いけっ！ ${e.battler.name}！`, 'info', 900 / sp); break; }
        case 'boss_enrage': { const b = nameOf(v, e.bossUid); flash('on dark'); shake(true); sfx.enrage(); setClass(e.bossUid, 'charge', 900); await banner(`${b?.name ?? 'ボス'}は いかりくるった！`, 'big', 1300 / sp); break; }
        case 'chain': { sfx.chain(); flash('on crit'); await banner(`チェイン ×${e.count}！`, 'gold', 700 / sp); break; }
        case 'special': { const u = nameOf(v, e.userUid); sfx.cutin(); say(lines.specialDone(SPECIAL_JA[e.special]), { priority: true }); flash('on crit'); setClass(e.userUid, 'charge', 900); if (u) setView(x => ({ ...x, cutin: { moveId: getMove(u.moves[0]).id, userUid: u.uid, speciesId: u.speciesId, shiny: u.shiny } })); await banner(`${u?.name ?? ''}の ${SPECIAL_JA[e.special]}！`, 'gold', 1000 / sp); setView(x => ({ ...x, cutin: null })); break; }
        case 'assist': { const pt = nameOf(v, e.partnerUid); if (pt) { setClass(pt.uid, pt.side === 'ally' ? 'lunge-right' : 'lunge-left', 600); await wait(220); playFx(getMove(pt.moves[0]).fx, pt.uid, e.targetUid, TYPE_COLOR[getMove(pt.moves[0]).type]); sfx.hit(); setClass(e.targetUid, 'hit', 500); shake(false); pop(e.targetUid, `${e.amount}`, 'super'); updateB(e.targetUid, { hp: e.hpAfter }); await banner(`${pt.name}の タッグアタック！`, 'info', 800 / sp); } break; }
        case 'support': { sfx.slash(); playFx('impact', e.targetUid, e.targetUid, '#ffc371'); setClass(e.targetUid, 'hit', 500); shake(false); pop(e.targetUid, `${e.amount}`, 'heal'); updateB(e.targetUid, { hp: e.hpAfter }); await banner(`サポートの ${e.name}が ついげき！`, 'info', 800 / sp); break; }
        case 'battle_end': { if (e.winner === 'ally') { sfx.victory(); say(lines.win(), { priority: true }); await banner('WIN！', 'gold', 1600 / sp); } else { sfx.lose(); say(lines.lose(), { priority: true }); await banner('まけてしまった…', '', 1600 / sp); } break; }
      }
    }
    if (opts.restoreSolo !== undefined) setView(x => ({ ...x, solo: opts.restoreSolo ?? null, nameplate: null, speedlines: false, slowmo: false }));
    setBusy(false);
  }, [banner, flash, playFx, pop, setClass, setLog, shake, focus, punch, posOf]);

  return useMemo(() => ({ view, setBattlers, play, setClass, banner, flash, shake, pop, posOf, playFx, setLog, punch, focus, solo, busy, refs: { root, canvas, engine } }), [view, setBattlers, play, setClass, banner, flash, shake, pop, posOf, playFx, setLog, punch, focus, solo, busy]);
}

// ------------------------------------------------------------------ presentational stage
export interface EmoteBubble { id: number; playerId: string; emote: string; }

export interface StageSelect {
  targetUid?: string | null;            // highlighted foe
  attackerUid?: string | null;          // highlighted ally
  tiredUids?: string[];                 // allies that attacked last turn
  onSelectFoe?: (uid: string) => void;
  onSelectAlly?: (uid: string) => void;
  line?: 'blue' | 'red' | null;         // speed line between attacker and target
  showMatchup?: boolean;                // show ばつぐん/いまひとつ tags on foes for the selected attacker
  duel?: { allyUid: string | null; foeUid: string | null } | null; // the two pokémon that stepped forward
}

export function BattleStage({ api, bg, scene, myOwnerId, pendingUids = [], emotes = [], select = {}, children }: { api: StageApi; bg: string; scene?: string; myOwnerId?: string; pendingUids?: string[]; emotes?: EmoteBubble[]; select?: StageSelect; children?: React.ReactNode }) {
  const v = api.view;
  const allyN = Math.max(1, v.allies.length);
  const foeN = Math.max(1, v.foes.length);
  const allySize = allyN === 1 ? 150 : allyN === 2 ? 120 : 96;
  const foeSize = v.foes[0]?.isBoss ? 210 : foeN === 1 ? 160 : foeN === 2 ? 120 : 96;
  const attacker = select.attackerUid ? v.allies.find(a => a.uid === select.attackerUid) : undefined;
  const [lineFrom, lineTo] = select.line && select.attackerUid && select.targetUid ? [api.posOf(select.attackerUid), api.posOf(select.targetUid)] : [null, null];
  const duel = select.duel;
  const focusPos = v.focusUid ? api.posOf(v.focusUid) : null;
  // duel layout: the two front pokémon face each other in the middle, the rest wait in the back rows
  const foeStyle = (f: Battler, i: number): React.CSSProperties => {
    if (duel) return f.uid === duel.foeUid ? { right: '8%', top: '5%' } : { left: `${2 + i * 17}%`, top: '11%' };
    return foeN === 1 ? { right: '6%', top: '4%' } : { right: `${4 + i * 31}%`, top: `${3 + (i % 2) * 6}%` };
  };
  const allyStyle = (a: Battler, i: number): React.CSSProperties => {
    if (duel) return a.uid === duel.allyUid ? { left: '8%', bottom: '7%' } : { right: `${2 + i * 17}%`, bottom: '1%' };
    return { left: `${3 + i * (allyN <= 2 ? 40 : 30)}%`, bottom: `${6 + (i % 2) * 5}%` };
  };
  const foeSz = (f: Battler) => (duel ? (f.uid === duel.foeUid ? 190 : 56) : foeSize);
  const allySz = (a: Battler) => (duel ? (a.uid === duel.allyUid ? 185 : 56) : allySize);
  if (v.solo) {
    const b = [...v.allies, ...v.foes].find(x => x.uid === v.solo);
    return (
      <div ref={api.refs.root} className={`stage solo-mode ${v.shake} ${v.slowmo ? 'slowmo' : ''}`}>
        <div className="bg" style={{ background: bg }}>{scene && <Scene id={scene} />}</div>
        {v.speedlines && <div className="speedlines" />}
        <div className="zoom" style={{ transform: v.zoom, transformOrigin: v.zoomOrigin }}>
          {b && <Combatant key={b.uid} b={b} cls={`${v.cls[b.uid] ?? ''} solo`} size={Math.min(300, (api.refs.root.current?.clientWidth ?? 390) * 0.72)} style={{ left: '50%', top: '44%', transform: 'translate(-50%,-50%)' }} pops={v.pops} mine={!!myOwnerId && b.ownerId === myOwnerId} tired={select.tiredUids?.includes(b.uid)} callout={v.callout?.uid === b.uid ? v.callout.text : undefined} emotes={emotes.filter(e => e.playerId === b.ownerId)} />}
        </div>
        {v.nameplate && <div className={`nameplate ${b?.side ?? ''}`}><b>{v.nameplate.text}</b>{v.nameplate.sub && <small>{v.nameplate.sub}</small>}</div>}
        <TeamHud side="foe" list={v.foes} front={select.targetUid ?? null} tired={[]} />
        <TeamHud side="ally" list={v.allies} front={select.attackerUid ?? null} tired={select.tiredUids ?? []} onSelect={select.onSelectAlly} pending={pendingUids} />
        <canvas ref={api.refs.canvas} className="fxcanvas" />
        <div className={`flash ${v.flash}`} />
        {v.cutin && <CutIn moveId={v.cutin.moveId} speciesId={v.cutin.speciesId} shiny={v.cutin.shiny} />}
        {v.banner && <div className={`banner ${v.banner.kind}`}><span>{v.banner.text}</span></div>}
        {children}
      </div>
    );
  }
  return (
    <div ref={api.refs.root} className={`stage ${v.shake} ${v.focusUid ? 'focusing' : ''} ${duel ? 'duel' : ''}`}>
      <div className="bg" style={{ background: bg }}>{scene && <Scene id={scene} />}</div>
      <div className="zoom" style={{ transform: v.zoom, transformOrigin: v.zoomOrigin }}>
        {v.foes.map((f, i) => {
          const isFront = !duel || duel.foeUid === f.uid;
          const eff = attacker && select.showMatchup && !f.fainted && isFront ? typeMultiplier(getMove(attacker.moves[0]).type, getSpecies(f.speciesId).types) : null;
          return <Combatant key={f.uid} b={f} cls={`${v.cls[f.uid] ?? ''} ${select.targetUid === f.uid ? 'target' : ''} ${select.onSelectFoe && !f.fainted ? 'selectable' : ''} ${v.focusUid === f.uid ? 'focus' : ''} ${duel && !isFront ? 'back' : ''} ${duel && isFront ? 'front' : ''}`} size={foeSz(f)}
            style={foeStyle(f, i)} pops={v.pops} eff={eff} onClick={select.onSelectFoe && !f.fainted ? () => select.onSelectFoe!(f.uid) : undefined} callout={v.callout?.uid === f.uid ? v.callout.text : undefined} compact={!!duel && !isFront} />;
        })}
        {v.allies.map((a, i) => {
          const isFront = !duel || duel.allyUid === a.uid;
          return <Combatant key={a.uid} b={a} cls={`${v.cls[a.uid] ?? ''} ${select.attackerUid === a.uid ? 'attacker' : ''} ${select.tiredUids?.includes(a.uid) ? 'tired' : ''} ${select.onSelectAlly && !a.fainted ? 'selectable' : ''} ${v.focusUid === a.uid ? 'focus' : ''} ${duel && !isFront ? 'back' : ''} ${duel && isFront ? 'front' : ''}`} size={allySz(a)} mine={!!myOwnerId && a.ownerId === myOwnerId} pending={pendingUids.includes(a.uid)}
            style={allyStyle(a, i)} pops={v.pops}
            emotes={emotes.filter(e => e.playerId === a.ownerId)} tired={select.tiredUids?.includes(a.uid)} onClick={select.onSelectAlly && !a.fainted ? () => select.onSelectAlly!(a.uid) : undefined} callout={v.callout?.uid === a.uid ? v.callout.text : undefined} compact={!!duel && !isFront} />;
        })}
      </div>
      {focusPos && <div className="spot" style={{ background: `radial-gradient(circle at ${focusPos.x}px ${focusPos.y}px, transparent 90px, rgba(0,0,0,.55) 260px)` }} />}
      {lineFrom && lineTo && <svg className="speedline" style={{ color: select.line === 'blue' ? '#66e0ff' : '#ff5f6d' }}><line x1={lineFrom.x} y1={lineFrom.y} x2={lineTo.x} y2={lineTo.y} stroke="currentColor" /></svg>}
      <canvas ref={api.refs.canvas} className="fxcanvas" />
      <div className={`flash ${v.flash}`} />
      {v.cutin && <CutIn moveId={v.cutin.moveId} speciesId={v.cutin.speciesId} shiny={v.cutin.shiny} />}
      {v.banner && <div className={`banner ${v.banner.kind}`}><span>{v.banner.text}</span></div>}
      {children}
    </div>
  );
}

function Combatant({ b, cls, size, style, mine, pending, pops, emotes = [], eff, onClick, tired, callout, compact }: { b: Battler; cls: string; size: number; style: React.CSSProperties; mine?: boolean; pending?: boolean; pops: Pop[]; emotes?: EmoteBubble[]; eff?: number | null; onClick?: () => void; tired?: boolean; callout?: string; compact?: boolean }) {
  const s = getSpecies(b.speciesId);
  if (compact) return (
    <div className={`combatant ${b.side} ${cls} ${mine ? 'mine' : ''}`} data-uid={b.uid} style={{ ...style, width: size }} onClick={onClick}>
      <div className="art" style={{ width: size, height: size }}><Sprite id={b.speciesId} shiny={b.shiny} size="100%" />{tired && <span className="zz">💤</span>}{pops.filter(p => p.uid === b.uid).map(p => <div key={p.id} className={`dmg ${p.cls}`} style={{ left: '50%', top: '40%' }}>{p.text}</div>)}</div>
      <div className="mini-hp"><HpBar hp={b.hp} max={b.maxHp} /></div>
    </div>
  );
  return (
    <div className={`combatant ${b.side} ${cls} ${mine ? 'mine' : ''} ${b.isBoss ? 'boss' : ''}`} data-uid={b.uid} style={{ ...style, width: size }} onClick={onClick}>
      <div className="art" style={{ width: size, height: size }}>
        <Sprite id={b.speciesId} shiny={b.shiny} size="100%" />
        {callout && <div className="callout">{callout}</div>}
        {tired && <span className="zz">💤</span>}
        {eff !== null && eff !== undefined && <span className={`eff-tag ${eff >= 2 ? 'super' : eff === 0 ? 'none' : eff < 1 ? 'weak' : ''}`}>{eff >= 2 ? 'ばつぐん' : eff === 0 ? 'こうかなし' : eff < 1 ? 'いまひとつ' : 'ふつう'}</span>}
        {emotes.map(e => <div key={e.id} className="emote" style={{ left: '50%', top: 0 }}>{e.emote}</div>)}
        {pops.filter(p => p.uid === b.uid).map(p => <div key={p.id} className={`dmg ${p.cls}`} style={{ left: '50%', top: '40%' }}>{p.cls.includes('countup') ? <CountUp to={parseInt(p.text) || 0} /> : p.text}</div>)}
      </div>
      <div className="plate">
        <div className="nm"><span>{b.isBoss && '👑'}{b.name}{b.shiny && '✨'}</span><span>Lv.{b.level}</span></div>
        {b.side === 'ally' && <div className="own" style={{ color: TYPE_COLOR[getMove(b.moves[0]).type] }}>{getMove(b.moves[0]).ja}</div>}
        {b.ownerId !== 'wild' && <div className="own">{b.ownerName} {pending && <span className="pending-dot" title="えらんでいます" />}</div>}
        <HpBar hp={b.hp} max={b.maxHp} />
        <div className="hpn">{b.side === 'ally' || b.isBoss ? `${b.hp} / ${b.maxHp}` : `${Math.ceil((b.hp / b.maxHp) * 100)}%`} <span style={{ color: TYPE_COLOR[s.types[0]] }}>●</span></div>
      </div>
    </div>
  );
}

function CountUp({ to, ms = 900 }: { to: number; ms?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => { const t0 = performance.now(); let raf = 0; const tick = (t: number) => { const k = Math.min(1, (t - t0) / ms); setN(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [to, ms]);
  return <>{n}</>;
}

/** Small team status rows shown in solo mode (everyone who is not on screen). */
function TeamHud({ side, list, front, tired, onSelect, pending = [] }: { side: 'ally' | 'foe'; list: Battler[]; front: string | null; tired: string[]; onSelect?: (uid: string) => void; pending?: string[] }) {
  if (!list.length) return null;
  return (
    <div className={`hud hud-${side}`}>
      {list.map(b => (
        <button key={b.uid} className={`hud-chip ${b.uid === front ? 'front' : ''} ${b.fainted ? 'down' : ''} ${tired.includes(b.uid) ? 'tired' : ''}`} disabled={!onSelect || b.fainted} onClick={() => onSelect?.(b.uid)}>
          <Sprite id={b.speciesId} shiny={b.shiny} size={34} />
          <div className="hud-info"><div className="hud-name">{b.isBoss && '👑'}{b.name}{tired.includes(b.uid) && ' 💤'}{pending.includes(b.uid) && <span className="pending-dot" style={{ marginLeft: 4 }} />}</div><HpBar hp={b.hp} max={b.maxHp} /><div className="hud-sub">Lv.{b.level} {b.side === 'ally' && b.ownerName !== 'やせい' ? `・${b.ownerName}` : ''}</div></div>
        </button>
      ))}
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
