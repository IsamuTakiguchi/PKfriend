import type { Move, TypeName } from './types.js';

export const MOVES: Move[] = [
  // normal
  { id: 'tackle', ja: 'たいあたり', type: 'normal', category: 'physical', power: 40, accuracy: 100, fx: 'impact', desc: 'からだごと ぶつかって こうげきする。' },
  { id: 'scratch', ja: 'ひっかく', type: 'normal', category: 'physical', power: 40, accuracy: 100, fx: 'slash', desc: 'するどい ツメで ひっかいて こうげきする。' },
  { id: 'quick-attack', ja: 'でんこうせっか', type: 'normal', category: 'physical', power: 40, accuracy: 100, priority: 1, fx: 'impact', desc: 'めにも とまらぬ はやさで つっこむ。かならず せんせいこうげき できる。' },
  { id: 'body-slam', ja: 'のしかかり', type: 'normal', category: 'physical', power: 85, accuracy: 100, fx: 'impact', desc: 'ぜんしんで のしかかって こうげきする。' },
  { id: 'hyper-beam', ja: 'はかいこうせん', type: 'normal', category: 'special', power: 150, accuracy: 90, fx: 'beam', desc: 'きょうりょくな こうせんを はっしゃする。' },
  { id: 'growl', ja: 'なきごえ', type: 'normal', category: 'status', power: 0, accuracy: 100, effect: 'atkDown', effectChance: 100, fx: 'wave', desc: 'かわいい なきごえで あいての こうげきを さげる。' },
  { id: 'harden', ja: 'かたくなる', type: 'normal', category: 'status', power: 0, accuracy: 100, effect: 'defUp', effectChance: 100, fx: 'buff', desc: 'ぜんしんに ちからを いれて ぼうぎょを あげる。' },
  { id: 'recover', ja: 'じこさいせい', type: 'normal', category: 'status', power: 0, accuracy: 100, effect: 'heal', effectChance: 100, fx: 'heal', desc: 'さいだいHPの はんぶん かいふくする。' },
  // fire
  { id: 'ember', ja: 'ひのこ', type: 'fire', category: 'special', power: 40, accuracy: 100, fx: 'burst', desc: 'ちいさな ほのおを とばして こうげきする。' },
  { id: 'flame-wheel', ja: 'かえんぐるま', type: 'fire', category: 'physical', power: 60, accuracy: 100, fx: 'impact', desc: 'ほのおを まとって つっこむ。' },
  { id: 'flamethrower', ja: 'かえんほうしゃ', type: 'fire', category: 'special', power: 90, accuracy: 100, fx: 'beam', desc: 'はげしい ほのおを あいてに はっしゃする。' },
  { id: 'fire-blast', ja: 'だいもんじ', type: 'fire', category: 'special', power: 110, accuracy: 85, fx: 'burst', desc: 'だいの じの ほのおで あいてを やきつくす。' },
  // water
  { id: 'water-gun', ja: 'みずでっぽう', type: 'water', category: 'special', power: 40, accuracy: 100, fx: 'beam', desc: 'みずを いきおいよく あいてに はっしゃする。' },
  { id: 'bubble-beam', ja: 'バブルこうせん', type: 'water', category: 'special', power: 65, accuracy: 100, effect: 'atkDown', effectChance: 10, fx: 'wave', desc: 'あわを いきおいよく はっしゃする。' },
  { id: 'surf', ja: 'なみのり', type: 'water', category: 'special', power: 90, accuracy: 100, fx: 'wave', desc: 'おおきな なみで あいてを おそう。' },
  { id: 'hydro-pump', ja: 'ハイドロポンプ', type: 'water', category: 'special', power: 110, accuracy: 80, fx: 'beam', desc: 'たいりょうの みずを はげしい いきおいで はっしゃする。' },
  // grass
  { id: 'vine-whip', ja: 'つるのムチ', type: 'grass', category: 'physical', power: 45, accuracy: 100, fx: 'slash', desc: 'ムチのような つるで あいてを たたく。' },
  { id: 'razor-leaf', ja: 'はっぱカッター', type: 'grass', category: 'physical', power: 55, accuracy: 95, fx: 'leaf', desc: 'はっぱを とばして きりつける。きゅうしょに あたりやすい。' },
  { id: 'giga-drain', ja: 'ギガドレイン', type: 'grass', category: 'special', power: 75, accuracy: 100, effect: 'drain', effectChance: 100, fx: 'leaf', desc: 'あたえた ダメージの はんぶん HPを かいふくする。' },
  { id: 'solar-beam', ja: 'ソーラービーム', type: 'grass', category: 'special', power: 120, accuracy: 100, fx: 'beam', desc: 'ひかりを あつめて はっしゃする。' },
  // electric
  { id: 'thunder-shock', ja: 'でんきショック', type: 'electric', category: 'special', power: 40, accuracy: 100, fx: 'shock', desc: 'でんげきを あびせて こうげきする。' },
  { id: 'spark', ja: 'スパーク', type: 'electric', category: 'physical', power: 65, accuracy: 100, fx: 'shock', desc: 'でんきを まとって たいあたりする。' },
  { id: 'thunderbolt', ja: '10まんボルト', type: 'electric', category: 'special', power: 90, accuracy: 100, fx: 'shock', desc: 'つよい でんげきを あいてに あびせる。' },
  { id: 'thunder', ja: 'かみなり', type: 'electric', category: 'special', power: 110, accuracy: 70, fx: 'shock', desc: 'はげしい かみなりを おとして こうげきする。' },
  // ice
  { id: 'powder-snow', ja: 'こなゆき', type: 'ice', category: 'special', power: 40, accuracy: 100, fx: 'ice', desc: 'つめたい ゆきを ふきつける。' },
  { id: 'ice-beam', ja: 'れいとうビーム', type: 'ice', category: 'special', power: 90, accuracy: 100, fx: 'beam', desc: 'れいとうビームを はっしゃする。' },
  { id: 'blizzard', ja: 'ふぶき', type: 'ice', category: 'special', power: 110, accuracy: 70, fx: 'ice', desc: 'はげしい ふぶきを おこして こうげきする。' },
  // fighting
  { id: 'karate-chop', ja: 'からてチョップ', type: 'fighting', category: 'physical', power: 50, accuracy: 100, fx: 'slash', desc: 'するどい てがたなで きりつける。' },
  { id: 'brick-break', ja: 'かわらわり', type: 'fighting', category: 'physical', power: 75, accuracy: 100, fx: 'impact', desc: 'てがたなを いきおいよく ふりおろす。' },
  { id: 'close-combat', ja: 'インファイト', type: 'fighting', category: 'physical', power: 120, accuracy: 100, effect: 'defDown', effectChance: 100, fx: 'impact', desc: 'ぼうぎょを すてて あいての ふところに とびこむ。' },
  // poison
  { id: 'poison-sting', ja: 'どくばり', type: 'poison', category: 'physical', power: 40, accuracy: 100, fx: 'poison', desc: 'どくの ハリを つきさす。' },
  { id: 'sludge-bomb', ja: 'ヘドロばくだん', type: 'poison', category: 'special', power: 90, accuracy: 100, fx: 'poison', desc: 'きたない ヘドロを なげつける。' },
  // ground
  { id: 'mud-slap', ja: 'どろかけ', type: 'ground', category: 'special', power: 40, accuracy: 100, fx: 'burst', desc: 'どろを あいての かおに なげつける。' },
  { id: 'dig', ja: 'あなをほる', type: 'ground', category: 'physical', power: 80, accuracy: 100, fx: 'quake', desc: 'じめんに もぐって したから こうげきする。' },
  { id: 'earthquake', ja: 'じしん', type: 'ground', category: 'physical', power: 100, accuracy: 100, fx: 'quake', desc: 'じしんを おこして こうげきする。' },
  // flying
  { id: 'gust', ja: 'かぜおこし', type: 'flying', category: 'special', power: 40, accuracy: 100, fx: 'wind', desc: 'つばさで かぜを おこして こうげきする。' },
  { id: 'wing-attack', ja: 'つばさでうつ', type: 'flying', category: 'physical', power: 60, accuracy: 100, fx: 'slash', desc: 'おおきな つばさを ひろげて うちつける。' },
  { id: 'drill-peck', ja: 'ドリルくちばし', type: 'flying', category: 'physical', power: 80, accuracy: 100, fx: 'impact', desc: 'かいてんしながら くちばしで つきさす。' },
  { id: 'hurricane', ja: 'ぼうふう', type: 'flying', category: 'special', power: 110, accuracy: 70, fx: 'wind', desc: 'はげしい かぜで あいてを まきこむ。' },
  // psychic
  { id: 'confusion', ja: 'ねんりき', type: 'psychic', category: 'special', power: 50, accuracy: 100, fx: 'psychic', desc: 'よわい ねんどうりょくで こうげきする。' },
  { id: 'psybeam', ja: 'サイケこうせん', type: 'psychic', category: 'special', power: 65, accuracy: 100, fx: 'beam', desc: 'ふしぎな こうせんを はっしゃする。' },
  { id: 'psychic', ja: 'サイコキネシス', type: 'psychic', category: 'special', power: 90, accuracy: 100, effect: 'defDown', effectChance: 10, fx: 'psychic', desc: 'つよい ねんどうりょくで こうげきする。' },
  // bug
  { id: 'bug-bite', ja: 'むしくい', type: 'bug', category: 'physical', power: 60, accuracy: 100, fx: 'impact', desc: 'かみついて こうげきする。' },
  { id: 'x-scissor', ja: 'シザークロス', type: 'bug', category: 'physical', power: 80, accuracy: 100, fx: 'slash', desc: 'カマや ツメを ハサミのように こうさして きりさく。' },
  // rock
  { id: 'rock-throw', ja: 'いわおとし', type: 'rock', category: 'physical', power: 50, accuracy: 90, fx: 'impact', desc: 'ちいさな いわを なげつける。' },
  { id: 'rock-slide', ja: 'いわなだれ', type: 'rock', category: 'physical', power: 75, accuracy: 90, fx: 'quake', desc: 'おおきな いわを はげしく なげつける。' },
  // ghost
  { id: 'lick', ja: 'したでなめる', type: 'ghost', category: 'physical', power: 30, accuracy: 100, fx: 'aura', desc: 'ながい したで なめまわして こうげきする。' },
  { id: 'shadow-ball', ja: 'シャドーボール', type: 'ghost', category: 'special', power: 80, accuracy: 100, fx: 'aura', desc: 'くろい かげの かたまりを なげつける。' },
  // dragon
  { id: 'dragon-breath', ja: 'りゅうのいぶき', type: 'dragon', category: 'special', power: 60, accuracy: 100, fx: 'beam', desc: 'はげしい いぶきを ふきつける。' },
  { id: 'dragon-claw', ja: 'ドラゴンクロー', type: 'dragon', category: 'physical', power: 80, accuracy: 100, fx: 'slash', desc: 'するどく とがった ツメで きりさく。' },
  { id: 'draco-meteor', ja: 'りゅうせいぐん', type: 'dragon', category: 'special', power: 130, accuracy: 90, fx: 'burst', desc: 'てんくうから いんせきを ふらせる。' },
  // dark / steel / fairy
  { id: 'bite', ja: 'かみつく', type: 'dark', category: 'physical', power: 60, accuracy: 100, effect: 'flinch', effectChance: 30, fx: 'impact', desc: 'するどい キバで かみついて こうげきする。' },
  { id: 'crunch', ja: 'かみくだく', type: 'dark', category: 'physical', power: 80, accuracy: 100, fx: 'impact', desc: 'するどい キバで かみくだいて こうげきする。' },
  { id: 'iron-head', ja: 'アイアンヘッド', type: 'steel', category: 'physical', power: 80, accuracy: 100, fx: 'impact', desc: 'はがねのように かたい あたまで こうげきする。' },
  { id: 'dazzling-gleam', ja: 'マジカルシャイン', type: 'fairy', category: 'special', power: 80, accuracy: 100, fx: 'burst', desc: 'つよい ひかりを はなって こうげきする。' },
  { id: 'moonblast', ja: 'ムーンフォース', type: 'fairy', category: 'special', power: 95, accuracy: 100, fx: 'burst', desc: 'つきの パワーを あつめて はっしゃする。' },
];

export const MOVE_BY_ID: Record<string, Move> = Object.fromEntries(MOVES.map(m => [m.id, m]));

export function getMove(id: string): Move {
  const m = MOVE_BY_ID[id];
  if (!m) throw new Error(`unknown move ${id}`);
  return m;
}

/** Deterministic move set: strongest available moves of own types at this level, plus coverage. */
export function movesFor(speciesId: number, types: TypeName[], level: number): string[] {
  const cap = level < 15 ? 60 : level < 30 ? 90 : 999;
  const own = MOVES.filter(m => types.includes(m.type) && m.category !== 'status' && m.power <= cap)
    .sort((a, b) => b.power - a.power);
  const picked: string[] = [];
  // best move of each own type first
  for (const t of types) {
    const best = own.find(m => m.type === t && !picked.includes(m.id));
    if (best) picked.push(best.id);
  }
  for (const m of own) { if (picked.length >= 3) break; if (!picked.includes(m.id)) picked.push(m.id); }
  // coverage / utility chosen deterministically by species id
  const utility = ['quick-attack', 'body-slam', 'growl', 'harden', 'recover', 'bite'];
  const u = utility[speciesId % utility.length];
  if (!picked.includes(u) && (u !== 'body-slam' || level >= 20)) picked.push(u);
  if (picked.length < 4 && !picked.includes('tackle')) picked.push('tackle');
  return picked.slice(0, 4);
}
