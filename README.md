# Hopboard

**Scan a QR code. Your clipboard, pictures and files hop between phone and laptop.**
End-to-end encrypted, no account, no app install, nothing stored on a server.

Live: **https://hopboard.pages.dev**

## How to use it

1. Open Hopboard on one device and tap **Start a board**. It shows a QR code.
2. Point the other device's camera at it and open the link.
3. Both screens show the same five emoji. Tap **Let it in** on the first device.
4. Type, paste, drop a picture or a file. It lands on the other device.

On Android you can also install it (Chrome menu, "Install app") and use **Share → Hopboard** from any app.

## What it does

- Text, links, pictures, files. Big phone photos are shrunk on-device first (one tick to send the original).
- A numeric code like `482913` is shown in big digits with a Copy code button.
- **Video is not allowed.** Checked by declared type, file extension and the file's first bytes, on both the sending and the receiving side.
- Direct device-to-device (WebRTC) whenever the network allows it, with an encrypted relay as fallback for small things.
- The returning device reconnects on its own after a refresh, with no new approval.
- Light and dark themes.

## Why you can trust it (and where you cannot)

| Question | Answer |
|---|---|
| Where is the key? | A random 128-bit secret in the URL **#fragment**. Browsers never send the fragment to a server. |
| What does the server see? | Sealed envelopes only. It routes by an id derived from the secret and has no key. The in-app **Server's view** shows every frame it relays, and how many bytes of your stuff touched it (0 B when you are connected directly). |
| Can someone with a photo of the QR join? | Not silently. The first device must approve, and both screens show matching emoji so you can tell which request is yours. The invite is single-use and expires after 10 minutes. |
| Can the server swap connection details? | No. Signaling is authenticated with a key the server never has. |
| Can the server replay old messages? | Each handshake derives a fresh key from both sides' nonces, so old frames are undecryptable. A strictly increasing counter rejects replays inside a session. |
| Is video block a security feature? | No. It is a product rule enforced by the app on both sides. A hand-modified client could bypass it, because the server cannot look inside encrypted data. |
| What do devices remember? | The paired board for up to 7 days (identity key in IndexedDB, non-extractable). **Leave** forgets it. |

Not covered: a compromised device, a malicious browser extension, or a modified copy of the app served to you. Pictures are shown inline only for real image types; SVG and every other file are downloads, never opened in the page.

## Measured

| What | Result | Notes |
|---|---|---|
| Direct link on a real Android phone | Connected, picture and text delivered | One phone, one network. Not a statistical claim. |
| Connect time, two browsers on one machine | ~200 ms after approval | Loopback |
| 20 MB file, direct | Arrived intact (SHA-256 match), **0 B through the server** | ~3 MB/s on loopback in headless Chromium. Real-network speed is not measured here. |
| Relay path | Text and pictures work; files over 5 MB are refused with a clear message | By design, to stay inside free hosting limits |

## Limits

- Android Chrome has Share Target. **iOS Safari does not**, so on iPhone you open the app and use the buttons.
- Direct links can fail behind strict NATs; then only the small relay path is available.
- Hosted on free tiers. Heavy use could hit daily limits.
- One partner device per board.

## Run it

```bash
cd web && npm install && npm run dev          # http://127.0.0.1:5173
cd worker && npm install && npx wrangler dev   # optional: your own relay (set VITE_WS_URL)
```

## Test

```bash
cd web
npx vitest run            # 16 unit tests: crypto, tamper/replay, pairing, video rules
npx playwright test       # 7 end-to-end tests with two browser contexts
BASE_URL=https://hopboard.pages.dev npx playwright test   # same suite against production
cd ../worker && node scripts/smoke.mjs   # relay: routing, isolation, frame cap, origin, room limit
```

The end-to-end suite pairs two browsers, checks matching emoji, sends text/pictures/files with hash checks, refuses video (including a renamed one), forces the relay path and then inspects every WebSocket frame to confirm the plaintext, the invite secret and the host key never appear on the wire.

## Deploy (free)

- **Relay:** Cloudflare Worker + Durable Object (`worker/`, SQLite-backed class, free plan). `npx wrangler deploy`.
- **App:** static build on Cloudflare Pages. `cd web && npm run build && npx wrangler pages deploy dist --project-name hopboard`.
- The relay accepts WebSockets only from `*hopboard*.pages.dev` and localhost; the app's CSP only allows connecting to that relay. Change both if you host it elsewhere.

## Layout

```
web/      React + TypeScript + Vite. src/lib: crypto.ts, net.ts (pairing, WebRTC, relay, transfer), media.ts (video rules)
worker/   Cloudflare Worker + Durable Object relay (memory only, no storage)
```

Built by Aiza Ali.
