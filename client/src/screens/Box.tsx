import { useState } from 'react';
import { SPECIES, getSpecies, getMove, levelFromExp, calcStats, displayName, expToNext, TYPE_COLOR, TYPE_JA, type OwnedPokemon } from '@pkfriend/shared';
import { useStore } from '../store';
import { Sprite, PokeCard, Modal, Types, ExpBar, PickCard } from '../components/ui';
import { sfx } from '../audio';
import { toast } from '../toast';

export function Box() {
  const [tab, setTab] = useState<'box' | 'dex'>('box');
  const box = useStore(s => s.box); const party = useStore(s => s.party); const caught = useStore(s => s.caught); const seen = useStore(s => s.seen);
  const [sel, setSel] = useState<OwnedPokemon | null>(null);
  const [sort, setSort] = useState<'new' | 'lv' | 'no'>('new');
  const list = [...box].sort((a, b) => sort === 'lv' ? b.exp - a.exp : sort === 'no' ? a.speciesId - b.speciesId : b.caughtAt - a.caughtAt);
  return (
    <div className="screen stack">
      <div className="tabs"><button className={tab === 'box' ? 'on' : ''} onClick={() => setTab('box')}>ボックス ({box.length})</button><button className={tab === 'dex' ? 'on' : ''} onClick={() => setTab('dex')}>ずかん ({caught.length}/{SPECIES.length})</button></div>
      {tab === 'box' ? (
        <>
          <div className="row between"><span className="small muted">★ = パーティ（さいだい3ひき）。いちばん左が せんとう。</span>
            <select className="input" style={{ width: 'auto', padding: '6px 8px', fontSize: 13 }} value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option value="new">あたらしい順</option><option value="lv">レベル順</option><option value="no">ばんごう順</option></select></div>
          {party.length > 0 && <div className="grid3">{party.map((u, i) => { const p = box.find(x => x.uid === u); return p ? <PokeCard key={u} p={p} size={60} tag={i === 0 ? '★ せんとう' : `★ ${i + 1}ばんめ`} onClick={() => setSel(p)} /> : null; })}</div>}
          <div className="grid3">{list.filter(p => !party.includes(p.uid)).map(p => <PokeCard key={p.uid} p={p} size={60} onClick={() => setSel(p)} />)}</div>
          {box.length === 0 && <p className="muted center">まだ ポケモンが いません。たんけんに いこう！</p>}
        </>
      ) : (
        <div className="grid4">
          {SPECIES.map(s => {
            const c = caught.includes(s.id), v = seen.includes(s.id);
            return <div key={s.id} className={`pokecard ${!c && !v ? 'dim' : ''}`} style={{ padding: 6 }}><span className="lv">{String(s.id).padStart(3, '0')}</span>{c || v ? <Sprite id={s.id} size={48} silhouette={!c} /> : <div style={{ width: 48, height: 48, display: 'grid', placeItems: 'center', fontSize: 24 }}>?</div>}<span className="nm" style={{ fontSize: 11 }}>{c || v ? s.ja : '？？？'}</span></div>;
          })}
        </div>
      )}
      {sel && <Detail p={box.find(x => x.uid === sel.uid) ?? sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function Detail({ p, onClose }: { p: OwnedPokemon; onClose: () => void }) {
  const s = getSpecies(p.speciesId); const lv = levelFromExp(p.exp); const st = calcStats(s.stats, p.ivs, lv); const e = expToNext(p.exp);
  const party = useStore(x => x.party); const setParty = useStore(x => x.setParty); const setLead = useStore(x => x.setLead); const update = useStore(x => x.updatePokemon); const remove = useStore(x => x.removePokemon); const box = useStore(x => x.box);
  const [nick, setNick] = useState(p.nickname ?? ''); const [card, setCard] = useState(false); const [rel, setRel] = useState(false);
  const inParty = party.includes(p.uid);
  return (
    <Modal onClose={onClose}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Sprite id={p.speciesId} shiny={p.shiny} size={110} />
        <div className="grow stack" style={{ gap: 4 }}>
          <div className="small muted">No.{String(s.id).padStart(3, '0')} {s.genus}</div>
          <h2 style={{ margin: 0 }}>{displayName(p)} {p.shiny && '✨'}</h2>
          <Types id={p.speciesId} />
          <div className="small">Lv.{lv}　つぎまで {e.need - e.cur} EXP</div><ExpBar exp={p.exp} />
          <div className="small muted">もとの トレーナー: {p.caughtByName}</div>
        </div>
      </div>
      <div className="grid3" style={{ marginTop: 12 }}>
        {(['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const).map(k => <div key={k} className="card center" style={{ padding: 8 }}><div className="small muted">{{ hp: 'HP', atk: 'こうげき', def: 'ぼうぎょ', spa: 'とくこう', spd: 'とくぼう', spe: 'すばやさ' }[k]}</div><div style={{ fontWeight: 900 }}>{st[k]}</div></div>)}
      </div>
      <h3 style={{ marginTop: 14 }}>わざ <span className="small muted">（バトルで つかうのは ★ピックのわざ）</span></h3>
      <div className="moves">{p.moves.map((id, i) => { const m = getMove(id); return <div key={id} className="movebtn" style={{ '--c': TYPE_COLOR[m.type], outline: i === 0 ? '2px solid var(--accent2)' : undefined } as React.CSSProperties}><div className="mn">{i === 0 && '★ '}{m.ja}</div><div className="mi"><span>{TYPE_JA[m.type]}</span><span>いりょく {m.power || '—'}</span><span>めいちゅう {m.accuracy}</span></div></div>; })}</div>
      <div className="stack" style={{ marginTop: 14 }}>
        <div className="row"><input className="input" placeholder="ニックネーム" value={nick} maxLength={10} onChange={ev => setNick(ev.target.value)} /><button className="btn sm" onClick={() => { update(p.uid, { nickname: nick.trim() || undefined }); toast('ニックネームを へんこうした'); }}>けってい</button></div>
        <div className="grid2">
          <button className="btn gold" onClick={() => { setLead(p.uid); sfx.select(); toast(`${displayName(p)}を せんとうにした`); }}>★ せんとうに する</button>
          {inParty ? <button className="btn" disabled={party.length <= 1} onClick={() => setParty(party.filter(u => u !== p.uid))}>パーティから はずす</button>
            : <button className="btn" disabled={party.length >= 3} onClick={() => { setParty([...party, p.uid]); sfx.select(); }}>パーティに いれる</button>}
          <button className="btn" onClick={() => setCard(true)}>🎴 ピックを みる</button>
          <button className="btn" disabled={box.length <= 1} onClick={() => setRel(true)}>にがす</button>
        </div>
      </div>
      {card && <Modal onClose={() => setCard(false)}><PickCard p={p} /></Modal>}
      {rel && <Modal title={`${displayName(p)}を にがしますか？`} onClose={() => setRel(false)}><div className="grid2"><button className="btn" onClick={() => setRel(false)}>やめる</button><button className="btn" style={{ background: 'var(--bad)' }} onClick={() => { remove(p.uid); toast(`${displayName(p)}は しぜんに かえっていった`); onClose(); }}>にがす</button></div></Modal>}
    </Modal>
  );
}
