import { useEffect, useRef, useState } from 'react';
import { getMove, getSpecies, typeMultiplier, TYPE_COLOR, TYPE_JA, levelFromExp, movesFor, displayName, ROUND_SECONDS, type BattleRoomView, type OwnedPokemon } from '@pkfriend/shared';
import { useStore } from '../store';
import { useNet } from '../net';
import { useBattleStage, BattleStage } from '../battle/stage';
import { CatchGame } from '../battle/CatchGame';
import { Sprite, Modal, PickCard, PokeCard } from '../components/ui';
import { BoxPicker } from '../components/BoxPicker';
import { sfx } from '../audio';
import { toast } from '../toast';

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
  const [chosen, setChosen] = useState<string | null>(null);
  const [showCard, setShowCard] = useState<OwnedPokemon | null>(null);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const started = useRef(false); const expApplied = useRef(false); const usedUids = useRef(new Set<string>());
  const catchWaiter = useRef<((r: { success: boolean; shakes: number }) => void) | null>(null);
  const isHost = room.hostId === player.id;
  const myBattler = room.state?.allies.find(a => a.ownerId === player.id);
  const myPending = !!myBattler && room.pendingUids.includes(myBattler.uid);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);

  // battle start: sync stage from room state once
  useEffect(() => {
    if (room.phase !== 'lobby' && room.state && !started.current) {
      started.current = true;
      api.setBattlers(room.state.allies, room.state.foes);
      sfx.encounter(); void api.banner(`ボス ${room.boss?.name}が あらわれた！`, 'big', 1500);
      bump('raids');
      for (const m of room.members) if (m.player.id !== player.id) addFriend({ id: m.player.id, name: m.player.name, avatarSpeciesId: m.player.avatarSpeciesId, via: 'raid' });
    }
  }, [room.phase, room.state, api, bump, addFriend, room.members, player.id, room.boss]);

  // play queued rounds / joins sequentially
  useEffect(() => {
    if (api.busy || !started.current) return;
    if (joins.length) { const j = joins[0]; clearJoin(j.id); if (j.battler.ownerId === player.id) usedUids.current.add(j.battler.uid); void api.play([{ kind: 'join', battler: j.battler }]); return; }
    if (rounds.length) {
      const r = rounds[0]; shiftRound(); setChosen(null);
      void api.play(r.events).then(() => { api.setBattlers(r.state.allies, r.state.foes); });
    }
  }, [api, api.busy, rounds, joins, shiftRound, clearJoin, player.id]);

  // catch result arrives via room sync
  useEffect(() => {
    const r = room.catchResults[player.id];
    if (r && catchWaiter.current) { catchWaiter.current({ success: r.success, shakes: r.shakes }); catchWaiter.current = null; if (r.pokemon) { addPokemon(r.pokemon); bump('catches'); } }
  }, [room.catchResults, player.id, addPokemon, bump]);

  // clear the stage for the get chance
  useEffect(() => {
    if (room.phase === 'catch' && !api.busy && room.state) { for (const a of room.state.allies) api.setClass(a.uid, 'gone'); if (room.boss) api.setClass(room.boss.uid, 'popout'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.phase, api.busy]);

  // exp when battle won
  useEffect(() => {
    if ((room.phase === 'catch' || room.phase === 'done') && room.expGain > 0 && !expApplied.current) {
      expApplied.current = true; bump('battles'); bump('wins');
      for (const uid of usedUids.current) { const p = box.find(x => x.uid === uid); if (!p) continue; const exp = p.exp + room.expGain; const to = levelFromExp(exp); const s = getSpecies(p.speciesId); updatePokemon(uid, { exp, moves: to > levelFromExp(p.exp) ? movesFor(s.id, s.types, to) : p.moves }); if (to > levelFromExp(p.exp)) toast(`${displayName(p)}は Lv.${to}に あがった！`, 'ok'); }
    }
  }, [room.phase, room.expGain, box, bump, updatePokemon]);

  function select(p: OwnedPokemon) { setMine(p); setPicker(false); usedUids.current.add(p.uid); send({ t: 'battle_select', pokemon: p }); sfx.select(); }
  function act(moveId: string) { if (!myBattler || !myPending) return; setChosen(moveId); sfx.click(); send({ t: 'battle_action', moveId }); }
  function share() { const text = `PKフレンドで いっしょに バトルしよう！ コード: ${room.code}`; if (navigator.share) void navigator.share({ text }).catch(() => {}); else { void navigator.clipboard?.writeText(room.code); toast('コードを コピーした'); } }
  const onThrow = (timing: number) => new Promise<{ success: boolean; shakes: number }>(res => { catchWaiter.current = res; send({ t: 'catch_attempt', timing }); setTimeout(() => { if (catchWaiter.current === res) { catchWaiter.current = null; res({ success: false, shakes: 0 }); } }, 8000); });

  const bossTypes = room.boss ? getSpecies(room.boss.speciesId).types : [];
  const deadlineLeft = room.roundDeadline ? Math.max(0, room.roundDeadline - now) : 0;
  const pendingNames = room.state ? room.state.allies.filter(a => room.pendingUids.includes(a.uid)).map(a => a.ownerName) : [];
  const myAlive = !!myBattler && !myBattler.fainted;
  const usedInBattle = room.state ? room.state.allies.filter(a => a.ownerId === player.id).map(a => a.uid) : [];

  // ---------------------------------------------------------------- lobby
  if (room.phase === 'lobby') return (
    <div className="screen stack">
      <div className="row between"><h1>みんなで バトル</h1><button className="btn sm" onClick={leave}>でる</button></div>
      <div className="card center hi">
        <div className="small muted">ともだちに このコードを おしえよう</div>
        <div className="code">{room.code}</div>
        <button className="btn sm" onClick={share}>📤 コードを おくる</button>
      </div>
      {room.boss && <div className="card row"><Sprite id={room.boss.speciesId} size={90} className="" /><div className="grow"><div className="small muted">ボス {'★'.repeat(room.difficulty)}</div><h2 style={{ margin: 0 }}>{room.boss.name}</h2><div className="small">Lv.{room.boss.level} ／ {bossTypes.map(t => TYPE_JA[t]).join('・')}タイプ</div><div className="small muted">HPは さんかにんずうで ふえる。みんなで けずろう！</div></div></div>}
      <div className="card stack">
        <h3>さんかしゃ ({room.members.length}/4)</h3>
        {room.members.map(m => <div key={m.player.id} className="member"><Sprite id={m.player.avatarSpeciesId} size={40} className="av" /><div className="grow"><b>{m.player.name}</b>{m.player.id === room.hostId && <span className="badge" style={{ marginLeft: 6 }}>ホスト</span>}</div><span className={`small ${m.ready ? '' : 'muted'}`}>{m.ready ? '✅ じゅんびOK' : 'えらんでいます…'}</span></div>)}
      </div>
      <div className="card stack">
        <h3>あなたの ポケモン</h3>
        {mine ? <div className="row"><PokeCard p={mine} size={60} /><button className="btn sm" onClick={() => setPicker(true)}>かえる</button></div> : <button className="btn primary block" onClick={() => setPicker(true)}>ポケモンを えらぶ</button>}
      </div>
      {isHost ? <button className="btn gold lg block" disabled={!room.members.some(m => m.ready)} onClick={() => send({ t: 'battle_start' })}>⚔️ バトル スタート！</button> : <p className="muted center small">ホストが スタートするのを まっています…{' '}<span className="blink">●</span></p>}
      {picker && <BoxPicker title="バトルに だす ポケモン" onPick={select} onClose={() => setPicker(false)} selected={mine?.uid} />}
    </div>
  );

  // ---------------------------------------------------------------- battle / catch / done
  const myResult = room.catchResults[player.id];
  return (
    <div className="screen full">
      <BattleStage api={api} bg={BG} myOwnerId={player.id} pendingUids={room.pendingUids} emotes={emotes}>
        <div style={{ position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', justifyContent: 'space-between', zIndex: 9, pointerEvents: 'none' }}>
          <span className="badge">コード {room.code}</span><span className="badge">{room.members.length}にん さんか</span>
          <button className="btn sm" style={{ pointerEvents: 'auto', background: 'rgba(0,0,0,.5)' }} onClick={() => setLeaveAsk(true)}>でる</button>
        </div>
        {room.phase === 'catch' && room.boss && myBattler && !myResult && !api.busy && (
          <CatchGame api={api} target={room.boss} ballsLeft={1} onThrow={onThrow} onDone={() => {}} />
        )}
      </BattleStage>
      <div className="controls">
        {room.phase === 'battle' && (
          <>
            {room.roundDeadline && <div className="timerbar"><i style={{ width: `${Math.min(100, (deadlineLeft / (ROUND_SECONDS * 1000)) * 100)}%` }} /></div>}
            <div className="log">{api.view.log || (myPending ? 'わざを えらぼう！' : ' ')}</div>
            {!myBattler && <button className="btn primary block" onClick={() => setPicker(true)}>🔥 バトルに さんせんする！</button>}
            {myBattler && myAlive && (
              <div className="moves">
                {myBattler.moves.map(id => { const m = getMove(id); const eff = m.power > 0 && typeMultiplier(m.type, bossTypes) >= 2; return (
                  <button key={id} className={`movebtn ${eff ? 'eff' : ''}`} style={{ '--c': TYPE_COLOR[m.type], outline: chosen === id ? '2px solid #fff' : undefined } as React.CSSProperties} disabled={!myPending || api.busy} onClick={() => act(id)}>
                    <div className="mn">{m.ja}</div><div className="mi"><span>{TYPE_JA[m.type]}</span><span>いりょく {m.power || '—'}</span></div>
                  </button>); })}
              </div>
            )}
            {myBattler && !myAlive && <button className="btn primary block" onClick={() => setPicker(true)}>🔄 つぎの ポケモンを だす</button>}
            <div className="row between" style={{ marginTop: 8 }}>
              <div className="row" style={{ gap: 4 }}>{EMOTES.map(e => <button key={e} className="btn sm" style={{ padding: '4px 8px' }} onClick={() => { sfx.emote(); send({ t: 'emote', emote: e }); }}>{e}</button>)}</div>
              {!myPending && myAlive && pendingNames.length > 0 && <span className="small muted">{pendingNames.join('・')}を まっています…</span>}
            </div>
          </>
        )}
        {room.phase === 'catch' && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="log">{myBattler ? (myResult ? (myResult.success ? '🎉 ゲット せいこう！' : 'にげられてしまった…') : 'ゲットチャンス！ タイミングよく なげよう（1かいだけ）') : 'みんなの ゲットチャンス中…'}</div>
            <Results room={room} onCard={setShowCard} me={player.id} />
            {myResult && <button className="btn block" onClick={leave}>へやを でる</button>}
          </div>
        )}
        {room.phase === 'done' && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="log">{room.state?.winner === 'ally' ? `バトル しゅうりょう！ けいけんち +${room.expGain}` : 'ぜんめつしてしまった… また ちょうせんしよう！'}</div>
            <Results room={room} onCard={setShowCard} me={player.id} />
            <button className="btn primary block" onClick={leave}>へやを でる</button>
          </div>
        )}
      </div>
      {picker && <BoxPicker title={myBattler ? 'つぎに だす ポケモン' : 'バトルに だす ポケモン'} onPick={select} onClose={() => setPicker(false)} exclude={usedInBattle} />}
      {showCard && <Modal onClose={() => setShowCard(null)}><PickCard p={showCard} /></Modal>}
      {leaveAsk && <Modal title="バトルから ぬけますか？" onClose={() => setLeaveAsk(false)}><p className="muted small">ぬけると あなたの ポケモンは たたかえなくなる。</p><div className="grid2"><button className="btn" onClick={() => setLeaveAsk(false)}>つづける</button><button className="btn" style={{ background: 'var(--bad)' }} onClick={leave}>ぬける</button></div></Modal>}
    </div>
  );
}

function Results({ room, onCard, me }: { room: BattleRoomView; onCard: (p: OwnedPokemon) => void; me: string }) {
  const entries = Object.entries(room.catchResults);
  if (!entries.length) return null;
  return <div className="row wrap" style={{ gap: 6 }}>{entries.map(([pid, r]) => { const m = room.members.find(x => x.player.id === pid); return <button key={pid} className="badge" style={{ padding: '6px 10px', border: pid === me ? '1px solid var(--accent2)' : undefined }} onClick={() => r.pokemon && onCard(r.pokemon)}>{m?.player.name ?? '？'}: {r.success ? `ゲット！ ${r.pokemon?.shiny ? '✨' : ''}` : `${r.shakes}かい ゆれた…`}</button>; })}</div>;
}
