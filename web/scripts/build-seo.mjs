// Runs after `vite build`. Writes the static content pages, sitemap.xml, robots.txt and a real 404 into dist/.
// The app's own CSS is reused (read from dist/index.html) so the pages look like Hopboard.
import { readFileSync, writeFileSync } from 'node:fs';

const SITE = 'https://hopboard.pages.dev';
const PORTFOLIO = 'https://storm-bureau-portfolio.vercel.app/';
const GITHUB = 'https://github.com/blacksinisterx/hopboard';
const AUTHOR = { '@type': 'Person', '@id': `${SITE}/#author`, name: 'Aiza Ali', url: PORTFOLIO };
const css = readFileSync('dist/index.html', 'utf8').match(/href="(\/assets\/index-[^"]+\.css)"/)[1];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const faq = [
  ['Is Hopboard free?', 'Yes. There is no account, no subscription and no ads. It runs on free hosting tiers, so a heavy spike of traffic could hit daily limits.'],
  ['Do I need an account or an app?', 'No. Hopboard works in the browser on both devices. On Android you can optionally install it (Chrome menu, Install app) to get Hopboard in the Share sheet.'],
  ['Is it really end-to-end encrypted?', 'Yes. A random 128-bit secret lives in the part of the link after the # sign, which browsers never send to a server. Everything is sealed with keys derived from it before it leaves your device. Like any web app, you still trust the code your browser loads from the site, which is why the project is open source.'],
  ['What can the server see?', 'Sealed envelopes: their size, their timing, and that two devices are connected. It has no key, so it cannot read the content. The Server\'s view panel in the app shows every frame it relays.'],
  ['What can I send?', 'Text, links, pictures and ordinary files. Video is not allowed, and the app checks the file type, the extension and the first bytes of the file, so a renamed video is refused too.'],
  ['How big can a file be?', 'Pictures up to 25 MB. Other files up to 100 MB when the devices connect directly, and up to 25 MB when they go through the encrypted relay.'],
  ['Does it work on an iPhone?', 'It should work in modern iPhone browsers, but I have only tested it on Android and desktop Chrome so far. iOS does not support the Share sheet integration, so on iPhone you open the page and use the buttons.'],
  ['Does it work if my laptop is on Wi-Fi and my phone is on mobile data?', 'Yes. A direct device-to-device link often cannot be made across different networks, so Hopboard automatically falls back to the encrypted relay. It is a little slower but text, pictures and files up to 25 MB still arrive.'],
  ['Can I connect more than two devices?', 'Not yet. Each board pairs one device with one partner. Start a second board for another device.'],
  ['How long does pairing last?', 'The QR code is valid for 10 minutes if nobody joins. After you approve a device, both devices remember the pairing for up to 7 days so they can reconnect without scanning again. Press Leave to forget it immediately. The server stores nothing.'],
  ['How does Scan text work?', 'Take or choose a photo of printed text and the text appears in the message box. The reading runs in your browser with Tesseract, so the photo is not uploaded. The first use downloads about 7 MB. It works best on clean printed text; handwriting and glare are hit and miss.'],
  ['Is Hopboard open source?', `Yes. The code is at ${GITHUB}.`],
  ['Who built Hopboard?', `Aiza Ali, an AI engineer. See the portfolio at ${PORTFOLIO}.`],
];

const table = (rows) => `<div class="table-wrap"><table><thead><tr><th>Way to move text</th><th>What it needs</th><th>What it leaves behind</th></tr></thead><tbody>${rows.map((r, i) => `<tr${i === rows.length - 1 ? ' class="us"' : ''}>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

const pages = [
  {
    slug: 'how-it-works',
    title: 'How Hopboard Works: QR Pairing and End-to-End Encryption',
    description: 'How Hopboard pairs two devices with a QR code, why the server cannot read your data, and when files go direct or through the encrypted relay.',
    h1: 'How Hopboard works',
    lead: 'Two devices, one QR code, and a server that only ever sees sealed envelopes.',
    related: ['faq', 'copy-text-from-phone-to-laptop'],
    body: `
<h2>The short version</h2>
<p>You open Hopboard on one device and it shows a QR code. You scan it with the other device, check that both screens show the same five emoji, and tap <strong>Let it in</strong>. From then on, text, links, pictures and files you send on one device appear on the other.</p>
<h2>Step by step</h2>
<ol>
<li><strong>Start a board.</strong> Your browser makes a random 128-bit secret and puts it in the link after the <code>#</code> sign. The QR code is that link.</li>
<li><strong>Scan.</strong> The other device opens the link and connects to the same room. The room name is derived from the secret, so the server can route messages without knowing the secret.</li>
<li><strong>Compare the emoji.</strong> Both screens show five emoji computed from the two devices' keys. If they match, the request really came from the device in your hand.</li>
<li><strong>Allow.</strong> Only after you approve does the first device accept the other. Once a partner is approved, any other new device is turned away. If nobody joins, the QR code expires after 10 minutes.</li>
</ol>
<h2>Why a stolen QR code is not enough</h2>
<p>Someone who photographs the QR code can knock, but they cannot get in unless you tap Let it in, and the matching emoji let you tell your own device from theirs. After approval the two devices derive a fresh pairwise key from their private keys, the invite secret and one random value from each side, so the server cannot swap connection details or replay old messages into a new session.</p>
<h2>Where the key lives</h2>
<p>Browsers do not send the part of a link after <code>#</code> to the server. That is why the secret never reaches Hopboard's relay. It is also why the project is open source: you can read exactly what the code does with it.</p>
<h2>Direct, or through the relay</h2>
<p>Whenever the network allows it, the two devices connect directly with WebRTC, so your data never touches the server at all. In Hopboard the Server's view panel then shows <strong>0 B</strong> relayed. If a direct link cannot be made, for example a laptop on Wi-Fi and a phone on mobile data, Hopboard falls back to a relay that forwards sealed envelopes. It is slower and capped at 25 MB per file, but it works.</p>
<h2>What the server sees and stores</h2>
<p>The relay is a small Cloudflare Worker that keeps nothing on disk. It sees envelope sizes, timing, and that two devices are connected. It cannot read content. Your devices remember the pairing for up to 7 days so they reconnect without a new scan; press <strong>Leave</strong> to forget it at once.</p>
<h2>What it does not protect against</h2>
<p>A compromised device, a malicious browser extension, or a tampered copy of the app served to you. The video block is a product rule enforced by the app on both sides, not a security guarantee.</p>`,
  },
  {
    slug: 'faq',
    title: 'Hopboard FAQ: Privacy, Limits, iPhone, Video and Cost',
    description: 'Answers about Hopboard: is it free, is it encrypted, what the server sees, file size limits, iPhone support, video, and how long pairing lasts.',
    h1: 'Hopboard FAQ',
    lead: 'Straight answers about privacy, limits and what works where.',
    related: ['how-it-works', 'send-photos-from-phone-to-pc'],
    faq: true,
    body: faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a.replace(/(https:\/\/[^\s]+?)(\.?)(?=$|\s)/g, '<a href="$1">$1</a>$2')}</p></details>`).join('\n'),
  },
  {
    slug: 'copy-text-from-phone-to-laptop',
    title: 'Copy Text From Your Phone to Your Laptop (No Account, No Cable)',
    description: 'Move text, links and one-time codes from your phone to your laptop in seconds with a QR code. Compares the usual ways and shows the Hopboard steps.',
    h1: 'Copy text from your phone to your laptop',
    lead: 'A Wi-Fi password, a link, a one-time code. You have it on one device and need it on the other.',
    related: ['send-photos-from-phone-to-pc', 'how-it-works'],
    body: `
<h2>The usual ways, and their trade-offs</h2>
<p>Most people message themselves, email themselves or use a notes app. They work, but each one needs an account and leaves a copy behind.</p>
${table([
  ['Message yourself in a chat app', 'An account and a phone number on both devices', 'The text stays in the chat history'],
  ['Email yourself', 'An email account on both devices', 'The text sits in a mailbox'],
  ['A notes or cloud-drive app', 'An account and the app on both devices', 'A synced copy in the cloud'],
  ['Hopboard', 'A browser on each device', 'Nothing on a server. Remove it from the screen, or press Leave'],
])}
<h2>Do it with Hopboard in about a minute</h2>
<ol>
<li>On your laptop open <a href="/">hopboard.pages.dev</a> and press <strong>Start a board</strong>.</li>
<li>Point your phone's camera at the QR code and open the link.</li>
<li>Check that both screens show the same five emoji, then press <strong>Let it in</strong> on the laptop.</li>
<li>Type or paste on either device and press <strong>Send</strong>. It appears on the other one with a Copy button.</li>
</ol>
<h2>Small things that save time</h2>
<ul>
<li><strong>Paste and send:</strong> press the pink button to send whatever is on your clipboard. On the page itself, Ctrl+V (or Cmd+V) sends text when you are not typing in the box.</li>
<li><strong>One-time codes:</strong> a message that is just 4 to 8 digits is shown in large digits with a <strong>Copy code</strong> button.</li>
<li><strong>Links:</strong> a message that is a web address gets an <strong>Open link</strong> button.</li>
<li><strong>Different networks:</strong> laptop on Wi-Fi and phone on mobile data works. Hopboard switches to its encrypted relay automatically.</li>
</ul>
<h2>Is it private?</h2>
<p>The key to your board is in the link you scan and never reaches the server, and the server only relays sealed data. <a href="/how-it-works">How Hopboard works</a> explains the details and the limits.</p>`,
  },
  {
    slug: 'send-photos-from-phone-to-pc',
    title: 'Send Photos From Your Phone to Your PC Without a Cable or Account',
    description: 'Send pictures from your phone to your PC or laptop by scanning a QR code. Large photos are resized on your phone first. Free, encrypted, no app.',
    h1: 'Send photos from your phone to your PC',
    lead: 'No cable, no cloud upload, no account. Scan once and your pictures land on the computer.',
    related: ['copy-text-from-phone-to-laptop', 'faq'],
    body: `
<h2>Steps</h2>
<ol>
<li>On your PC open <a href="/">hopboard.pages.dev</a> and press <strong>Start a board</strong>.</li>
<li>Scan the QR code with your phone's camera and open the link.</li>
<li>Match the five emoji on both screens, then press <strong>Let it in</strong> on the PC.</li>
<li>On the phone press <strong>Photo</strong> and choose one or more pictures. They appear on the PC with <strong>Save</strong> and <strong>Copy picture</strong> buttons.</li>
</ol>
<h2>Big phone photos</h2>
<p>Modern phone photos can be many megabytes. By default Hopboard resizes large JPEG, PNG and WebP pictures on your phone before sending, which makes the transfer faster. Untick <strong>Shrink big photos</strong> to send the original. Pictures can be up to 25 MB each. HEIC photos are sent as they are.</p>
<h2>Direct or relayed</h2>
<p>If the two devices can connect directly, the pictures go straight from one to the other and nothing passes through a server. If not, for example when the PC is on Wi-Fi and the phone is on mobile data, they go through an encrypted relay that cannot read them.</p>
<h2>Share straight from the gallery on Android</h2>
<p>In Chrome on Android, open the menu and choose <strong>Install app</strong>. After that, open a photo in your gallery, tap Share and pick <strong>Hopboard</strong>. iPhones do not support this integration, so use the Photo button there.</p>
<h2>What it will not send</h2>
<p>Video is not allowed. Hopboard is built for pictures, text and files, and it refuses video by checking the file type, the extension and the first bytes of the file.</p>
<h2>Need the text from a picture?</h2>
<p>Tap <strong>Read text</strong> under any picture, or use <strong>Scan text</strong> on the phone. The reading happens in your browser and nothing is uploaded. It works best on clean printed text.</p>`,
  },
];

/* ───────────── templates ───────────── */

const logo = '<svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true"><rect x="2" y="2" width="60" height="60" rx="18" class="logo-bg"/><ellipse cx="23" cy="17" rx="6" ry="14" class="logo-fur" transform="rotate(-8 23 17)"/><ellipse cx="41" cy="17" rx="6" ry="14" class="logo-fur" transform="rotate(8 41 17)"/><ellipse cx="32" cy="38" rx="20" ry="17" class="logo-fur"/><circle cx="25" cy="37" r="2.6" class="logo-ink"/><circle cx="39" cy="37" r="2.6" class="logo-ink"/><path d="M29.5 43 q2.5 3 5 0" class="logo-line"/></svg>';
const linkTitle = Object.fromEntries(pages.map((p) => [p.slug, p.h1]));
const UPDATED = '2026-10-14';

function head({ title, description, path, ld, noindex }) {
  return `<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
${noindex ? '<meta name="robots" content="noindex" />' : `<link rel="canonical" href="${SITE}${path}" />
<meta name="robots" content="index, follow, max-image-preview:large" />`}
<meta name="author" content="Aiza Ali" />
<meta name="theme-color" content="#FFF4DE" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#14102A" media="(prefers-color-scheme: dark)" />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
<link rel="apple-touch-icon" href="/icon-192.png" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="preload" href="/fonts/fredoka.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/fonts/nunito.woff2" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="${css}" />
<meta property="og:type" content="${noindex ? 'website' : 'article'}" />
<meta property="og:site_name" content="Hopboard" />
<meta property="og:url" content="${SITE}${path}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${SITE}/og.png" />
<meta property="og:image:alt" content="Hopboard, a bunny mascot and the line: scan once, your clipboard, photos and files hop between your phone and laptop" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${SITE}/og.png" />
${ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : ''}
<script src="/theme.js"></script>`;
}

const shell = (headHtml, inner) => `<!doctype html>
<html lang="en">
<head>
${headHtml}
</head>
<body>
<div class="app">
<header class="top">
<a class="logo" href="/" aria-label="Hopboard home">${logo}<span class="wordmark">Hop<span>board</span></span></a>
<div class="right"><a class="btn sm yellow" href="/">Open Hopboard</a></div>
</header>
<main class="page">
${inner}
</main>
<footer class="foot">
<nav class="foot-links" aria-label="Guides"><a href="/how-it-works">How it works</a><a href="/faq">FAQ</a><a href="/copy-text-from-phone-to-laptop">Copy text phone to laptop</a><a href="/send-photos-from-phone-to-pc">Send photos phone to PC</a></nav>
<div><b>End-to-end encrypted.</b> The key lives in the link you scan and never reaches the server.</div>
<div>Free and open source. Built by <a href="${PORTFOLIO}">Aiza Ali</a> · <a href="${GITHUB}">GitHub</a></div>
</footer>
</div>
</body>
</html>
`;

for (const p of pages) {
  const path = `/${p.slug}`;
  const crumbs = { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Hopboard', item: `${SITE}/` }, { '@type': 'ListItem', position: 2, name: p.h1, item: `${SITE}${path}` }] };
  const graph = [
    { '@type': 'WebPage', '@id': `${SITE}${path}#page`, url: `${SITE}${path}`, name: p.title, description: p.description, inLanguage: 'en', isPartOf: { '@id': `${SITE}/#website` }, datePublished: UPDATED, dateModified: UPDATED, author: AUTHOR, about: { '@id': `${SITE}/#app` } },
    crumbs,
    ...(p.faq ? [{ '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }] : []),
  ];
  const related = p.related.map((s) => `<a href="/${s}">${esc(linkTitle[s])}</a>`).join('');
  const inner = `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Hopboard</a> / ${esc(p.h1)}</nav>
<article class="card prose">
<h1>${esc(p.h1)}</h1>
<p class="lead">${esc(p.lead)}</p>
${p.body}
<div class="cta-row"><a class="btn big yellow" href="/">Start a board</a></div>
<div class="related"><strong>Keep reading</strong>${related}</div>
</article>`;
  writeFileSync(`dist/${p.slug}.html`, shell(head({ title: p.title, description: p.description, path, ld: { '@context': 'https://schema.org', '@graph': graph } }), inner));
}

writeFileSync('dist/404.html', shell(head({ title: 'Page not found | Hopboard', description: 'That page does not exist. Go back to Hopboard.', path: '/404', noindex: true }),
  '<article class="card prose" style="text-align:center"><h1>That page hopped away</h1><p class="lead">There is nothing here.</p><div class="cta-row" style="justify-content:center"><a class="btn big yellow" href="/">Back to Hopboard</a></div></article>'));

const urls = [['/', UPDATED], ...pages.map((p) => [`/${p.slug}`, UPDATED])];
writeFileSync('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, d]) => `  <url><loc>${SITE}${u}</loc><lastmod>${d}</lastmod></url>`).join('\n')}\n</urlset>\n`);
writeFileSync('dist/robots.txt', `User-agent: *\nAllow: /\nDisallow: /ocr/\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`SEO: ${pages.length} pages, sitemap (${urls.length} urls), robots.txt, 404.html`);
