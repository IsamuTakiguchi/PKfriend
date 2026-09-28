import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { getMove, getSpecies, artworkUrl, TYPE_COLOR, TYPE_JA, effectivenessText, typeMultiplier, SPECIAL_JA, formFor, seedOf, type Battler, type BattleEvent, type StatStages, type MoveFx, type BattleForm } from '@pkfriend/shared';
import { FxEngine, type Body, type Act } from './effects';
import { sfx } from '../audio';
import { say, lines } from '../voice';
import { HpBar, Sprite, BattleSprite, preloadAnimated } from '../components/ui';
import { Scene } from '../scenes';

export type BannerKind = '' | 'big' | 'gold' | 'info';
export interface Pop { id: number; uid: string; text: string; cls: string; }
export interface StageView {
  allies: Battler[]; foes: Battler[];
  cls: Record<string, string>;
  banner: { text: string; kind: BannerKind } | null;
  cutin: { moveId: string; userUid: string; speciesId: number; shiny: boolean; artId?: number; label?: string } | null;
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
  /** move reactions on a pokémon (st-burn, st-freeze, …) layered on top of the body animation class */
  tint: Record<string, string>;
  /** pokémon transformed by a special chance (メガシンカ / テラスタル / ダイマックス) */
  forms: Record<string, BattleForm>;
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
  /** Center, radius and feet position of the pokémon's visible sprite. */
  bodyOf: (uid: string) => Body;
  refs: { root: RefObject<HTMLDivElement>; canvas: RefObject<HTMLCanvasElement>; back: RefObject<HTMLCanvasElement>; engine: RefObject<FxEngine | null> };
}

const initial: StageView = { allies: [], foes: [], cls: {}, banner: null, cutin: null, shake: '', flash: '', pops: [], log: '', zoom: '', zoomOrigin: '50% 50%', focusUid: null, callout: null, solo: null, slowmo: false, speedlines: false, nameplate: null, tint: {}, forms: {} };

export function useBattleStage(): StageApi {
  const [view, setView] = useState<StageView>(initial);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null); const canvas = useRef<HTMLCanvasElement>(null); const back = useRef<HTMLCanvasElement>(null); const engine = useRef<FxEngine | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => () => { engine.current?.destroy(); engine.current = null; }, []);
  // (re)attach every commit: the stage renders different DOM in solo and team layouts
  useLayoutEffect(() => {
    if (!canvas.current) return;
    if (!engine.current) engine.current = new FxEngine(canvas.current, back.current);
    else if (!engine.current.isAttached(canvas.current, back.current)) engine.current.attach(canvas.current, back.current);
  });

  const posOf = useCallback((uid: string) => {
    const r = root.current; const el = (r?.querySelector(`[data-uid="${uid}"] .art > .sprite`) ?? r?.querySelector(`[data-uid="${uid}"] .art`)) as HTMLElement | null;
    if (!r || !el) return { x: (r?.clientWidth ?? 300) / 2, y: (r?.clientHeight ?? 300) / 2 };
    const rr = r.getBoundingClientRect(), er = el.getBoundingClientRect();
    return { x: er.left - rr.left + er.width / 2, y: er.top - rr.top + er.height / 2 };
  }, []);

  const bodyOf = useCallback((uid: string): Body => {
    const r = root.current; const el = (r?.querySelector(`[data-uid="${uid}"] .art > .sprite`) ?? r?.querySelector(`[data-uid="${uid}"] .art`)) as HTMLElement | null;
    if (!r || !el) { const w = r?.clientWidth ?? 390, h = r?.clientHeight ?? 600; return { x: w / 2, y: h * 0.44, r: 90, ground: h * 0.44 + 90 }; }
    const rr = r.getBoundingClientRect(), er = el.getBoundingClientRect();
    return { x: er.left - rr.left + er.width / 2, y: er.top - rr.top + er.height * 0.55, r: Math.max(40, Math.min(er.width, er.height) * 0.45), ground: er.bottom - rr.top - 4 };
  }, []);
  const tintTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const react = useCallback((uid: string, cls: string, ms: number) => {
    setView(v => ({ ...v, tint: { ...v.tint, [uid]: cls } }));
    if (tintTimers.current[uid]) clearTimeout(tintTimers.current[uid]);
    tintTimers.current[uid] = setTimeout(() => setView(v => ({ ...v, tint: { ...v.tint, [uid]: '' } })), ms);
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
  const setBattlers = useCallback((allies: Battler[], foes: Battler[]) => { for (const b of [...allies, ...foes]) preloadAnimated(b.speciesId, b.shiny); setView(v => ({ ...v, allies: allies.map(a => ({ ...a })), foes: foes.map(f => ({ ...f })) })); }, []);
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
  const shownName = (b: Battler) => viewRef.current.forms[b.uid]?.name ?? b.name;
  const cutinOf = (b: Battler, moveId: string): StageView['cutin'] => { const f = viewRef.current.forms[b.uid]; return { moveId, userUid: b.uid, speciesId: b.speciesId, shiny: b.shiny, artId: f?.spriteId, label: f?.name }; };

  const viewRef = useRef(view); viewRef.current = view;
  const heavyRef = useRef(false);

  /** The pokémon changes shape: メガシンカ (beyond its evolution limit), テラスタル (turns to crystal), ダイマックス (becomes gigantic). */
  const transform = useCallback(async (u: Battler, form: BattleForm) => {
    const eng = engine.current; const setForm = () => setView(x => ({ ...x, forms: { ...x.forms, [u.uid]: form } }));
    setView(x => ({ ...x, solo: u.uid, callout: null, speedlines: false, nameplate: { text: u.name, sub: SPECIAL_JA[form.kind] } }));
    setClass(u.uid, 'stepin', 700); await sleep(750);
    const b = () => bodyOf(u.uid); const c = { x: b().x, y: b().y };
    if (form.kind === 'mega') {
      // rainbow energy spirals in, the pokémon glows white and changes shape
      sfx.evolve(); setClass(u.uid, 'evolving', 2300);
      eng?.tint('#1a0033', 0.35, 3.2);
      for (const [i, col] of ['#ff5252', '#ffd740', '#69f0ae', '#40c4ff', '#e040fb'].entries()) eng?.gather(c, b().r * (1.8 + i * 0.15), col, 1.6, i * 0.08);
      eng?.orbit(b(), 12, 2.0, (ctx, x, y, i) => { const col = ['#ff5252', '#ffd740', '#69f0ae', '#40c4ff', '#e040fb', '#ffffff'][i % 6]; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill(); }, 6);
      await sleep(2000); flash('on'); sfx.cutin(); setForm(); setClass(u.uid, 'formed', 900);
      await sleep(80); const nb = b();
      eng?.starBurst({ x: nb.x, y: nb.y }, nb.r * 1.3, '#e040fb', 0.6); for (const [i, col] of ['#ff5252', '#ffd740', '#69f0ae', '#40c4ff'].entries()) eng?.ring({ x: nb.x, y: nb.y }, nb.r * 0.4, nb.r * (2.4 + i * 0.4), col, 0.8, 6, i * 0.07);
      eng?.emit(40, () => { const a = Math.random() * Math.PI * 2, s2 = 200 + Math.random() * 400; return { x: nb.x, y: nb.y, vx: Math.cos(a) * s2, vy: Math.sin(a) * s2, size: 10 + Math.random() * 10, shape: 'star', color: ['#ffffff', '#ffd740', '#40c4ff', '#e040fb'][Math.floor(Math.random() * 4)], max: 0.9 }; });
    } else if (form.kind === 'tera') {
      // crystal shards close in and encase the pokémon, then the shell bursts into facets
      const col = TYPE_COLOR[form.teraType ?? 'normal']; sfx.cast(); setClass(u.uid, 'crystallizing', 1700);
      const bb = b(); eng?.tint('#001a33', 0.3, 2.8);
      eng?.emit(30, i => { const a = (i / 30) * Math.PI * 2, d = bb.r * (2.2 + Math.random() * 0.8); return { x: bb.x + Math.cos(a) * d, y: bb.y + Math.sin(a) * d, vx: -Math.cos(a) * (d - bb.r * 0.7) / 0.9, vy: -Math.sin(a) * (d - bb.r * 0.7) / 0.9, drag: 1, size: 16 + Math.random() * 16, shape: 'shard', color: '#e0ffff', max: 1.1, rot: a + Math.PI / 2, vr: 0, delay: (i % 6) * 0.08 }; });
      eng?.glowAt(c, bb.r * 1.4, col, 1.8, 0.3, 0, 0.1);
      await sleep(1400); sfx.ice(); await sleep(250); flash('on'); setForm(); setClass(u.uid, 'formed', 900); sfx.superEff();
      await sleep(80); const nb = b();
      eng?.emit(36, () => { const a = Math.random() * Math.PI * 2, s2 = 250 + Math.random() * 450; return { x: nb.x, y: nb.y, vx: Math.cos(a) * s2, vy: Math.sin(a) * s2, g: 400, size: 12 + Math.random() * 14, shape: 'shard', color: '#e0ffff', max: 1, rot: a, vr: 6 }; });
      eng?.ring({ x: nb.x, y: nb.y }, nb.r * 0.4, nb.r * 2.6, col, 0.7, 7); eng?.starBurst({ x: nb.x, y: nb.y - nb.r * 0.9 }, nb.r * 0.6, col, 0.6, 0.1);
    } else {
      // red energy pours in from the sky and the pokémon swells to a gigantic size
      sfx.enrage(); eng?.tint('#3b0010', 0.4, 3.4); const bb = b();
      eng?.stream(1.6, 40, () => { const x = bb.x + (Math.random() - 0.5) * bb.r * 3; return { x, y: -20, vx: (bb.x - x) * 1.2, vy: 700, drag: 1, size: 14 + Math.random() * 12, shape: 'glow', color: Math.random() < 0.5 ? '#ff1744' : '#ff80ab', max: 0.55 }; });
      eng?.vortex(bb, 1.8, '#ff5252'); eng?.glowAt(c, bb.r * 1.6, '#ff1744', 2.2, 0, 0, 0.12);
      await sleep(1300); setForm(); sfx.quake(); shake(true); setClass(u.uid, 'growing', 1400);
      await sleep(700); shake(true); sfx.hitBig(); await sleep(500);
      const nb = b(); eng?.ring({ x: nb.x, y: nb.ground }, nb.r * 0.5, nb.r * 3.5, '#ff5252', 0.8, 9, 0, 0.28, 0);
    }
    setView(x => ({ ...x, nameplate: { text: form.name, sub: form.kind === 'tera' ? `テラスタル・${TYPE_JA[form.teraType ?? 'normal']}` : form.realForm && form.kind === 'dyna' ? 'キョダイマックス' : SPECIAL_JA[form.kind] } }));
    await banner(form.announce, 'gold', 1600);
    setView(x => ({ ...x, nameplate: null }));
  }, [banner, bodyOf, flash, setClass, shake]);

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
          const eng = engine.current;
          setLog(`${shownName(u)}の ${m.ja}！`);
          say(lines.move(getSpecies(u.speciesId).ja, m.ja), { priority: true });
          const cinematic = viewRef.current.solo !== null || opts.cinematic;
          const act: Act = eng?.actOf(m.id) ?? 'dash';
          if (!cinematic) {
            await focus(u.uid, `${m.ja}！`); punch(u.uid, 1.1, 500); await wait(520);
            if (m.power >= 90) { sfx.cutin(); setView(x => ({ ...x, cutin: cutinOf(u, m.id) })); await wait(950); setView(x => ({ ...x, cutin: null })); }
            if (m.category === 'physical') { sfx.lunge(); setClass(u.uid, u.side === 'ally' ? 'lunge-right' : 'lunge-left', 600); await wait(260); }
            else { sfx.cast(); setClass(u.uid, act === 'rise' || act === 'roar' ? act : 'blast', 900); await wait(300); }
            sfx[FX_SFX[m.fx]]();
            if (eng && t && t.uid !== u.uid) { const tb = bodyOf(t.uid); const info = eng.impact(m.id, tb, tb.x >= bodyOf(u.uid).x ? 1 : -1); await wait(info.hitAt); if (info.react) react(t.uid, `st-${info.react}`, 1600); heavyRef.current = !!info.heavy; }
            else if (eng) await wait(eng.launch(m.id, bodyOf(u.uid), u.side === 'ally' ? 1 : -1));
            void focus(null); void color;
            break;
          }
          const dir = u.side === 'ally' ? 1 : -1;
          // ---- 1. close-up on the attacker: name plate, move callout, type-flavoured power-up (≈2.8s)
          setView(x => ({ ...x, solo: u.uid, callout: null, nameplate: { text: shownName(u), sub: u.ownerId === 'wild' ? 'やせいの ポケモン' : u.ownerName }, speedlines: false }));
          setClass(u.uid, 'stepin', 700); sfx.lunge();
          await wait(750);
          punch(u.uid, 1.08, 2200);
          setView(x => ({ ...x, speedlines: true, callout: { uid: u.uid, text: `${m.ja}！` } }));
          sfx.cast(); setClass(u.uid, 'powerup', 1900);
          eng?.charge(m.id, bodyOf(u.uid), dir, 1800);
          await wait(1800);
          if (u.side === 'ally') sfx.buff(); else sfx.debuff();
          await wait(250);
          // ---- 2. cut-in with the move name (≈1.1s)
          sfx.cutin(); setView(x => ({ ...x, cutin: cutinOf(u, m.id), speedlines: false }));
          await wait(1050); setView(x => ({ ...x, cutin: null }));
          // ---- 3. launch: the attacker acts out the move and the attack flies off screen (≈0.9s)
          if (act === 'dash') { setClass(u.uid, 'windup', 320); await wait(260); setClass(u.uid, 'launch', 1100); sfx.lunge(); }
          else setClass(u.uid, act, 1100);
          setView(x => ({ ...x, speedlines: act === 'dash' }));
          sfx[FX_SFX[m.fx]]();
          const outMs = eng ? eng.launch(m.id, bodyOf(u.uid), dir) : 800;
          if (act === 'stomp' || act === 'burrow') setTimeout(() => shake(act === 'stomp'), act === 'stomp' ? 450 : 150);
          await wait(outMs);
          // ---- 4. cut to the target: the move arrives and lands (≈0.3–0.5s), the hit itself is the damage event
          if (t && t.uid !== u.uid) {
            flash('on dark');
            setView(x => ({ ...x, solo: t.uid, callout: null, speedlines: false, nameplate: { text: shownName(t), sub: t.ownerId === 'wild' ? 'やせいの ポケモン' : t.ownerName } }));
            await wait(280);
            eng?.clear();
            const info = eng ? eng.impact(m.id, bodyOf(t.uid), dir) : { hitAt: 400 };
            heavyRef.current = !!info.heavy;
            await wait(info.hitAt);
            sfx[FX_SFX[m.fx]]();
            if (info.react) react(t.uid, `st-${info.react}`, 1800);
          } else { setView(x => ({ ...x, speedlines: false })); }
          break;
        }
        case 'miss': sfx.miss(); await banner('しかし はずれた！', '', 700 / sp); break;
        case 'damage': {
          const t = nameOf(v, e.targetUid); if (!t) break;
          const big = e.effectiveness >= 2 || e.crit || e.amount >= t.maxHp * 0.3 || heavyRef.current; heavyRef.current = false;
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
        case 'special': {
          const u = nameOf(v, e.userUid); if (!u) break;
          say(lines.specialDone(SPECIAL_JA[e.special]), { priority: true });
          const form = formFor(e.special, u.speciesId, seedOf(u.uid), getMove(u.moves[0]).type);
          if (!form || viewRef.current.forms[u.uid]) {
            // Zワザ / タッグわざ (or already transformed): a power-up flourish
            sfx.cutin(); flash('on crit'); setClass(e.userUid, 'charge', 900); setView(x => ({ ...x, cutin: cutinOf(u, getMove(u.moves[0]).id) }));
            await banner(`${shownName(u)}の ${SPECIAL_JA[e.special]}！`, 'gold', 1000 / sp); setView(x => ({ ...x, cutin: null })); break;
          }
          await transform(u, form);
          break;
        }
        case 'assist': { const pt = nameOf(v, e.partnerUid); if (pt) { setClass(pt.uid, pt.side === 'ally' ? 'lunge-right' : 'lunge-left', 600); await wait(220); playFx(getMove(pt.moves[0]).fx, pt.uid, e.targetUid, TYPE_COLOR[getMove(pt.moves[0]).type]); sfx.hit(); setClass(e.targetUid, 'hit', 500); shake(false); pop(e.targetUid, `${e.amount}`, 'super'); updateB(e.targetUid, { hp: e.hpAfter }); await banner(`${pt.name}の タッグアタック！`, 'info', 800 / sp); } break; }
        case 'support': { sfx.slash(); playFx('impact', e.targetUid, e.targetUid, '#ffc371'); setClass(e.targetUid, 'hit', 500); shake(false); pop(e.targetUid, `${e.amount}`, 'heal'); updateB(e.targetUid, { hp: e.hpAfter }); await banner(`サポートの ${e.name}が ついげき！`, 'info', 800 / sp); break; }
        case 'battle_end': { if (e.winner === 'ally') { sfx.victory(); say(lines.win(), { priority: true }); await banner('WIN！', 'gold', 1600 / sp); } else { sfx.lose(); say(lines.lose(), { priority: true }); await banner('まけてしまった…', '', 1600 / sp); } break; }
      }
    }
    if (opts.restoreSolo !== undefined) setView(x => ({ ...x, solo: opts.restoreSolo ?? null, nameplate: null, speedlines: false, slowmo: false }));
    setBusy(false);
  }, [banner, flash, playFx, pop, setClass, setLog, shake, focus, punch, posOf, bodyOf, react, transform]);

  const api = useMemo(() => ({ view, setBattlers, play, setClass, banner, flash, shake, pop, posOf, bodyOf, playFx, setLog, punch, focus, solo, busy, refs: { root, canvas, back, engine } }), [view, setBattlers, play, setClass, banner, flash, shake, pop, posOf, bodyOf, playFx, setLog, punch, focus, solo, busy]);
  // debug handle for the E2E scripts (window.__pk is created in main.tsx)
  useEffect(() => { const w = window as unknown as { __pk?: Record<string, unknown> }; if (w.__pk) w.__pk.stage = api; });
  return api;
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
    if (duel) return f.uid === duel.foeUid ? { right: '8%', top: 'calc(5% + var(--safe-t))' } : { left: `${2 + i * 17}%`, top: 'calc(11% + var(--safe-t))' };
    return foeN === 1 ? { right: '6%', top: 'calc(4% + var(--safe-t))' } : { right: `${4 + i * 31}%`, top: `calc(${3 + (i % 2) * 6}% + var(--safe-t))` };
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
        <canvas ref={api.refs.back} className="fxcanvas back" />
        <div className="zoom" style={{ transform: v.zoom, transformOrigin: v.zoomOrigin }}>
          {b && <Combatant key={b.uid} b={b} form={v.forms[b.uid]} cls={`${v.cls[b.uid] ?? ''} ${v.tint[b.uid] ?? ''} solo`} size={Math.min(300, (api.refs.root.current?.clientWidth ?? 390) * 0.72)} style={{ left: '50%', top: 'calc(44% + var(--safe-t) / 2)', transform: 'translate(-50%,-50%)' }} pops={v.pops} mine={!!myOwnerId && b.ownerId === myOwnerId} tired={select.tiredUids?.includes(b.uid)} callout={v.callout?.uid === b.uid ? v.callout.text : undefined} emotes={emotes.filter(e => e.playerId === b.ownerId)} />}
        </div>
        {v.nameplate && <div className={`nameplate ${b?.side ?? ''}`}><b>{v.nameplate.text}</b>{v.nameplate.sub && <small>{v.nameplate.sub}</small>}</div>}
        <TeamHud side="foe" list={v.foes} front={select.targetUid ?? null} tired={[]} forms={v.forms} />
        <TeamHud side="ally" list={v.allies} front={select.attackerUid ?? null} tired={select.tiredUids ?? []} onSelect={select.onSelectAlly} pending={pendingUids} forms={v.forms} />
        <canvas ref={api.refs.canvas} className="fxcanvas" />
        <div className={`flash ${v.flash}`} />
        {v.cutin && <CutIn moveId={v.cutin.moveId} speciesId={v.cutin.speciesId} shiny={v.cutin.shiny} artId={v.cutin.artId} label={v.cutin.label} />}
        {v.banner && <div className={`banner ${v.banner.kind}`}><span>{v.banner.text}</span></div>}
        {children}
      </div>
    );
  }
  return (
    <div ref={api.refs.root} className={`stage ${v.shake} ${v.focusUid ? 'focusing' : ''} ${duel ? 'duel' : ''}`}>
      <div className="bg" style={{ background: bg }}>{scene && <Scene id={scene} />}</div>
      <canvas ref={api.refs.back} className="fxcanvas back" />
      <div className="zoom" style={{ transform: v.zoom, transformOrigin: v.zoomOrigin }}>
        {v.foes.map((f, i) => {
          const isFront = !duel || duel.foeUid === f.uid;
          const eff = attacker && select.showMatchup && !f.fainted && isFront ? typeMultiplier(getMove(attacker.moves[0]).type, getSpecies(f.speciesId).types) : null;
          return <Combatant key={f.uid} b={f} form={v.forms[f.uid]} cls={`${v.cls[f.uid] ?? ''} ${v.tint[f.uid] ?? ''} ${select.targetUid === f.uid ? 'target' : ''} ${select.onSelectFoe && !f.fainted ? 'selectable' : ''} ${v.focusUid === f.uid ? 'focus' : ''} ${duel && !isFront ? 'back' : ''} ${duel && isFront ? 'front' : ''}`} size={foeSz(f)}
            style={foeStyle(f, i)} pops={v.pops} eff={eff} onClick={select.onSelectFoe && !f.fainted ? () => select.onSelectFoe!(f.uid) : undefined} callout={v.callout?.uid === f.uid ? v.callout.text : undefined} compact={!!duel && !isFront} />;
        })}
        {v.allies.map((a, i) => {
          const isFront = !duel || duel.allyUid === a.uid;
          return <Combatant key={a.uid} b={a} form={v.forms[a.uid]} cls={`${v.cls[a.uid] ?? ''} ${v.tint[a.uid] ?? ''} ${select.attackerUid === a.uid ? 'attacker' : ''} ${select.tiredUids?.includes(a.uid) ? 'tired' : ''} ${select.onSelectAlly && !a.fainted ? 'selectable' : ''} ${v.focusUid === a.uid ? 'focus' : ''} ${duel && !isFront ? 'back' : ''} ${duel && isFront ? 'front' : ''}`} size={allySz(a)} mine={!!myOwnerId && a.ownerId === myOwnerId} pending={pendingUids.includes(a.uid)}
            style={allyStyle(a, i)} pops={v.pops}
            emotes={emotes.filter(e => e.playerId === a.ownerId)} tired={select.tiredUids?.includes(a.uid)} onClick={select.onSelectAlly && !a.fainted ? () => select.onSelectAlly!(a.uid) : undefined} callout={v.callout?.uid === a.uid ? v.callout.text : undefined} compact={!!duel && !isFront} />;
        })}
      </div>
      {focusPos && <div className="spot" style={{ background: `radial-gradient(circle at ${focusPos.x}px ${focusPos.y}px, transparent 90px, rgba(0,0,0,.55) 260px)` }} />}
      {lineFrom && lineTo && <svg className="speedline" style={{ color: select.line === 'blue' ? '#66e0ff' : '#ff5f6d' }}><line x1={lineFrom.x} y1={lineFrom.y} x2={lineTo.x} y2={lineTo.y} stroke="currentColor" /></svg>}
      <canvas ref={api.refs.canvas} className="fxcanvas" />
      <div className={`flash ${v.flash}`} />
      {v.cutin && <CutIn moveId={v.cutin.moveId} speciesId={v.cutin.speciesId} shiny={v.cutin.shiny} artId={v.cutin.artId} label={v.cutin.label} />}
      {v.banner && <div className={`banner ${v.banner.kind}`}><span>{v.banner.text}</span></div>}
      {children}
    </div>
  );
}

function Combatant({ b, cls, size, style, mine, pending, pops, emotes = [], eff, onClick, tired, callout, compact, form }: { form?: BattleForm; b: Battler; cls: string; size: number; style: React.CSSProperties; mine?: boolean; pending?: boolean; pops: Pop[]; emotes?: EmoteBubble[]; eff?: number | null; onClick?: () => void; tired?: boolean; callout?: string; compact?: boolean }) {
  const s = getSpecies(b.speciesId);
  const fcls = form ? `form-${form.kind} ${form.realForm ? '' : 'pseudo'}` : '';
  const sp = { id: b.speciesId, shiny: b.shiny, box: size, formId: form?.spriteId, form: form?.kind, tera: form?.teraType ? TYPE_COLOR[form.teraType] : undefined };
  if (compact) return (
    <div className={`combatant ${b.side} ${cls} ${fcls} ${mine ? 'mine' : ''}`} data-uid={b.uid} style={{ ...style, width: size }} onClick={onClick}>
      <div className="art" style={{ width: size, height: size }}><BattleSprite {...sp} />{tired && <span className="zz">💤</span>}{pops.filter(p => p.uid === b.uid).map(p => <div key={p.id} className={`dmg ${p.cls}`} style={{ left: '50%', top: '40%' }}>{p.text}</div>)}</div>
      <div className="mini-hp"><HpBar hp={b.hp} max={b.maxHp} /></div>
    </div>
  );
  return (
    <div className={`combatant ${b.side} ${cls} ${fcls} ${mine ? 'mine' : ''} ${b.isBoss ? 'boss' : ''}`} data-uid={b.uid} style={{ ...style, width: size }} onClick={onClick}>
      {/launch/.test(cls) && [1, 2, 3].map(i => <div key={i} className={`art ghost g${i}`} style={{ width: size, height: size }}><BattleSprite {...sp} form={undefined} /></div>)}
      <div className="art" style={{ width: size, height: size }}>
        <BattleSprite {...sp} />
        {callout && <div className="callout">{callout}</div>}
        {tired && <span className="zz">💤</span>}
        {eff !== null && eff !== undefined && <span className={`eff-tag ${eff >= 2 ? 'super' : eff === 0 ? 'none' : eff < 1 ? 'weak' : ''}`}>{eff >= 2 ? 'ばつぐん' : eff === 0 ? 'こうかなし' : eff < 1 ? 'いまひとつ' : 'ふつう'}</span>}
        {emotes.map(e => <div key={e.id} className="emote" style={{ left: '50%', top: 0 }}>{e.emote}</div>)}
        {pops.filter(p => p.uid === b.uid).map(p => <div key={p.id} className={`dmg ${p.cls}`} style={{ left: '50%', top: '40%' }}>{p.cls.includes('countup') ? <CountUp to={parseInt(p.text) || 0} /> : p.text}</div>)}
      </div>
      <div className="plate">
        <div className="nm"><span>{b.isBoss && '👑'}{form?.name ?? b.name}{b.shiny && '✨'}</span><span>Lv.{b.level}</span></div>
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
function TeamHud({ side, list, front, tired, onSelect, pending = [], forms = {} }: { forms?: Record<string, BattleForm>; side: 'ally' | 'foe'; list: Battler[]; front: string | null; tired: string[]; onSelect?: (uid: string) => void; pending?: string[] }) {
  if (!list.length) return null;
  return (
    <div className={`hud hud-${side}`}>
      {list.map(b => (
        <button key={b.uid} className={`hud-chip ${b.uid === front ? 'front' : ''} ${b.fainted ? 'down' : ''} ${tired.includes(b.uid) ? 'tired' : ''}`} disabled={!onSelect || b.fainted} onClick={() => onSelect?.(b.uid)}>
          <Sprite id={b.speciesId} shiny={b.shiny} size={34} />
          <div className="hud-info"><div className="hud-name">{b.isBoss && '👑'}{forms[b.uid] && <span className="form-badge">{{ mega: '🧬', tera: '💎', dyna: '🔺' }[forms[b.uid].kind]}</span>}{forms[b.uid]?.name ?? b.name}{tired.includes(b.uid) && ' 💤'}{pending.includes(b.uid) && <span className="pending-dot" style={{ marginLeft: 4 }} />}</div><HpBar hp={b.hp} max={b.maxHp} /><div className="hud-sub">Lv.{b.level} {b.side === 'ally' && b.ownerName !== 'やせい' ? `・${b.ownerName}` : ''}</div></div>
        </button>
      ))}
    </div>
  );
}

function CutIn({ moveId, speciesId, shiny, artId, label }: { moveId: string; speciesId: number; shiny: boolean; artId?: number; label?: string }) {
  const m = getMove(moveId);
  return (
    <div className="cutin" style={{ '--c': TYPE_COLOR[m.type] } as React.CSSProperties}>
      <div className="band" />
      <img src={artworkUrl(artId ?? speciesId, shiny)} alt="" />
      <div className="txt"><small>{label ?? getSpecies(speciesId).ja}の</small>{m.ja}</div>
    </div>
  );
}
