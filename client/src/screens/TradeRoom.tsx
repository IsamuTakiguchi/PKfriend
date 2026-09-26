import { useEffect, useState } from 'react';
import { getSpecies, displayName, type TradeRoomView, type OwnedPokemon } from '@pkfriend/shared';
import { useStore } from '../store';
import { useNet } from '../net';
import { Sprite, PokeCard, Modal, PickCard } from '../components/ui';
import { BoxPicker } from '../components/BoxPicker';
import { sfx } from '../audio';
import { toast } from '../toast';
import { useBgm } from '../music';

export function TradeRoom() {
  const room = useNet(s => s.room) as TradeRoomView; const send = useNet(s => s.send); const leave = useNet(s => s.leave); const done = useNet(s => s.tradeDone); const clearTrade = useNet(s => s.clearTrade);
  const player = useStore(s => s.player)!; const box = useStore(s => s.box);
  const [picker, setPicker] = useState(false); const [stage, setStage] = useState<0 | 1 | 2>(0);
  useBgm(done ? 'result' : 'home');
  const partner = room.members.find(m => m.player.id !== player.id);
  const myOffer = room.offers[player.id]; const theirOffer = partner ? room.offers[partner.player.id] : undefined;
  const mine = myOffer?.pokemon ? box.find(p => p.uid === myOffer.pokemon!.uid) ?? myOffer.pokemon : null;

  useEffect(() => { if (done) { setStage(1); sfx.beam(); const t = setTimeout(() => { setStage(2); sfx.caught(); }, 1800); return () => clearTimeout(t); } }, [done]);

  function share() { const text = `PKフレンドで ポケモンを こうかんしよう！ コード: ${room.code}`; if (navigator.share) void navigator.share({ text }).catch(() => {}); else { void navigator.clipboard?.writeText(room.code); toast('コードを コピーした'); } }
  const canConfirm = !!mine && !!theirOffer?.pokemon && room.phase === 'offer';

  return (
    <div className="screen stack">
      <div className="row between"><h1>こうかん</h1><button className="btn sm" onClick={leave}>でる</button></div>
      {!partner && <div className="card center hi"><div className="small muted">ともだちに このコードを おしえよう</div><div className="code">{room.code}</div><button className="btn sm" onClick={share}>📤 コードを おくる</button><p className="small muted blink" style={{ marginBottom: 0 }}>あいてを まっています…</p></div>}
      <div className="grid2">
        <div className="card stack center">
          <div className="small muted">あなた ({player.name})</div>
          {mine ? <PokeCard p={mine} size={70} onClick={room.phase === 'offer' ? () => setPicker(true) : undefined} /> : <button className="btn primary" onClick={() => setPicker(true)}>えらぶ</button>}
          {myOffer?.confirmed && <span className="badge" style={{ background: 'var(--ok)', color: '#042' }}>✅ かくにんずみ</span>}
        </div>
        <div className="card stack center">
          <div className="small muted">{partner ? partner.player.name : 'あいて'}</div>
          {theirOffer?.pokemon ? <PokeCard p={theirOffer.pokemon} size={70} /> : <div style={{ padding: 20 }} className="muted">{partner ? 'えらんでいます…' : '—'}</div>}
          {theirOffer?.confirmed && <span className="badge" style={{ background: 'var(--ok)', color: '#042' }}>✅ かくにんずみ</span>}
        </div>
      </div>
      {theirOffer?.pokemon && <div className="card small"><b>{displayName(theirOffer.pokemon)}</b>（{getSpecies(theirOffer.pokemon.speciesId).ja}）は {theirOffer.pokemon.caughtByName}が {theirOffer.pokemon.origin === 'raid' ? 'みんなでバトルで' : 'やせいで'} ゲットした ポケモン。{theirOffer.pokemon.shiny && ' ✨いろちがい！'}</div>}
      {room.phase === 'offer' && (
        myOffer?.confirmed
          ? <button className="btn block" onClick={() => send({ t: 'trade_confirm', confirmed: false })}>かくにんを とりけす</button>
          : <button className="btn gold lg block" disabled={!canConfirm} onClick={() => { sfx.select(); send({ t: 'trade_confirm', confirmed: true }); }}>🤝 この ないようで こうかんする</button>
      )}
      <p className="small muted center">ふたりとも かくにんすると こうかんが せいりつする。どちらかが ポケモンを かえると かくにんは リセットされる。</p>
      {picker && <BoxPicker title="こうかんに だす ポケモン" onPick={p => { setPicker(false); send({ t: 'trade_offer', pokemon: p }); sfx.select(); }} onClose={() => setPicker(false)} selected={mine?.uid} />}
      {done && (
        <Modal>
          {stage === 1 && (
            <div className="center" style={{ padding: 20, position: 'relative', height: 220, overflow: 'hidden' }}>
              <h2>こうかん せいりつ！</h2>
              <div style={{ position: 'absolute', left: '10%', top: 80, animation: 'crossR 1.6s forwards' }}><Sprite id={box.find(p => p.uid === done.gaveUid)?.speciesId ?? done.received.speciesId} size={90} /></div>
              <div style={{ position: 'absolute', right: '10%', top: 80, animation: 'crossL 1.6s forwards' }}><Sprite id={done.received.speciesId} shiny={done.received.shiny} size={90} /></div>
              <style>{`@keyframes crossR{to{transform:translateX(280px) scale(.3);opacity:0}}@keyframes crossL{to{transform:translateX(-280px) scale(1.2)}}`}</style>
            </div>
          )}
          {stage === 2 && (<>
            <h2 className="center">🎁 {done.partner.name}から {getSpecies(done.received.speciesId).ja}が やってきた！</h2>
            <PickCard p={done.received} />
            <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => { clearTrade(); leave(); }}>ボックスに いれる</button>
          </>)}
        </Modal>
      )}
    </div>
  );
}
export type { OwnedPokemon };
