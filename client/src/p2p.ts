// Serverless multiplayer: the player who creates a room runs it in their own browser (the same RoomHub the
// Node server uses) and friends connect to them directly over WebRTC. PeerJS's free public broker only
// introduces the peers; its default config also includes TURN relays for strict mobile networks.
// The room code doubles as the host's peer id, so a friend only needs the 6-character code.
import type { Peer as PeerT, DataConnection } from 'peerjs';
import { RoomHub, type Client, type Conn, type ClientMsg, type ServerMsg, type Player } from '@pkfriend/shared';

const PREFIX = 'pkfriend-v1-';
const ENV = (import.meta as unknown as { env: Record<string, string | undefined> }).env ?? {};
/** Broker: PeerJS's free public server by default, or a self-hosted `peer` server via VITE_PEER_HOST etc. */
const BROKER = ENV.VITE_PEER_HOST ? { host: ENV.VITE_PEER_HOST, port: Number(ENV.VITE_PEER_PORT || 443), path: ENV.VITE_PEER_PATH || '/', secure: ENV.VITE_PEER_SECURE !== 'false' } : {};
const CONNECT_TIMEOUT = 12_000;
type PeerErr = Error & { type?: string };

let PeerCtor: typeof PeerT | null = null;
async function loadPeer(): Promise<typeof PeerT> { if (!PeerCtor) PeerCtor = (await import('peerjs')).Peer; return PeerCtor; }

function openPeer(Peer: typeof PeerT, id?: string): Promise<PeerT> {
  return new Promise((resolve, reject) => {
    const p = id ? new Peer(id, { debug: 0, ...BROKER }) : new Peer({ debug: 0, ...BROKER });
    const t = setTimeout(() => { p.destroy(); reject(Object.assign(new Error('timeout'), { type: 'network' })); }, CONNECT_TIMEOUT);
    p.once('open', () => { clearTimeout(t); resolve(p); });
    p.once('error', e => { clearTimeout(t); p.destroy(); reject(e); });
  });
}

export class P2PNet {
  private base: PeerT | null = null;          // random-id peer: shows we're online and dials hosts
  private hostPeer: PeerT | null = null;      // peer whose id is our room code while we host
  private hub: RoomHub | null = null;
  private hostCode: string | null = null;
  private self: Client | null = null;
  private selfConn: Conn;
  private links = new Set<DataConnection>();  // guests connected to us
  private link: DataConnection | null = null; // our connection to someone else's room
  private player: Player | null = null;
  /** finished rooms we left but keep serving until the others have seen their results */
  private retired: { hub: RoomHub; peer: PeerT; links: Set<DataConnection>; until: number }[] = [];

  constructor(private deliver: (m: ServerMsg) => void, private status: (s: 'offline' | 'connecting' | 'online') => void) {
    this.selfConn = { open: true, send: d => queueMicrotask(() => this.deliver(JSON.parse(d) as ServerMsg)) };
  }

  /** Connect to the broker (so the app shows オンライン and can dial rooms). */
  async start() {
    if (this.base && !this.base.destroyed) { if (this.base.disconnected) this.base.reconnect(); return; }
    this.status('connecting');
    try {
      const Peer = await loadPeer(); this.base = await openPeer(Peer);
      this.status('online');
      this.base.on('disconnected', () => { this.status('connecting'); setTimeout(() => this.base && !this.base.destroyed && this.base.reconnect(), 1500); });
      this.base.on('open', () => this.status('online'));
      this.base.on('error', e => this.onBaseError(e as PeerErr));
    } catch { this.base = null; this.status('offline'); setTimeout(() => void this.start(), 5000); }
  }
  private onBaseError(e: PeerErr) {
    if (e.type === 'peer-unavailable') { this.link = null; this.deliver({ t: 'error', message: 'そのコードの へやは みつかりません' }); this.deliver({ t: 'left' }); }
    else if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') this.status('connecting');
  }

  send(m: ClientMsg) {
    switch (m.t) {
      case 'hello': this.player = m.player; if (this.hub && this.self) this.hub.handle(this.selfConn, this.self, m); else this.link?.send(JSON.stringify(m)); return;
      case 'ping': return;
      case 'create_room': void this.host(m); return;
      case 'join_room': void this.join(m.code); return;
      case 'leave_room': this.leave(); return;
      default:
        if (this.hub && this.self) this.hub.handle(this.selfConn, this.self, m);
        else if (this.link?.open) this.link.send(JSON.stringify(m));
        else this.deliver({ t: 'error', message: 'へやに つながっていません' });
    }
  }

  // ---------------------------------------------------------------- hosting
  private async host(m: Extract<ClientMsg, { t: 'create_room' }>) {
    if (!this.player) return;
    this.leave(true);
    const Peer = await loadPeer(); const hub = new RoomHub();
    let peer: PeerT | null = null; let code = '';
    for (let i = 0; i < 4 && !peer; i++) {
      code = hub.newCode();
      try { peer = await openPeer(Peer, PREFIX + code); } catch (e) { if ((e as PeerErr).type !== 'unavailable-id') { this.deliver({ t: 'error', message: 'へやを つくれませんでした。つうしんを たしかめてね' }); return; } }
    }
    if (!peer) { this.deliver({ t: 'error', message: 'へやを つくれませんでした' }); return; }
    this.hub = hub; this.hostPeer = peer; this.hostCode = code;
    this.self = hub.handle(this.selfConn, null, { t: 'hello', player: this.player });
    hub.handle(this.selfConn, this.self, { t: 'create_room', kind: m.kind, difficulty: m.difficulty, bossSpeciesId: m.bossSpeciesId }, { code });
    peer.on('connection', dc => this.accept(dc));
    peer.on('disconnected', () => setTimeout(() => peer && !peer.destroyed && peer.reconnect(), 1500)); // stay reachable for late joiners
  }
  private accept(dc: DataConnection) {
    const hub = this.hub; if (!hub) { dc.close(); return; }
    let client: Client | null = null;
    const conn: Conn = { send: d => { try { dc.send(d); } catch { /* closed */ } }, get open() { return dc.open; } };
    this.links.add(dc);
    dc.on('data', raw => { let msg: ClientMsg; try { msg = JSON.parse(String(raw)); } catch { return; } try { client = hub.handle(conn, client, msg); } catch (e) { console.error(e); } });
    const gone = () => { this.links.delete(dc); hub.disconnect(client); client = null; };
    dc.on('close', gone); dc.on('error', gone);
  }
  private closeHosted() {
    const hub = this.hub, code = this.hostCode;
    if (hub && code) { const room = hub.getRoom(code); if (room) for (const mem of room.members.values()) if (mem.client !== this.self) { room.send(mem.client, { t: 'error', message: 'ホストが へやを とじました' }); room.send(mem.client, { t: 'left' }); } for (const r of hub.rooms.values()) r.dispose(); }
    const peer = this.hostPeer; setTimeout(() => { for (const dc of this.links) dc.close(); this.links.clear(); peer?.destroy(); }, 300);
    this.hub = null; this.hostPeer = null; this.hostCode = null; this.self = null;
  }

  // ---------------------------------------------------------------- joining
  private async join(codeRaw: string) {
    const code = String(codeRaw).toUpperCase().trim();
    if (this.hub && this.hostCode === code && this.self) { this.hub.handle(this.selfConn, this.self, { t: 'join_room', code }); return; }
    if (!this.player) return;
    this.leave(true);
    await this.start(); const base = this.base; if (!base) { this.deliver({ t: 'error', message: 'オフラインです' }); return; }
    const dc = base.connect(PREFIX + code, { reliable: true }); this.link = dc;
    const timer = setTimeout(() => { if (!dc.open && this.link === dc) { this.link = null; dc.close(); this.deliver({ t: 'error', message: 'へやに つながりませんでした' }); } }, CONNECT_TIMEOUT);
    dc.on('open', () => { clearTimeout(timer); dc.send(JSON.stringify({ t: 'hello', player: this.player })); dc.send(JSON.stringify({ t: 'join_room', code })); });
    dc.on('data', raw => { let msg: ServerMsg; try { msg = JSON.parse(String(raw)); } catch { return; } this.deliver(msg); });
    dc.on('close', () => { clearTimeout(timer); if (this.link === dc) { this.link = null; this.deliver({ t: 'error', message: 'ホストとの つうしんが きれました' }); this.deliver({ t: 'left' }); } });
  }

  /** We leave a finished room (trade done / raid over) but keep serving it in the background so the others
   *  can still see their results; it shuts down once they have left too (or after 3 minutes). */
  private retireHost() {
    const hub = this.hub!, peer = this.hostPeer!, self = this.self!;
    hub.handle({ open: false, send: () => {} }, self, { t: 'leave_room' });
    this.retired.push({ hub, peer, links: this.links, until: Date.now() + 180_000 });
    this.links = new Set(); this.hub = null; this.hostPeer = null; this.hostCode = null; this.self = null;
    const sweep = setInterval(() => {
      this.retired = this.retired.filter(r => {
        if (r.hub.count > 0 && Date.now() < r.until) return true;
        for (const x of r.hub.rooms.values()) x.dispose(); for (const dc of r.links) dc.close(); r.peer.destroy(); return false;
      });
      if (!this.retired.length) clearInterval(sweep);
    }, 3000);
  }

  /** Leave the current room (closing it for everyone when we are its host). */
  leave(silent = false) {
    if (this.hub) {
      const room = this.hostCode ? this.hub.getRoom(this.hostCode) : undefined;
      const others = !!room && [...room.members.values()].some(m => m.client !== this.self);
      if (room && others && room.phase === 'done') this.retireHost(); else this.closeHosted();
    }
    if (this.link) { const dc = this.link; this.link = null; try { dc.send(JSON.stringify({ t: 'leave_room' })); } catch { /* ignore */ } setTimeout(() => dc.close(), 200); }
    if (!silent) this.deliver({ t: 'left' });
  }
}
