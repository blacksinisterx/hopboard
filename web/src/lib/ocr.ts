// On-device text recognition. tesseract.js loads lazily (about 7 MB, once), runs in a Web Worker, and nothing is uploaded.
import type { Worker as TessWorker } from 'tesseract.js';

let worker: Promise<TessWorker> | null = null;
let onProgress: ((p: number) => void) | undefined;

export async function readText(image: Blob, progress?: (p: number) => void): Promise<string> {
  onProgress = progress;
  worker ??= import('tesseract.js').then(({ createWorker }) =>
    createWorker('eng', 1, {
      workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr', workerBlobURL: false,
      logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') onProgress?.(m.progress); },
    }));
  const w = await worker;
  const { data } = await w.recognize(image);
  return data.text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
