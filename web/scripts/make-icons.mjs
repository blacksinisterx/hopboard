// Renders the PNG icons and the social card from the SVG art. Run: node scripts/make-icons.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const icon = readFileSync('public/icon.svg');
for (const n of [192, 512]) await sharp(icon, { density: 300 }).resize(n, n).png().toFile(`public/icon-${n}.png`);

// maskable: full-bleed yellow, bunny kept inside the safe zone (~70%)
const inner = await sharp(icon, { density: 300 }).resize(360, 360).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#FFD23F' } }).composite([{ input: inner, gravity: 'center' }]).png().toFile('public/icon-maskable-512.png');

// social card 1200x630
const bun = await sharp(icon, { density: 300 }).resize(340, 340).png().toBuffer();
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF4DE"/><stop offset="1" stop-color="#FFD0E6"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#g)"/>
<ellipse cx="930" cy="318" rx="235" ry="225" fill="#FF5FA8" stroke="#2B1B4E" stroke-width="6"/>
<text x="70" y="215" font-family="Arial Black, Arial" font-weight="900" font-size="110" fill="#2B1B4E">Hop<tspan fill="#FF5FA8">board</tspan></text>
<text x="70" y="310" font-family="Arial, sans-serif" font-weight="800" font-size="42" fill="#2B1B4E">Scan once. Clipboard, photos</text>
<text x="70" y="364" font-family="Arial, sans-serif" font-weight="800" font-size="42" fill="#2B1B4E">and files hop between</text>
<text x="70" y="418" font-family="Arial, sans-serif" font-weight="800" font-size="42" fill="#2B1B4E">your phone and laptop.</text>
<rect x="70" y="470" width="520" height="66" rx="22" fill="#FFD23F" stroke="#2B1B4E" stroke-width="5"/>
<text x="98" y="514" font-family="Arial, sans-serif" font-weight="800" font-size="29" fill="#2B1B4E">End-to-end encrypted. No account.</text>
</svg>`);
await sharp(svg).composite([{ input: bun, left: 760, top: 148 }]).png().toFile('public/og.png');
console.log('icons + og.png written');
