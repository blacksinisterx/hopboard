import { describe, it, expect } from 'vitest';
import {
  b64uEnc, b64uDec, newSecret, deriveRoom, sealJson, openJson, sealBytes, openBytes,
  newIdentity, safetyEmoji, derivePairKey, randomBytes,
} from './crypto';
import { sniff, checkFile, checkDeclared } from './media';

const bytes = (...n: number[]) => new Uint8Array(n);
const ascii = (s: string) => new TextEncoder().encode(s);
const pad = (b: Uint8Array, n = 32) => { const o = new Uint8Array(n); o.set(b); return o; };

describe('base64url', () => {
  it('round-trips every length', () => {
    for (let n = 0; n < 70; n++) { const b = randomBytes(n); expect(b64uDec(b64uEnc(b))).toEqual(b); }
  });
  it('has no padding or unsafe chars', () => expect(b64uEnc(randomBytes(33))).toMatch(/^[A-Za-z0-9_-]+$/));
});

describe('room derivation + sealing', () => {
  it('is deterministic per secret and differs between secrets', async () => {
    const s = newSecret();
    expect((await deriveRoom(s)).roomId).toBe((await deriveRoom(s)).roomId);
    expect((await deriveRoom(newSecret())).roomId).not.toBe((await deriveRoom(s)).roomId);
  });
  it('round-trips JSON and rejects tampering and the wrong key', async () => {
    const a = await deriveRoom(newSecret()); const b = await deriveRoom(newSecret());
    const sealed = await sealJson(a.key, { hi: 'there' });
    expect(await openJson(a.key, sealed)).toEqual({ hi: 'there' });
    await expect(openJson(b.key, sealed)).rejects.toThrow();
    const raw = b64uDec(sealed); raw[raw.length - 1] ^= 1;
    await expect(openBytes(a.key, b64uEnc(raw))).rejects.toThrow();
  });
  it('never leaks plaintext or the key into the sealed frame', async () => {
    const s = newSecret(); const { key } = await deriveRoom(s);
    const sealed = await sealBytes(key, ascii('super secret clipboard text'));
    expect(sealed).not.toContain('super'); expect(sealed).not.toContain(s);
  });
  it('uses a fresh nonce every time', async () => {
    const { key } = await deriveRoom(newSecret());
    expect(await sealBytes(key, ascii('x'))).not.toBe(await sealBytes(key, ascii('x')));
  });
});

describe('pairing', () => {
  it('both sides get the same safety emoji and the same pair key', async () => {
    const secret = newSecret(); const g = await newIdentity(); const h = await newIdentity();
    const [sg, sh] = await Promise.all([safetyEmoji(g.priv, g.pub, h.pub, secret), safetyEmoji(h.priv, h.pub, g.pub, secret)]);
    expect(sg).toEqual(sh); expect(sg).toHaveLength(5);
    const ng = randomBytes(16); const nh = randomBytes(16);
    const kg = await derivePairKey(g.priv, g.pub, h.pub, secret, ng, nh);
    const kh = await derivePairKey(h.priv, h.pub, g.pub, secret, ng, nh);
    expect(await openJson(kh, await sealJson(kg, { ok: 1 }))).toEqual({ ok: 1 });
  });
  it('someone with the QR but no private key cannot read pair traffic', async () => {
    const secret = newSecret(); const g = await newIdentity(); const h = await newIdentity(); const eve = await newIdentity();
    const ng = randomBytes(16); const nh = randomBytes(16);
    const kg = await derivePairKey(g.priv, g.pub, h.pub, secret, ng, nh);
    const keve = await derivePairKey(eve.priv, eve.pub, h.pub, secret, ng, nh);
    await expect(openJson(keve, await sealJson(kg, { a: 1 }))).rejects.toThrow();
  });
  it('a new handshake gives a new key, so frames from an old session are dead', async () => {
    const secret = newSecret(); const g = await newIdentity(); const h = await newIdentity();
    const k1 = await derivePairKey(g.priv, g.pub, h.pub, secret, randomBytes(16), randomBytes(16));
    const k2 = await derivePairKey(h.priv, h.pub, g.pub, secret, randomBytes(16), randomBytes(16));
    await expect(openJson(k2, await sealJson(k1, { old: true }))).rejects.toThrow();
  });
  it('a wrong invite secret yields different safety emoji', async () => {
    const g = await newIdentity(); const h = await newIdentity();
    const a = await safetyEmoji(g.priv, g.pub, h.pub, newSecret());
    const b = await safetyEmoji(g.priv, g.pub, h.pub, newSecret());
    expect(a).not.toEqual(b);
  });
});

describe('video is blocked, pictures and files are not', () => {
  const mp4 = pad(new Uint8Array([0, 0, 0, 0x20, ...ascii('ftypisom')]));
  const heic = pad(new Uint8Array([0, 0, 0, 0x18, ...ascii('ftypheic')]));
  const jpeg = pad(bytes(0xff, 0xd8, 0xff, 0xe0));
  const png = pad(bytes(0x89, 0x50, 0x4e, 0x47));
  const webm = pad(bytes(0x1a, 0x45, 0xdf, 0xa3));
  const avi = pad(new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('AVI ')]));
  const webp = pad(new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')]));
  const pdf = pad(ascii('%PDF-1.7'));

  it('sniffs by content', () => {
    expect(sniff(mp4)).toBe('video'); expect(sniff(webm)).toBe('video'); expect(sniff(avi)).toBe('video');
    expect(sniff(heic)).toBe('image'); expect(sniff(jpeg)).toBe('image'); expect(sniff(png)).toBe('image'); expect(sniff(webp)).toBe('image');
    expect(sniff(pdf)).toBe('other');
  });
  it('blocks a video renamed to .jpg with an image mime', () => {
    expect(checkFile('holiday.jpg', 'image/jpeg', 5000, mp4)).toMatchObject({ ok: false });
    expect(checkFile('clip.png', 'image/png', 5000, webm)).toMatchObject({ ok: false });
  });
  it('blocks by declared mime and by extension', () => {
    expect(checkDeclared('a.bin', 'video/mp4')).toMatchObject({ ok: false });
    expect(checkDeclared('movie.MOV', '')).toMatchObject({ ok: false });
    expect(checkDeclared('notes.pdf', 'application/pdf')).toBeNull();
  });
  it('lets pictures and normal files through', () => {
    expect(checkFile('p.jpg', 'image/jpeg', 5000, jpeg)).toEqual({ ok: true, kind: 'image' });
    expect(checkFile('p.heic', 'image/heic', 5000, heic)).toEqual({ ok: true, kind: 'image' });
    expect(checkFile('doc.pdf', 'application/pdf', 5000, pdf)).toEqual({ ok: true, kind: 'file' });
  });
  it('SVG is a plain file, never rendered as an image (it can carry script)', () => {
    expect(checkFile('x.svg', 'image/svg+xml', 100, pad(ascii("<svg")))).toEqual({ ok: true, kind: 'file' });
  });
  it('enforces size caps', () => {
    expect(checkFile('big.jpg', 'image/jpeg', 26 * 1024 * 1024, jpeg)).toMatchObject({ ok: false });
    expect(checkFile('big.zip', 'application/zip', 101 * 1024 * 1024, pad(bytes(0x50, 0x4b)))).toMatchObject({ ok: false });
  });
});
