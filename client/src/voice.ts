// Live commentary with the browser's speech synthesis (Web Speech API). Prefers a Japanese male voice.
import { useStore } from './store';
import { music } from './music';

let voices: SpeechSynthesisVoice[] = [];
let chosen: SpeechSynthesisVoice | null = null;
const MALE_HINT = /otoya|hattori|ichiro|keita|daichi|takumi|kenji|男性|male|naoki|shinji/i;
const FEMALE_HINT = /kyoko|haruka|ayumi|nanami|mizuki|sayaka|female|女性|o-ren|siri female/i;

function refresh() {
  if (typeof speechSynthesis === 'undefined') return;
  voices = speechSynthesis.getVoices();
  const ja = voices.filter(v => /^ja/i.test(v.lang));
  chosen = ja.find(v => MALE_HINT.test(v.name)) ?? ja.find(v => !FEMALE_HINT.test(v.name) && /premium|enhanced|natural|neural/i.test(v.name)) ?? ja.find(v => !FEMALE_HINT.test(v.name)) ?? ja[0] ?? null;
}
if (typeof speechSynthesis !== 'undefined') { refresh(); speechSynthesis.addEventListener?.('voiceschanged', refresh); }

export const voiceInfo = () => ({ available: typeof speechSynthesis !== 'undefined' && voices.some(v => /^ja/i.test(v.lang)), name: chosen?.name ?? null, male: !!chosen && MALE_HINT.test(chosen.name) });

let lastText = ''; let lastAt = 0;
/**
 * Speak a short line. `priority` lines interrupt whatever is playing; normal lines are dropped if something is speaking.
 * Pitch is lowered a little so that voices without an explicit male variant still read as a male announcer.
 */
export function say(text: string, opts: { priority?: boolean; rate?: number } = {}) {
  if (!useStore.getState().voice) return;
  if (typeof speechSynthesis === 'undefined') return;
  const now = Date.now();
  if (text === lastText && now - lastAt < 4000) return; // avoid stuttering the same line
  if (speechSynthesis.speaking && !opts.priority) return;
  if (opts.priority) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (chosen) u.voice = chosen;
  u.lang = 'ja-JP'; u.rate = opts.rate ?? 1.08; u.volume = 1;
  u.pitch = chosen && MALE_HINT.test(chosen.name) ? 0.95 : 0.72;
  music.duck(Math.min(4000, 350 + text.length * 120), 0.45);
  try { speechSynthesis.speak(u); lastText = text; lastAt = now; } catch { /* ignore */ }
}
export function stopSpeaking() { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); }

/** Commentary lines used across the game. */
export const lines = {
  wildAppear: (names: string[]) => `やせいの ${names.join('、')} が あらわれた！`,
  stepForward: (n: string) => `あいての ${n} が 前に 出てきた！`,
  yourPick: (n: string) => `いけ、${n}！`,
  initiativeChance: () => 'せんこうチャンス！ 連打だ！',
  specialChance: (kind: string) => `${kind}チャンス！`,
  roulette: () => 'こうげきルーレット、スタート！',
  cheer: () => 'ボタン連打で おうえんしよう！',
  bigNumber: (n: number) => (n >= 10 ? `${n}！ 最高の 数字だ！` : n >= 7 ? `${n}！ いい数字だ！` : `${n}。`),
  move: (u: string, m: string) => `${u}の ${m}！`,
  superEffective: () => 'こうかは ばつぐんだ！',
  crit: () => 'きゅうしょに あたった！',
  faint: (n: string) => `${n}、ダウン！`,
  getTime: (last: boolean) => (last ? 'ラストゲットタイム！' : 'ゲットタイム！'),
  ballRoulette: () => 'ボールルーレット！ ボールを 投げよう！',
  caught: (n: string) => `やった！ ${n}を ゲットだ！`,
  escaped: (n: string) => `ああ、${n}に 逃げられた…`,
  win: () => 'バトル 終了！ おみごと！',
  lose: () => 'ぜんめつ… つぎは がんばろう！',
  bossAppear: (n: string) => `ボスの ${n} が あらわれた！ みんなで たおそう！`,
  joined: (p: string) => `${p} が さんせんした！`,
  exchange: () => 'こうかんチャンス！',
  trainer: (t: string) => `${t} が しょうぶを しかけてきた！`,
  bonus: () => 'ボーナスゲットタイム！',
  levelUp: (n: string, lv: number) => `${n}は レベル${lv}に あがった！`,
  evolve: (a: string, b: string) => `おめでとう！ ${a}は ${b}に しんかした！`,
  nowGet: () => 'おかしを なげて、ポケモンの はんのうを たしかめよう！',
  reaction: (rare: boolean) => (rare ? 'レアな はんのうだ！' : 'なにか いるぞ！'),
};
