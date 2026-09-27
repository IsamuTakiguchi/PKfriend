import { useEffect, useRef, useState } from 'react';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
import {
  AREAS, areaPool, getSpecies, getMove, makeRng, randomSeed, pick, randInt, wildBattler, battlerFromOwned, newBattle, resolveRound, wildActions, aiChoose,
  rollCatchBall, createOwned, expGain, levelFromExp, evolveLevel, evolutionsOf, movesFor, typeMultiplier, stageMul, SHINY_RATE, displayName, makeTrainer, trainerLabel, exchangeOffer, exchangeLevel, TYPE_COLOR, TYPE_JA, gradeOf,
  type Area, type Battler, type BattleState, type OwnedPokemon, type BattleAction, type BallKind, type SpecialKind, type TrainerDef, type Rng,
} from '@pkfriend/shared';
import { useStore, useParty } from '../store';
import { useBattleStage, BattleStage } from '../battle/stage';
import { ThrowBall } from '../battle/CatchGame';
import { AttackRoulette, BallRoulette, MashChance, SpecialChance, FollowUpChance } from '../battle/minigames';
import { Sprite, Modal, PickCard, PokeCard, Grade } from '../components/ui';
import { BoxPicker } from '../components/BoxPicker';
import { sfx, unlockAudio } from '../audio';
import { toast } from '../toast';
import { useBgm } from '../music';
import { useImmersive } from '../ui';

type Mode = 'menu' | 'areas' | 'prep' | 'battle' | 'now-areas' | 'now';

const rentalFor = (area: Area, level: number, rng: Rng, ownerName: string): OwnedPokemon => { const basics = areaPool(area).filter(id => !getSpecies(id).evolvesFrom); return { ...createOwned({ speciesId: pick(rng, basics.length ? basics : areaPool(area)), level, rng, ownerId: 'rental', ownerName, origin: 'rental', mark: null }), uid: 'rental_' + Math.random().toString(36).slice(2, 8) }; };

export function Explore() {
  const [mode, setMode] = useState<Mode>('menu');
  const [area, setArea] = useState<Area | null>(null);
  const [team, setTeam] = useState<OwnedPokemon[]>([]);
  const party = useParty();
  useBgm(mode === 'battle' || mode === 'now' ? null : 'explore');
  if (!party.length) return <div className="screen"><p className="muted center">パーティに ポケモンが いません</p></div>;

  if (mode === 'menu') return (
    <div className="screen stack">
      <h1>たんけん</h1>
      <button className="area" style={{ background: 'linear-gradient(135deg,#56ab2f,#a8e063)', minHeight: 120 }} onClick={() => { unlockAudio(); sfx.select(); setMode('areas'); }}><h2>⚔️ バトルでゲット！</h2><span className="small">やせいの ポケモン3匹と 3対3で バトル。たおすたびに ゲットタイム！ こうげきルーレットで だいダメージを ねらえ。</span></button>
      <button className="area" style={{ background: 'linear-gradient(135deg,#f7971e,#ffd200)', minHeight: 120 }} onClick={() => { unlockAudio(); sfx.select(); setMode('now-areas'); }}><h2>🍬 いますぐゲット！</h2><span className="small">バトルなしで ゲット。くさむらに おかしを なげて、はんのうが あった ところに ボールを なげよう。</span></button>
      <div className="card row"><Sprite id={party[0].speciesId} shiny={party[0].shiny} size={56} /><div><div className="small muted">セットする ピック（さいだい3枚）</div><b>{party.map(p => displayName(p)).join('・')}</b><div className="small muted">バトルまえに いれかえ できます</div></div></div>
    </div>
  );
  if (mode === 'areas' || mode === 'now-areas') return (
    <div className="screen stack">
      <div className="row between"><h1>{mode === 'areas' ? 'エリアを えらぶ' : 'いますぐゲット！'}</h1><button className="btn sm" onClick={() => setMode('menu')}>もどる</button></div>
      {AREAS.map(a => <button key={a.id} className="area" style={{ background: a.bg }} onClick={() => { sfx.select(); setArea(a); setMode(mode === 'areas' ? 'prep' : 'now'); }}><span className="lvl">Lv.{a.minLevel}〜{a.maxLevel}</span><h2>{a.ja}</h2><span className="small">{a.desc}</span></button>)}
    </div>
  );
  if (mode === 'prep' && area) return <TeamPrep area={area} onBack={() => setMode('areas')} onStart={t => { setTeam(t); setMode('battle'); }} />;
  if (mode === 'battle' && area) return <Encounter area={area} team={team} onExit={() => setMode('menu')} />;
  if (mode === 'now' && area) return <NowGet area={area} onExit={() => setMode('menu')} />;
  return null;
}

// ------------------------------------------------------------------ team prep: set your 3 picks (change / swap before battle)
function TeamPrep({ area, onBack, onStart }: { area: Area; onBack: () => void; onStart: (team: OwnedPokemon[]) => void }) {
  const party = useParty(); const box = useStore(s => s.box); const setParty = useStore(s => s.setParty); const player = useStore(s => s.player)!;
  const rng = useRef(makeRng(randomSeed()));
  const leadLv = levelFromExp(party[0].exp);
  const [slots, setSlots] = useState<(OwnedPokemon | null)[]>(() => [party[0] ?? null, party[1] ?? null, party[2] ?? null]);
  const [pickSlot, setPickSlot] = useState<number | null>(null);
  const chosen = slots.filter((p): p is OwnedPokemon => !!p);
  const rentals = 3 - chosen.length;
  function start() {
    const team = [...chosen];
    while (team.length < 3) team.push(rentalFor(area, leadLv, rng.current, player.name));
    setParty(chosen.map(p => p.uid));
    sfx.encounter(); onStart(team);
  }
  return (
    <div className="screen stack">
      <div className="row between"><h1>ピックを セット</h1><button className="btn sm" onClick={onBack}>もどる</button></div>
      <div className="card small" style={{ background: area.bg, color: '#fff', textShadow: '0 1px 2px #000' }}><b>{area.ja}</b>　Lv.{area.minLevel}〜{area.maxLevel}　{area.types.map(t => TYPE_JA[t]).join('・')}タイプが おおい</div>
      <p className="small muted" style={{ margin: 0 }}>3枚まで セットできる。タップで いれかえ。たりない ぶんは <b>レンタルポケモン</b>が はいる（レンタルは ゲームが おわると かえす）。</p>
      <div className="grid3">
        {slots.map((p, i) => p ? <PokeCard key={i} p={p} size={64} tag={i === 0 ? '1ばん' : `${i + 1}ばん`} onClick={() => setPickSlot(i)} /> : (
          <button key={i} className="pokecard" onClick={() => setPickSlot(i)} style={{ minHeight: 150, justifyContent: 'center' }}><div style={{ fontSize: 28 }}>➕</div><span className="small muted">{box.length > chosen.length ? 'ピックを えらぶ' : 'レンタル'}</span></button>
        ))}
      </div>
      <div className="card stack" style={{ gap: 6 }}>
        <h3>えらぶ ポイント</h3>
        <div className="small">① <b>タイプ</b>: あいての タイプに ばつぐんの わざを もつ ポケモンを 前に出そう（バトル中に ばつぐん/いまひとつ が 表示される）</div>
        <div className="small">② <b>すばやさ</b>: すばやさが 高いほうが 先に こうげき。おそくても「せんこうチャンス」で ぎゃくてん できる</div>
        <div className="small">③ <b>つかれ</b>: 1つ前の ターンに こうげきした ポケモンは つかれていて ルーレットが まわらない。3匹を こうたいで つかおう</div>
      </div>
      <button className="btn primary lg block" onClick={start}>⚔️ バトル スタート！{rentals > 0 && <small style={{ fontSize: 12 }}>（レンタル {rentals}匹）</small>}</button>
      {pickSlot !== null && <BoxPicker title={`${pickSlot + 1}ばんめの ピック`} exclude={chosen.filter((_, i) => i !== pickSlot).map(p => p.uid)} selected={slots[pickSlot]?.uid} onPick={p => { const n = [...slots]; n[pickSlot] = p; setSlots(n); setPickSlot(null); sfx.select(); }} onClose={() => setPickSlot(null)}>
        {slots[pickSlot] && <button className="btn block" style={{ marginTop: 10 }} onClick={() => { const n = [...slots]; n[pickSlot] = null; setSlots(n); setPickSlot(null); }}>この わくを レンタルに する</button>}
      </BoxPicker>}
    </div>
  );
}

// ------------------------------------------------------------------ battle-de-get: 3 vs 3
type Phase = 'intro' | 'trainerOffer' | 'choose' | 'special' | 'mash' | 'roulette' | 'tagRoulette' | 'followup' | 'resolving' | 'getTime' | 'ballRoulette' | 'throw' | 'exchange' | 'bonus' | 'result' | 'lost';
interface Pending { attackerUid: string; targetUid: string; special?: SpecialKind; initiative?: number; roulette?: number; assistUid?: string; assistRoulette?: number; support?: { speciesId: number; name: string } }

function Encounter({ area, team, onExit }: { area: Area; team: OwnedPokemon[]; onExit: () => void }) {
  const player = useStore(s => s.player)!;
  const addPokemon = useStore(s => s.addPokemon); const removePokemon = useStore(s => s.removePokemon); const updatePokemon = useStore(s => s.updatePokemon); const markSeen = useStore(s => s.markSeen); const bump = useStore(s => s.bump);
  const api = useBattleStage();
  const rng = useRef(makeRng(randomSeed()));
  const state = useRef<BattleState | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [trainer, setTrainer] = useState<TrainerDef | null>(null);
  const [isTrainerBattle, setIsTrainerBattle] = useState(false);
  const [targetUid, setTargetUid] = useState<string | null>(null);
  const [attackerUid, setAttackerUid] = useState<string | null>(null);
  const [tiredUid, setTiredUidState] = useState<string | null>(null);
  const tiredRef = useRef<string | null>(null);
  const setTiredUid = (u: string | null) => { tiredRef.current = u; setTiredUidState(u); };
  const [nextWild, setNextWild] = useState<Battler | null>(null);
  const usedSpecial = useRef(new Set<string>());
  const pending = useRef<Pending | null>(null);
  const [getTarget, setGetTarget] = useState<Battler | null>(null);
  const [ball, setBall] = useState<BallKind | null>(null);
  const [isLast, setIsLast] = useState(false);
  const [caught, setCaught] = useState<OwnedPokemon[]>([]);
  const [justCaught, setJustCaught] = useState<OwnedPokemon | null>(null);
  const [exchange, setExchange] = useState<{ give: OwnedPokemon; offer: OwnedPokemon } | null>(null);
  const [levelUps, setLevelUps] = useState<{ uid: string; from: number; to: number }[]>([]);
  const [evo, setEvo] = useState<{ p: OwnedPokemon; to: number } | null>(null);
  const [evolving, setEvolving] = useState(false); const [evoDone, setEvoDone] = useState(false);
  const [expTotal, setExpTotal] = useState(0);
  const participants = useRef(new Set<string>());
  const defeated = useRef<Battler[]>([]);
  const [, force] = useState(0);
  const [fleeAsk, setFleeAsk] = useState(false);
  const busy = api.busy;
  useImmersive();
  useBgm(phase === 'result' || phase === 'exchange' ? 'result' : phase === 'getTime' || phase === 'ballRoulette' || phase === 'throw' || phase === 'bonus' ? 'catch' : 'battle');

  const leadLv = levelFromExp(team[0].exp);
  const wildLevel = () => { const lo = Math.max(area.minLevel, leadLv - 3), hi = Math.min(area.maxLevel, leadLv + 2); return lo <= hi ? randInt(rng.current, lo, hi) : randInt(rng.current, area.minLevel, Math.min(area.maxLevel, Math.max(area.minLevel, leadLv + 2))); };

  // ---- setup: 3 wilds (or a trainer ambush)
  useEffect(() => {
    const r = rng.current;
    const allies = team.map(p => battlerFromOwned(p, player.id, player.name, 'ally'));
    const wilds = [0, 1, 2].map(() => { const sid = pick(r, areaPool(area)); markSeen(sid); return wildBattler(getSpecies(sid), wildLevel(), r, { shiny: r() < SHINY_RATE }); });
    state.current = newBattle(allies, wilds);
    const t = setTimeout(async () => {
      api.setBattlers(allies, wilds);
      if (r() < 0.15) { const tr = makeTrainer(area, leadLv, r); setTrainer(tr); setPhase('trainerOffer'); return; }
      await introduce(wilds, 'やせいの ポケモン');
      startTurn();
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** cinematic intro: each opponent appears alone on screen */
  async function introduce(list: Battler[], sub: string) {
    for (const w of list) { sfx.encounter(); api.solo(w.uid, { enter: true, callout: 'あらわれた！', nameplate: { text: `やせいの ${w.name}`, sub: `${sub} Lv.${w.level}` } }); await sleep(1300); }
  }
  const aliveAllies = () => state.current?.allies.filter(a => !a.fainted) ?? [];
  const aliveFoes = () => state.current?.foes.filter(f => !f.fainted) ?? [];

  async function startTurn() {
    if (!state.current) return;
    const foes = aliveFoes(); const allies = aliveAllies();
    if (!foes.length || !allies.length) return;
    setPhase('resolving');
    // あいては じどうで 前に出てくる
    const nw = foes[Math.floor(rng.current() * foes.length)]; setNextWild(nw); setTargetUid(nw.uid);
    sfx.lunge();
    api.solo(nw.uid, { enter: true, callout: `${nw.name}、前へ！`, nameplate: { text: nw.name, sub: isTrainerBattle && trainer ? trainerLabel(trainer) : 'やせいの ポケモン' } });
    await sleep(1500);
    api.setLog(`あいての ${nw.name}が 前に出てきた！ こちらは だれを 出す？`);
    const fresh = allies.find(a => a.uid !== tiredRef.current) ?? allies[0];
    chooseAttacker(fresh.uid, true);
    setPhase('choose'); force(x => x + 1);
  }
  function chooseAttacker(uid: string, silent = false) {
    setAttackerUid(uid);
    const a = state.current?.allies.find(x => x.uid === uid);
    if (!silent) sfx.select();
    api.solo(uid, { enter: true, callout: silent ? undefined : '前へ！', nameplate: a ? { text: a.name, sub: `${player.name}の ポケモン` } : null });
  }

  async function acceptTrainer(yes: boolean) {
    if (!trainer || !state.current) return;
    if (!yes) { setTrainer(null); await introduce(state.current.foes, 'やせいの ポケモン'); startTurn(); return; }
    const foes = trainer.speciesIds.map(id => { const b = wildBattler(getSpecies(id), trainer.level, rng.current); b.ownerName = trainerLabel(trainer); b.ownerId = 'trainer'; markSeen(id); return b; });
    state.current.foes = foes; setIsTrainerBattle(true);
    api.setBattlers(state.current.allies, foes);
    sfx.cutin(); await api.banner(`${trainerLabel(trainer)}が しょうぶを しかけてきた！`, 'big', 1600);
    for (const f of foes) { sfx.encounter(); api.solo(f.uid, { enter: true, callout: 'いけっ！', nameplate: { text: f.name, sub: `${trainerLabel(trainer)} Lv.${f.level}` } }); await sleep(1100); }
    startTurn();
  }

  const attacker = state.current?.allies.find(a => a.uid === attackerUid);
  const target = state.current?.foes.find(f => f.uid === targetUid);
  const iAmFaster = !!attacker && !!nextWild && attacker.stats.spe * stageMul(attacker.stages.spe) >= nextWild.stats.spe * stageMul(nextWild.stages.spe);

  // ---- attack flow: special chance -> (speed) -> roulette -> (tag roulette) -> (follow-up) -> resolve
  function beginAttack() {
    if (!attacker || !target || busy) return;
    sfx.click();
    pending.current = { attackerUid: attacker.uid, targetUid: target.uid };
    const owned = team.find(p => p.uid === attacker.uid);
    if (owned?.mark && !usedSpecial.current.has(attacker.uid)) { usedSpecial.current.add(attacker.uid); setPhase('special'); return; }
    afterSpecial();
  }
  function afterSpecial() { if (!iAmFaster) setPhase('mash'); else setPhase('roulette'); }
  function onSpecial(ok: boolean) { const p = pending.current!; const owned = team.find(x => x.uid === p.attackerUid); if (ok && owned?.mark) p.special = owned.mark; afterSpecial(); }
  function onMash(won: boolean) { if (won) pending.current!.initiative = 5; setPhase('roulette'); }
  function onRoulette(n: number) {
    const p = pending.current!; p.roulette = n;
    if (p.special === 'tag') { const partner = aliveAllies().find(a => a.uid !== p.attackerUid && a.uid !== tiredRef.current) ?? aliveAllies().find(a => a.uid !== p.attackerUid); if (partner) { p.assistUid = partner.uid; setPhase('tagRoulette'); return; } }
    afterRoulette();
  }
  function onTagRoulette(n: number) { pending.current!.assistRoulette = n; afterRoulette(); }
  function afterRoulette() { if (rng.current() < 0.3) setPhase('followup'); else void resolveTurn(); }
  function onFollowUp(ok: boolean) { if (ok) pending.current!.support = { speciesId: player.avatarSpeciesId, name: getSpecies(player.avatarSpeciesId).ja }; void resolveTurn(); }

  async function resolveTurn() {
    if (!state.current || !pending.current) return;
    setPhase('resolving');
    const p = pending.current; pending.current = null;
    const a = state.current.allies.find(x => x.uid === p.attackerUid)!;
    participants.current.add(a.uid);
    const action: BattleAction = { battlerUid: a.uid, moveId: a.moves[0], targetUid: p.targetUid, roulette: p.roulette, initiative: p.initiative, special: p.special, assistUid: p.assistUid, assistRoulette: p.assistRoulette, support: p.support };
    const first = !!p.initiative || iAmFaster;
    await api.banner(first ? `${a.name}の せんこう！` : `${nextWild?.name ?? 'あいて'}の せんこう…！`, first ? 'info' : '', 800);
    const foeActs = isTrainerBattle ? trainerActions(a.uid) : wildActions(state.current, rng.current, nextWild?.uid, a.uid);
    const before = state.current.foes.filter(f => f.fainted).map(f => f.uid);
    const events = resolveRound(state.current, [action, ...foeActs], rng.current);
    await api.play(events, { cinematic: true, restoreSolo: p.targetUid });
    setTiredUid(a.uid);
    const newlyDown = state.current.foes.filter(f => f.fainted && !before.includes(f.uid));
    for (const f of newlyDown) defeated.current.push(f);
    if (!aliveAllies().length) { bump('battles'); await api.banner('めのまえが まっくらに なった…', '', 1500); setPhase('lost'); return; }
    if (newlyDown.length && !isTrainerBattle) { // ゲットタイム for the defeated wild
      const f = newlyDown[0]; const last = aliveFoes().length === 0;
      setIsLast(last); setGetTarget(f);
      api.solo(f.uid, { nameplate: { text: f.name, sub: 'よわっている！' } }); api.setClass(f.uid, 'popout');
      sfx.encounter(); await api.banner(last ? 'ラストゲットタイム！' : 'ゲットタイム！', 'big', 1300);
      setPhase('getTime'); return;
    }
    if (!aliveFoes().length) { await finishBattle(); return; }
    startTurn();
  }
  function trainerActions(targetUid: string): BattleAction[] {
    const foes = aliveFoes(); const allies = aliveAllies(); if (!foes.length || !allies.length) return [];
    const f = nextWild && !nextWild.fainted ? nextWild : foes[0]; const t = allies.find(x => x.uid === targetUid) ?? allies[0];
    return [{ battlerUid: f.uid, moveId: aiChoose(f, t, rng.current), targetUid: t.uid, roulette: 4 + Math.floor(rng.current() * 5) }];
  }

  // ---- get time: ball roulette -> throw
  function onBall(b: BallKind) { setBall(b); setPhase('throw'); }
  async function resolveThrow() {
    const t = getTarget!; const r = rollCatchBall(t, ball!, rng.current);
    if (r.success) { const p = createOwned({ speciesId: t.speciesId, level: t.level, rng: rng.current, ownerId: player.id, ownerName: player.name, origin: phase === 'bonus' || isTrainerBattle ? 'bonus' : 'wild', shiny: t.shiny }); addPokemon(p); bump('catches'); setCaught(c => [...c, p]); setJustCaught(p); }
    return r;
  }
  async function afterThrow(success: boolean) {
    const t = getTarget!;
    if (!success) await api.banner(`${t.name}は にげてしまった…`, '', 1000);
    api.setClass(t.uid, 'gone'); setGetTarget(null); setBall(null); await sleep(300);
    if (success && isLast && rng.current() < 0.35 && justCaughtRef.current) { // こうかんチャンス
      const give = justCaughtRef.current; const offerId = exchangeOffer(give.speciesId, t.level, rng.current); markSeen(offerId);
      const offer = createOwned({ speciesId: offerId, level: exchangeLevel(t.level), rng: rng.current, ownerId: 'senior', ownerName: 'せんぱいトレーナー', origin: 'exchange' });
      sfx.cutin(); await api.banner('こうかんチャンス！', 'gold', 1200);
      setExchange({ give, offer }); setPhase('exchange'); return;
    }
    if (!aliveFoes().length || isTrainerBattle) { await finishBattle(); return; }
    startTurn();
  }
  const justCaughtRef = useRef<OwnedPokemon | null>(null); justCaughtRef.current = justCaught;
  async function doExchange(yes: boolean) {
    if (!exchange) return;
    if (yes) { removePokemon(exchange.give.uid); addPokemon({ ...exchange.offer, caughtBy: player.id, caughtByName: exchange.offer.caughtByName }); setCaught(c => c.map(x => x.uid === exchange.give.uid ? exchange.offer : x)); bump('trades'); sfx.caught(); toast(`${getSpecies(exchange.offer.speciesId).ja}を こうかんで もらった！`, 'ok'); }
    setExchange(null);
    if (!aliveFoes().length || isTrainerBattle) await finishBattle(); else startTurn();
  }

  async function finishBattle() {
    if (!state.current) return;
    bump('battles');
    if (isTrainerBattle && !aliveFoes().length && phase !== 'bonus') {
      bump('wins'); sfx.victory(); await api.banner(`${trainerLabel(trainer!)}に かった！`, 'gold', 1500);
      // ボーナスゲットタイム: a rare pokémon shows up for a free catch
      const ids = areaPool(area).filter(id => gradeOf(id) >= 3); const sid = pick(rng.current, ids.length ? ids : areaPool(area)); markSeen(sid);
      const bonus = wildBattler(getSpecies(sid), wildLevel() + 2, rng.current, { shiny: rng.current() < SHINY_RATE * 2 }); bonus.hp = Math.floor(bonus.maxHp * 0.3);
      state.current.foes = [bonus]; api.setBattlers(state.current.allies, [bonus]); api.solo(bonus.uid, { enter: true, nameplate: { text: bonus.name, sub: 'ボーナス！ よわっている' } });
      setIsTrainerBattle(false); setIsLast(true); setGetTarget(bonus);
      await api.banner('ボーナスゲットタイム！', 'big', 1400);
      setPhase('bonus'); return;
    }
    if (defeated.current.length) bump('wins');
    await grantExp();
    setPhase('result');
  }

  async function grantExp() {
    const gain = defeated.current.reduce((a, f) => a + expGain(f.speciesId, f.level), 0);
    setExpTotal(gain);
    const ups: { uid: string; from: number; to: number }[] = []; let evoCandidate: { p: OwnedPokemon; to: number } | null = null;
    for (const uid of participants.current) {
      const p = useStore.getState().box.find(x => x.uid === uid); if (!p) continue; // rentals don't level
      const from = levelFromExp(p.exp), exp = p.exp + gain, to = levelFromExp(exp); const s = getSpecies(p.speciesId);
      updatePokemon(uid, { exp, moves: to > from ? movesFor(s.id, s.types, to) : p.moves });
      if (to > from) { ups.push({ uid, from, to }); const el = evolveLevel(p.speciesId); if (el && to >= el && !evoCandidate) evoCandidate = { p: { ...p, exp }, to: pick(rng.current, evolutionsOf(p.speciesId)) }; }
    }
    if (gain > 0) await api.banner(`${gain} けいけんちを もらった！`, '', 900);
    for (const u of ups) { const p = useStore.getState().box.find(x => x.uid === u.uid); sfx.levelUp(); api.setClass(u.uid, 'levelup', 1000); await api.banner(`${p ? displayName(p) : ''}は Lv.${u.to}に あがった！`, 'gold', 1100); }
    setLevelUps(ups); if (evoCandidate) setEvo(evoCandidate);
  }
  function doEvolve() { if (!evo) return; setEvolving(true); sfx.evolve(); setTimeout(() => { const s = getSpecies(evo.to); updatePokemon(evo.p.uid, { speciesId: evo.to, moves: movesFor(s.id, s.types, levelFromExp(evo.p.exp)) }); toast(`おめでとう！ ${displayName(evo.p)}は ${s.ja}に しんかした！`, 'ok'); setEvoDone(true); }, 2500); }

  const canChoose = phase === 'choose' && !busy;
  const eff = attacker && target ? typeMultiplier(getMove(attacker.moves[0]).type, getSpecies(target.speciesId).types) : 1;
  return (
    <div className="screen full">
      <BattleStage api={api} bg={area.bg} myOwnerId={player.id} select={{ targetUid, attackerUid, tiredUids: tiredUid ? [tiredUid] : [], onSelectAlly: canChoose ? uid => chooseAttacker(uid) : undefined }}>
        {phase === 'special' && attacker && <SpecialChance kind={team.find(p => p.uid === attacker.uid)!.mark!} onDone={onSpecial} />}
        {phase === 'mash' && <MashChance onDone={onMash} />}
        {phase === 'roulette' && <AttackRoulette tired={attackerUid === tiredUid} onDone={onRoulette} />}
        {phase === 'tagRoulette' && <AttackRoulette title="🤝 タッグわざルーレット！" onDone={onTagRoulette} />}
        {phase === 'followup' && <FollowUpChance name={getSpecies(player.avatarSpeciesId).ja} onDone={onFollowUp} />}
        {phase === 'ballRoulette' && <BallRoulette onDone={onBall} />}
        {phase === 'throw' && getTarget && ball && <ThrowBall api={api} target={getTarget} ball={ball} resolve={resolveThrow} onDone={afterThrow} />}
      </BattleStage>
      <div className="controls">
        <div className="log">{api.view.log || ' '}</div>
        {canChoose && attacker && target && (
          <>
            <div className="row between small" style={{ marginBottom: 8 }}>
              <span>前に出す: <b>{attacker.name}</b>{attackerUid === tiredUid && ' 💤つかれ'}</span>
              <span>あいて: <b>{target.name}</b>（じどう）</span>
            </div>
            <div className="row between small" style={{ marginBottom: 8 }}>
              <span className={`badge`} style={{ background: eff >= 2 ? 'var(--accent2)' : eff === 0 ? '#333' : eff < 1 ? '#555' : undefined, color: eff >= 2 ? '#3b2a00' : undefined }}>{getMove(attacker.moves[0]).ja} → {eff >= 2 ? 'ばつぐん！' : eff === 0 ? 'こうかなし' : eff < 1 ? 'いまひとつ' : 'ふつう'}</span>
              <span className="badge" style={{ color: iAmFaster ? 'var(--info)' : 'var(--accent)' }}>{iAmFaster ? '🔵 こちらが せんこう' : '🔴 あいてが せんこう'}</span>
            </div>
            <div className="grid3" style={{ marginBottom: 8 }}>
              {state.current!.allies.map(a => <button key={a.uid} className={`pokecard ${a.uid === attackerUid ? 'sel' : ''} ${a.fainted ? 'dim' : ''}`} style={{ padding: 6 }} disabled={a.fainted} onClick={() => chooseAttacker(a.uid)}><Sprite id={a.speciesId} shiny={a.shiny} size={40} /><span className="nm" style={{ fontSize: 11 }}>{a.name}{a.uid === tiredUid && ' 💤'}</span><span className="small" style={{ fontSize: 10, color: TYPE_COLOR[getMove(a.moves[0]).type], fontWeight: 900 }}>{getMove(a.moves[0]).ja}</span></button>)}
            </div>
            <div className="row" style={{ gap: 8 }}><button className="btn primary lg grow" onClick={beginAttack}>⚔️ こうげき！</button><button className="btn sm" onClick={() => setFleeAsk(true)}>🏃 にげる</button></div>
          </>
        )}
        {phase === 'getTime' && getTarget && <div className="stack" style={{ gap: 6 }}><div className="small">よわった <b>{getTarget.name}</b>を つかまえよう！ ボールルーレットで ボールが きまる。</div><button className="btn gold lg block" onClick={() => { sfx.select(); setPhase('ballRoulette'); }}>⚪ ボールルーレットを まわす</button></div>}
        {phase === 'bonus' && getTarget && <div className="stack" style={{ gap: 6 }}><div className="small">ボーナス！ <b>{getTarget.name}</b>が よわっている。ボールを なげよう。</div><button className="btn gold lg block" onClick={() => { sfx.select(); setIsLast(true); setPhase('ballRoulette'); }}>⚪ ボールルーレットを まわす</button></div>}
        {(phase === 'resolving' || phase === 'intro') && <p className="small muted center" style={{ margin: 0 }}>…</p>}
        {phase === 'lost' && <button className="btn block" onClick={onExit}>もどる</button>}
      </div>

      {fleeAsk && <Modal title="バトルから にげますか？" onClose={() => setFleeAsk(false)}><p className="small muted">ここまでに ゲットした ポケモンは のこる。けいけんちは もらえない。</p><div className="grid2"><button className="btn" onClick={() => setFleeAsk(false)}>たたかう</button><button className="btn" style={{ background: 'var(--bad)' }} onClick={() => { sfx.miss(); onExit(); }}>にげる</button></div></Modal>}
      {phase === 'trainerOffer' && trainer && (
        <Modal>
          <h2 className="center">👤 {trainerLabel(trainer)}が バトルを しかけてきた！</h2>
          <div className="row" style={{ justifyContent: 'center' }}>{trainer.speciesIds.map(id => <Sprite key={id} id={id} size={70} silhouette />)}</div>
          <p className="small muted center">かてば <b>ボーナスゲットタイム</b>！ ただし やせいの ポケモンとは バトルできなくなる。</p>
          <div className="grid2"><button className="btn" onClick={() => acceptTrainer(false)}>やめておく</button><button className="btn primary" onClick={() => acceptTrainer(true)}>バトルする！</button></div>
        </Modal>
      )}
      {phase === 'exchange' && exchange && (
        <Modal>
          <h2 className="center">🔁 こうかんチャンス！</h2>
          <p className="small center muted">せんぱいトレーナーが <b>{getSpecies(exchange.offer.speciesId).ja}</b>（<Grade id={exchange.offer.speciesId} />）と こうかんしたいと いっている。</p>
          <div className="grid2"><div className="card center small"><div className="muted">あなたの</div><PokeCard p={exchange.give} size={60} /></div><div className="card center small" style={{ borderColor: 'var(--accent2)' }}><div className="muted">せんぱいの</div><PokeCard p={exchange.offer} size={60} /></div></div>
          <div className="grid2" style={{ marginTop: 10 }}><button className="btn" onClick={() => doExchange(false)}>こうかんしない</button><button className="btn gold" onClick={() => doExchange(true)}>こうかんする！</button></div>
        </Modal>
      )}
      {phase === 'result' && !evolving && !evo && (
        <Modal>
          <h2 className="center">{caught.length ? `🎉 ${caught.length}匹 ゲット！` : defeated.current.length ? 'バトル しゅうりょう' : 'ざんねん…'}</h2>
          {caught.length > 0 && <div className="row" style={{ justifyContent: caught.length > 1 ? 'flex-start' : 'center', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>{caught.map(p => <div key={p.uid} style={{ width: 190, height: 268, flexShrink: 0 }}><div style={{ transform: 'scale(.72)', transformOrigin: 'top left', width: 260 }}><PickCard p={p} /></div></div>)}</div>}
          <p className="small muted center">けいけんち +{expTotal}{levelUps.length > 0 && ' ／ レベルアップ！'}{team.some(t => t.origin === 'rental') && ' ／ レンタルポケモンは かえした'}</p>
          <button className="btn primary block" onClick={onExit}>つづける</button>
        </Modal>
      )}
      {phase === 'result' && evo && (
        <Modal>
          <h2 className="center">おや…？ {displayName(evo.p)}の ようすが…！</h2>
          <div className="center" style={{ margin: '10px 0' }}>
            {evolving ? <Sprite id={evoDone ? evo.to : evo.p.speciesId} size={140} className={evoDone ? 'levelup' : 'evo'} /> : <Sprite id={evo.p.speciesId} shiny={evo.p.shiny} size={140} />}
            {evolving && !evoDone && <div className="blink" style={{ marginTop: 6 }}>しんか している…</div>}
            {evoDone && <h3 style={{ marginTop: 6 }}>おめでとう！ {getSpecies(evo.to).ja}に しんかした！</h3>}
          </div>
          {!evolving && <div className="grid2"><button className="btn" onClick={() => setEvo(null)}>いまは やめる</button><button className="btn gold" onClick={doEvolve}>✨ しんかさせる</button></div>}
          {evoDone && <button className="btn primary block" onClick={() => setEvo(null)}>つづける</button>}
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ いますぐゲット！ (no battle)
type Reaction = '!?' | '?' | null;
function NowGet({ area, onExit }: { area: Area; onExit: () => void }) {
  const player = useStore(s => s.player)!; const party = useParty(); const addPokemon = useStore(s => s.addPokemon); const markSeen = useStore(s => s.markSeen); const bump = useStore(s => s.bump);
  const api = useBattleStage(); const rng = useRef(makeRng(randomSeed()));
  const [step, setStep] = useState<'snack' | 'pickGrass' | 'ballRoulette' | 'throw' | 'done'>('snack');
  const [reactions, setReactions] = useState<Reaction[]>([null, null, null]);
  const [target, setTarget] = useState<Battler | null>(null); const [ball, setBall] = useState<BallKind | null>(null); const [got, setGot] = useState<OwnedPokemon | null>(null);
  const [caughtList, setCaughtList] = useState<OwnedPokemon[]>([]);
  useBgm('catch'); useImmersive();
  const leadLv = levelFromExp(party[0].exp);
  async function throwSnack() {
    sfx.throwBall(); setStep('pickGrass');
    const r = rng.current; const re: Reaction[] = [0, 1, 2].map(() => { const x = r(); return x < 0.25 ? '!?' : x < 0.65 ? '?' : null; });
    await api.banner('くさむらに おかしを なげた！', 'info', 900);
    setReactions(re); sfx.encounter();
  }
  function pickGrass(i: number) {
    const re = reactions[i]; const r = rng.current;
    if (!re && r() < 0.5) { toast('…なにも いなかった。', 'bad'); setReactions(x => x.map((v, k) => k === i ? null : v)); sfx.miss(); return; }
    const pool = areaPool(area); const ids = re === '!?' ? pool.filter(id => gradeOf(id) >= 3) : pool;
    const sid = pick(r, ids.length ? ids : pool); markSeen(sid);
    const lvl = Math.max(area.minLevel, Math.min(area.maxLevel, leadLv + randInt(r, -2, 2)));
    const b = wildBattler(getSpecies(sid), lvl, r, { shiny: r() < SHINY_RATE * (re === '!?' ? 3 : 1) }); b.hp = Math.floor(b.maxHp * (re === '!?' ? 0.5 : 0.7));
    setTarget(b); api.setBattlers([], [b]); api.solo(b.uid, { enter: true, callout: 'とびだした！', nameplate: { text: b.name, sub: re === '!?' ? 'レアな はんのう！' : 'やせいの ポケモン' } }); setStep('ballRoulette'); sfx.encounter();
  }
  async function resolveThrow() { const r = rollCatchBall(target!, ball!, rng.current); if (r.success) { const p = createOwned({ speciesId: target!.speciesId, level: target!.level, rng: rng.current, ownerId: player.id, ownerName: player.name, origin: 'wild', shiny: target!.shiny }); addPokemon(p); bump('catches'); setGot(p); setCaughtList(c => [...c, p]); } return r; }
  async function afterThrow(ok: boolean) { if (!ok) await api.banner(`${target!.name}は にげてしまった…`, '', 900); setStep('done'); }
  function again() { setGot(null); setTarget(null); setBall(null); api.solo(null); api.setBattlers([], []); setReactions([null, null, null]); setStep('snack'); }
  return (
    <div className="screen full">
      <BattleStage api={api} bg={area.bg}>
        {(step === 'snack' || step === 'pickGrass') && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-around', zIndex: 9 }}>
            {[0, 1, 2].map(i => <button key={i} className="btn" style={{ background: 'transparent', flexDirection: 'column', fontSize: 64, position: 'relative' }} disabled={step !== 'pickGrass'} onClick={() => pickGrass(i)}>
              <span className={step === 'pickGrass' && reactions[i] ? 'encounter-grass' : ''} style={{ position: 'static', animation: reactions[i] ? undefined : 'none' }}>🌿</span>
              {reactions[i] && <span style={{ position: 'absolute', top: -10, fontSize: 28, fontWeight: 900, color: reactions[i] === '!?' ? '#ffd54a' : '#fff', textShadow: '0 2px 0 #000' }}>{reactions[i]}</span>}
            </button>)}
          </div>
        )}
        {step === 'ballRoulette' && <BallRoulette onDone={b => { setBall(b); setStep('throw'); }} />}
        {step === 'throw' && target && ball && <ThrowBall api={api} target={target} ball={ball} resolve={resolveThrow} onDone={afterThrow} />}
      </BattleStage>
      <div className="controls stack" style={{ gap: 8 }}>
        {step === 'snack' && <><div className="small">くさむらに <b>おかし</b>を なげて、かくれている ポケモンの ようすを チェック！ <b>「!?」</b>は レアな ポケモンの はんのう。</div><div className="row" style={{ gap: 8 }}><button className="btn gold lg grow" onClick={throwSnack}>🍬 おかしを なげる</button><button className="btn sm" onClick={onExit}>おわる</button></div></>}
        {step === 'pickGrass' && <div className="small">はんのうが あった くさむらを タップして ボールを なげよう！</div>}
        {step === 'done' && <><div className="small">{got ? `${getSpecies(got.speciesId).ja}を ゲットした！` : 'つぎの くさむらを さがそう。'}　（ここまで {caughtList.length}匹）</div><div className="grid2"><button className="btn" onClick={onExit}>おわる</button><button className="btn primary" onClick={again}>もういちど</button></div></>}
        {(step === 'ballRoulette' || step === 'throw') && <div className="small muted">…</div>}
      </div>
      {got && step === 'done' && <Modal onClose={() => setGot(null)}><h2 className="center">🎉 ゲット！</h2><PickCard p={got} /><button className="btn primary block" style={{ marginTop: 10 }} onClick={() => setGot(null)}>OK</button></Modal>}
    </div>
  );
}
