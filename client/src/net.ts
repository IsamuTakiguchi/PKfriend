import { create } from 'zustand';
import type { ClientMsg, ServerMsg, RoomView, BattleEvent, BattleState, Battler, OwnedPokemon, Player } from '@pkfriend/shared';
import { useStore } from './store';
import { toast } from './toast';
import { P2PNet } from './p2p';

export interface RoundPacket { events: BattleEvent[]; state: BattleState; roundDeadline: number | null; pendingUids: string[]; }
export interface Emote { id: number; playerId: string; playerName: string; emote: string; }
export interface TradeDone { received: OwnedPokemon; gaveUid: string; partner: Player; }

interface Net {
  status: 'offline' | 'connecting' | 'online';
  room: RoomView | null;
  rounds: RoundPacket[];              // queue consumed by the raid screen
  joins: { battler: Battler; playerName: string; id: number }[];
  emotes: Emote[];
  tradeDone: TradeDone | null;
  connect: () => void;
  send: (m: ClientMsg) => void;
  shiftRound: () => void;
  clearJoin: (id: number) => void;
  clearTrade: () => void;
  leave: () => void;
}

let ws: WebSocket | null = null;
let retry = 0;
let seq = 0;
let everOpened = false;

const ENV = (import.meta as unknown as { env: Record<string, string | undefined> }).env ?? {};
/** 'ws' = the Node server (same origin or VITE_WS_URL); 'p2p' = rooms run in the host player's browser.
 *  VITE_NET=p2p forces peer-to-peer (GitHub Pages without a server); otherwise the server is tried first
 *  and we fall back to peer-to-peer when it cannot be reached. */
let mode: 'ws' | 'p2p' = ENV.VITE_NET === 'p2p' ? 'p2p' : 'ws';
let p2p: P2PNet | null = null;

function wsUrl() {
  if (ENV.VITE_WS_URL) return ENV.VITE_WS_URL;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}
export const netMode = () => mode;

export const useNet = create<Net>((set, get) => ({
  status: 'offline', room: null, rounds: [], joins: [], emotes: [], tradeDone: null,
  connect: () => {
    if (mode === 'p2p') { startP2P(); return; }
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    set({ status: 'connecting' });
    try { ws = new WebSocket(wsUrl()); } catch { set({ status: 'offline' }); return; }
    ws.onopen = () => {
      retry = 0; everOpened = true; set({ status: 'online' });
      const p = useStore.getState().player; if (p) get().send({ t: 'hello', player: p });
      const code = get().room?.code; if (code) get().send({ t: 'join_room', code });
    };
    ws.onclose = () => {
      set({ status: 'offline' }); ws = null;
      // no server reachable (e.g. GitHub Pages only): switch to peer-to-peer rooms
      if (!everOpened && retry >= 1) { mode = 'p2p'; startP2P(); return; }
      const d = Math.min(8000, 500 * 2 ** retry++); setTimeout(() => get().connect(), d);
    };
    ws.onerror = () => { ws?.close(); };
    ws.onmessage = ev => { let m: ServerMsg; try { m = JSON.parse(ev.data); } catch { return; } receive(m); };
  },
  send: m => {
    if (mode === 'p2p') { startP2P(); p2p!.send(m); return; }
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); else if (m.t !== 'hello') toast('サーバーに せつぞく できていません', 'bad');
  },
  shiftRound: () => set(s => ({ rounds: s.rounds.slice(1) })),
  clearJoin: id => set(s => ({ joins: s.joins.filter(j => j.id !== id) })),
  clearTrade: () => set({ tradeDone: null }),
  leave: () => { get().send({ t: 'leave_room' }); set({ room: null, rounds: [], joins: [], emotes: [] }); },
}));

function receive(m: ServerMsg) {
  const set = useNet.setState;
  switch (m.t) {
    case 'room': set({ room: m.room }); break;
    case 'left': set({ room: null, rounds: [], joins: [], emotes: [] }); break;
    case 'round': set(s => ({ rounds: [...s.rounds, { events: m.events, state: m.state, roundDeadline: m.roundDeadline, pendingUids: m.pendingUids }] })); break;
    case 'joined_battle': set(s => ({ joins: [...s.joins, { battler: m.battler, playerName: m.playerName, id: ++seq }] })); break;
    case 'catch_result': break; // room sync carries results
    case 'emote': { const id = ++seq; set(s => ({ emotes: [...s.emotes, { id, playerId: m.playerId, playerName: m.playerName, emote: m.emote }] })); setTimeout(() => set(s => ({ emotes: s.emotes.filter(e => e.id !== id) })), 2500); break; }
    case 'trade_done': {
      const st = useStore.getState();
      st.removePokemon(m.gaveUid);
      st.addPokemon({ ...m.received, origin: 'trade' });
      st.addFriend({ id: m.partner.id, name: m.partner.name, avatarSpeciesId: m.partner.avatarSpeciesId, via: 'trade' });
      st.bump('trades');
      set({ tradeDone: { received: m.received, gaveUid: m.gaveUid, partner: m.partner } });
      break;
    }
    case 'error': toast(m.message, 'bad'); break;
  }
}

function startP2P() {
  if (!p2p) p2p = new P2PNet(receive, status => useNet.setState({ status }));
  const p = useStore.getState().player; if (p) p2p.send({ t: 'hello', player: p });
  void p2p.start();
}

// keep-alive
setInterval(() => { if (mode === 'ws' && ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'ping' })); }, 25000);
