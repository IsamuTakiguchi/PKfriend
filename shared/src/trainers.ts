import type { Rng } from './rng.js';
import { pick, randInt } from './rng.js';
import { SPECIES, getSpecies } from './species.js';
import type { Area } from './areas.js';

export interface TrainerDef { name: string; title: string; speciesIds: number[]; level: number; }

export const TRAINER_TITLES = ['たんパンこぞう', 'ミニスカート', 'ポケモンブリーダー', 'エリートトレーナー', 'キャンプボーイ', 'ピクニックガール', 'つりびと', 'やまおとこ', 'かいじゅうマニア', 'ダブルスチーム'];
export const TRAINER_NAMES = ['ケン', 'ユミ', 'ハナ', 'レン', 'ソラ', 'ミオ', 'タクミ', 'アオイ', 'ヒロ', 'リン', 'カイ', 'ナナ'];

/** A random trainer who ambushes you in an area, with 3 pokémon a little above the wild level. */
export function makeTrainer(area: Area, level: number, rng: Rng): TrainerDef {
  const pool = SPECIES.filter(s => !s.legendary && s.types.some(t => area.types.includes(t)) && (s.evolvesFrom || rng() < 0.4));
  const ids: number[] = [];
  while (ids.length < 3) { const id = pick(rng, pool).id; if (!ids.includes(id) || pool.length < 3) ids.push(id); }
  return { name: pick(rng, TRAINER_NAMES), title: pick(rng, TRAINER_TITLES), speciesIds: ids, level: Math.min(100, level + randInt(rng, 1, 3)) };
}
export const trainerLabel = (t: TrainerDef) => `${t.title}の ${t.name}`;

/** こうかんチャンス: a senior trainer offers a rarer pokémon in exchange for the one you just caught. */
export function exchangeOffer(caughtSpeciesId: number, level: number, rng: Rng): number {
  const c = getSpecies(caughtSpeciesId);
  const cand = SPECIES.filter(s => s.id !== c.id && (s.legendary || !SPECIES.some(x => x.evolvesFrom === s.id)));
  const strong = cand.filter(s => Object.values(s.stats).reduce((a, b) => a + b, 0) >= 450);
  return pick(rng, strong.length ? strong : cand).id;
}
export const exchangeLevel = (level: number) => Math.min(100, level + 5);
