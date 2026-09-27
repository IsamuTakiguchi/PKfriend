import { useState } from 'react';
import { SPECIES, levelFromExp, displayName, getSpecies, movesFor } from '@pkfriend/shared';
import { useStore, useLead } from '../store';
import { Sprite, Modal, ExpBar, Types } from '../components/ui';
import { useNet } from '../net';
import { say, voiceInfo } from '../voice';

export function Home({ go }: { go: (tab: 'explore' | 'box' | 'friends') => void }) {
  const player = useStore(s => s.player)!; const box = useStore(s => s.box); const caught = useStore(s => s.caught); const seen = useStore(s => s.seen);
  const stats = useStore(s => s.stats); const sound = useStore(s => s.sound); const toggleSound = useStore(s => s.toggleSound); const bgm = useStore(s => s.bgm); const toggleBgm = useStore(s => s.toggleBgm); const voice = useStore(s => s.voice); const toggleVoice = useStore(s => s.toggleVoice); const setPlayer = useStore(s => s.setPlayer); const resetAll = useStore(s => s.resetAll); const updatePokemon = useStore(s => s.updatePokemon);
  const starter = box.find(p => p.origin === 'starter');
  const [changeStarter, setChangeStarter] = useState(false);
  const status = useNet(s => s.status);
  const lead = useLead();
  const [edit, setEdit] = useState(false); const [name, setName] = useState(player.name); const [confirmReset, setConfirmReset] = useState(false);
  return (
    <div className="screen stack">
      <div className="row between">
        <h1>PKフレンド</h1>
        <span className="row small muted"><span className={`dot ${status === 'online' ? 'on' : ''}`} />{status === 'online' ? 'オンライン' : status === 'connecting' ? 'せつぞく中…' : 'オフライン'}</span>
      </div>
      <div className="card hi row" onClick={() => setEdit(true)}>
        <Sprite id={lead?.speciesId ?? player.avatarSpeciesId} shiny={lead?.shiny} size={84} />
        <div className="grow">
          <div className="muted small">トレーナー</div>
          <h2 style={{ margin: 0 }}>{player.name} <span className="small muted">✎</span></h2>
          {lead && <><div className="small">パートナー: {displayName(lead)} Lv.{levelFromExp(lead.exp)}</div><ExpBar exp={lead.exp} /></>}
        </div>
      </div>
      <div className="grid3">
        <Stat n={box.length} label="てもち" /><Stat n={`${caught.length}/${SPECIES.length}`} label="ずかん" /><Stat n={stats.wins} label="しょうり" />
        <Stat n={stats.catches} label="ゲット" /><Stat n={stats.trades} label="こうかん" /><Stat n={stats.raids} label="みんなでバトル" />
      </div>
      <button className="area" style={{ background: 'linear-gradient(135deg,#56ab2f,#a8e063)' }} onClick={() => go('explore')}><h2>🌿 たんけんに いく</h2><span className="small">やせいの ポケモンを みつけて ゲット！</span></button>
      <button className="area" style={{ background: 'linear-gradient(135deg,#cb2d3e,#ef473a)' }} onClick={() => go('friends')}><h2>⚔️ みんなで バトル</h2><span className="small">ともだちと いっしょに ボスに いどもう。とちゅう さんせんも OK！</span></button>
      <button className="area" style={{ background: 'linear-gradient(135deg,#185a9d,#43cea2)' }} onClick={() => go('friends')}><h2>🔁 ともだちと こうかん</h2><span className="small">6けたの コードで つながって ポケモンを こうかん。</span></button>
      {starter && <button className="card row between" style={{ width: '100%', textAlign: 'left' }} onClick={() => setChangeStarter(true)}><span>🔄 さいしょの パートナーを かえる</span><span className="small muted">いまは {getSpecies(starter.speciesId).ja} ›</span></button>}
      <div className="card stack" style={{ gap: 8 }}>
        <div className="row between"><span>🎵 BGM</span><button className={`btn sm ${bgm ? 'gold' : ''}`} onClick={toggleBgm}>{bgm ? 'ON' : 'OFF'}</button></div>
        <div className="row between"><span>🔊 こうかおん</span><button className={`btn sm ${sound ? 'gold' : ''}`} onClick={toggleSound}>{sound ? 'ON' : 'OFF'}</button></div>
        <div className="row between"><span>🎙️ じっきょう（おとこの こえ）</span><div className="row" style={{ gap: 6 }}><button className="btn sm" onClick={() => say('ようこそ、PKフレンドへ！今日もポケモンをゲットしよう！', { priority: true })}>テスト</button><button className={`btn sm ${voice ? 'gold' : ''}`} onClick={toggleVoice}>{voice ? 'ON' : 'OFF'}</button></div></div>
        <div className="small muted">{voiceInfo().available ? `つかう こえ: ${voiceInfo().name}${voiceInfo().male ? '' : '（この端末に 男性ボイスが ないため、すこし ひくい声に しています。iPhone は 設定→アクセシビリティ→読み上げコンテンツ→声→日本語 で「Otoya（拡張）」を 追加すると 自然な 男性の声に なります）'}` : 'この端末には 日本語の 音声合成が ありません（端末の 設定で 日本語音声を 追加すると 実況が 流れます）'}</div>
      </div>
      <p className="small muted center">みたポケモン {seen.length}しゅるい ／ ID: {player.id}</p>
      <button className="btn ghost sm" style={{ color: 'var(--muted)' }} onClick={() => setConfirmReset(true)}>データを リセットする</button>
      {edit && (
        <Modal title="なまえを へんこう" onClose={() => setEdit(false)}>
          <div className="stack">
            <input className="input" value={name} maxLength={12} onChange={e => setName(e.target.value)} />
            <button className="btn primary block" onClick={() => { if (name.trim()) setPlayer({ ...player, name: name.trim() }); setEdit(false); }}>けってい</button>
            {lead && <div className="row small muted">パートナーのタイプ: <Types id={lead.speciesId} /> {getSpecies(lead.speciesId).genus}</div>}
          </div>
        </Modal>
      )}
      {changeStarter && starter && (
        <Modal title="パートナーを えらびなおす" onClose={() => setChangeStarter(false)}>
          <p className="small muted">レベルと けいけんちは そのまま。サポートポケモン（ついげき）も この ポケモンに なる。</p>
          <div className="grid4">{[1, 4, 7, 25].map(id => <button key={id} className={`pokecard ${starter.speciesId === id ? 'sel' : ''}`} onClick={() => { const s = getSpecies(id); updatePokemon(starter.uid, { speciesId: id, moves: movesFor(id, s.types, levelFromExp(starter.exp)), nickname: undefined }); setPlayer({ ...player, avatarSpeciesId: id }); setChangeStarter(false); }}><Sprite id={id} size={56} /><span className="nm">{getSpecies(id).ja}</span><Types id={id} /></button>)}</div>
        </Modal>
      )}
      {confirmReset && (
        <Modal title="ほんとうに リセットしますか？" onClose={() => setConfirmReset(false)}>
          <p className="muted">すべての ポケモンと きろくが きえます。もとに もどせません。</p>
          <div className="grid2"><button className="btn" onClick={() => setConfirmReset(false)}>やめる</button><button className="btn" style={{ background: 'var(--bad)' }} onClick={resetAll}>リセットする</button></div>
        </Modal>
      )}
    </div>
  );
}
const Stat = ({ n, label }: { n: number | string; label: string }) => <div className="card center" style={{ padding: 10 }}><div style={{ fontSize: 20, fontWeight: 900 }}>{n}</div><div className="small muted">{label}</div></div>;
