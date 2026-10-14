import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const png = (extra: number) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(extra)]);
const mp4 = () => Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), randomBytes(2000)]);

const hashInPage = (page: Page, sel: string) => page.evaluate(async (s) => {
  const el = document.querySelector(s) as HTMLImageElement | HTMLAnchorElement;
  const buf = await (await fetch((el as HTMLImageElement).src || (el as HTMLAnchorElement).href)).arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
}, sel);

interface Pair { host: Page; guest: Page; hostCtx: BrowserContext; guestCtx: BrowserContext; invite: string; wsFrames: string[]; consoleErrors: string[] }

/** Laptop and phone: two isolated browser contexts, real signaling through the deployed relay. */
async function pair(browser: Browser, opts: { noWebRtc?: boolean } = {}): Promise<Pair> {
  const hostCtx = await browser.newContext(); const guestCtx = await browser.newContext();
  const wsFrames: string[] = []; const consoleErrors: string[] = [];
  for (const ctx of [hostCtx, guestCtx]) if (opts.noWebRtc) await ctx.addInitScript(() => { delete (window as any).RTCPeerConnection; });
  const host = await hostCtx.newPage(); const guest = await guestCtx.newPage();
  for (const p of [host, guest]) {
    p.on('websocket', (ws) => { if (!ws.url().includes('/ws/')) return; /* skip Vite's own HMR socket */ ws.on('framesent', (f) => wsFrames.push(String(f.payload))); ws.on('framereceived', (f) => wsFrames.push(String(f.payload))); });
    p.on('pageerror', (e) => consoleErrors.push(String(e)));
  }
  await host.goto('/');
  await host.getByRole('button', { name: /start a board/i }).click();
  const invite = (await host.getByTestId('invite').textContent())!.trim();
  expect(invite).toMatch(/#[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{87}$/);
  await guest.goto(invite);
  await expect(guest.getByTestId('joining')).toBeVisible();
  // both screens must show the same safety emoji before the host lets the device in
  const hostSas = (await host.getByTestId('request-sas').textContent())!;
  const guestSas = (await guest.getByTestId('joining').locator('.sas').textContent())!;
  expect(hostSas).toBe(guestSas); expect(hostSas.length).toBeGreaterThan(4);
  await host.getByTestId('allow').click();
  await expect(host.getByTestId('peer')).toBeVisible({ timeout: 20000 });
  await expect(guest.getByTestId('peer')).toBeVisible({ timeout: 20000 });
  return { host, guest, hostCtx, guestCtx, invite, wsFrames, consoleErrors };
}

test('pair with approval, then text, picture and file hop both ways', async ({ browser }) => {
  const p = await pair(browser);
  const link = await p.host.getByTestId('link').textContent();
  test.info().annotations.push({ type: 'link', description: link ?? '' });

  await p.host.locator('#msg').fill('hello from the laptop');
  await p.host.getByRole('button', { name: /^send$/i }).click();
  await expect(p.guest.getByTestId('item').filter({ hasText: 'hello from the laptop' })).toBeVisible({ timeout: 15000 });

  await p.guest.locator('#msg').fill('482913');
  await p.guest.getByRole('button', { name: /^send$/i }).click();
  await expect(p.host.locator('.otp', { hasText: '482913' })).toBeVisible({ timeout: 15000 }); // codes get big digits

  const pic = png(150_000);
  await p.host.getByTestId('photo-input').setInputFiles({ name: 'cat.png', mimeType: 'image/png', buffer: pic });
  await expect(p.guest.locator('article.item.image img.pic')).toBeVisible({ timeout: 20000 });
  expect(await hashInPage(p.guest, 'article.item.image img.pic')).toBe(sha256(pic));

  const doc = randomBytes(3 * 1024 * 1024);
  await p.guest.getByTestId('file-input').setInputFiles({ name: 'notes.bin', mimeType: 'application/octet-stream', buffer: doc });
  await expect(p.host.locator('article.item.file a[download]')).toBeVisible({ timeout: 40000 });
  expect(await hashInPage(p.host, 'article.item.file a[download]')).toBe(sha256(doc));

  expect(p.consoleErrors).toEqual([]);
});

test('video is refused, even when renamed to look like a picture', async ({ browser }) => {
  const p = await pair(browser);
  await p.host.getByTestId('file-input').setInputFiles({ name: 'holiday.mp4', mimeType: 'video/mp4', buffer: mp4() });
  await expect(p.host.locator('.note', { hasText: /video is not allowed/i })).toBeVisible();
  await p.host.getByTestId('photo-input').setInputFiles({ name: 'sneaky.jpg', mimeType: 'image/jpeg', buffer: mp4() });
  await expect(p.host.locator('.note', { hasText: /video is not allowed/i })).toHaveCount(2);
  await p.guest.waitForTimeout(1500);
  await expect(p.guest.getByTestId('item')).toHaveCount(0); // nothing reached the other side
});

test('relay path: works with WebRTC removed, and the server never sees plaintext or keys', async ({ browser }) => {
  const p = await pair(browser, { noWebRtc: true });
  await expect(p.host.getByTestId('link')).toContainText(/relay/i);

  const secretText = 'top-secret-banana-' + randomBytes(4).toString('hex');
  await p.host.locator('#msg').fill(secretText);
  await p.host.getByRole('button', { name: /^send$/i }).click();
  await expect(p.guest.getByTestId('item').filter({ hasText: secretText })).toBeVisible({ timeout: 15000 });

  const pic = png(60_000);
  await p.guest.getByTestId('photo-input').setInputFiles({ name: 'dog.png', mimeType: 'image/png', buffer: pic });
  await expect(p.host.locator('article.item.image img.pic')).toBeVisible({ timeout: 20000 });
  expect(await hashInPage(p.host, 'article.item.image img.pic')).toBe(sha256(pic));

  const mid = randomBytes(12 * 1024 * 1024); // well over the old 5 MB cap: relays fine now, and must arrive intact
  const t0 = Date.now();
  await p.host.getByTestId('file-input').setInputFiles({ name: 'mid.bin', mimeType: 'application/octet-stream', buffer: mid });
  await expect(p.guest.locator('article.item.file a[download]')).toBeVisible({ timeout: 120000 });
  expect(await hashInPage(p.guest, 'article.item.file a[download]')).toBe(sha256(mid));
  console.log(`relay: 12 MB in ${((Date.now() - t0) / 1000).toFixed(1)} s = ${(12 / ((Date.now() - t0) / 1000)).toFixed(1)} MB/s (relay, same machine)`);

  const big = randomBytes(26 * 1024 * 1024); // over the relay cap with no direct link: must be refused, not silently dropped
  await p.host.getByTestId('file-input').setInputFiles({ name: 'big.bin', mimeType: 'application/octet-stream', buffer: big });
  await expect(p.host.locator('.note', { hasText: /direct connection/i })).toBeVisible({ timeout: 20000 });

  // server blindness: inspect every frame that crossed the wire
  const secret = p.invite.split('#')[1].split('.')[0];
  const hostPub = p.invite.split('#')[1].split('.')[1];
  const wire = p.wsFrames.join('\n');
  expect(p.wsFrames.length).toBeGreaterThan(5);
  expect(wire).not.toContain(secretText);
  expect(wire).not.toContain(secret);
  expect(wire).not.toContain(hostPub);
  expect(wire).not.toContain(pic.subarray(8, 40).toString('base64').slice(0, 24));
  expect(wire).not.toContain('hello'); // handshake carries no readable field names either: everything is sealed
  for (const f of p.wsFrames) expect(f).toMatch(/^\{"t":"[rpb]"(,"to":"[A-Za-z0-9_-]+")?,"s":"[A-Za-z0-9_-]+"\}$/);

  // the in-app "Server's view" agrees with the wire
  await p.host.getByRole('button', { name: /server's view/i }).click();
  await expect(p.host.getByTestId('relayed-bytes')).not.toHaveText('0 B');
});

test('a third device is turned away once the board has a partner', async ({ browser }) => {
  const p = await pair(browser);
  const third = await (await browser.newContext()).newPage();
  await third.goto(p.invite);
  await expect(third.getByText(/already has a partner/i)).toBeVisible({ timeout: 15000 });
});

test('denying a device ends its attempt', async ({ browser }) => {
  const hostCtx = await browser.newContext(); const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage(); const guest = await guestCtx.newPage();
  await host.goto('/'); await host.getByRole('button', { name: /start a board/i }).click();
  const invite = (await host.getByTestId('invite').textContent())!.trim();
  await guest.goto(invite);
  await host.getByRole('button', { name: /no thanks/i }).click();
  await expect(guest.getByText(/said no/i)).toBeVisible({ timeout: 15000 });
});

test('a returning device reconnects on its own, with no new approval', async ({ browser }) => {
  const p = await pair(browser);
  await p.guest.reload();
  await expect(p.guest.getByTestId('peer')).toBeVisible({ timeout: 20000 });
  await expect(p.host.getByTestId('allow')).toHaveCount(0); // no prompt: it proved who it is
  await p.guest.locator('#msg').fill('back again');
  await p.guest.getByRole('button', { name: /^send$/i }).click();
  await expect(p.host.getByTestId('item').filter({ hasText: 'back again' })).toBeVisible({ timeout: 15000 });
});
