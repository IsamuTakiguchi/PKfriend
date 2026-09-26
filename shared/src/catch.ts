import type { Battler } from './types.js';
import { getSpecies } from './species.js';
import type { Rng } from './rng.js';

/**
 * Catch probability. `timing` is 0..1 from the ring mini-game (1 = perfect).
 * Follows the classic formula shape: low hp and high capture rate help; timing multiplies like a better ball.
 */
export function catchChance(target: Battler, timing: number, opts: { bonus?: number } = {}): number {
  const s = getSpecies(target.speciesId);
  const hpFactor = (3 * target.maxHp - 2 * target.hp) / (3 * target.maxHp); // 1/3 .. 1
  const ballBonus = 1 + timing * 1.5 + (opts.bonus ?? 0);                    // 1 .. 2.5 (+bonus)
  const a = (hpFactor * s.captureRate * ballBonus) / 255;                    // 0 .. ~2.5
  const bossPenalty = target.isBoss ? 1.6 : 1;                                 // raid bosses are guaranteed-ish once damaged heavily
  return Math.max(0.03, Math.min(0.97, a * bossPenalty));
}

/** Returns the number of shakes (0..3) and whether the catch succeeded. */
export function rollCatch(target: Battler, timing: number, rng: Rng, opts: { bonus?: number } = {}): { success: boolean; shakes: number; chance: number } {
  const chance = catchChance(target, timing, opts);
  if (chance >= 0.97) return { success: true, shakes: 3, chance };
  const perShake = Math.pow(chance, 1 / 3);
  let shakes = 0;
  for (let i = 0; i < 3; i++) { if (rng() < perShake) shakes++; else break; }
  return { success: shakes === 3, shakes, chance };
}
