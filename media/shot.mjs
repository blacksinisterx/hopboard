import { chromium } from '@playwright/test';
const b = await chromium.launch();
for (const theme of ['light', 'dark']) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: theme });
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:5173/'); await p.waitForTimeout(1200);
  await p.screenshot({ path: `../media/out/landing-${theme}.png` });
  await ctx.close();
}
await b.close();
