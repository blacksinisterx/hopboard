// Hopboard signaling + relay. Memory only: nothing is written to storage.
// The server forwards opaque frames between the sockets of one room and never sees keys or plaintext.

export interface Env { ROOM: DurableObjectNamespace }

const MAX_FRAME = 256 * 1024; // relay fallback is for small payloads only
const MAX_SOCKETS = 4;        // host + partner + a couple of pending join requests

// Keeps other websites from borrowing this free relay. A script can forge the header, so this deters casual
// cross-site use only; shortcut: add per-IP rate limiting (Cloudflare rules) if the free tier is ever abused.
const ORIGIN_OK = /^(https:\/\/([a-z0-9-]+\.)?hopboard[a-z0-9-]*\.pages\.dev|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/ws\/([A-Za-z0-9_-]{16,64})$/);
    if (!m) return new Response('hopboard ok', { status: 200 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const origin = req.headers.get('Origin');
    if (origin && !ORIGIN_OK.test(origin)) return new Response('origin not allowed', { status: 403 });
    return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(req);
  },
};

export class Room implements DurableObject {
  constructor(private ctx: DurableObjectState) {}

  async fetch(): Promise<Response> {
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response('room is full', { status: 429 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]); // hibernation API: idle rooms cost nothing
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    const size = typeof msg === 'string' ? msg.length : msg.byteLength;
    if (size > MAX_FRAME) return ws.close(1009, 'frame too large');
    for (const peer of this.ctx.getWebSockets()) if (peer !== ws) peer.send(msg);
  }

  webSocketClose(ws: WebSocket, code: number) { ws.close(code); }
}
