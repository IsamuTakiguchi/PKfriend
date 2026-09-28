import { POKEMON_DATA } from './data/pokemon.data.js';
import type { Species, BaseStats, TypeName, OwnedPokemon, SpecialKind } from './types.js';
import { movesFor } from './moves.js';
import type { Rng } from './rng.js';
import { randInt } from './rng.js';

export const SPECIES: Species[] = (POKEMON_DATA as unknown as Array<Omit<Species, 'types'> & { types: string[] }>).map(s => ({ ...s, types: s.types as TypeName[] }));
export const SPECIES_BY_ID: Record<number, Species> = Object.fromEntries(SPECIES.map(s => [s.id, s]));
export function getSpecies(id: number): Species {
  const s = SPECIES_BY_ID[id];
  if (!s) throw new Error(`unknown species ${id}`);
  return s;
}

const EVOLVES_TO: Record<number, number[]> = {};
for (const s of SPECIES) if (s.evolvesFrom) (EVOLVES_TO[s.evolvesFrom] ??= []).push(s.id);

export function evolutionsOf(id: number): number[] { return EVOLVES_TO[id] ?? []; }
export function evolveLevel(id: number): number | null {
  if (!EVOLVES_TO[id]?.length) return null;
  const s = getSpecies(id);
  return s.evolvesFrom ? 36 : 16;
}
export function stageOf(id: number): number { let s = getSpecies(id); let n = 0; while (s.evolvesFrom) { s = getSpecies(s.evolvesFrom); n++; } return n; }

export function artworkUrl(id: number, shiny = false): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${shiny ? 'shiny/' : ''}${id}.png`;
}
/** Animated 3D-model sprite (Pokémon Showdown renders mirrored in the PokeAPI sprites repo). Faces left. */
export function animatedUrl(id: number, shiny = false): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/${shiny ? 'shiny/' : ''}${id}.gif`;
}
export function iconUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}

// ----- level / exp -----
export const MAX_LEVEL = 100;
export const expForLevel = (level: number) => level ** 3;
export function levelFromExp(exp: number): number { return Math.min(MAX_LEVEL, Math.max(1, Math.floor(Math.cbrt(exp)))); }
export function expToNext(exp: number): { level: number; cur: number; need: number } {
  const level = levelFromExp(exp);
  if (level >= MAX_LEVEL) return { level, cur: 1, need: 1 };
  const lo = expForLevel(level), hi = expForLevel(level + 1);
  return { level, cur: exp - lo, need: hi - lo };
}
/** Exp gained for defeating a foe. */
export function expGain(foeSpeciesId: number, foeLevel: number, isBoss = false): number {
  const s = getSpecies(foeSpeciesId);
  const total = Object.values(s.stats).reduce((a, b) => a + b, 0);
  return Math.floor((total * foeLevel) / 14) * (isBoss ? 3 : 1);
}

// ----- stats -----
export function calcStats(base: BaseStats, ivs: BaseStats, level: number): BaseStats {
  const st = (b: number, iv: number) => Math.floor(((2 * b + iv) * level) / 100) + 5;
  return {
    hp: Math.floor(((2 * base.hp + ivs.hp) * level) / 100) + level + 10,
    atk: st(base.atk, ivs.atk), def: st(base.def, ivs.def), spa: st(base.spa, ivs.spa), spd: st(base.spd, ivs.spd), spe: st(base.spe, ivs.spe),
  };
}

export function randomIvs(rng: Rng): BaseStats {
  return { hp: randInt(rng, 0, 31), atk: randInt(rng, 0, 31), def: randInt(rng, 0, 31), spa: randInt(rng, 0, 31), spd: randInt(rng, 0, 31), spe: randInt(rng, 0, 31) };
}

export const SHINY_RATE = 1 / 64;

let uidCounter = 0;
export function newUid(prefix = 'p'): string {
  uidCounter = (uidCounter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${uidCounter.toString(36)}`;
}

export const SPECIAL_KINDS: SpecialKind[] = ['tera', 'z', 'mega', 'tag', 'dyna'];
export const SPECIAL_JA: Record<SpecialKind, string> = { tera: 'テラスタル', z: 'Zワザ', mega: 'メガシンカ', tag: 'タッグわざ', dyna: 'ダイマックス' };
export const MARK_RATE = 0.3;
/** Which special a marked pick carries — the three transforming chances are the common ones. */
const MARK_WEIGHTS: [SpecialKind, number][] = [['mega', 0.26], ['tera', 0.26], ['dyna', 0.26], ['z', 0.11], ['tag', 0.11]];
export function markFromRoll(r: number): SpecialKind { let acc = 0; for (const [k, w] of MARK_WEIGHTS) { acc += w; if (r < acc) return k; } return 'mega'; }

export function createOwned(opts: { speciesId: number; level: number; rng: Rng; ownerId: string; ownerName: string; origin: OwnedPokemon['origin']; shiny?: boolean; mark?: SpecialKind | null }): OwnedPokemon {
  const s = getSpecies(opts.speciesId);
  const level = Math.max(1, Math.min(MAX_LEVEL, opts.level));
  const mark = opts.mark === null ? undefined : opts.mark ?? (opts.rng() < MARK_RATE ? markFromRoll(opts.rng()) : undefined);
  return {
    uid: newUid(), speciesId: s.id, exp: expForLevel(level), ivs: randomIvs(opts.rng),
    moves: movesFor(s.id, s.types, level), shiny: opts.shiny ?? opts.rng() < SHINY_RATE, mark,
    caughtAt: Date.now(), caughtBy: opts.ownerId, caughtByName: opts.ownerName, origin: opts.origin,
  };
}

// ----- pick info (Frienda style) -----
export const bst = (s: Species) => Object.values(s.stats).reduce((a, b) => a + b, 0);
/** ★2〜★5 grade. ★5 = legendary / very strong, ★4 = treasure, ★3 = evolved, ★2 = basic. */
export function gradeOf(speciesId: number): 2 | 3 | 4 | 5 {
  const s = getSpecies(speciesId); const t = bst(s);
  if (s.legendary || t >= 580) return 5;
  if (t >= 490) return 4;
  if (t >= 380) return 3;
  return 2;
}
/** ポケエネ: single "power" number shown on the pick. */
export function pokeEne(p: { speciesId: number; exp: number; ivs: BaseStats }): number {
  const s = getSpecies(p.speciesId); const lv = levelFromExp(p.exp); const st = calcStats(s.stats, p.ivs, lv);
  return Math.round((st.hp + st.atk + st.def + st.spa + st.spd + st.spe) * 1.6 + lv * 4);
}
/** すばやさレベル 1..10 from the speed stat. */
export function speedLevel(spe: number): number { return Math.max(1, Math.min(10, Math.ceil(spe / 18))); }
/** The pick's main わざ. */
export function mainMove(p: { moves: string[] }): string { return p.moves[0]; }

export function displayName(p: { nickname?: string; speciesId: number }): string { return p.nickname || getSpecies(p.speciesId).ja; }
