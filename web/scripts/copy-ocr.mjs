// Self-host the OCR engine (the CSP forbids loading code from a CDN). Copies only what is needed into public/ocr.
import { mkdirSync, copyFileSync } from 'node:fs';

mkdirSync('public/ocr', { recursive: true });
const from = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
];
for (const [src, name] of from) copyFileSync(src, `public/ocr/${name}`);
console.log('OCR assets copied to public/ocr');
