import { useEffect, useRef, useState } from 'react';
import {
  AREAS, areaPool, getSpecies, getMove, makeRng, randomSeed, pick, randInt, wildBattler, battlerFromOwned, newBattle, resolveRound, aiChoose,
  rollCatch, createOwned, expGain, levelFromExp, evolveLevel, evolutionsOf, movesFor, typeMultiplier, TYPE_COLOR, TYPE_JA, SHINY_RATE, displayName,
  type Area, type Battler, type BattleState, type OwnedPokemon,
} from '@pkfriend/shared';
import { useStore, useParty } from '../store';
import { useBattleStage, BattleStage } from '../battle/stage';
import { CatchGame } from '../battle/CatchGame';
import { Sprite, Modal, PickCard, Types } from '../components/ui';
import { sfx, unlockAudio } from '../audio';
import { toast } from '../toast';
import { useBgm } from '../music';

type Phase = 'areas' | 'search' | 'battle' | 'catch' | 'done';

export function Explore() {
  const [area, setArea] = useState<Area | null>(null);
  const [phase, setPhase] = useState<Phase>('areas');
  const party = useParty();
  useBgm('explore');
  if (!party.length) return <div className="screen"><p className="muted center">パーティに ポケモンが いません</p></div>;
  if (phase === 'areas' || !area) return (
    <div className="screen stack">
      <h1>たんけん</h1>
      <p className="muted small">エリアを えらぶと やせいの ポケモンが とびだしてくる。たおすと ゲットチャンス！</p>
      {AREAS.map(a => <button key={a.id} className="area" style={{ background: a.bg }} onClick={() => { unlockAudio(); sfx.select(); setArea(a); setPhase('search'); }}><span className="lvl">Lv.{a.minLevel}〜{a.maxLevel}</span><h2>{a.ja}</h2><span className="small">{a.desc}</span></button>)}
      <div className="card row"><Sprite id={party[0].speciesId} shiny={party[0].shiny} size={56} /><div><div className="small muted">せんとうの ポケモン</div><b>{displayName(party[0])} Lv.{levelFromExp(party[0].exp)}</b><div><Types id={party[0].speciesId} /></div></div></div>
    </div>
  );
  return <Encounter area={area} onExit={() => { setPhase('areas'); }} />;
}

// ------------------------------------------------------------------ one encounter (search -> battle -> catch)
function Encounter({ area, onExit }: { area: Area; onExit: () => void }) {
  const player = useStore(s => s.player)!; const party = useParty();
  const addPokemon = useStore(s => s.addPokemon); const updatePokemon = useStore(s => s.updatePokemon); const markSeen = useStore(s => s.markSeen); const bump = useStore(s => s.bump);
  const api = useBattleStage();
  const rng = useRef(makeRng(randomSeed()));
  const state = useRef<BattleState | null>(null);
  const [phase, setPhase] = useState<Phase>('search');
  const [foe, setFoe] = useState<Battler | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const participants = useRef(new Set<string>());
  const [swap, setSwap] = useState(false);
  const [caughtP, setCaughtP] = useState<OwnedPokemon | null>(null);
  const [levelUps, setLevelUps] = useState<{ uid: string; from: number; to: number }[]>([]);
  const [evo, setEvo] = useState<{ p: OwnedPokemon; to: number } | null>(null);
  const [evolving, setEvolving] = useState(false);
  const [showEvo, setShowEvo] = useState(false);
  const [evoDone, setEvoDone] = useState(false);
  const [balls, setBalls] = useState(3);
  const [, force] = useState(0);
  const busy = api.busy;
  useBgm(caughtP || showEvo ? 'result' : phase === 'catch' ? 'catch' : 'battle');

  // build battle
  useEffect(() => {
    const r = rng.current;
    const sid = pick(r, areaPool(area));
    const leadLv = levelFromExp(party[0].exp);
    const lo = Math.max(area.minLevel, leadLv - 3), hi = Math.min(area.maxLevel, leadLv + 2);
    const lvl = lo <= hi ? randInt(r, lo, hi) : randInt(r, area.minLevel, Math.min(area.maxLevel, Math.max(area.minLevel, leadLv + 2)));
    const wild = wildBattler(getSpecies(sid), lvl, r, { shiny: r() < SHINY_RATE });
    const allies = party.map(p => battlerFromOwned(p, player.id, player.name, 'ally'));
    state.current = newBattle(allies, [wild]);
    participants.current = new Set([allies[0].uid]);
    setFoe(wild); markSeen(sid);
    const t = setTimeout(async () => {
      sfx.encounter();
      api.setBattlers([allies[0]], [wild]);
      setPhase('battle');
      await api.banner(`あ！ やせいの ${wild.name}が とびだしてきた！${wild.shiny ? ' ✨いろちがい！' : ''}`, 'info', 1500);
      api.setLog(`いけっ！ ${allies[0].name}！`);
    }, 1400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const st = state.current;
  const active = st?.allies[activeIdx];

  async function doTurn(moveId: string) {
    if (!st || !active || !foe || busy || st.finished) return;
    sfx.click();
    const events = resolveRound(st, [{ battlerUid: active.uid, moveId, targetUid: foe.uid }, { battlerUid: foe.uid, moveId: aiChoose(foe, active, rng.current), targetUid: active.uid }], rng.current);
    await api.play(events);
    afterRound();
  }

  async function doSwap(idx: number) {
    if (!st || !foe || busy || idx === activeIdx || st.allies[idx].fainted) return;
    setSwap(false);
    const out = st.allies[activeIdx], inn = st.allies[idx];
    setActiveIdx(idx); participants.current.add(inn.uid);
    api.setBattlers([inn], [foe]);
    await api.play([{ kind: 'swap', outUid: out.uid, battler: inn }]);
    // foe gets a free hit
    const events = resolveRound(st, [{ battlerUid: foe.uid, moveId: aiChoose(foe, inn, rng.current), targetUid: inn.uid }], rng.current);
    await api.play(events);
    afterRound();
  }

  async function flee() {
    if (busy) return; sfx.miss();
    await api.banner('うまく にげきれた！', '', 900);
    onExit();
  }

  async function afterRound() {
    if (!st || !foe) return;
    force(x => x + 1);
    if (st.finished) {
      if (st.winner === 'ally') {
        bump('battles'); bump('wins');
        await grantExp();
        // get chance: foe re-appears weakened
        api.setClass(foe.uid, 'popout');
        await api.banner('ゲットチャンス！', 'big', 1300);
        if (active) api.setClass(active.uid, 'gone');
        setPhase('catch');
      } else {
        bump('battles');
        await api.banner('めのまえが まっくらに なった…', '', 1500);
        onExit();
      }
      return;
    }
    // active fainted but others remain -> must swap
    if (st.allies[activeIdx].fainted) {
      const next = st.allies.findIndex(a => !a.fainted);
      if (next >= 0) setSwap(true);
    }
  }

  async function grantExp() {
    if (!foe) return;
    const gain = expGain(foe.speciesId, foe.level);
    const ups: { uid: string; from: number; to: number }[] = [];
    let evoCandidate: { p: OwnedPokemon; to: number } | null = null;
    for (const uid of participants.current) {
      const p = useStore.getState().box.find(x => x.uid === uid); if (!p) continue;
      const from = levelFromExp(p.exp), exp = p.exp + gain, to = levelFromExp(exp);
      const s = getSpecies(p.speciesId);
      updatePokemon(uid, { exp, moves: to > from ? movesFor(s.id, s.types, to) : p.moves });
      if (to > from) {
        ups.push({ uid, from, to });
        const el = evoLevelFor(p.speciesId);
        if (el && to >= el && !evoCandidate) evoCandidate = { p: { ...p, exp }, to: pick(rng.current, evolutionsOf(p.speciesId)) };
      }
    }
    api.pop(active!.uid, `+${gain} EXP`, 'heal');
    await api.banner(`${gain} けいけんちを もらった！`, '', 900);
    for (const u of ups) { const p = useStore.getState().box.find(x => x.uid === u.uid); sfx.levelUp(); api.setClass(u.uid, 'levelup', 1000); await api.banner(`${p ? displayName(p) : ''}は Lv.${u.to}に あがった！`, 'gold', 1100); }
    setLevelUps(ups);
    if (evoCandidate) setEvo(evoCandidate);
  }
  const evoLevelFor = (sid: number) => evolveLevel(sid);

  async function onThrow(timing: number) {
    if (!foe) return { success: false, shakes: 0 };
    const r = rollCatch(foe, timing, rng.current);
    setBalls(b => b - 1);
    if (r.success) {
      const p = createOwned({ speciesId: foe.speciesId, level: foe.level, rng: rng.current, ownerId: player.id, ownerName: player.name, origin: 'wild', shiny: foe.shiny });
      addPokemon(p); bump('catches'); setCaughtP(p);
    }
    return r;
  }

  function doEvolve() {
    if (!evo) return;
    setEvolving(true); sfx.evolve();
    setTimeout(() => {
      const s = getSpecies(evo.to);
      updatePokemon(evo.p.uid, { speciesId: evo.to, moves: movesFor(s.id, s.types, levelFromExp(evo.p.exp)) });
      toast(`おめでとう！ ${displayName(evo.p)}は ${s.ja}に しんかした！`, 'ok');
      setEvoDone(true);
    }, 2500);
  }

  const foeTypes = foe ? getSpecies(foe.speciesId).types : [];
  return (
    <div className="screen full">
      {phase === 'search' && (
        <div className="stage" style={{ background: area.bg }}>
          <div className="encounter-grass">🌿</div>
          <div className="banner" style={{ top: '70%' }}><span>{area.ja}を さがしている…</span></div>
        </div>
      )}
      {phase !== 'search' && (
        <BattleStage api={api} bg={area.bg} myOwnerId={player.id}>
          {phase === 'catch' && foe && !caughtP && <CatchGame api={api} target={foe} ballsLeft={balls} onThrow={onThrow} onDone={async ok => { if (!ok) { await api.banner(`${foe.name}は にげてしまった…`, '', 1200); if (evo) setShowEvo(true); else onExit(); } }} />}
        </BattleStage>
      )}
      <div className="controls">
        <div className="log">{api.view.log || ' '}</div>
        {phase === 'battle' && active && foe && (
          <>
            <div className="moves">
              {active.moves.map(id => { const m = getMove(id); const eff = m.power > 0 && typeMultiplier(m.type, foeTypes) >= 2; return (
                <button key={id} className={`movebtn ${eff ? 'eff' : ''}`} style={{ '--c': TYPE_COLOR[m.type] } as React.CSSProperties} disabled={busy || active.fainted} onClick={() => doTurn(id)}>
                  <div className="mn">{m.ja}</div><div className="mi"><span>{TYPE_JA[m.type]}</span><span>いりょく {m.power || '—'}</span></div>
                </button>); })}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn sm grow" disabled={busy || (st?.allies.length ?? 0) < 2} onClick={() => setSwap(true)}>🔄 ポケモン</button>
              <button className="btn sm grow" disabled={busy} onClick={flee}>🏃 にげる</button>
            </div>
          </>
        )}
        {phase === 'catch' && !caughtP && <p className="small muted center" style={{ margin: 0 }}>わっかが みどりの ゾーンに はいった しゅんかんに なげよう。ぴったりだと ゲットしやすい！</p>}
      </div>

      {swap && st && (
        <Modal title="どの ポケモンを だす？" onClose={st.allies[activeIdx].fainted ? undefined : () => setSwap(false)}>
          <div className="grid3">{st.allies.map((a, i) => <button key={a.uid} className={`pokecard ${i === activeIdx ? 'sel' : ''} ${a.fainted ? 'dim' : ''}`} disabled={a.fainted || i === activeIdx} onClick={() => doSwap(i)}><Sprite id={a.speciesId} shiny={a.shiny} size={60} /><span className="nm">{a.name}</span><span className="small muted">HP {a.hp}/{a.maxHp}</span></button>)}</div>
        </Modal>
      )}
      {caughtP && !showEvo && (
        <Modal>
          <h2 className="center">🎉 {getSpecies(caughtP.speciesId).ja}を ゲット！</h2>
          <PickCard p={caughtP} />
          <p className="small muted center" style={{ marginTop: 10 }}>ピックが ボックスに はいった。{levelUps.length > 0 && ' レベルアップも した！'}</p>
          <button className="btn primary block" onClick={() => { if (evo) setShowEvo(true); else onExit(); }}>{evo ? 'つづける（しんかの ようす…？）' : 'つづける'}</button>
        </Modal>
      )}
      {showEvo && evo && (
        <Modal>
          <h2 className="center">おや…？ {displayName(evo.p)}の ようすが…！</h2>
          <div className="center" style={{ margin: '10px 0' }}>
            {evolving ? <Sprite id={evoDone ? evo.to : evo.p.speciesId} size={140} className={evoDone ? 'levelup' : 'evo'} /> : <Sprite id={evo.p.speciesId} shiny={evo.p.shiny} size={140} />}
            {evolving && !evoDone && <div className="blink" style={{ marginTop: 6 }}>しんか している…</div>}
            {evoDone && <h3 style={{ marginTop: 6 }}>おめでとう！ {getSpecies(evo.to).ja}に しんかした！</h3>}
          </div>
          {!evolving && <div className="grid2"><button className="btn" onClick={() => { setShowEvo(false); onExit(); }}>いまは やめる</button><button className="btn gold" onClick={doEvolve}>✨ しんかさせる</button></div>}
          {evoDone && <button className="btn primary block" onClick={onExit}>つづける</button>}
        </Modal>
      )}
    </div>
  );
}
