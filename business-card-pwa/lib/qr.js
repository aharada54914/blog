/**
 * QR code rendering wrapper.
 *
 * In the browser, relies on the global `QRCode` object exposed by
 * lib/qrcode.min.js (vendored build of the `qrcode` npm package).
 *
 * This file is intentionally excluded from unit test coverage because
 * QRCode.toCanvas requires a real Canvas context.
 */

/**
 * Render a QR code into `container` (a block element).
 * Clears any previous content, creates a <canvas>, and fills it.
 *
 * @param {HTMLElement} container - Parent element to render into
 * @param {string} text           - Text / URL to encode
 * @returns {Promise<void>}
 */
export function renderQR(container, text) {
  /* global QRCode */
  if (typeof QRCode === 'undefined') {
    return Promise.reject(new Error('QRCode ライブラリが読み込まれていません'));
  }

  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  return new Promise((resolve, reject) => {
    QRCode.toCanvas(canvas, text, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: 'L',
      color: {
        dark:  isDark ? '#e8eaed' : '#202124',
        light: isDark ? '#202124' : '#ffffff',
      },
    }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
