// Deployed-server smoke test: relay between two sockets in one room, isolation between rooms, frame cap.
import WebSocket from 'ws';
import { randomBytes } from 'node:crypto';

const BASE = process.argv[2] ?? 'wss://hopboard.blacksinisterx.workers.dev';
const room = () => randomBytes(16).toString('base64url');
const open = (r) => new Promise((res, rej) => { const w = new WebSocket(`${BASE}/ws/${r}`); w.on('open', () => res(w)); w.on('error', rej); });
const next = (w, ms = 5000) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); w.once('message', (d) => { clearTimeout(t); res(d.toString()); }); });
const silent = (w, ms = 1500) => new Promise((res) => { let got = false; w.once('message', () => (got = true)); setTimeout(() => res(!got), ms); });

const r1 = room();
const [a, b] = await Promise.all([open(r1), open(r1)]);
const t0 = Date.now();
const got = next(b); a.send('ciphertext-only-hello');
console.log('relay A->B:', (await got) === 'ciphertext-only-hello' ? 'PASS' : 'FAIL', `(${Date.now() - t0} ms)`);

const other = await open(room());
const isolated = silent(other); a.send('should-not-leak');
console.log('room isolation:', (await isolated) ? 'PASS' : 'FAIL');

const closed = new Promise((res) => a.once('close', (code) => res(code)));
a.send('x'.repeat(300 * 1024));
const code = await Promise.race([closed, new Promise((r) => setTimeout(() => r(null), 4000))]);
console.log('frame cap (>256 KiB closes sender with 1009):', code === 1009 ? 'PASS' : `FAIL (got ${code})`);
[a, b, other].forEach((w) => w.terminate());

const tryOpen = (r, headers) => new Promise((res) => { const w = new WebSocket(`${BASE}/ws/${r}`, { headers }); w.on('open', () => res({ ok: true, w })); w.on('unexpected-response', (q, resp) => { res({ ok: false, status: resp.statusCode }); resp.destroy(); q.destroy(); }); w.on('error', () => res({ ok: false, status: 0 })); });
const evil = await tryOpen(room(), { Origin: 'https://evil.example' });
console.log('foreign Origin blocked (403):', !evil.ok && evil.status === 403 ? 'PASS' : `FAIL (${JSON.stringify({ ok: evil.ok, s: evil.status })})`);
const good = await tryOpen(room(), { Origin: 'https://hopboard.pages.dev' });
console.log('hopboard.pages.dev Origin allowed:', good.ok ? 'PASS' : `FAIL (${good.status})`); good.w?.terminate();
const full = room(); const socks = [];
for (let i = 0; i < 4; i++) socks.push((await tryOpen(full, {})).w);
const fifth = await tryOpen(full, {});
console.log('5th socket in a room refused (429):', !fifth.ok && fifth.status === 429 ? 'PASS' : `FAIL (${JSON.stringify({ ok: fifth.ok, s: fifth.status })})`);
socks.forEach((w) => w?.terminate());
process.exit(0);
