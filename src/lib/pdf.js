import * as pdfjsLib from 'pdfjs-dist';
// Vite resolves this to a hashed URL and serves the worker as a separate file.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Anthropic recommends a long edge around 1568px; we target ~1600 for legible
// text without bloating the base64 payload.
const TARGET_LONG_EDGE = 1600;
const MAX_PAGES = 15;

/**
 * Render a PDF File into an array of base64 page images suitable for the
 * Anthropic API.
 * @returns {Promise<Array<{ media_type: string, data: string }>>}
 */
export async function pdfToImages(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  const images = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);

    // Scale so the long edge lands near TARGET_LONG_EDGE, never downscaling
    // below 1x (small pages stay crisp).
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(
      2.5,
      Math.max(1, TARGET_LONG_EDGE / Math.max(base.width, base.height))
    );
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    // White background so transparent PDFs don't render as black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // v6 prefers the `canvas` param; `canvasContext` is kept for compatibility.
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    images.push({ media_type: 'image/jpeg', data: dataUrl.split(',')[1] });

    // Release page resources before the next iteration.
    page.cleanup();
  }

  return images;
}
