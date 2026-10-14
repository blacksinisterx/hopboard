// One-off: download the latin subset of Fredoka + Nunito (variable, SIL OFL) so the app serves its own fonts.
// Usage: node scripts/fetch-fonts.mjs   -> public/fonts/*.woff2 and prints the @font-face rules for index.css
import { writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const css = await (await fetch('https://fonts.googleapis.com/css2?family=Fredoka:wght@500..700&family=Nunito:wght@500..800&display=swap', { headers: { 'User-Agent': UA } })).text();
const blocks = [...css.matchAll(/\/\* (\S+) \*\/\s*(@font-face \{[^}]+\})/g)].filter((m) => m[1] === 'latin');
let rules = '';
for (const [, , block] of blocks) {
  const family = block.match(/font-family: '([^']+)'/)[1];
  const weight = block.match(/font-weight: ([^;]+);/)[1];
  const url = block.match(/url\(([^)]+)\)/)[1];
  const range = block.match(/unicode-range: ([^;]+);/)[1];
  const file = `${family.toLowerCase()}.woff2`;
  writeFileSync(`public/fonts/${file}`, Buffer.from(await (await fetch(url)).arrayBuffer()));
  rules += `@font-face { font-family: '${family}'; font-style: normal; font-weight: ${weight}; font-display: swap; src: url('/fonts/${file}') format('woff2'); unicode-range: ${range}; }\n`;
}
console.log(rules);
