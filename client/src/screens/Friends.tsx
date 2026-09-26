import { useState } from 'react';
import { bossPool, getSpecies } from '@pkfriend/shared';
import { useStore } from '../store';
import { useNet } from '../net';
import { Sprite, Modal } from '../components/ui';
import { RaidRoom } from './RaidRoom';
import { TradeRoom } from './TradeRoom';
import { sfx, unlockAudio } from '../audio';

export function Friends() {
  const room = useNet(s => s.room); const status = useNet(s => s.status); const send = useNet(s => s.send);
  const player = useStore(s => s.player)!; const friends = useStore(s => s.friends);
  const [code, setCode] = useState(''); const [raid, setRaid] = useState(false); const [diff, setDiff] = useState<1 | 2 | 3>(1); const [boss, setBoss] = useState<number | undefined>(undefined);

  if (room?.kind === 'battle') return <RaidRoom />;
  if (room?.kind === 'trade') return <TradeRoom />;
  const online = status === 'online';
  return (
    <div className="screen stack">
      <div className="row between"><h1>フレンド</h1><span className="row small muted"><span className={`dot ${online ? 'on' : ''}`} />{online ? 'オンライン' : 'せつぞく中…'}</span></div>
      <div className="card hi row"><Sprite id={player.avatarSpeciesId} size={56} /><div><div className="small muted">あなた</div><b>{player.name}</b></div></div>
      {status === 'offline' && <div className="card small" style={{ borderColor: 'var(--warn)' }}>⚠️ サーバーに つながっていません。こうかんと みんなでバトルには サーバーが ひつようです（README の「デプロイ」を かくにん）。たんけんは オフラインでも あそべます。</div>}

      <div className="card stack">
        <h3>へやに さんかする</h3>
        <div className="row"><input className="input" placeholder="6けたの コード" value={code} maxLength={6} style={{ textTransform: 'uppercase', letterSpacing: '.2em', fontWeight: 900 }} onChange={e => setCode(e.target.value.toUpperCase())} />
          <button className="btn primary" disabled={!online || code.length < 6} onClick={() => { unlockAudio(); sfx.select(); send({ t: 'join_room', code }); }}>さんか</button></div>
        <p className="small muted" style={{ margin: 0 }}>ともだちの がめんに でている コードを いれてね。バトルの とちゅうでも さんせん できる！</p>
      </div>

      <button className="area" style={{ background: 'linear-gradient(135deg,#cb2d3e,#ef473a)' }} disabled={!online} onClick={() => { unlockAudio(); setRaid(true); }}><h2>⚔️ みんなで バトルを つくる</h2><span className="small">さいだい4にんで ボスに いどむ。かてば ぜんいんに ゲットチャンス！</span></button>
      <button className="area" style={{ background: 'linear-gradient(135deg,#185a9d,#43cea2)' }} disabled={!online} onClick={() => { unlockAudio(); sfx.select(); send({ t: 'create_room', kind: 'trade' }); }}><h2>🔁 こうかんの へやを つくる</h2><span className="small">ふたりで ポケモンを こうかんする。</span></button>

      <div className="card stack">
        <h3>ともだち ({friends.length})</h3>
        {friends.length === 0 && <p className="small muted" style={{ margin: 0 }}>こうかんや バトルを すると ここに きろくされる。</p>}
        {friends.map(f => <div key={f.id} className="member"><Sprite id={f.avatarSpeciesId} size={40} className="av" /><div className="grow"><b>{f.name}</b><div className="small muted">{f.via === 'trade' ? 'こうかん' : 'みんなでバトル'} ・ {new Date(f.lastSeen).toLocaleDateString('ja-JP')}</div></div></div>)}
      </div>

      {raid && (
        <Modal title="みんなで バトル" onClose={() => setRaid(false)}>
          <div className="stack">
            <div><div className="small muted" style={{ marginBottom: 6 }}>つよさ</div>
              <div className="tabs">{([1, 2, 3] as const).map(d => <button key={d} className={diff === d ? 'on' : ''} onClick={() => setDiff(d)}>{['★ Lv.8', '★★ Lv.25', '★★★ Lv.45'][d - 1]}</button>)}</div></div>
            <div><div className="small muted" style={{ marginBottom: 6 }}>ボス（おまかせ か えらぶ）</div>
              <div className="row wrap" style={{ gap: 6 }}>
                <button className={`btn sm ${boss === undefined ? 'gold' : ''}`} onClick={() => setBoss(undefined)}>おまかせ</button>
                {bossPool().slice(0, 40).map(id => <button key={id} className={`btn sm ${boss === id ? 'gold' : ''}`} style={{ padding: 4 }} onClick={() => setBoss(id)} title={getSpecies(id).ja}><Sprite id={id} size={36} /></button>)}
              </div></div>
            <button className="btn primary lg block" onClick={() => { sfx.select(); send({ t: 'create_room', kind: 'battle', difficulty: diff, bossSpeciesId: boss }); setRaid(false); }}>へやを つくる</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
