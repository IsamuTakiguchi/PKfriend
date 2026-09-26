import type { TypeName } from './types.js';
import { SPECIES } from './species.js';

export interface Area { id: string; ja: string; desc: string; types: TypeName[]; minLevel: number; maxLevel: number; bg: string; }

export const AREAS: Area[] = [
  { id: 'grass', ja: 'みどりのくさむら', desc: 'くさ・むし・ノーマルタイプが よく あらわれる。', types: ['grass', 'bug', 'normal', 'poison'], minLevel: 3, maxLevel: 12, bg: 'linear-gradient(180deg,#8fd3f4 0%,#a8e063 60%,#56ab2f 100%)' },
  { id: 'sea', ja: 'あおいうみべ', desc: 'みず・こおりタイプの ポケモンが すんでいる。', types: ['water', 'ice'], minLevel: 8, maxLevel: 22, bg: 'linear-gradient(180deg,#43cea2 0%,#185a9d 100%)' },
  { id: 'cave', ja: 'くらいどうくつ', desc: 'いわ・じめん・ゴーストタイプに ちゅうい。', types: ['rock', 'ground', 'ghost', 'poison'], minLevel: 12, maxLevel: 28, bg: 'linear-gradient(180deg,#2c3e50 0%,#4b6584 100%)' },
  { id: 'plant', ja: 'はつでんしょ', desc: 'でんき・はがねタイプが ビリビリ している。', types: ['electric', 'steel'], minLevel: 15, maxLevel: 30, bg: 'linear-gradient(180deg,#f7971e 0%,#ffd200 100%)' },
  { id: 'volcano', ja: 'かざんのふもと', desc: 'ほのお・かくとうタイプが きたえている。', types: ['fire', 'fighting'], minLevel: 20, maxLevel: 38, bg: 'linear-gradient(180deg,#cb2d3e 0%,#ef473a 100%)' },
  { id: 'sky', ja: 'そらのとう', desc: 'ひこう・エスパー・ドラゴンタイプが まっている。', types: ['flying', 'psychic', 'dragon', 'fairy'], minLevel: 25, maxLevel: 45, bg: 'linear-gradient(180deg,#5f2c82 0%,#49a09d 100%)' },
];

export function areaPool(area: Area): number[] {
  const pool = SPECIES.filter(s => !s.legendary && s.types.some(t => area.types.includes(t)));
  // weight lower stages higher by duplicating
  const ids: number[] = [];
  for (const s of pool) {
    const w = s.evolvesFrom ? (SPECIES.some(x => x.evolvesFrom === s.id) ? 2 : 1) : 4;
    for (let i = 0; i < w; i++) ids.push(s.id);
  }
  return ids;
}

/** Raid bosses: fully-evolved or legendary pokémon. */
export function bossPool(): number[] {
  return SPECIES.filter(s => s.legendary || !SPECIES.some(x => x.evolvesFrom === s.id)).filter(s => Object.values(s.stats).reduce((a, b) => a + b, 0) >= 400).map(s => s.id);
}
