import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OwnedPokemon, Player } from '@pkfriend/shared';

export interface Friend { id: string; name: string; avatarSpeciesId: number; lastSeen: number; via: 'trade' | 'raid'; }
export interface Stats { battles: number; wins: number; catches: number; trades: number; raids: number; }

interface State {
  player: Player | null;
  box: OwnedPokemon[];
  party: string[];           // uids, party[0] is the lead
  seen: number[];
  caught: number[];
  friends: Friend[];
  stats: Stats;
  sound: boolean;
  bgm: boolean;
  setPlayer: (p: Player) => void;
  addPokemon: (p: OwnedPokemon) => void;
  removePokemon: (uid: string) => void;
  updatePokemon: (uid: string, patch: Partial<OwnedPokemon>) => void;
  setParty: (uids: string[]) => void;
  setLead: (uid: string) => void;
  markSeen: (speciesId: number) => void;
  addFriend: (f: Omit<Friend, 'lastSeen'>) => void;
  bump: (k: keyof Stats, n?: number) => void;
  toggleSound: () => void;
  toggleBgm: () => void;
  resetAll: () => void;
}

const uniq = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);
export const genId = () => 'u_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const useStore = create<State>()(persist((set, get) => ({
  player: null, box: [], party: [], seen: [], caught: [], friends: [], stats: { battles: 0, wins: 0, catches: 0, trades: 0, raids: 0 }, sound: true, bgm: true,
  setPlayer: p => set({ player: p }),
  addPokemon: p => set(s => ({ box: [...s.box.filter(x => x.uid !== p.uid), p], caught: uniq([...s.caught, p.speciesId]), seen: uniq([...s.seen, p.speciesId]), party: s.party.length < 3 ? [...s.party, p.uid] : s.party })),
  removePokemon: uid => set(s => ({ box: s.box.filter(x => x.uid !== uid), party: s.party.filter(u => u !== uid) })),
  updatePokemon: (uid, patch) => set(s => ({ box: s.box.map(x => x.uid === uid ? { ...x, ...patch } : x), caught: patch.speciesId ? uniq([...s.caught, patch.speciesId]) : s.caught, seen: patch.speciesId ? uniq([...s.seen, patch.speciesId]) : s.seen })),
  setParty: uids => set({ party: uids.slice(0, 3) }),
  setLead: uid => set(s => ({ party: [uid, ...s.party.filter(u => u !== uid)].slice(0, 3) })),
  markSeen: id => set(s => ({ seen: uniq([...s.seen, id]) })),
  addFriend: f => set(s => ({ friends: [{ ...f, lastSeen: Date.now() }, ...s.friends.filter(x => x.id !== f.id)].slice(0, 50) })),
  bump: (k, n = 1) => set(s => ({ stats: { ...s.stats, [k]: s.stats[k] + n } })),
  toggleSound: () => set(s => ({ sound: !s.sound })),
  toggleBgm: () => set(s => ({ bgm: !s.bgm })),
  resetAll: () => { localStorage.removeItem('pkfriend'); location.reload(); },
}), { name: 'pkfriend', version: 1, merge: (persisted, current) => ({ ...current, ...(persisted as object), bgm: (persisted as { bgm?: boolean })?.bgm ?? true }) }));

export const useParty = () => { const box = useStore(s => s.box); const party = useStore(s => s.party); return party.map(u => box.find(p => p.uid === u)).filter((p): p is OwnedPokemon => !!p); };
export const useLead = () => useParty()[0];
