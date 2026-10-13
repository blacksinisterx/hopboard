import { test, expect } from '@playwright/test';
import sharp from 'sharp';

// A photographed page, made on the fly: black text on white with a little noise-free margin.
const textImage = (lines: string[]) => sharp(Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${120 + lines.length * 110}"><rect width="100%" height="100%" fill="#fff"/>` +
  lines.map((l, i) => `<text x="60" y="${130 + i * 110}" font-family="Arial, Helvetica, sans-serif" font-size="72" fill="#111">${l}</text>`).join('') + '</svg>',
)).png().toBuffer();

test('Scan text: a photo of text becomes editable text, read on the device', async ({ browser }) => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  // OCR needs no pairing to read; it needs the board screen, so pair a second browser quickly
  const hostCtx = ctx; const guestCtx = await browser.newContext();
  const host = page; const guest = await guestCtx.newPage();
  await host.goto('/'); await host.getByRole('button', { name: /start a board/i }).click();
  const invite = (await host.getByTestId('invite').textContent())!.trim();
  await guest.goto(invite); await host.getByTestId('allow').click();
  await expect(host.getByTestId('peer')).toBeVisible({ timeout: 20000 });

  const img = await textImage(['Meeting room 4B', 'Wifi password bunny2026']);
  await host.getByTestId('scan-input').setInputFiles({ name: 'whiteboard.png', mimeType: 'image/png', buffer: img });
  await expect(host.locator('#msg')).toHaveValue(/meeting/i, { timeout: 90000 });
  const got = (await host.locator('#msg').inputValue()).toLowerCase();
  expect(got).toContain('room');
  expect(got).toContain('password');
  void hostCtx; void guestCtx;
});

test('Read text on a received picture', async ({ browser }) => {
  const hostCtx = await browser.newContext(); const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage(); const guest = await guestCtx.newPage();
  await host.goto('/'); await host.getByRole('button', { name: /start a board/i }).click();
  const invite = (await host.getByTestId('invite').textContent())!.trim();
  await guest.goto(invite); await host.getByTestId('allow').click();
  await expect(guest.getByTestId('peer')).toBeVisible({ timeout: 20000 });

  const img = await textImage(['Order number 48213', 'Pickup at gate seven']);
  await host.getByTestId('photo-input').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: img });
  await expect(guest.locator('article.item.image img.pic')).toBeVisible({ timeout: 20000 });
  await guest.getByTestId('read-text').click();
  await expect(guest.getByTestId('ocr-result')).toContainText(/48213/, { timeout: 90000 });
  await expect(guest.getByTestId('ocr-result')).toContainText(/pickup/i);
});
