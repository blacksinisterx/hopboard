// Hopboard signaling + relay. Memory only: nothing is written to storage.
// The server forwards opaque frames between the sockets of one room and never sees keys or plaintext.

export interface Env { ROOM: DurableObjectNamespace }

const MAX_FRAME = 256 * 1024; // relay fallback is for small payloads only

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/ws\/([A-Za-z0-9_-]{16,64})$/);
    if (!m) return new Response('hopboard ok', { status: 200 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(req);
  },
};

export class Room implements DurableObject {
  constructor(private ctx: DurableObjectState) {}

  async fetch(): Promise<Response> {
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
