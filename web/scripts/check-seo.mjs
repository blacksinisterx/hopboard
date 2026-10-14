// Fails the build if any page loses its SEO basics. Runs after build-seo.mjs.
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const SITE = 'https://hopboard.pages.dev';
const fail = []; const bad = (m) => fail.push(m);
const pages = [['index.html', '/'], ...readdirSync('dist').filter((f) => f.endsWith('.html') && !['index.html', '404.html'].includes(f)).map((f) => [f, '/' + f.replace(/\.html$/, '')])];
const sitemap = readFileSync('dist/sitemap.xml', 'utf8');
const seen = { title: new Map(), description: new Map() };

const resolves = (href) => {
  const p = href.split('#')[0].split('?')[0];
  return p === '/' || p === '' || existsSync('dist' + p) || existsSync('dist' + p + '.html');
};

for (const [file, path] of pages) {
  const html = readFileSync('dist/' + file, 'utf8');
  const one = (re) => (html.match(re) || [])[1];
  const title = one(/<title>([^<]+)<\/title>/); const desc = one(/<meta name="description" content="([^"]+)"/);
  if (!title) bad(`${path}: no title`); else if (title.length > 70) bad(`${path}: title ${title.length} chars`);
  if (!desc) bad(`${path}: no description`); else if (desc.length < 70 || desc.length > 165) bad(`${path}: description ${desc.length} chars`);
  if (one(/<link rel="canonical" href="([^"]+)"/) !== SITE + path) bad(`${path}: canonical is ${one(/<link rel="canonical" href="([^"]+)"/)}`);
  if ((html.match(/<h1[\s>]/g) || []).length !== 1) bad(`${path}: needs exactly one h1`);
  if (!/<meta property="og:image" content="https:\/\//.test(html)) bad(`${path}: og:image not absolute`);
  if (/noindex/.test(html)) bad(`${path}: unexpectedly noindex`);
  if (!sitemap.includes(`<loc>${SITE}${path}</loc>`)) bad(`${path}: not in sitemap`);
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (!ld.length) bad(`${path}: no JSON-LD`);
  for (const m of ld) { try { JSON.parse(m[1]); } catch { bad(`${path}: invalid JSON-LD`); } }
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\balt="/.test(m[0])) bad(`${path}: image without alt`);
  for (const m of html.matchAll(/<a\b[^>]*\bhref="(\/[^"]*)"/g)) if (!resolves(m[1])) bad(`${path}: broken link ${m[1]}`);
  for (const [k, v] of [['title', title], ['description', desc]]) { if (seen[k].has(v)) bad(`${path}: duplicate ${k} (also ${seen[k].get(v)})`); seen[k].set(v, path); }
  if (file !== 'index.html' && (html.match(/\b[\w'-]+\b/g) || []).length < 300) bad(`${path}: thin content`);
}
if (!/noindex/.test(readFileSync('dist/404.html', 'utf8'))) bad('404.html must be noindex');
if (!/Sitemap: https:\/\//.test(readFileSync('dist/robots.txt', 'utf8'))) bad('robots.txt has no Sitemap line');
const faq = readFileSync('dist/faq.html', 'utf8');
const nQ = (faq.match(/"@type":"Question"/g) || []).length; const nD = (faq.match(/<details>/g) || []).length;
if (nQ !== nD) bad(`faq: ${nQ} schema questions vs ${nD} visible`);

if (fail.length) { console.error(`\nSEO check FAILED (${fail.length}):\n - ${fail.join('\n - ')}\n`); process.exit(1); }
console.log(`SEO check passed: ${pages.length} indexable pages, sitemap, robots, 404 noindex, JSON-LD valid, FAQ schema matches visible text.`);
