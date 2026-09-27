// Commentary lines shared by the client (playback) and the build script (VOICEVOX synthesis).
// Written in natural Japanese (kanji + punctuation) so synthesizers place accents and pauses correctly.
import { SPECIES, evolutionsOf } from './species.js';
import { MOVES, movesFor } from './moves.js';
import { bossPool } from './areas.js';
import { BALL_JA } from './catch.js';
import { TRAINER_TITLES, TRAINER_NAMES } from './trainers.js';
import { SPECIAL_JA } from './species.js';

export const lines = {
  welcome: () => 'ようこそ、PKフレンドへ！今日もポケモンをゲットしよう！',
  wildAppear: () => '野生のポケモンが現れた！',
  wildIs: (n: string) => `${n}だ！`,
  stepForward: (n: string) => `相手の${n}が前に出てきた！`,
  yourPick: (n: string) => `行け、${n}！`,
  initiativeChance: () => '先攻チャンス！連打だ！',
  specialChance: (kind: string) => `${kind}チャンス！`,
  specialFalling: (kind: string) => `${kind}チャンス！マークを5回続けてタッチだ！`,
  specialAim: (kind: string) => `${kind}チャンス！光るマークで止めろ！`,
  specialDone: (kind: string) => `${kind}、発動！`,
  roulette: () => '攻撃ルーレット、スタート！',
  tired: () => '疲れていてルーレットが回らない！',
  cheer: () => 'ボタン連打で応援しよう！',
  bigNumber: (n: number) => (n >= 10 ? `${n}！最高の数字だ！` : n >= 7 ? `${n}！いい数字だ！` : `${n}。`),
  move: (u: string, m: string) => `${u}の${m}！`,
  superEffective: () => '効果は抜群だ！',
  crit: () => '急所に当たった！',
  faint: (n: string) => `${n}、ダウン！`,
  getTime: (last: boolean) => (last ? 'ラストゲットタイム！' : 'ゲットタイム！'),
  ballRoulette: () => 'ボールルーレット！ボールを投げよう！',
  ball: (ja: string) => `${ja}だ！`,
  caught: (n: string) => `やった！${n}をゲットだ！`,
  escaped: (n: string) => `ああ、${n}に逃げられた。`,
  win: () => 'バトル終了！お見事！',
  lose: () => '全滅。次は頑張ろう！',
  bossAppear: (n: string) => `ボスの${n}が現れた！みんなで倒そう！`,
  joined: () => '仲間が参戦した！',
  followUp: (n: string) => `追撃チャンス！${n}、行け！`,
  exchange: () => '交換チャンス！',
  trainer: (t: string) => `${t}が勝負を仕掛けてきた！`,
  bonus: () => 'ボーナスゲットタイム！',
  levelUp: (n: string) => `レベルアップ！${n}が強くなった！`,
  evolveStart: () => 'おや？様子が…！',
  evolve: (a: string, b: string) => `おめでとう！${a}は${b}に進化した！`,
  nowGet: () => 'お菓子を投げて、ポケモンの反応を確かめよう！',
  reaction: (rare: boolean) => (rare ? 'レアな反応だ！' : '何かいるぞ！'),
};

/** Every line the game can say, so the whole set can be synthesized ahead of time. */
export function allLines(): string[] {
  const out = new Set<string>();
  const L = lines;
  for (const f of [L.welcome, L.wildAppear, L.initiativeChance, L.roulette, L.tired, L.cheer, L.superEffective, L.crit, L.ballRoulette, L.win, L.lose, L.joined, L.exchange, L.bonus, L.evolveStart, L.nowGet]) out.add(f());
  out.add(L.getTime(true)); out.add(L.getTime(false)); out.add(L.reaction(true)); out.add(L.reaction(false));
  for (let n = 1; n <= 13; n++) out.add(L.bigNumber(n));
  for (const b of Object.values(BALL_JA)) out.add(L.ball(b));
  for (const k of Object.values(SPECIAL_JA)) { out.add(L.specialChance(k)); out.add(L.specialFalling(k)); out.add(L.specialAim(k)); out.add(L.specialDone(k)); }
  const bosses = new Set(bossPool());
  for (const s of SPECIES) {
    out.add(L.wildIs(s.ja)); out.add(L.stepForward(s.ja)); out.add(L.yourPick(s.ja)); out.add(L.faint(s.ja)); out.add(L.caught(s.ja)); out.add(L.escaped(s.ja)); out.add(L.levelUp(s.ja)); out.add(L.followUp(s.ja));
    if (bosses.has(s.id)) out.add(L.bossAppear(s.ja));
    const mv = new Set<string>(); for (const lv of [3, 8, 14, 20, 29, 35, 50, 80]) mv.add(movesFor(s.id, s.types, lv)[0]);
    for (const m of mv) out.add(L.move(s.ja, MOVES.find(x => x.id === m)!.ja));
    for (const to of evolutionsOf(s.id)) out.add(L.evolve(s.ja, SPECIES.find(x => x.id === to)!.ja));
  }
  for (const t of TRAINER_TITLES) for (const n of TRAINER_NAMES) out.add(L.trainer(`${t}の ${n}`));
  return [...out];
}
