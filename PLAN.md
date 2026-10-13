# Hopboard — plan (v1)

> **Scan once. Your clipboard, photos and files hop between phone and laptop. End-to-end encrypted, no account, no app install, nothing stored.**

Working name: **Hopboard** (hop between devices + clipboard). Alternates: Beamboard, Tether. Rename is free until the repo is created.

Status: PLAN ONLY. Nothing is built. No benchmark number in this file is a result.

---

## 0. The problem and why existing tools leave room

Today people send themselves things via WhatsApp/Telegram "Saved Messages", email-to-self, or Drive. All of those push a copy through a company's server, need a login, and leave a permanent history of passwords, OTPs and photos.

There are already open tools in this space (PairDrop/Snapdrop-style P2P senders, code-based senders, native ecosystems like Apple/Windows/KDE Connect). **Before any claim of "better" goes into a post, each differentiator below gets tested head-to-head against at least two of them** (Phase 6). Only differences that survive that test are published.

---

## 1. What makes it better (the differentiators, each one testable)

| # | Feature | Why it matters | How we test the claim |
|---|---|---|---|
| 1 | **Zero-friction pairing**: laptop shows a QR, phone's normal camera scans it, connected. No account, no install, any browser. | Fewest steps to first transfer | Count taps and seconds from "open" to "first item received", same task on each tool |
| 2 | **Approve-new-device**: a scanned QR is not enough; the laptop shows "Aiza's phone wants to join: Allow?" (like WhatsApp Web linking). Invite is single-use and expires. | A photographed or shoulder-surfed QR can't silently join | Security test: replay a used/expired invite, expect rejection |
| 3 | **True E2E with the key never reaching the server**: secret lives in the URL `#fragment` (never sent in HTTP). Room id and key are both derived from it. The signaling server authenticates nothing it can read. | Server compromise or snooping reveals nothing | "Server's View" panel shows the exact bytes the server sees (ciphertext only) |
| 4 | **Android Share Target**: install as PWA, then *Share -> Hopboard* from any app sends text/links/images to the laptop. | Beats copy-paste-open-app on the phone | Manual device test; works on Android Chrome. **iOS Safari does not support Web Share Target** (stated, not hidden) |
| 5 | **Real clipboard UX**: one tap "Send my clipboard", paste anywhere on the page to send, screenshots from the clipboard work, big "Copy" button on the receiving side, URL detection, OTP/code detection. | It is a clipboard, not a file dropper | Hands-on checklist |
| 6 | **Camera -> text (on-device OCR)**: photograph a page or whiteboard on the phone; the laptop receives the *extracted text* in its clipboard. Tesseract.js runs in the browser, nothing uploaded. | Genuinely useful and a strong demo | Accuracy spot-check on a small set of real photos, reported with the failures |
| 7 | **Ephemeral by design**: nothing is stored server-side; rooms die when everyone leaves; items can be "burn after reading". | Passwords/OTPs don't pile up in a chat log | Inspect the server: no persistent storage used |
| 8 | **Open source + free to self-host** | Trust and zero lock-in | Repo + one-command deploy |

Not claimed: speed records, "unhackable", or anything about competitors that was not tested.

---

## 1b. What can be sent (media policy)

- **Allowed:** text, links, clipboard, **pictures** (JPEG, PNG, WebP, GIF, HEIC), and ordinary documents (PDF, txt, zip, etc.).
- **Not allowed: video** (MP4, MOV, WebM, MKV, AVI...). Checked by MIME type, extension **and** magic bytes (so renaming `clip.mp4` to `clip.jpg` does not slip through).
- **Size caps:** pictures up to ~25 MB each, other files up to ~100 MB over P2P; the relay fallback stays small (a few MB).
- **Honest limit:** because everything is end-to-end encrypted, the server cannot look inside and cannot enforce the video block. Enforcement is in the app on **both** sides: the sender refuses to send video and the receiver rejects it. A hand-modified client could bypass that. This is a product rule, not a security guarantee, and the README will say so.
- Phone photos are large, so the sender offers a one-tap "shrink before sending" (client-side resize/re-encode) as the default for pictures, with "send original" as the option.

---

## 2. Architecture (all free)

```
Phone (PWA) <-- WebRTC data channel (DTLS, P2P, direct) --> Laptop (web app)
        \                                                     /
         \--- fallback: encrypted relay over WebSocket -------/
                         |
        Cloudflare Worker + Durable Object (signaling + relay, memory only)
```

- **Pairing/crypto:** one random 128-bit secret in the URL fragment. `roomId = HKDF(secret, "room")`, `key = HKDF(secret, "enc")`. WebCrypto AES-GCM, per-message nonce + counter (replay protection). SDP/ICE fingerprints are HMAC-authenticated with the shared key, so the signaling server cannot swap in its own endpoint. Optional short "safety words" to compare on both screens.
- **Transport:** P2P WebRTC data channel for everything (files chunked with backpressure). If P2P fails (restrictive NAT), small payloads fall back to an **encrypted relay** through the Worker (size-capped); the relay only ever carries ciphertext.
- **STUN:** free public STUN. **TURN:** optional, via Cloudflare's TURN free allowance if an account token is set; otherwise relay fallback covers text and small files. Free-tier limits change, so verify current numbers at build time.
- **Signaling/relay server:** Cloudflare Worker + one Durable Object per room, WebSocket, **no storage writes**, per-room and per-IP rate limits, hard size caps, idle TTL.
- **Frontend:** Vite + React + TypeScript + Tailwind/shadcn (same stack as the portfolio projects), `vite-plugin-pwa` (installable, Share Target), `qrcode` for rendering. Phone scans with its native camera (the QR is just a URL), so no in-app scanner is needed for v1.
- **Hosting:** Cloudflare Pages (frontend) + Worker (server). One free account, no card, no sleep/pause. *(Supabase Realtime would also work and the account exists, but free projects pause after inactivity, which would kill a demo link. Rejected on purpose; verify before relying on either.)*

Why not a bigger framework or database: nothing needs one. No accounts, no persistence, no AI model.

---

## 3. Scope

**v1 (the build):** QR pairing + approve-device, text/links/clipboard/images, files over P2P with relay fallback for small ones, E2E, PWA + Android Share Target, ephemeral rooms, "Server's View" panel, 2+ devices in one room.

**v1.1 (small, high-impact, cut first if time slips):** Camera -> text OCR, burn-after-reading, safety-words verification, remembered devices (encrypted key pair in IndexedDB so re-pairing is one tap).

**Out (named so it does not creep in):** accounts, cloud file storage, native apps, browser extension, AI features beyond OCR, sync history across days.

---

## 4. Test plan (this is what turns "cool" into "credible")

- **Unit (vitest):** key derivation, AES-GCM round-trip, nonce/replay rejection, invite single-use and expiry, fingerprint HMAC rejects a swapped fingerprint.
- **E2E (Playwright, two browser contexts as laptop and phone):** pair via QR URL, approve device, send text/image/10 MB file with SHA-256 match, force the relay path (block WebRTC) and re-check, reconnect after drop, third device blocked until approved.
- **Server blindness test:** capture every WebSocket frame in the E2E run and assert the plaintext and the key never appear in them.
- **Real-device test (manual, needs the user's phone):** home Wi-Fi <-> phone on mobile data, which exercises the NAT/TURN path for real. Report what happened, n small, honestly.
- **Measurements for the post (real only):** scan-to-connected time, P2P vs relay throughput for a 10 MB file, time-to-first-item vs the tools we compared against, OCR accuracy on a small photo set including misses.

---

## 5. Phases

| # | Phase | Output | Exit check |
|---|---|---|---|
| 0 | Feasibility | Cloudflare account + `wrangler` login; confirm Durable Object WebSockets work on the free plan; repo scaffold | "hello" round-trip through a deployed Worker |
| 1 | Crypto + signaling | Key derivation, Worker/DO, pairing + approval | Two browser tabs pair and exchange encrypted text |
| 2 | Transfer | Clipboard/text/images, file chunking, P2P + relay fallback | 10 MB file arrives with matching hash on both paths |
| 3 | PWA + UX | Installable, Android Share Target, polished UI, "Server's View" | Share-from-phone works on a real Android device |
| 4 | Tests | Unit + E2E + server-blindness | All green in CI-equivalent local run |
| 5 | v1.1 | OCR, burn-after-reading, safety words, remembered devices | Each behind its own test |
| 6 | Competitor reality check | Same 5 tasks on 2 existing tools, written up | Only confirmed differences go in the post |
| 7 | Deploy + media | Live URL, README with threat model, 3 GIFs + MP4, LinkedIn post | GIFs <= ~5 MB, post uses only measured results |

Estimate: ~3-4 days of work. No overnight compute.

---

## 6. LinkedIn post and GIFs

Written **after Phase 6**, because it must quote what was actually measured and only claim differences that held up. Structure and hooks now, final text later (`docs/linkedin-post.md`):

**Hook options (pick one at write-time):**
1. "I was tired of WhatsApp-ing myself passwords. So I built a clipboard that can't read your clipboard."
2. "Scan a QR code. Your phone and laptop now share a clipboard. The server in the middle sees only noise, and I can prove it."
3. "Point your phone at a page. The text appears in your laptop's clipboard. No upload, no account."

**Structure:** the annoying real problem -> the 3-step demo -> *how it stays private* (fragment key, ciphertext-only server, approve-device) -> the honest comparison with what was tested -> limits (iOS has no Share Target, free-tier caps, P2P can fail on strict NAT) -> live link + repo.

**GIFs (3):** (1) QR scan -> connected -> clipboard hop (real phone screen recording merged with the laptop capture, labelled as such), (2) Camera -> text OCR landing in the laptop clipboard, (3) "Server's View": the same message as plaintext on both devices and ciphertext on the server. Each also as MP4. Built with Playwright/Pillow/`imageio-ffmpeg`, <= ~5 MB.

---

## 7. Free-ness audit

| Piece | $0 because |
|---|---|
| Frontend | Cloudflare Pages free |
| Signaling + relay | Cloudflare Workers + Durable Objects free plan (check current limits; per-IP and per-room caps protect it) |
| Transfer bandwidth | WebRTC P2P goes device to device; the relay path is size-capped |
| OCR | Tesseract.js runs in the visitor's browser |
| Crypto | Browser WebCrypto |
| Tests and media | Playwright, vitest, Pillow, `imageio-ffmpeg` |
| Domain | `*.pages.dev` / `*.workers.dev` (a custom domain is optional and not free) |

Real risks of "free": a viral spike can hit daily request limits; mitigated by caps and by P2P doing the heavy lifting. If limits are hit, text fallback degrades first, not safety.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| P2P fails across strict NATs | Encrypted relay fallback for small payloads; optional free TURN; report the real success rate honestly |
| Free-tier limits or abuse | Rate limits, size caps, idle TTL, no storage, no file hosting |
| QR is a bearer secret | Single-use invite + expiry + approve-new-device |
| iOS limits (no Share Target, clipboard permissions) | State plainly; paste/tap flows still work on iOS |
| Clipboard API needs a user gesture / HTTPS | Design around explicit tap and paste events |
| "Better than X" overclaim | Phase 6 head-to-head; unconfirmed claims are deleted |
| Scope creep into a full AirDrop | v1 vs v1.1 vs Out list above |

---

## 9. What the user must do (cannot be automated)

1. Approve this plan.
2. Create a free **Cloudflare** account (no card) and run `wrangler login` when prompted (interactive).
3. Create an **empty** GitHub repo under `blacksinisterx` (name TBD, no `gh` CLI installed); Pages deploys from it or via `wrangler`.
4. Provide a phone for the real-device test (Android for Share Target) and screen-record it for the GIF.

Git identity stays `blacksinisterx <aiza.ali03@gmail.com>`, no co-author trailers.
