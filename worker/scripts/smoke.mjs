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
