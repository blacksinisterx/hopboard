# SEO notes for Hopboard

What is built (all checked on every build by `web/scripts/check-seo.mjs`):

- One title, description, canonical, Open Graph and Twitter card per page; one `h1` per page.
- Homepage content exists as real HTML (not only after JavaScript runs). React replaces it on load; returning devices skip it so it never flashes.
- Structured data: `WebApplication` + `WebSite` + `Person` on the homepage, `WebPage` + `BreadcrumbList` on guides, `FAQPage` on `/faq` (its questions must match the visible ones, and the build fails if they do not).
- Four guides written for real searches: `/how-it-works`, `/faq`, `/copy-text-from-phone-to-laptop`, `/send-photos-from-phone-to-pc`.
- `sitemap.xml`, `robots.txt`, and a real `404` (noindex). Unknown URLs no longer return the app with a 200.
- Fonts are self-hosted, so there is no request to Google and no layout shift. Lighthouse (mobile, simulated): performance 99 to 100, accessibility 100, best practices 100, CLS 0, all 8 SEO audits that can run pass. The `canonical` audit crashes under Node 20 (`URL.parse`), so canonical is verified by the build script instead.

What only you can do:

1. **Google Search Console**: add `https://hopboard.pages.dev/` (URL prefix), verify with the HTML tag, submit `sitemap.xml`, then Inspect URL and Request indexing for `/`, `/how-it-works`, `/faq` and the two guides.
2. **Bing Webmaster Tools**: import the property from Search Console and submit the sitemap.
3. **Backlinks** (the biggest lever you control): put the live link in the GitHub repo "Website" field, add GitHub topics (`clipboard`, `webrtc`, `e2ee`, `pwa`, `file-transfer`, `qr-code`), link it from your portfolio and LinkedIn, and post it where people already look for this tool (e.g. r/selfhosted-style or "show HN"-style posts, only if you are happy to answer questions).
4. **A custom domain** helps more than any on-page change. `pages.dev` is a shared domain with little authority. If you add one, update `SITE` in `web/scripts/build-seo.mjs`, `web/index.html`, `web/public/manifest.webmanifest` and the Worker origin allow-list, then rebuild.

Honest expectation: a new utility on a `pages.dev` address will not outrank established tools for broad searches like "send files between devices". The realistic target is the long-tail guides and searches for "Hopboard" itself, and that grows with links to it.
