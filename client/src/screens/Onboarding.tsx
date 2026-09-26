import { useState } from 'react';
import { createOwned, makeRng, randomSeed, getSpecies } from '@pkfriend/shared';
import { useStore, genId } from '../store';
import { Sprite, Types } from '../components/ui';
import { sfx, unlockAudio } from '../audio';

const STARTERS = [1, 4, 7, 25];

export function Onboarding() {
  const [name, setName] = useState('');
  const [pick, setPick] = useState<number | null>(null);
  const setPlayer = useStore(s => s.setPlayer); const addPokemon = useStore(s => s.addPokemon);

  function start() {
    if (!pick || !name.trim()) return;
    unlockAudio(); sfx.caught();
    const player = { id: genId(), name: name.trim().slice(0, 12), avatarSpeciesId: pick };
    setPlayer(player);
    addPokemon(createOwned({ speciesId: pick, level: 8, rng: makeRng(randomSeed()), ownerId: player.id, ownerName: player.name, origin: 'starter' }));
  }
  return (
    <div className="screen stack" style={{ paddingBottom: 24 }}>
      <div className="center" style={{ marginTop: 24 }}>
        <div style={{ fontSize: 56 }}>⚪</div>
        <h1>PKフレンドへ ようこそ！</h1>
        <p className="muted">ポケモンを あつめて、ともだちと こうかんして、みんなで バトルしよう。</p>
      </div>
      <div className="card stack">
        <h3>トレーナーの なまえ</h3>
        <input className="input" placeholder="なまえを いれてね（12もじまで）" value={name} maxLength={12} onChange={e => setName(e.target.value)} />
      </div>
      <div className="card stack">
        <h3>さいしょの パートナーを えらぼう</h3>
        <div className="grid4">
          {STARTERS.map(id => (
            <button key={id} className={`pokecard ${pick === id ? 'sel' : ''}`} onClick={() => { setPick(id); sfx.select(); }}>
              <Sprite id={id} size={64} />
              <span className="nm">{getSpecies(id).ja}</span>
              <Types id={id} />
            </button>
          ))}
        </div>
      </div>
      <button className="btn primary lg block" disabled={!pick || !name.trim()} onClick={start}>ぼうけんに でかける！</button>
      <p className="small muted center">データは この端末の ブラウザに ほぞんされます。</p>
    </div>
  );
}
