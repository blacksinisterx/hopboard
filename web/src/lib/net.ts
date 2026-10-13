// Hopboard session: pairing handshake, WebRTC data channel, encrypted-relay fallback, item transfer.
//
// Wire format on the relay is JSON strings the server cannot read:
//   {t:'r', s}        sealed with the ROOM key   (handshake: hello / accept / here / deny / full)
//   {t:'p', to, s}    sealed with the PAIR key   (control: ready / sig / ping), s = {n, ...}
//   {t:'b', to, s}    sealed with the PAIR key   (relayed app frames), plaintext = u64 counter || frame
// App frames (same bytes over WebRTC or relay):  [1]=utf8 JSON message   [2]+u32 id+u32 idx+bytes = file chunk

import {
  b64uEnc, b64uDec, deriveRoom, sealJson, openJson, sealBytes, openBytes, newIdentity, safetyEmoji, derivePairKey,
  randomBytes, randomId, concat, u32, readU32, u64, readU64,
} from './crypto';
import { checkOutgoing, checkDeclared, checkFile, shrinkImage, MAX_FILE, MAX_RELAY } from './media';
import { idbGet, idbSet, idbDel } from './idb';

const WS_BASE = (import.meta.env.VITE_WS_URL as string | undefined) ?? 'wss://hopboard.blacksinisterx.workers.dev';
const ICE: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
const CHUNK_DC = 64 * 1024; // well under the 256 KiB SCTP message limit every browser supports
const READ_BLOCK = 1 << 20;
const CHUNK_RELAY = 96 * 1024;
const BOARD_TTL = 7 * 24 * 3600 * 1000;
const INVITE_TTL = 10 * 60 * 1000;
const REQUEST_TTL = 2 * 60 * 1000;
const MAX_TEXT = 100_000;

export type Phase = 'waiting' | 'joining' | 'connected' | 'ended';
export type Link = 'none' | 'p2p' | 'relay';
export type ItemStatus = 'sending' | 'sent' | 'delivered' | 'receiving' | 'done' | 'rejected' | 'failed';

export interface Item {
  id: string; mine: boolean; kind: 'text' | 'image' | 'file'; at: number; status: ItemStatus;
  text?: string; name?: string; mime?: string; size?: number; url?: string; progress: number; note?: string;
}
export interface JoinRequest { id: string; name: string; pub: string; sas: string[]; at: number }
export interface FrameLog { at: number; dir: 'in' | 'out'; kind: 'handshake' | 'signal' | 'data'; bytes: number; preview: string }
export interface State {
  phase: Phase; link: Link; wsUp: boolean; forceRelay: boolean; role: 'host' | 'guest'; myName: string;
  inviteUrl?: string; inviteExpiresAt?: number; sas: string[]; peer?: { name: string }; peerAway: boolean;
  requests: JoinRequest[]; items: Item[]; frames: FrameLog[]; relayedBytes: number; endReason?: string;
}

interface BoardRecord {
  role: 'host' | 'guest'; secret: string; hostPub?: string; priv: CryptoKey; pub: Uint8Array;
  approved: string[]; name: string; createdAt: number; lastUsed: number;
}
interface Pair { peerId: string; key: CryptoKey; sn: number; rn: number; pubStr: string }
interface Incoming { id: number; itemId: string; name: string; mime: string; size: number; kind: 'image' | 'file'; chunks: Uint8Array[]; got: number; dead: boolean; lastUi: number }

const ADJ = ['Sleepy', 'Zippy', 'Cozy', 'Fluffy', 'Sneaky', 'Jolly', 'Bouncy', 'Mellow', 'Giddy', 'Plucky'];
const ANIMAL = ['Otter', 'Carrot', 'Comet', 'Pickle', 'Waffle', 'Mango', 'Noodle', 'Pebble', 'Muffin', 'Biscuit'];
function deviceName(): string {
  const ua = navigator.userAgent;
  const kind = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Mac/i.test(ua) ? 'Mac' : /Windows/i.test(ua) ? 'Windows' : /Linux/i.test(ua) ? 'Linux' : 'Device';
  const pick = (a: string[]) => a[randomBytes(1)[0] % a.length];
  return `${kind} · ${pick(ADJ)} ${pick(ANIMAL)}`;
}

export const INVITE_RE = /^#?([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{87})$/;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const te = new TextEncoder();
const td = new TextDecoder();
const cleanName = (s: unknown) => String(s ?? 'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'file';

export class Session {
  state: State;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private rec: BoardRecord;
  private id = randomId(6);
  private room!: { roomId: string; key: CryptoKey };
  private ws: WebSocket | null = null;
  private closed = false;
  private retry = 0;
  private pair: Pair | null = null;
  private nG: Uint8Array = randomBytes(16);
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private iceQueue: RTCIceCandidateInit[] = [];
  private sendQ: Promise<void> = Promise.resolve();
  private incoming = new Map<number, Incoming>();
  private lastSeen = 0;
  private hb: ReturnType<typeof setInterval> | null = null;
  private seq = 0;

  private constructor(rec: BoardRecord) {
    this.rec = rec;
    this.state = {
      phase: rec.role === 'host' ? 'waiting' : 'joining', link: 'none', wsUp: false, forceRelay: false, role: rec.role,
      myName: rec.name, sas: [], peerAway: false, requests: [], items: [], frames: [], relayedBytes: 0,
    };
    if (rec.role === 'host') {
      this.state.inviteUrl = `${location.origin}/#${rec.secret}.${b64uEnc(rec.pub)}`;
      this.state.inviteExpiresAt = rec.approved.length ? undefined : rec.createdAt + INVITE_TTL;
    }
  }

  /* ───────── construction ───────── */

  static async createHost(): Promise<Session> {
    const id = await newIdentity();
    const rec: BoardRecord = { role: 'host', secret: b64uEnc(randomBytes(16)), priv: id.priv, pub: id.pub, approved: [], name: deviceName(), createdAt: Date.now(), lastUsed: Date.now() };
    await idbSet('board', rec);
    return Session.start(rec);
  }

  static async join(invite: string): Promise<Session> {
    const m = INVITE_RE.exec(invite);
    if (!m) throw new Error('That invite link looks broken.');
    const id = await newIdentity();
    const rec: BoardRecord = { role: 'guest', secret: m[1], hostPub: m[2], priv: id.priv, pub: id.pub, approved: [], name: deviceName(), createdAt: Date.now(), lastUsed: Date.now() };
    await idbSet('board', rec);
    return Session.start(rec);
  }

  /** Invite in the URL wins; otherwise resume the remembered board (if still fresh). */
  static async boot(): Promise<Session | null> {
    if (INVITE_RE.test(location.hash)) {
      const invite = location.hash;
      history.replaceState(null, '', location.pathname + location.search); // keep the secret out of history/screenshots
      return Session.join(invite);
    }
    const rec = await idbGet<BoardRecord>('board').catch(() => undefined);
    if (!rec || Date.now() - rec.lastUsed > BOARD_TTL) { if (rec) await idbDel('board'); return null; }
    return Session.start(rec);
  }

  private static async start(rec: BoardRecord): Promise<Session> {
    const s = new Session(rec);
    s.room = await deriveRoom(rec.secret);
    if (rec.role === 'guest') s.set({ sas: await safetyEmoji(rec.priv, rec.pub, b64uDec(rec.hostPub!), rec.secret) });
    s.connect();
    s.hb = setInterval(() => s.heartbeat(), 15000);
    return s;
  }

  /* ───────── tiny store ───────── */

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  getState = () => this.state;
  private set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.listeners.forEach((f) => f()); }, 30);
  }
  private log(dir: FrameLog['dir'], kind: FrameLog['kind'], s: string) {
    const f: FrameLog = { at: Date.now(), dir, kind, bytes: s.length, preview: s.slice(0, 72) };
    this.set({ frames: [f, ...this.state.frames].slice(0, 80), relayedBytes: this.state.relayedBytes + (kind === 'data' ? s.length : 0) });
  }
  private computeLink(): Link {
    if (!this.pair) return 'none';
    if (!this.state.forceRelay && this.dc?.readyState === 'open') return 'p2p';
    return this.state.wsUp ? 'relay' : 'none';
  }
  private refreshLink() { this.set({ link: this.computeLink() }); }

  setForceRelay(v: boolean) { this.state = { ...this.state, forceRelay: v }; this.refreshLink(); }

  /* ───────── websocket ───────── */

  private connect() {
    if (this.closed) return;
    const ws = new WebSocket(`${WS_BASE}/ws/${this.room.roomId}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.set({ wsUp: true });
      this.refreshLink();
      if (this.rec.role === 'guest') void this.sendHello();
      else if (this.rec.approved.length) void this.sendRoom({ k: 'here' });
    };
    ws.onmessage = (e) => { if (typeof e.data === 'string') void this.onWs(e.data); };
    ws.onclose = () => {
      this.set({ wsUp: false });
      this.refreshLink();
      if (!this.closed && this.state.phase !== 'ended') setTimeout(() => this.connect(), Math.min(10000, 800 * 2 ** this.retry++));
    };
    ws.onerror = () => ws.close();
  }

  private wsSend(obj: unknown, kind: FrameLog['kind']) {
    const s = JSON.stringify(obj);
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(s);
    this.log('out', kind, s);
    return true;
  }

  private async sendRoom(msg: Record<string, unknown>) {
    this.wsSend({ t: 'r', s: await sealJson(this.room.key, { ...msg, from: this.id, ts: Date.now() }) }, 'handshake');
  }

  private enqueue(fn: () => Promise<void>) {
    this.sendQ = this.sendQ.then(fn).catch(() => undefined);
    return this.sendQ;
  }

  private sendPairJson(msg: Record<string, unknown>, kind: FrameLog['kind'] = 'signal') {
    return this.enqueue(async () => {
      const p = this.pair; if (!p) return;
      this.wsSend({ t: 'p', to: p.peerId, s: await sealJson(p.key, { n: p.sn++, ...msg }) }, kind);
    });
  }

  private sendPairBytes(frame: Uint8Array) {
    return this.enqueue(async () => {
      const p = this.pair; if (!p) return;
      this.wsSend({ t: 'b', to: p.peerId, s: await sealBytes(p.key, concat(u64(p.sn++), frame)) }, 'data');
    });
  }

  private async onWs(raw: string) {
    let f: { t?: string; to?: string; s?: string };
    try { f = JSON.parse(raw); } catch { return; }
    if (typeof f.s !== 'string') return;
    try {
      if (f.t === 'r') {
        const m = await openJson<Record<string, any>>(this.room.key, f.s);
        if (m.from === this.id) return;
        this.log('in', 'handshake', raw);
        await this.onRoom(m);
      } else if ((f.t === 'p' || f.t === 'b') && f.to === this.id && this.pair) {
        const p = this.pair;
        if (f.t === 'p') {
          const m = await openJson<Record<string, any>>(p.key, f.s);
          if (typeof m.n !== 'number' || m.n <= p.rn) return; // replay or reorder
          p.rn = m.n;
          this.log('in', 'signal', raw);
          await this.onPairJson(m);
        } else {
          const plain = await openBytes(p.key, f.s);
          const n = readU64(plain);
          if (n <= p.rn) return;
          p.rn = n;
          this.log('in', 'data', raw);
          this.touch();
          this.onFrame(plain.subarray(8));
        }
      }
    } catch { /* wrong key, tampered or stale frame: drop silently */ }
  }

  /* ───────── handshake ───────── */

  private async sendHello() {
    this.nG = randomBytes(16);
    this.pair = null;
    this.set({ phase: 'joining', peer: undefined, link: 'none' });
    await this.sendRoom({ k: 'hello', name: this.rec.name, pub: b64uEnc(this.rec.pub), nG: b64uEnc(this.nG) });
  }

  private async onRoom(m: Record<string, any>) {
    if (Math.abs(Date.now() - Number(m.ts)) > 5 * 60 * 1000) return;
    if (this.rec.role === 'host') {
      if (m.k !== 'hello') return;
      const pub = b64uDec(String(m.pub));
      if (pub.length !== 65) return;
      const pubStr = String(m.pub);
      const known = this.rec.approved.includes(pubStr);
      if (!known) {
        const inviteLive = this.rec.approved.length === 0 && Date.now() < this.rec.createdAt + INVITE_TTL;
        if (!inviteLive) return void this.sendRoom({ k: 'full', to: m.from });
        const sas = await safetyEmoji(this.rec.priv, this.rec.pub, pub, this.rec.secret);
        const fresh = this.state.requests.filter((r) => r.id !== m.from && Date.now() - r.at < REQUEST_TTL);
        this.pendingHello.set(m.from, { pub, nG: b64uDec(String(m.nG)) });
        this.set({ requests: [...fresh, { id: m.from, name: cleanName(m.name), pub: pubStr, sas, at: Date.now() }].slice(-3) });
        return;
      }
      await this.accept(m.from, pub, b64uDec(String(m.nG)), cleanName(m.name));
    } else {
      if (m.k === 'here' && this.state.phase !== 'ended') return void this.sendHello(); // host came back: re-handshake
      if (m.to !== this.id) return;
      if (m.k === 'deny') return this.end('The other device said no. Ask for a fresh QR code.');
      if (m.k === 'full') return this.end('This board already has a partner (or the invite expired). Ask for a fresh QR code.');
      if (m.k === 'accept' && b64uEnc(this.nG) === m.nG) {
        const nH = b64uDec(String(m.nH));
        const key = await derivePairKey(this.rec.priv, this.rec.pub, b64uDec(this.rec.hostPub!), this.rec.secret, this.nG, nH);
        this.pair = { peerId: m.from, key, sn: 0, rn: -1, pubStr: this.rec.hostPub! };
        this.peerName = cleanName(m.name);
        await this.sendPairJson({ k: 'ready' });
      }
    }
  }

  private pendingHello = new Map<string, { pub: Uint8Array; nG: Uint8Array }>();

  allow(requestId: string) {
    const r = this.state.requests.find((x) => x.id === requestId);
    const h = this.pendingHello.get(requestId);
    if (!r || !h) return;
    this.rec.approved = [...this.rec.approved, r.pub];
    void idbSet('board', this.rec);
    this.set({ requests: [], inviteExpiresAt: undefined });
    void this.accept(requestId, h.pub, h.nG, r.name);
  }

  deny(requestId: string) {
    this.set({ requests: this.state.requests.filter((r) => r.id !== requestId) });
    void this.sendRoom({ k: 'deny', to: requestId });
  }

  private async accept(peerId: string, pub: Uint8Array, nG: Uint8Array, name: string) {
    const nH = randomBytes(16);
    const key = await derivePairKey(this.rec.priv, this.rec.pub, pub, this.rec.secret, nG, nH);
    this.closeRtc();
    this.pair = { peerId, key, sn: 0, rn: -1, pubStr: b64uEnc(pub) };
    this.peerName = name;
    await this.sendRoom({ k: 'accept', to: peerId, nG: b64uEnc(nG), nH: b64uEnc(nH), name: this.rec.name });
  }
  private peerName = 'Your other device';

  private async onPairJson(m: Record<string, any>) {
    this.touch();
    if (m.k === 'ready') {
      // a decrypting `ready` proves both sides hold the same pair key
      this.set({ phase: 'connected', peer: { name: this.peerName }, peerAway: false, link: this.computeLink() });
      this.rec.lastUsed = Date.now(); void idbSet('board', this.rec);
      if (this.rec.role === 'host') {
        await this.sendPairJson({ k: 'ready' }); // ack, so the guest knows the host holds the same key
        this.startRtc(true);
      }
    } else if (m.k === 'sig') {
      await this.onSignal(m);
    }
  }

  private end(reason: string) {
    this.set({ phase: 'ended', endReason: reason, link: 'none' });
    this.closeRtc();
    this.closed = true;
    this.ws?.close();
    void idbDel('board');
  }

  /** Forget this board on this device and disconnect. */
  remove(id: string) {
    const it = this.state.items.find((i) => i.id === id);
    if (it?.url) URL.revokeObjectURL(it.url);
    this.set({ items: this.state.items.filter((i) => i.id !== id) });
  }

  async leave() { this.closed = true; this.closeRtc(); this.ws?.close(); if (this.hb) clearInterval(this.hb); await idbDel('board'); }

  private touch() { this.lastSeen = Date.now(); if (this.state.peerAway) this.set({ peerAway: false }); }
  private heartbeat() {
    if (!this.pair || this.state.phase !== 'connected') return;
    void this.sendPairJson({ k: 'ping' }, 'signal');
    if (this.lastSeen && Date.now() - this.lastSeen > 50000 && !this.state.peerAway) this.set({ peerAway: true });
  }

  /* ───────── WebRTC ───────── */

  private closeRtc() {
    try { this.dc?.close(); this.pc?.close(); } catch { /* already closed */ }
    this.dc = null; this.pc = null; this.iceQueue = [];
  }

  private startRtc(initiator: boolean) {
    this.closeRtc();
    if (typeof RTCPeerConnection === 'undefined') return;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    this.pc = pc;
    pc.onicecandidate = (e) => { if (e.candidate) void this.sendPairJson({ k: 'sig', c: e.candidate.toJSON() }); };
    if (initiator) {
      this.bindDc(pc.createDataChannel('hop'));
      void pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => this.sendPairJson({ k: 'sig', d: pc.localDescription!.toJSON() }));
    } else {
      pc.ondatachannel = (e) => this.bindDc(e.channel);
    }
  }

  private bindDc(dc: RTCDataChannel) {
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = 1 << 20;
    dc.onopen = () => { this.dc = dc; this.refreshLink(); };
    dc.onclose = () => { if (this.dc === dc) this.dc = null; this.refreshLink(); };
    dc.onmessage = (e) => { this.touch(); this.onFrame(new Uint8Array(e.data as ArrayBuffer)); };
    this.dc = dc;
  }

  private async onSignal(m: Record<string, any>) {
    if (m.d) {
      if (m.d.type === 'offer') this.startRtc(false);
      const pc = this.pc; if (!pc) return;
      await pc.setRemoteDescription(m.d);
      for (const c of this.iceQueue.splice(0)) await pc.addIceCandidate(c).catch(() => undefined);
      if (m.d.type === 'offer') {
        await pc.setLocalDescription(await pc.createAnswer());
        void this.sendPairJson({ k: 'sig', d: pc.localDescription!.toJSON() });
      }
    } else if (m.c) {
      if (this.pc?.remoteDescription) await this.pc.addIceCandidate(m.c).catch(() => undefined);
      else this.iceQueue.push(m.c);
    }
  }

  /* ───────── app frames ───────── */

  private async sendFrame(frame: Uint8Array) {
    const dc = this.dc;
    if (!this.state.forceRelay && dc?.readyState === 'open') {
      while (dc.bufferedAmount > 4 << 20) await new Promise<void>((r) => { dc.onbufferedamountlow = () => r(); setTimeout(r, 500); });
      dc.send(frame);
    } else {
      while ((this.ws?.bufferedAmount ?? 0) > 1 << 20) await sleep(20);
      await this.sendPairBytes(frame);
    }
  }
  private sendMsg(msg: Record<string, unknown>) { return this.sendFrame(concat(new Uint8Array([1]), te.encode(JSON.stringify(msg)))); }

  private onFrame(frame: Uint8Array) {
    if (frame[0] === 1) {
      try { this.onApp(JSON.parse(td.decode(frame.subarray(1)))); } catch { /* malformed */ }
    } else if (frame[0] === 2 && frame.length >= 9) {
      this.onChunk(readU32(frame, 1), readU32(frame, 5), frame.subarray(9));
    }
  }

  private patchItem(id: string, patch: Partial<Item>) {
    this.set({ items: this.state.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  }
  private addItem(i: Item) { this.set({ items: [i, ...this.state.items] }); }

  private onApp(m: Record<string, any>) {
    if (m.k === 'item') {
      const id = Number(m.id);
      if (m.kind === 'text') {
        if (typeof m.text !== 'string' || m.text.length > MAX_TEXT) return;
        this.addItem({ id: `i${id}`, mine: false, kind: 'text', at: Date.now(), status: 'done', text: m.text, progress: 1 });
        void this.sendMsg({ k: 'got', id });
        return;
      }
      const name = cleanName(m.name); const mime = String(m.mime ?? ''); const size = Number(m.size);
      const itemId = `i${id}`;
      const bad = !Number.isFinite(size) || size < 0 || size > MAX_FILE ? 'That file is too large.' : (() => { const v = checkDeclared(name, mime); return v && !v.ok ? v.reason : ''; })();
      if (bad) {
        this.addItem({ id: itemId, mine: false, kind: 'file', at: Date.now(), status: 'rejected', name, size: 0, progress: 0, note: bad });
        void this.sendMsg({ k: 'reject', id, why: bad });
        return;
      }
      this.incoming.set(id, { id, itemId, name, mime, size, kind: m.kind === 'image' ? 'image' : 'file', chunks: [], got: 0, dead: false, lastUi: 0 });
      this.addItem({ id: itemId, mine: false, kind: m.kind === 'image' ? 'image' : 'file', at: Date.now(), status: 'receiving', name, mime, size, progress: 0 });
    } else if (m.k === 'done') {
      const r = this.incoming.get(Number(m.id)); if (!r || r.dead) return;
      const parts: Uint8Array[] = [];
      for (let i = 0; i < r.chunks.length; i++) if (!r.chunks[i]) return void this.fail(r, 'A piece went missing in transit.'); else parts.push(r.chunks[i]);
      if (r.got !== r.size) return void this.fail(r, 'The file arrived incomplete.');
      // only real image types are ever shown inline; every other file is a download with a neutral type
      const blob = new Blob(parts as BlobPart[], { type: r.kind === 'image' ? r.mime : 'application/octet-stream' });
      this.patchItem(r.itemId, { status: 'done', progress: 1, url: URL.createObjectURL(blob) });
      this.incoming.delete(r.id);
      void this.sendMsg({ k: 'got', id: r.id });
    } else if (m.k === 'reject') {
      this.patchItem(`o${Number(m.id)}`, { status: 'rejected', note: String(m.why ?? 'The other device refused it.').slice(0, 200) });
    } else if (m.k === 'got') {
      this.patchItem(`o${Number(m.id)}`, { status: 'delivered', progress: 1 });
    }
  }

  private fail(r: Incoming, why: string) {
    r.dead = true;
    this.patchItem(r.itemId, { status: 'failed', note: why });
    this.incoming.delete(r.id);
  }

  private onChunk(id: number, idx: number, data: Uint8Array) {
    const r = this.incoming.get(id); if (!r || r.dead) return;
    if (idx === 0) {
      const v = checkFile(r.name, r.mime, r.size, data.subarray(0, 32));
      if (!v.ok) { r.dead = true; this.incoming.delete(id); this.patchItem(r.itemId, { status: 'rejected', note: v.reason, progress: 0 }); void this.sendMsg({ k: 'reject', id, why: v.reason }); return; }
      if (v.kind !== r.kind) r.kind = v.kind; // claimed image but isn't one: treat as a plain file
    }
    if (r.chunks[idx]) return;
    r.chunks[idx] = data; // a view over a buffer we own: no copy
    r.got += data.length;
    if (r.got > r.size) return this.fail(r, 'More data arrived than announced.');
    if (Date.now() - r.lastUi > 80) { r.lastUi = Date.now(); this.patchItem(r.itemId, { progress: r.size ? r.got / r.size : 1, kind: r.kind }); }
  }

  /* ───────── sending ───────── */

  private nextId() { return (this.seq++ + (readU32(randomBytes(4)) & 0x0fffffff)) >>> 0; }

  async sendText(text: string) {
    const t = text.slice(0, MAX_TEXT); if (!t.trim()) return;
    const id = this.nextId();
    this.addItem({ id: `o${id}`, mine: true, kind: 'text', at: Date.now(), status: 'sending', text: t, progress: 0 });
    await this.sendMsg({ k: 'item', id, kind: 'text', text: t });
    this.patchItem(`o${id}`, { status: 'sent', progress: 1 });
  }

  private async waitDirect(ms: number) {
    for (let t = 0; t < ms && this.computeLink() !== 'p2p'; t += 100) await sleep(100);
    return this.computeLink() === 'p2p';
  }

  async sendFile(original: File, opts: { shrink?: boolean } = {}) {
    const id = this.nextId(); const itemId = `o${id}`;
    const reject = (note: string) => this.addItem({ id: itemId, mine: true, kind: 'file', at: Date.now(), status: 'rejected', name: cleanName(original.name), size: original.size, progress: 0, note });
    if (this.state.phase !== 'connected') return reject('Not connected yet.');
    const verdict = await checkOutgoing(original);
    if (!verdict.ok) return reject(verdict.reason);
    const file = verdict.kind === 'image' && opts.shrink !== false ? await shrinkImage(original) : original;
    if (file.size > MAX_RELAY && !(await this.waitDirect(8000))) {
      return reject('Files over 5 MB need a direct connection and none could be made. Try the same Wi-Fi, or send a smaller file.');
    }
    this.addItem({ id: itemId, mine: true, kind: verdict.kind, at: Date.now(), status: 'sending', name: cleanName(file.name), mime: file.type, size: file.size, progress: 0, url: verdict.kind === 'image' ? URL.createObjectURL(file) : undefined });
    await this.sendMsg({ k: 'item', id, kind: verdict.kind, name: cleanName(file.name), mime: file.type, size: file.size });
    let sent = 0; let idx = 0; let lastUi = 0;
    try {
      while (sent < file.size) {
        const block = new Uint8Array(await file.slice(sent, sent + READ_BLOCK).arrayBuffer()); // one disk read per MB, not per chunk
        for (let o = 0; o < block.length;) {
          const direct = this.computeLink() === 'p2p';
          if (!direct && file.size > MAX_RELAY) throw new Error('The direct connection dropped mid-transfer.');
          const part = block.subarray(o, o + (direct ? CHUNK_DC : CHUNK_RELAY));
          await this.sendFrame(concat(new Uint8Array([2]), u32(id), u32(idx++), part));
          o += part.length; sent += part.length;
          if (Date.now() - lastUi > 80) { lastUi = Date.now(); this.patchItem(itemId, { progress: sent / file.size }); }
        }
      }
      await this.sendMsg({ k: 'done', id });
      this.patchItem(itemId, { status: 'sent', progress: 1 });
    } catch (e) {
      this.patchItem(itemId, { status: 'failed', note: e instanceof Error ? e.message : 'Transfer failed.' });
    }
  }
}
