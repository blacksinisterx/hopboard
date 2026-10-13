// What may be sent. Pictures and ordinary files: yes. Video: no.
//
// Because everything is end-to-end encrypted the server cannot look inside, so this rule is enforced by the app on BOTH
// sides (sender refuses, receiver rejects). A hand-modified client could bypass it: it is a product rule, not a
// security boundary.

export const MAX_IMAGE = 25 * 1024 * 1024;
export const MAX_FILE = 100 * 1024 * 1024;
export const MAX_RELAY = 5 * 1024 * 1024; // files over this need a direct connection

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif']);
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|wmv|flv|mpe?g|3gp|3g2|ogv|mts|m2ts|vob|asf)$/i;
const IMAGE_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'avif', 'avis']);

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

export type Sniffed = 'video' | 'image' | 'other';

/** Look at the first bytes of a file, not at what it claims to be. */
export function sniff(head: Uint8Array): Sniffed {
  if (head.length >= 12 && ascii(head, 4, 8) === 'ftyp') {
    const brand = ascii(head, 8, 12).trim().toLowerCase();
    if (IMAGE_BRANDS.has(brand)) return 'image';
    if (brand === 'm4a') return 'other';
    return 'video'; // isom, mp41, mp42, qt, 3gp*, avc1, dash, ...
  }
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) return 'video'; // webm / mkv
  if (head.length >= 12 && ascii(head, 0, 4) === 'RIFF') {
    const t = ascii(head, 8, 12);
    if (t === 'AVI ') return 'video';
    if (t === 'WEBP') return 'image';
    return 'other';
  }
  if (ascii(head, 0, 3) === 'FLV') return 'video';
  if (startsWith(head, [0x00, 0x00, 0x01, 0xba]) || startsWith(head, [0x00, 0x00, 0x01, 0xb3])) return 'video'; // mpeg
  if (startsWith(head, [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11])) return 'video'; // asf / wmv
  if (startsWith(head, [0xff, 0xd8, 0xff]) || startsWith(head, [0x89, 0x50, 0x4e, 0x47]) || ascii(head, 0, 4) === 'GIF8') return 'image';
  return 'other';
}

export type Verdict = { ok: true; kind: 'image' | 'file' } | { ok: false; reason: string };

const NO_VIDEO = 'Video is not allowed: Hopboard is for pictures, text and files.';

/** Cheap checks that need no file bytes: declared type and extension. */
export function checkDeclared(name: string, mime: string): Verdict | null {
  if (mime.toLowerCase().startsWith('video/') || VIDEO_EXT.test(name)) return { ok: false, reason: NO_VIDEO };
  return null;
}

/** Full check once the first bytes are available (sender: from the file; receiver: from the first chunk). */
export function checkFile(name: string, mime: string, size: number, head: Uint8Array): Verdict {
  const early = checkDeclared(name, mime);
  if (early) return early;
  const seen = sniff(head);
  if (seen === 'video') return { ok: false, reason: NO_VIDEO };
  // an "image" must really be an allowed image type; SVG is deliberately not an image here (it can carry script)
  const isImage = IMAGE_MIME.has(mime.toLowerCase()) && (seen === 'image' || mime.toLowerCase() === 'image/avif');
  if (isImage) return size > MAX_IMAGE ? { ok: false, reason: 'That picture is over 25 MB.' } : { ok: true, kind: 'image' };
  return size > MAX_FILE ? { ok: false, reason: 'That file is over 100 MB.' } : { ok: true, kind: 'file' };
}

export async function checkOutgoing(file: File): Promise<Verdict> {
  const early = checkDeclared(file.name, file.type);
  if (early) return early;
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  return checkFile(file.name, file.type, file.size, head);
}

/** Phone photos are huge. Resize on-device before sending; the original stays an option. */
export async function shrinkImage(file: File, maxDim = 2048, quality = 0.85): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  if (file.type === 'image/png' && file.size < 4 * 1024 * 1024) return file; // small screenshots stay pixel-perfect
  if (file.size < 600 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, file.type, quality));
    return blob && blob.size < file.size ? new File([blob], file.name, { type: file.type }) : file;
  } catch {
    return file; // undecodable here (e.g. HEIC outside Safari): send the original
  }
}

export const prettySize = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export const isHttpUrl = (s: string) => {
  try { const u = new URL(s.trim()); return (u.protocol === 'http:' || u.protocol === 'https:') && !/\s/.test(s.trim()); } catch { return false; }
};
