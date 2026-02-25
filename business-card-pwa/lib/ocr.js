/**
 * OCR wrapper using Tesseract.js v5.
 *
 * Tesseract.js is loaded lazily from CDN on first call to recognizeImage().
 * Language data (~20 MB for jpn+eng) is downloaded and cached in the
 * browser's IndexedDB by Tesseract.js — subsequent scans work offline.
 *
 * IMPORTANT: The very first scan requires an internet connection.
 *
 * This file is intentionally excluded from unit test coverage because it
 * depends on the CDN, browser Canvas API, and Tesseract WebAssembly.
 */

/* global Tesseract */

const TESSERACT_CDN =
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

let loaded = false;

/**
 * Lazy-load Tesseract.js from CDN (no-op if already available).
 * @returns {Promise<void>}
 */
export function loadTesseract() {
  if (loaded || typeof Tesseract !== 'undefined') {
    loaded = true;
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TESSERACT_CDN;
    script.onload  = () => { loaded = true; resolve(); };
    script.onerror = () =>
      reject(new Error(
        'Tesseract.js の読み込みに失敗しました。\nインターネット接続を確認してください。'
      ));
    document.head.appendChild(script);
  });
}

/**
 * Run OCR on an image and return the recognised text.
 *
 * Progress is split into two phases:
 *   - Language data loading : reports 0–30 %
 *   - Text recognition      : reports 30–100 %
 *
 * @param {File|Blob|string} imageSource  Image file, blob, or URL
 * @param {(pct: number) => void} [onProgress]  Called with 0‥100
 * @returns {Promise<string>}  Raw recognised text
 */
export async function recognizeImage(imageSource, onProgress) {
  await loadTesseract();

  const { data: { text } } = await Tesseract.recognize(
    imageSource,
    'jpn+eng',
    {
      logger: (m) => {
        if (!onProgress) return;
        if (m.status === 'loading language traineddata') {
          onProgress(Math.round(m.progress * 30));          // 0 – 30 %
        } else if (m.status === 'recognizing text') {
          onProgress(30 + Math.round(m.progress * 70));    // 30 – 100 %
        }
      },
    }
  );

  return text;
}
