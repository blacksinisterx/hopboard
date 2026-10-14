// Reproduce "Scan text does nothing" the way a phone would: Pixel 7 profile, 4x slower CPU, a 12 MP noisy photo of text.
import { chromium, devices } from '@playwright/test';
import sharp from 'sharp';

const BASE = process.env.BASE_URL ?? 'https://hopboard.pages.dev';
const text = ['Tickets: Gate 7', 'Booking code K7M4Q2', 'Boarding at 18:45', 'Seat 21C - Window'];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="3000"><rect width="100%" height="100%" fill="#e9e4d8"/>` +
  text.map((t, i) => `<text x="400" y="${900 + i * 360}" font-family="Arial" font-size="230" fill="#25221c">${t}</text>`).join('') + '</svg>';
const photo = await sharp(Buffer.from(svg)).rotate(2, { background: '#e9e4d8' }).blur(1.2).modulate({ brightness: 0.95 }).jpeg({ quality: 85 }).toBuffer();
console.log('photo', (photo.length / 1e6).toFixed(1), 'MB 4000x3000');

const b = await chromium.launch();
const host = await (await b.newContext()).newPage();
const ctx = await b.newContext({ ...devices['Pixel 7'] });
const phone = await ctx.newPage();
const cdp = await ctx.newCDPSession(phone);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const errors = []; phone.on('pageerror', (e) => errors.push(String(e))); phone.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await host.goto(BASE); await host.getByRole('button', { name: /start a board/i }).click();
const invite = (await host.getByTestId('invite').textContent()).trim();
await phone.goto(invite); await host.getByTestId('allow').click();
await phone.getByTestId('peer').waitFor({ timeout: 30000 });

// 1) does tapping the button open a file picker at all?
const [chooser] = await Promise.all([phone.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), phone.getByTestId('scan-text').tap()]);
console.log('tap opens a file chooser:', !!chooser);
if (chooser) {
  const t0 = Date.now();
  await chooser.setFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: photo });
  const labels = new Set();
  const tick = setInterval(async () => { labels.add(await phone.getByTestId('scan-text').textContent().catch(() => '')); }, 400);
  try {
    await phone.waitForFunction(() => (document.querySelector('#msg')?.value?.length ?? 0) > 5, null, { timeout: 180000 });
    console.log('text arrived after', ((Date.now() - t0) / 1000).toFixed(1), 's:', JSON.stringify(await phone.locator('#msg').inputValue()));
  } catch { console.log('NO TEXT after 180 s. Button labels seen:', [...labels]); }
  clearInterval(tick); console.log('labels:', [...labels].filter(Boolean).slice(0, 6));
}
console.log('page errors:', errors.slice(0, 5));
await b.close();
