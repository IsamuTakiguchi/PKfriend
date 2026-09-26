import type { Battler, BattleEvent, BattleState, OwnedPokemon, Player } from './types.js';

export type RoomKind = 'battle' | 'trade';

export interface RoomMember { player: Player; ready: boolean; connected: boolean; }

export interface BattleRoomView {
  code: string; kind: 'battle'; hostId: string; members: RoomMember[];
  phase: 'lobby' | 'battle' | 'catch' | 'done';
  boss: Battler | null; difficulty: 1 | 2 | 3;
  state: BattleState | null;
  pendingUids: string[];          // battlers that still need to choose this round
  roundDeadline: number | null;   // epoch ms
  catchResults: Record<string, { success: boolean; shakes: number; pokemon?: OwnedPokemon }>;
  expGain: number;
}

export interface TradeOffer { pokemon: OwnedPokemon | null; confirmed: boolean; }
export interface TradeRoomView {
  code: string; kind: 'trade'; hostId: string; members: RoomMember[];
  offers: Record<string, TradeOffer>;
  phase: 'offer' | 'done';
}

export type RoomView = BattleRoomView | TradeRoomView;

export type ClientMsg =
  | { t: 'hello'; player: Player }
  | { t: 'create_room'; kind: RoomKind; difficulty?: 1 | 2 | 3; bossSpeciesId?: number }
  | { t: 'join_room'; code: string }
  | { t: 'leave_room' }
  | { t: 'battle_select'; pokemon: OwnedPokemon }       // pick / swap the pokémon you fight with
  | { t: 'battle_start' }                                // host only
  | { t: 'battle_action'; moveId: string }
  | { t: 'catch_attempt'; timing: number }
  | { t: 'emote'; emote: string }
  | { t: 'trade_offer'; pokemon: OwnedPokemon | null }
  | { t: 'trade_confirm'; confirmed: boolean }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'welcome'; serverTime: number }
  | { t: 'room'; room: RoomView }
  | { t: 'left' }
  | { t: 'round'; events: BattleEvent[]; state: BattleState; roundDeadline: number | null; pendingUids: string[] }
  | { t: 'joined_battle'; battler: Battler; playerName: string }
  | { t: 'catch_result'; playerId: string; success: boolean; shakes: number; pokemon?: OwnedPokemon }
  | { t: 'emote'; playerId: string; playerName: string; emote: string }
  | { t: 'trade_done'; received: OwnedPokemon; gaveUid: string; partner: Player }
  | { t: 'error'; message: string }
  | { t: 'pong' };

export const ROUND_SECONDS = 20;
export const MAX_RAID_MEMBERS = 4;
