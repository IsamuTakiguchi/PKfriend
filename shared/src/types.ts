export type TypeName =
  | 'normal' | 'fire' | 'water' | 'grass' | 'electric' | 'ice' | 'fighting' | 'poison' | 'ground'
  | 'flying' | 'psychic' | 'bug' | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy';

export interface BaseStats { hp: number; atk: number; def: number; spa: number; spd: number; spe: number; }

export interface Species {
  id: number;
  name: string;
  ja: string;
  genus: string;
  types: TypeName[];
  stats: BaseStats;
  height: number;
  weight: number;
  captureRate: number;
  legendary: boolean;
  evolvesFrom: number | null;
}

export type MoveCategory = 'physical' | 'special' | 'status';
export type MoveFx = 'impact' | 'slash' | 'beam' | 'burst' | 'shock' | 'wave' | 'leaf' | 'ice' | 'aura' | 'quake' | 'wind' | 'poison' | 'psychic' | 'heal' | 'buff';
export type MoveEffect = 'heal' | 'atkUp' | 'defUp' | 'speUp' | 'atkDown' | 'defDown' | 'drain' | 'recoil' | 'flinch';

export interface Move {
  id: string;
  ja: string;
  type: TypeName;
  category: MoveCategory;
  power: number;
  accuracy: number;
  priority?: number;
  effect?: MoveEffect;
  effectChance?: number;
  fx: MoveFx;
  desc: string;
}

/** A Pokémon owned by a player (persisted client side). */
/** Special marks printed on a pick (Frienda: テラスタル / Zワザ / メガシンカ / タッグわざ / ダイマックス). */
export type SpecialKind = 'tera' | 'z' | 'mega' | 'tag' | 'dyna';

export interface OwnedPokemon {
  uid: string;
  speciesId: number;
  nickname?: string;
  exp: number;
  ivs: BaseStats;
  moves: string[];       // moves[0] is the pick's わざ used in battle
  shiny: boolean;
  mark?: SpecialKind;
  caughtAt: number;
  caughtBy: string;      // player id of original trainer
  caughtByName: string;
  origin: 'wild' | 'raid' | 'trade' | 'starter' | 'rental' | 'bonus' | 'exchange';
}

export interface StatStages { atk: number; def: number; spa: number; spd: number; spe: number; }

/** A live combatant in a battle. */
export interface Battler {
  uid: string;
  speciesId: number;
  name: string;         // display name (nickname or species ja)
  level: number;
  hp: number;
  maxHp: number;
  stats: BaseStats;     // computed stats at level
  moves: string[];
  shiny: boolean;
  ownerId: string;      // 'wild' for wild/boss
  ownerName: string;
  side: 'ally' | 'foe';
  stages: StatStages;
  isBoss?: boolean;
  fainted: boolean;
}

export interface BattleState {
  turn: number;
  allies: Battler[];
  foes: Battler[];
  finished: boolean;
  winner: 'ally' | 'foe' | null;
}

export interface BattleAction {
  battlerUid: string;
  moveId: string;
  targetUid?: string;
  /** こうげきルーレットの数字 (1..10). Damage is scaled by roulette / 5. Undefined = 1.0x. */
  roulette?: number;
  /** せんこうチャンス success etc.: added to the move priority. */
  initiative?: number;
  /** Special chance that fired on this attack. */
  special?: SpecialKind;
  /** タッグわざ: partner battler whose roulette number is added. */
  assistUid?: string;
  assistRoulette?: number;
  /** サポートポケモンの ついげき (follow-up hit, fraction of the damage dealt). */
  support?: { speciesId: number; name: string };
}

export type BattleEvent =
  | { kind: 'turn_start'; turn: number }
  | { kind: 'move_used'; userUid: string; targetUid: string; moveId: string }
  | { kind: 'miss'; userUid: string; targetUid: string }
  | { kind: 'damage'; targetUid: string; amount: number; hpAfter: number; effectiveness: number; crit: boolean; stab: boolean }
  | { kind: 'heal'; targetUid: string; amount: number; hpAfter: number }
  | { kind: 'stat_change'; targetUid: string; stat: keyof StatStages; delta: number }
  | { kind: 'faint'; targetUid: string }
  | { kind: 'join'; battler: Battler }
  | { kind: 'swap'; outUid: string; battler: Battler }
  | { kind: 'boss_enrage'; bossUid: string }
  | { kind: 'chain'; count: number }
  | { kind: 'special'; userUid: string; special: SpecialKind }
  | { kind: 'assist'; userUid: string; partnerUid: string; targetUid: string; amount: number; hpAfter: number }
  | { kind: 'support'; speciesId: number; name: string; targetUid: string; amount: number; hpAfter: number }
  | { kind: 'battle_end'; winner: 'ally' | 'foe' };

export interface Player { id: string; name: string; avatarSpeciesId: number; }
