# LinkedIn posts — Hopboard

Three short posts, one per GIF. Post them a few days apart. Every claim below was measured or tested (see README "Measured" and the test suite). Swap in new numbers if anything changes.

Links: https://hopboard.pages.dev · https://github.com/blacksinisterx/hopboard

---

## Post 1: launch (attach `hopboard-pair.gif`)

I was tired of WhatsApp-ing myself passwords and photos.

So I built **Hopboard**. Open it on your laptop, scan the QR with your phone, and your clipboard, pictures and files hop between the two.

No account. No app to install. Free.

The part I care about: it's end-to-end encrypted. The key lives in the link you scan and never reaches the server. And a stolen QR isn't enough. Your laptop shows 5 emoji, your phone shows the same 5, and nothing joins until you tap "Let it in".

Pictures and files: yes. Video: no, on purpose.

Built with WebRTC (device to device), a tiny Cloudflare relay and one very smug bunny. Hosting bill: $0.

Try it: hopboard.pages.dev
Code: github.com/blacksinisterx/hopboard

#BuildInPublic #WebRTC #Privacy #Cloudflare #React

---

## Post 2: the proof (attach `hopboard-server.gif`)

"The server can't read your data" is easy to say. So I tested it.

In Hopboard I force every message through the relay and record every frame that crosses the wire. The test fails if the message, the invite secret or the host's key shows up anywhere in it. It doesn't.

That's the GIF. My laptop shows `my PIN is 4821`. The server sees sealed envelopes.

When two devices connect directly, the counter in "Server's view" says **0 B** went through the server. I sent a 20 MB file that way: hash matches, nothing relayed.

One bug I'm glad I caught: my relay's own frame-size test printed PASS when it shouldn't have. It was watching the wrong socket, and its fallback value was a truthy string. A test that can't fail isn't a test.

16 unit tests and 9 end-to-end tests, also run against the live site.

hopboard.pages.dev · github.com/blacksinisterx/hopboard

#Security #WebRTC #Testing #BuildInPublic

---

## Post 3: camera to text (attach `hopboard-ocr.gif`)

Point your phone at a page. The text lands on your laptop.

That's the newest Hopboard trick. The reading (Tesseract) runs in your browser, so the photo isn't uploaded for OCR, and nothing leaves your phone until you press Send.

Honest limits: it's good on clean printed text like tickets, receipts and whiteboards. Handwriting, glare and blur will be hit and miss. So far I've only tested it on generated images, not a real-world benchmark.

Free, no account: hopboard.pages.dev

#OCR #BuildInPublic #WebApp

---

## Before you post

- Post 3: try "Scan text" on a few **real photos** first. If you do, change that line to "tested on generated images and N real photos" and mention one failure. That is more convincing than a perfect demo.
- Don't mention "Share to Hopboard" from the Android share sheet until you have tested it on your phone.
- Add the GIF directly to the post (not a link). MP4 versions are in `docs/` if you prefer video.
- Reply to comments with real answers: it's free-tier hosting (Cloudflare Pages + Workers), WebRTC data channels, no accounts, nothing stored on the server, devices remember the pairing for up to 7 days.
