// On-device text recognition. tesseract.js loads lazily (about 7 MB, once), runs in a Web Worker, and nothing is uploaded.
import type { Worker as TessWorker } from 'tesseract.js';

export interface OcrProgress { stage: 'loading' | 'reading'; pct: number }

let worker: Promise<TessWorker> | null = null;
let report: ((p: OcrProgress) => void) | undefined;
const MAX_SIDE = 1800;     // a 12 MP phone photo is far more pixels than the reader needs
const TIMEOUT_MS = 120_000;

/** Shrink and grayscale: faster, and usually more accurate than feeding the raw photo. */
async function prepare(image: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(image); // honours the photo's rotation tag
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext('2d')!;
    ctx.filter = 'grayscale(1) contrast(1.2)'; // ignored by browsers without canvas filters: still works, just plainer
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/png'));
  } catch {
    return image;
  }
}

export async function readText(image: Blob, progress?: (p: OcrProgress) => void): Promise<string> {
  report = progress;
  report?.({ stage: 'loading', pct: 0 });
  worker ??= import('tesseract.js').then(({ createWorker }) =>
    createWorker('eng', 1, {
      workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr', workerBlobURL: false,
      logger: (m: { status: string; progress: number }) =>
        report?.({ stage: m.status === 'recognizing text' ? 'reading' : 'loading', pct: m.progress }),
    }));
  const run = async () => {
    const w = await worker!;
    const { data } = await w.recognize(await prepare(image));
    return data.text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([run(), new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS); })]);
  } catch (e) {
    const w = worker; worker = null; // a stuck or broken worker must not poison the next try
    void w?.then((x) => x.terminate()).catch(() => undefined);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const progressLabel = (p: OcrProgress) => `${p.stage === 'loading' ? 'Loading reader' : 'Reading'}… ${Math.round(p.pct * 100)}%`;
