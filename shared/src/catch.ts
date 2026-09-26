import type { Battler } from './types.js';
import { getSpecies } from './species.js';
import type { Rng } from './rng.js';

/**
 * Catch probability. `timing` is 0..1 from the ring mini-game (1 = perfect).
 * Follows the classic formula shape: low hp and high capture rate help; timing multiplies like a better ball.
 */
export type BallKind = 'monster' | 'super' | 'hyper' | 'master';
export const BALL_JA: Record<BallKind, string> = { monster: 'モンスターボール', super: 'スーパーボール', hyper: 'ハイパーボール', master: 'マスターボール' };
export const BALL_RATE: Record<BallKind, number> = { monster: 1, super: 1.6, hyper: 2.4, master: 255 };
export const BALL_RANK: Record<BallKind, number> = { monster: 0, super: 1, hyper: 2, master: 3 };
/** ボールルーレットの盤面 (8 segments). A trainer pick adds one master ball in Frienda; we always include one. */
export const BALL_WHEEL: BallKind[] = ['monster', 'super', 'monster', 'hyper', 'monster', 'super', 'monster', 'master'];
export const bestBall = (balls: BallKind[]): BallKind => balls.reduce((a, b) => (BALL_RANK[b] > BALL_RANK[a] ? b : a), 'monster' as BallKind);

/** Catch chance with a ball kind (Frienda style: the roulette decides the ball, not the timing). */
export function catchChanceBall(target: Battler, ball: BallKind, opts: { bonus?: number } = {}): number {
  if (ball === 'master') return 1;
  const s = getSpecies(target.speciesId);
  const hpFactor = (3 * target.maxHp - 2 * target.hp) / (3 * target.maxHp);
  const a = (hpFactor * s.captureRate * BALL_RATE[ball] * (1 + (opts.bonus ?? 0))) / 255;
  return Math.max(0.05, Math.min(0.97, a * (target.isBoss ? 1.6 : 1)));
}
export function rollCatchBall(target: Battler, ball: BallKind, rng: Rng, opts: { bonus?: number } = {}): { success: boolean; shakes: number; chance: number } {
  const chance = catchChanceBall(target, ball, opts);
  if (chance >= 0.97) return { success: true, shakes: 3, chance };
  const perShake = Math.pow(chance, 1 / 3);
  let shakes = 0;
  for (let i = 0; i < 3; i++) { if (rng() < perShake) shakes++; else break; }
  return { success: shakes === 3, shakes, chance };
}

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
