// Records the three demo scenarios against a running Hopboard (default: production). Output: ../media/out/raw/<name>-{laptop,phone}.webm
// Usage: node scripts/record.mjs [pair|ocr|server|all]   BASE_URL=... to override
import { chromium } from '@playwright/test';
import { mkdirSync, readdirSync, renameSync, readFileSync } from 'node:fs';
import sharp from 'sharp';

const BASE = process.env.BASE_URL ?? 'https://hopboard.pages.dev';
const RAW = '../media/out/raw/';
mkdirSync(RAW, { recursive: true });
const want = process.argv[2] ?? 'all';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const LAPTOP = { width: 1000, height: 640 };
const PHONE = { width: 390, height: 780 };

// a visible pointer / tap marker, because screen recordings from Playwright have no cursor
const CURSOR = `(() => {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;z-index:99999;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:rgba(255,95,168,.85);border:3px solid #2B1B4E;pointer-events:none;transition:transform .12s;left:-50px;top:-50px';
  addEventListener('DOMContentLoaded', () => document.body.appendChild(d));
  addEventListener('mousemove', (e) => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => { d.style.transform = 'scale(.6)'; }, true);
  addEventListener('mouseup', () => { d.style.transform = 'scale(1)'; }, true);
})();`;

async function glide(page, loc) {
  const el = await loc.first();
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 });
  await pause(220);
}
async function tap(page, loc) { await glide(page, loc); await loc.first().click(); }

async function newDevices(browser, name) {
  const lCtx = await browser.newContext({ viewport: LAPTOP, recordVideo: { dir: RAW + 'tmp-l', size: LAPTOP }, deviceScaleFactor: 1 });
  const pCtx = await browser.newContext({ viewport: PHONE, recordVideo: { dir: RAW + 'tmp-p', size: PHONE }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await lCtx.addInitScript(CURSOR); await pCtx.addInitScript(CURSOR);
  const laptop = await lCtx.newPage(); const phone = await pCtx.newPage();
  return { lCtx, pCtx, laptop, phone, finish: async () => {
    await lCtx.close(); await pCtx.close();
    for (const [dir, suffix] of [['tmp-l', 'laptop'], ['tmp-p', 'phone']]) {
      const f = readdirSync(RAW + dir).filter((x) => x.endsWith('.webm')).pop();
      renameSync(RAW + dir + '/' + f, `${RAW}${name}-${suffix}.webm`);
    }
  } };
}

const cameraHint = (phone, text) => phone.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;height:100vh;display:grid;place-items:center;background:#FFF4DE;color:#2B1B4E;font:700 24px system-ui;text-align:center;padding:30px">${text}</body>`);

const browser = await chromium.launch();

/* ── 1. pair + hop ── */
if (want === 'pair' || want === 'all') {
  const { laptop, phone, finish } = await newDevices(browser, 'pair');
  await cameraHint(phone, 'Point the camera at the QR code on your laptop');
  await laptop.goto(BASE); await pause(1400);
  await tap(laptop, laptop.getByRole('button', { name: /start a board/i }));
  await laptop.getByTestId('qr').waitFor(); await pause(2200);
  const invite = (await laptop.getByTestId('invite').textContent()).trim();
  await phone.goto(invite); await phone.getByTestId('joining').waitFor(); await pause(2600);
  await tap(laptop, laptop.getByTestId('allow'));
  await laptop.getByTestId('peer').waitFor(); await phone.getByTestId('peer').waitFor(); await pause(1500);
  await tap(laptop, laptop.locator('#msg'));
  await laptop.keyboard.type('Wi-Fi password: bunny-hop-2026', { delay: 55 }); await pause(500);
  await tap(laptop, laptop.getByRole('button', { name: /^send$/i })); await pause(2400);
  await phone.getByTestId('photo-input').setInputFiles('../media/assets/sunset.jpg'); await pause(3200);
  await finish();
}

/* ── 2. scan text (OCR) ── */
if (want === 'ocr' || want === 'all') {
  const poster = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760"><rect width="100%" height="100%" fill="#FFF8E7"/><rect x="40" y="40" width="1120" height="680" rx="30" fill="none" stroke="#2B1B4E" stroke-width="8"/><text x="90" y="190" font-family="Arial Black,Arial" font-size="96" fill="#2B1B4E">Tickets: Gate 7</text><text x="90" y="330" font-family="Arial,Helvetica" font-size="70" fill="#222">Booking code K7M4Q2</text><text x="90" y="450" font-family="Arial,Helvetica" font-size="70" fill="#222">Boarding at 18:45</text><text x="90" y="570" font-family="Arial,Helvetica" font-size="70" fill="#222">Seat 21C - Window</text></svg>`)).png().toBuffer();
  const { laptop, phone, finish } = await newDevices(browser, 'ocr');
  await cameraHint(phone, 'Point the camera at the QR code on your laptop');
  await laptop.goto(BASE); await tap(laptop, laptop.getByRole('button', { name: /start a board/i }));
  await laptop.getByTestId('qr').waitFor();
  const invite = (await laptop.getByTestId('invite').textContent()).trim();
  await phone.goto(invite); await laptop.getByTestId('allow').waitFor(); await laptop.getByTestId('allow').click();
  await laptop.getByTestId('peer').waitFor(); await phone.getByTestId('peer').waitFor(); await pause(1200);
  await tap(phone, phone.getByTestId('scan-text')); // (the native camera sheet cannot be recorded: the photo is attached directly)
  await pause(600);
  await phone.getByTestId('scan-input').setInputFiles({ name: 'tickets.png', mimeType: 'image/png', buffer: poster });
  await phone.locator('#msg').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await phone.waitForFunction(() => document.querySelector('#msg')?.value.length > 10, null, { timeout: 120000 }); await pause(2000);
  await tap(phone, phone.getByRole('button', { name: /^send$/i })); await pause(1200);
  await laptop.getByTestId('item').first().waitFor(); await pause(1800);
  await tap(laptop, laptop.getByRole('button', { name: /^copy$/i }).first()); await pause(2400);
  await finish();
}

/* ── 3. the server only sees gibberish ── */
if (want === 'server' || want === 'all') {
  const { laptop, phone, finish } = await newDevices(browser, 'server');
  await cameraHint(phone, 'Point the camera at the QR code on your laptop');
  await laptop.goto(BASE); await tap(laptop, laptop.getByRole('button', { name: /start a board/i }));
  await laptop.getByTestId('qr').waitFor();
  const invite = (await laptop.getByTestId('invite').textContent()).trim();
  await phone.goto(invite); await laptop.getByTestId('allow').waitFor(); await laptop.getByTestId('allow').click();
  await laptop.getByTestId('peer').waitFor(); await phone.getByTestId('peer').waitFor(); await pause(800);
  await tap(laptop, laptop.getByRole('button', { name: /server's view/i })); await pause(1600);
  await tap(laptop, laptop.getByLabel(/force the relay path/i)); await pause(1200);
  await laptop.locator('#msg').click(); await laptop.keyboard.type('my PIN is 4821', { delay: 70 }); await pause(500);
  await laptop.getByRole('button', { name: /^send$/i }).click({ delay: 120 }); await pause(3800);
  await finish();
}

await browser.close();
console.log('recorded', want, readdirSync(RAW).filter((x) => x.endsWith('.webm')).join(', '));
