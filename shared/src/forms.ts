// Battle transformations triggered by a successful special chance.
//   メガシンカ : evolution beyond the limit — the line's final stage, as its real Mega form when one exists
//   テラスタル : the pokémon turns crystalline and wears a jewel crown of its tera type
//   ダイマックス: the pokémon becomes gigantic — as its Gigantamax form when it has one
// Sprite ids ≥ 10000 are PokeAPI form ids (animated sprites + artwork exist for all of them).
import type { SpecialKind, TypeName } from './types.js';
import { getSpecies, evolutionsOf } from './species.js';
import { TYPE_JA } from './typechart.js';

export type FormKind = Extract<SpecialKind, 'mega' | 'tera' | 'dyna'>;
export interface BattleForm {
  kind: FormKind;
  /** sprite / artwork id to show (a species id or a PokeAPI form id) */
  spriteId: number;
  /** display name while transformed */
  name: string;
  /** announcement when the transformation completes */
  announce: string;
  /** true when spriteId is a dedicated form (Mega / Gigantamax), false when it is a regular species drawn with effects */
  realForm: boolean;
  teraType?: TypeName;
}

const MEGA: Record<number, { id: number; ja: string }[]> = {
  3: [{ id: 10033, ja: 'メガフシギバナ' }],
  6: [{ id: 10034, ja: 'メガリザードンX' }, { id: 10035, ja: 'メガリザードンY' }],
  9: [{ id: 10036, ja: 'メガカメックス' }],
  15: [{ id: 10090, ja: 'メガスピアー' }],
  18: [{ id: 10073, ja: 'メガピジョット' }],
  65: [{ id: 10037, ja: 'メガフーディン' }],
  80: [{ id: 10071, ja: 'メガヤドラン' }],
  94: [{ id: 10038, ja: 'メガゲンガー' }],
  115: [{ id: 10039, ja: 'メガガルーラ' }],
  127: [{ id: 10040, ja: 'メガカイロス' }],
  130: [{ id: 10041, ja: 'メガギャラドス' }],
  142: [{ id: 10042, ja: 'メガプテラ' }],
  150: [{ id: 10043, ja: 'メガミュウツーX' }, { id: 10044, ja: 'メガミュウツーY' }],
};
const GMAX: Record<number, number> = { 3: 10195, 6: 10196, 9: 10197, 12: 10198, 25: 10199, 52: 10200, 68: 10201, 94: 10202, 99: 10203, 131: 10204, 133: 10205, 143: 10206 };

/** Stable small number from a string (so the same pokémon always picks the same branch / X-Y form). */
export function seedOf(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Last stage of the evolution line (branching lines such as Eevee pick a branch by seed). */
export function finalEvolution(speciesId: number, seed = 0): number {
  let id = speciesId;
  for (let guard = 0; guard < 4; guard++) { const next = evolutionsOf(id); if (!next.length) break; id = next[seed % next.length]; }
  return id;
}

export function megaForm(speciesId: number, seed = 0): BattleForm {
  const fin = finalEvolution(speciesId, seed); const megas = MEGA[fin];
  if (megas) { const m = megas[seed % megas.length]; return { kind: 'mega', spriteId: m.id, name: m.ja, announce: `${m.ja}に メガシンカした！`, realForm: true }; }
  const name = `メガ${getSpecies(fin).ja}`;
  return { kind: 'mega', spriteId: fin, name, announce: `${name}に メガシンカした！`, realForm: false };
}
export function teraForm(speciesId: number, teraType: TypeName): BattleForm {
  const ja = getSpecies(speciesId).ja;
  return { kind: 'tera', spriteId: speciesId, name: ja, announce: `${ja}は ${TYPE_JA[teraType]}タイプに テラスタルした！`, realForm: false, teraType };
}
export function dynaForm(speciesId: number): BattleForm {
  const g = GMAX[speciesId]; const ja = getSpecies(speciesId).ja;
  return g ? { kind: 'dyna', spriteId: g, name: `キョダイ${ja}`, announce: `${ja}が キョダイマックスした！`, realForm: true } : { kind: 'dyna', spriteId: speciesId, name: `ダイマックス${ja}`, announce: `${ja}が ダイマックスした！`, realForm: false };
}
/** The form a pokémon takes when its special chance succeeds (null for Zワザ / タッグわざ, which do not transform). */
export function formFor(kind: SpecialKind, speciesId: number, seed: number, teraType: TypeName): BattleForm | null {
  if (kind === 'mega') return megaForm(speciesId, seed);
  if (kind === 'tera') return teraForm(speciesId, teraType);
  if (kind === 'dyna') return dynaForm(speciesId);
  return null;
}
