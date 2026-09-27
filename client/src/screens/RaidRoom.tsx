import { useEffect, useRef, useState } from 'react';
import { getMove, getSpecies, typeMultiplier, TYPE_COLOR, TYPE_JA, levelFromExp, movesFor, displayName, ROUND_SECONDS, BALL_JA, type BattleRoomView, type OwnedPokemon, type BallKind, type SpecialKind } from '@pkfriend/shared';
import { useStore } from '../store';
import { useNet } from '../net';
import { useBattleStage, BattleStage } from '../battle/stage';
import { ThrowBall } from '../battle/CatchGame';
import { AttackRoulette, BallRoulette, SpecialChance, BallIcon } from '../battle/minigames';
import { Sprite, Modal, PickCard, PokeCard, Mark } from '../components/ui';
import { BoxPicker } from '../components/BoxPicker';
import { sfx } from '../audio';
import { toast } from '../toast';
import { useBgm } from '../music';
import { useUi } from '../ui';

const EMOTES = ['👍', '🔥', '😱', '💪', '🙏', '🎉'];
const BG = 'linear-gradient(180deg,#1a0b2e 0%,#4a1942 50%,#c31432 100%)';

export function RaidRoom() {
  const room = useNet(s => s.room) as BattleRoomView;
  const rounds = useNet(s => s.rounds); const shiftRound = useNet(s => s.shiftRound); const joins = useNet(s => s.joins); const clearJoin = useNet(s => s.clearJoin);
  const emotes = useNet(s => s.emotes); const send = useNet(s => s.send); const leave = useNet(s => s.leave);
  const player = useStore(s => s.player)!; const box = useStore(s => s.box); const addPokemon = useStore(s => s.addPokemon); const updatePokemon = useStore(s => s.updatePokemon); const bump = useStore(s => s.bump); const addFriend = useStore(s => s.addFriend);
  const api = useBattleStage();
  const [picker, setPicker] = useState(false);
  const [mine, setMine] = useState<OwnedPokemon | null>(null);
  const [now, setNow] = useState(Date.now());
  const [sub, setSub] = useState<'idle' | 'special' | 'roulette' | 'sent'>('idle');
  const [special, setSpecial] = useState<SpecialKind | undefined>(undefined);
  const [showCard, setShowCard] = useState<OwnedPokemon | null>(null);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [catchStep, setCatchStep] = useState<'idle' | 'roulette' | 'waiting' | 'throw' | 'done'>('idle');
  const started = useRef(false); const expApplied = useRef(false); const usedUids = useRef(new Set<string>()); const usedSpecial = useRef(new Set<string>()); const rewardApplied = useRef(false);
  const setImmersive = useUi(s => s.setImmersive);
  useEffect(() => { setImmersive(room.phase !== 'lobby'); return () => setImmersive(false); }, [room.phase, setImmersive]);
  const isHost = room.hostId === player.id;
  const myBattler = room.state?.allies.find(a => a.ownerId === player.id);
  const myPending = !!myBattler && room.pendingUids.includes(myBattler.uid);
  useBgm(room.phase === 'lobby' ? 'explore' : room.phase === 'battle' ? 'boss' : room.phase === 'catch' ? 'catch' : 'result');

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (room.phase !== 'lobby' && room.state && !started.current) {
      started.current = true;
      api.setBattlers(room.state.allies, room.state.foes);
      if (room.boss) api.solo(room.boss.uid, { enter: true, callout: 'あらわれた！', nameplate: { text: room.boss.name, sub: `ボス Lv.${room.boss.level}` } });
      sfx.encounter(); void api.banner(`ボス ${room.boss?.name}が あらわれた！`, 'big', 1500);
      bump('raids');
      for (const m of room.members) if (m.player.id !== player.id) addFriend({ id: m.player.id, name: m.player.name, avatarSpeciesId: m.player.avatarSpeciesId, via: 'raid' });
    }
  }, [room.phase, room.state, api, bump, addFriend, room.members, player.id, room.boss]);

  useEffect(() => {
    if (api.busy || !started.current) return;
    if (joins.length) { const j = joins[0]; clearJoin(j.id); if (j.battler.ownerId === player.id) usedUids.current.add(j.battler.uid); api.solo(j.battler.uid, { enter: true, nameplate: { text: j.battler.name, sub: `${j.playerName}が さんせん！` } }); void api.play([{ kind: 'join', battler: j.battler }], { restoreSolo: room.boss?.uid ?? null }); return; }
    if (rounds.length) { const r = rounds[0]; shiftRound(); setSub('idle'); void api.play(r.events, { cinematic: true, restoreSolo: room.boss?.uid ?? null }).then(() => { api.setBattlers(r.state.allies, r.state.foes); }); }
  }, [api, api.busy, rounds, joins, shiftRound, clearJoin, player.id, room.boss]);

  // catch phase: clear the stage, then once the shared result is in, play the throw
  useEffect(() => {
    if (room.phase === 'catch' && !api.busy && room.state && room.boss) { api.solo(room.boss.uid, { nameplate: { text: room.boss.name, sub: 'よわっている！' } }); api.setClass(room.boss.uid, 'popout'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.phase, api.busy]);
  const myResult = room.catchResults[player.id];
  useEffect(() => { if (room.chosenBall && myResult && catchStep === 'waiting') setCatchStep('throw'); }, [room.chosenBall, myResult, catchStep]);
  useEffect(() => { if (myResult?.pokemon && !rewardApplied.current) { rewardApplied.current = true; addPokemon(myResult.pokemon); bump('catches'); } }, [myResult, addPokemon, bump]);

  useEffect(() => {
    if ((room.phase === 'catch' || room.phase === 'done') && room.expGain > 0 && !expApplied.current) {
      expApplied.current = true; bump('battles'); bump('wins');
      for (const uid of usedUids.current) { const p = box.find(x => x.uid === uid); if (!p) continue; const exp = p.exp + room.expGain; const to = levelFromExp(exp); const s = getSpecies(p.speciesId); updatePokemon(uid, { exp, moves: to > levelFromExp(p.exp) ? movesFor(s.id, s.types, to) : p.moves }); if (to > levelFromExp(p.exp)) toast(`${displayName(p)}は Lv.${to}に あがった！`, 'ok'); }
    }
  }, [room.phase, room.expGain, box, bump, updatePokemon]);

  function select(p: OwnedPokemon) { setMine(p); setPicker(false); usedUids.current.add(p.uid); send({ t: 'battle_select', pokemon: p }); sfx.select(); }
  function beginAttack() { if (!myBattler || !myPending) return; sfx.click(); setSpecial(undefined); if (mine?.mark && !usedSpecial.current.has(myBattler.uid)) { usedSpecial.current.add(myBattler.uid); setSub('special'); } else setSub('roulette'); }
  function onSpecial(ok: boolean) { if (ok && mine?.mark) setSpecial(mine.mark); setSub('roulette'); }
  function onRoulette(n: number) { if (!myBattler) return; send({ t: 'battle_action', moveId: myBattler.moves[0], roulette: n, special }); setSub('sent'); }
  function share() { const text = `PKフレンドで いっしょに バトルしよう！ コード: ${room.code}`; if (navigator.share) void navigator.share({ text }).catch(() => {}); else { void navigator.clipboard?.writeText(room.code); toast('コードを コピーした'); } }
  function onBall(b: BallKind) { send({ t: 'catch_attempt', ball: b }); setCatchStep('waiting'); }

  const bossTypes = room.boss ? getSpecies(room.boss.speciesId).types : [];
  const deadlineLeft = room.roundDeadline ? Math.max(0, room.roundDeadline - now) : 0;
  const pendingNames = room.state ? room.state.allies.filter(a => room.pendingUids.includes(a.uid)).map(a => a.ownerName) : [];
  const myAlive = !!myBattler && !myBattler.fainted;
  const usedInBattle = room.state ? room.state.allies.filter(a => a.ownerId === player.id).map(a => a.uid) : [];
  const participated = !!room.state?.allies.some(a => a.ownerId === player.id);

  if (room.phase === 'lobby') return (
    <div className="screen stack">
      <div className="row between"><h1>トレジャータッグバトル</h1><button className="btn sm" onClick={leave}>でる</button></div>
      <div className="card center hi"><div className="small muted">ともだちに このコードを おしえよう</div><div className="code">{room.code}</div><button className="btn sm" onClick={share}>📤 コードを おくる</button></div>
      {room.boss && <div className="card row"><Sprite id={room.boss.speciesId} size={90} /><div className="grow"><div className="small muted">ボス {'★'.repeat(room.difficulty)}</div><h2 style={{ margin: 0 }}>{room.boss.name}</h2><div className="small">Lv.{room.boss.level} ／ {bossTypes.map(t => TYPE_JA[t]).join('・')}タイプ</div><div className="small muted">みんなの ルーレットの いちばん大きい数字で こうげき！ ボールも いちばん良いものが えらばれ、つかまえたら ぜんいんが ピックを ゲット。</div></div></div>}
      <div className="card stack">
        <h3>さんかしゃ ({room.members.length}/4)</h3>
        {room.members.map(m => <div key={m.player.id} className="member"><Sprite id={m.player.avatarSpeciesId} size={40} className="av" /><div className="grow"><b>{m.player.name}</b>{m.player.id === room.hostId && <span className="badge" style={{ marginLeft: 6 }}>ホスト</span>}</div><span className={`small ${m.ready ? '' : 'muted'}`}>{m.ready ? '✅ じゅんびOK' : 'えらんでいます…'}</span></div>)}
      </div>
      <div className="card stack">
        <h3>あなたの ピック</h3>
        {mine ? <div className="row"><PokeCard p={mine} size={60} /><button className="btn sm" onClick={() => setPicker(true)}>かえる</button></div> : <button className="btn primary block" onClick={() => setPicker(true)}>ピックを セットする</button>}
      </div>
      {isHost ? <button className="btn gold lg block" disabled={!room.members.some(m => m.ready)} onClick={() => send({ t: 'battle_start' })}>⚔️ バトル スタート！</button> : <p className="muted center small">ホストが スタートするのを まっています…{' '}<span className="blink">●</span></p>}
      {picker && <BoxPicker title="バトルに だす ピック" onPick={select} onClose={() => setPicker(false)} selected={mine?.uid} />}
    </div>
  );

  return (
    <div className="screen full">
      <BattleStage api={api} bg={BG} myOwnerId={player.id} pendingUids={room.pendingUids} emotes={emotes}>
        <div style={{ position: 'absolute', top: 70, left: 8, right: 8, display: 'flex', justifyContent: 'space-between', zIndex: 9, pointerEvents: 'none' }}>
          <span className="badge">コード {room.code}</span><span className="badge">{room.members.length}にん さんか</span>
          <button className="btn sm" style={{ pointerEvents: 'auto', background: 'rgba(0,0,0,.5)' }} onClick={() => setLeaveAsk(true)}>でる</button>
        </div>
        {sub === 'special' && mine?.mark && <SpecialChance kind={mine.mark} onDone={onSpecial} />}
        {sub === 'roulette' && <AttackRoulette onDone={onRoulette} />}
        {catchStep === 'roulette' && <BallRoulette onDone={onBall} />}
        {catchStep === 'throw' && room.boss && room.chosenBall && myResult && <ThrowBall api={api} target={room.boss} ball={room.chosenBall} resolve={async () => ({ success: myResult.success, shakes: myResult.shakes })} onDone={() => setCatchStep('done')} />}
      </BattleStage>
      <div className="controls">
        {room.phase === 'battle' && (
          <>
            {room.roundDeadline && <div className="timerbar"><i style={{ width: `${Math.min(100, (deadlineLeft / (ROUND_SECONDS * 1000)) * 100)}%` }} /></div>}
            <div className="log">{api.view.log || (myPending && sub === 'idle' ? 'こうげきの ばんだ！' : ' ')}</div>
            {!myBattler && <button className="btn primary block" onClick={() => setPicker(true)}>🔥 バトルに さんせんする！</button>}
            {myBattler && myAlive && (
              <div className="row" style={{ gap: 8 }}>
                <div className="grow small">
                  <b>{myBattler.name}</b>の <span style={{ color: TYPE_COLOR[getMove(myBattler.moves[0]).type], fontWeight: 900 }}>{getMove(myBattler.moves[0]).ja}</span>
                  {' '}→ {typeMultiplier(getMove(myBattler.moves[0]).type, bossTypes) >= 2 ? 'ばつぐん！' : typeMultiplier(getMove(myBattler.moves[0]).type, bossTypes) < 1 ? 'いまひとつ' : 'ふつう'}
                  {mine && <div><Mark p={mine} /></div>}
                </div>
                <button className="btn primary lg" disabled={!myPending || api.busy || sub !== 'idle'} onClick={beginAttack}>⚔️ こうげき！</button>
              </div>
            )}
            {myBattler && !myAlive && <button className="btn primary block" onClick={() => setPicker(true)}>🔄 つぎの ピックを だす</button>}
            <div className="row between" style={{ marginTop: 8 }}>
              <div className="row" style={{ gap: 4 }}>{EMOTES.map(e => <button key={e} className="btn sm" style={{ padding: '4px 8px' }} onClick={() => { sfx.emote(); send({ t: 'emote', emote: e }); }}>{e}</button>)}</div>
              {!myPending && myAlive && pendingNames.length > 0 && <span className="small muted">{pendingNames.join('・')}を まっています…</span>}
            </div>
          </>
        )}
        {room.phase === 'catch' && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="log">ゲットタイム！ みんなで ボールルーレット。いちばん良い ボールで なげる！</div>
            {participated && catchStep === 'idle' && <button className="btn gold lg block" onClick={() => { sfx.select(); setCatchStep('roulette'); }}>⚪ ボールルーレットを まわす</button>}
            {catchStep === 'waiting' && <div className="small muted blink">みんなの ルーレットを まっています…</div>}
            <BallList room={room} />
          </div>
        )}
        {room.phase === 'done' && (
          <div className="stack" style={{ gap: 6 }}>
            {room.chosenBall && myResult && catchStep !== 'throw' && catchStep !== 'done' && participated && <button className="btn gold lg block" onClick={() => setCatchStep('throw')}>⚪ {BALL_JA[room.chosenBall]}で なげる！</button>}
            {(catchStep === 'done' || !participated || !room.chosenBall) && <>
              <div className="log">{room.state?.winner === 'ally' ? (myResult?.success ? `🎉 ${room.boss?.name}を ぜんいんで ゲット！ けいけんち +${room.expGain}` : `にげられてしまった… けいけんち +${room.expGain}`) : 'ぜんめつしてしまった… また ちょうせんしよう！'}</div>
              <BallList room={room} />
              <Results room={room} onCard={setShowCard} me={player.id} />
              <button className="btn primary block" onClick={leave}>へやを でる</button>
            </>}
          </div>
        )}
      </div>
      {picker && <BoxPicker title={myBattler ? 'つぎに だす ピック' : 'バトルに だす ピック'} onPick={select} onClose={() => setPicker(false)} exclude={usedInBattle} />}
      {showCard && <Modal onClose={() => setShowCard(null)}><PickCard p={showCard} /></Modal>}
      {leaveAsk && <Modal title="バトルから ぬけますか？" onClose={() => setLeaveAsk(false)}><p className="muted small">ぬけると あなたの ポケモンは たたかえなくなる。</p><div className="grid2"><button className="btn" onClick={() => setLeaveAsk(false)}>つづける</button><button className="btn" style={{ background: 'var(--bad)' }} onClick={leave}>ぬける</button></div></Modal>}
    </div>
  );
}

function BallList({ room }: { room: BattleRoomView }) {
  const entries = Object.entries(room.ballChoices);
  if (!entries.length) return null;
  return <div className="row wrap" style={{ gap: 6 }}>{entries.map(([pid, b]) => { const m = room.members.find(x => x.player.id === pid); return <span key={pid} className="badge row" style={{ gap: 4, border: room.chosenBall === b ? '1px solid var(--accent2)' : undefined }}><BallIcon kind={b} size={16} />{m?.player.name ?? '？'}: {BALL_JA[b]}</span>; })}{room.chosenBall && <span className="badge" style={{ background: 'var(--accent2)', color: '#3b2a00' }}>→ {BALL_JA[room.chosenBall]}で なげる！</span>}</div>;
}
function Results({ room, onCard, me }: { room: BattleRoomView; onCard: (p: OwnedPokemon) => void; me: string }) {
  const entries = Object.entries(room.catchResults);
  if (!entries.length) return null;
  return <div className="row wrap" style={{ gap: 6 }}>{entries.map(([pid, r]) => { const m = room.members.find(x => x.player.id === pid); return <button key={pid} className="badge" style={{ padding: '6px 10px', border: pid === me ? '1px solid var(--accent2)' : undefined }} onClick={() => r.pokemon && onCard(r.pokemon)}>{m?.player.name ?? '？'}: {r.success ? `ゲット！ ${r.pokemon?.shiny ? '✨' : ''}` : `${r.shakes}かい ゆれた…`}</button>; })}</div>;
}
