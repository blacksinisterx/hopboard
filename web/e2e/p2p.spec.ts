import { test, expect } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';

// Direct WebRTC path. Both browsers run on THIS machine, so speed numbers are loopback, not real-world.
test('direct link: big file arrives intact and the server sees none of it', async ({ browser }) => {
  const hostCtx = await browser.newContext(); const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage(); const guest = await guestCtx.newPage();
  await host.goto('/'); await host.getByRole('button', { name: /start a board/i }).click();
  const invite = (await host.getByTestId('invite').textContent())!.trim();
  await guest.goto(invite);
  await host.getByTestId('allow').click();
  await expect(host.getByTestId('peer')).toBeVisible({ timeout: 20000 });

  const t0 = Date.now();
  await expect(host.getByTestId('link')).toContainText(/direct/i, { timeout: 20000 });
  const connectMs = Date.now() - t0;

  const mb = 20; const data = randomBytes(mb * 1024 * 1024);
  const start = Date.now();
  await host.getByTestId('file-input').setInputFiles({ name: 'big.bin', mimeType: 'application/octet-stream', buffer: data });
  await expect(guest.locator('article.item.file a[download]')).toBeVisible({ timeout: 90000 });
  const secs = (Date.now() - start) / 1000;
  const got = await guest.evaluate(async () => {
    const a = document.querySelector('article.item.file a[download]') as HTMLAnchorElement;
    const buf = await (await fetch(a.href)).arrayBuffer();
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
  });
  expect(got).toBe(createHash('sha256').update(data).digest('hex'));

  await host.getByRole('button', { name: /server's view/i }).click();
  await expect(host.getByTestId('relayed-bytes')).toHaveText('0 B'); // not one byte of the file touched the server
  console.log(`P2P: connected ${connectMs} ms after approval, ${mb} MB in ${secs.toFixed(1)} s = ${(mb / secs).toFixed(1)} MB/s (loopback)`);
});
