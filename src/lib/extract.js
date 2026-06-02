import { pdfToImages } from './pdf.js';
import { normalizeBooking } from './bookings.js';

/**
 * Pull a JSON array out of the model's text response. Tolerates accidental
 * prose or ```json fences even though the prompt forbids them.
 */
function parseBookingArray(text) {
  if (!text) throw new Error('Empty response from the model.');

  let cleaned = text.trim();

  // Strip a leading/trailing markdown code fence if present.
  const fence = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) cleaned = fence[1].trim();

  // Fall back to slicing out the outermost [ ... ] if there's stray text.
  const tryParse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };

  let data = tryParse(cleaned);
  if (data === undefined) {
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start !== -1 && end > start) {
      data = tryParse(cleaned.slice(start, end + 1));
    }
  }

  if (data === undefined) {
    throw new Error('Could not parse JSON from the model response.');
  }
  if (!Array.isArray(data)) {
    throw new Error('Model did not return a JSON array.');
  }
  return data;
}

/**
 * Render a PDF File to images, send to the dev proxy, and return normalized
 * bookings. Throws with a friendly message on any failure (caller shows a
 * retry UI).
 */
export async function extractBookingsFromPdf(file) {
  let images;
  try {
    images = await pdfToImages(file);
  } catch (err) {
    throw new Error(`Couldn't read this PDF (${err.message || 'render failed'}).`);
  }
  if (!images.length) {
    throw new Error('This PDF has no readable pages.');
  }

  const res = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images }),
  });

  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new Error('The extraction server returned an unreadable response.');
  }

  if (!res.ok) {
    throw new Error(payload?.error || `Extraction failed (HTTP ${res.status}).`);
  }

  const bookings = parseBookingArray(payload.text).map(normalizeBooking);
  return bookings;
}
