// All cryptography lives here. WebCrypto only, no dependencies.
//
// Trust model:
//  - The invite secret (128 random bits) travels in the URL #fragment, which browsers never send to a server.
//  - roomId and the room key are both derived from it, so the relay can route a room without ever being able to read it.
//  - After the host approves a device, the two devices derive a fresh pairwise key (ECDH + the room secret + per-handshake
//    nonces). Everything after approval is sealed with that key, so a third party who only has the QR cannot read it,
//    and the relay cannot replay old frames into a new session.

const te = new TextEncoder();
const td = new TextDecoder();

export function b64uEnc(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uDec(s: string): Uint8Array {
  const p = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(p);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
export const newSecret = () => b64uEnc(randomBytes(16));
export const randomId = (n = 6) => b64uEnc(randomBytes(n));

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function compare(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

async function hkdf(ikm: Uint8Array, info: string, bytes: number, salt: Uint8Array = new Uint8Array(0)): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: te.encode(info) }, k, bytes * 8));
}

const aesKey = (raw: Uint8Array) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

/** roomId (routing only) and room key (handshake sealing) from the invite secret. */
export async function deriveRoom(secret: string): Promise<{ roomId: string; key: CryptoKey }> {
  const ikm = b64uDec(secret);
  return {
    roomId: b64uEnc(await hkdf(ikm, 'hopboard/room/v1', 16)),
    key: await aesKey(await hkdf(ikm, 'hopboard/enc/v1', 32)),
  };
}

/** AES-GCM seal: returns base64url(nonce || ciphertext+tag). Tampering makes open() throw. */
export async function sealBytes(key: CryptoKey, data: Uint8Array): Promise<string> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  return b64uEnc(concat(iv, ct));
}

export async function openBytes(key: CryptoKey, sealed: string): Promise<Uint8Array> {
  const raw = b64uDec(sealed);
  if (raw.length < 12 + 16) throw new Error('short frame');
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) }, key, raw.subarray(12)));
}

export const sealJson = (key: CryptoKey, obj: unknown) => sealBytes(key, te.encode(JSON.stringify(obj)));
export async function openJson<T = Record<string, unknown>>(key: CryptoKey, sealed: string): Promise<T> {
  return JSON.parse(td.decode(await openBytes(key, sealed))) as T;
}

/** Ephemeral-or-persisted ECDH identity. The private key is non-extractable. */
export async function newIdentity(): Promise<{ priv: CryptoKey; pub: Uint8Array }> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  return { priv: kp.privateKey, pub: new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)) };
}

const SAS_SYMBOLS = ['🥕', '🌻', '🍄', '🎈', '🍓', '🐢', '🦊', '🐙', '🌈', '⭐', '🍋', '🎸', '🚀', '🍩', '🐝', '🦄',
  '🍉', '🎲', '🧀', '🐳', '🌵', '🍪', '🦋', '🔔', '🍒', '🐸', '🎩', '🍕', '🌙', '🔥', '🍇', '🐧'];

async function sharedSecret(priv: CryptoKey, theirPub: Uint8Array, secret: string): Promise<Uint8Array> {
  const their = await crypto.subtle.importKey('raw', theirPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: their }, priv, 256));
  return concat(shared, b64uDec(secret)); // mixing the invite secret in authenticates the exchange
}

const sortedPubs = (a: Uint8Array, b: Uint8Array) => (compare(a, b) <= 0 ? concat(a, b) : concat(b, a));

/** Safety emoji both screens show, so the host can tell which request is the device in their hand. */
export async function safetyEmoji(priv: CryptoKey, myPub: Uint8Array, theirPub: Uint8Array, secret: string): Promise<string[]> {
  const bits = await hkdf(await sharedSecret(priv, theirPub, secret), 'hopboard/sas/v1', 5, sortedPubs(myPub, theirPub));
  return Array.from(bits, (b) => SAS_SYMBOLS[b % SAS_SYMBOLS.length]);
}

/** Fresh pairwise key for ONE handshake: bound to both public keys and both handshake nonces. */
export async function derivePairKey(
  priv: CryptoKey, myPub: Uint8Array, theirPub: Uint8Array, secret: string, nonceGuest: Uint8Array, nonceHost: Uint8Array,
): Promise<CryptoKey> {
  const salt = concat(sortedPubs(myPub, theirPub), nonceGuest, nonceHost);
  return aesKey(await hkdf(await sharedSecret(priv, theirPub, secret), 'hopboard/pair/v1', 32, salt));
}

export function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0);
  return b;
}
export const readU32 = (b: Uint8Array, o = 0) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(o);

export function u64(n: number): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n));
  return b;
}
export const readU64 = (b: Uint8Array, o = 0) => Number(new DataView(b.buffer, b.byteOffset, b.byteLength).getBigUint64(o));
