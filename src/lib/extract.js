import { pdfToImages } from './pdf.js';
import { normalizeBooking } from './bookings.js';
import {
  getStoredPassphrase,
  clearStoredPassphrase,
  promptForPassphrase,
} from './passphrase.js';

// Keep each POST under the host's request-body limit (Vercel = 4.5 MB hard).
// We budget on the base64 payload; the JSON wrapper adds little on top.
const BATCH_BUDGET_BYTES = 3.6 * 1024 * 1024;

/**
 * Pull a JSON array out of the model's text response. Tolerates accidental
 * prose or ```json fences even though the prompt forbids them.
 */
function parseBookingArray(text) {
  if (!text) throw new Error('Empty response from the model.');
  let cleaned = text.trim();

  const fence = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) cleaned = fence[1].trim();

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
    if (start !== -1 && end > start) data = tryParse(cleaned.slice(start, end + 1));
  }

  if (data === undefined) throw new Error('Could not parse JSON from the model response.');
  if (!Array.isArray(data)) throw new Error('Model did not return a JSON array.');
  return data;
}

/**
 * Split images into batches that each stay under the body-size budget. Keeps as
 * few batches as possible so a single document's pages usually travel together.
 */
function batchImages(images) {
  const batches = [];
  let current = [];
  let size = 0;
  for (const img of images) {
    const cost = (img.data ? img.data.length : 0) + 64;
    if (current.length && size + cost > BATCH_BUDGET_BYTES) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(img);
    size += cost;
  }
  if (current.length) batches.push(current);
  return batches;
}

/** POST one batch of images; transparently handles the passphrase gate (401). */
async function postBatch(images) {
  const send = (passphrase) =>
    fetch('/api/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(passphrase ? { 'x-app-passphrase': passphrase } : {}),
      },
      body: JSON.stringify({ images }),
    });

  let res = await send(getStoredPassphrase());

  if (res.status === 401) {
    // A gate is configured — ask for the passphrase and retry once.
    const entered = promptForPassphrase();
    if (!entered) throw new Error('A passphrase is required to extract bookings.');
    res = await send(entered);
    if (res.status === 401) {
      clearStoredPassphrase();
      throw new Error('Wrong passphrase. Try again.');
    }
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new Error('The extraction server returned an unreadable response.');
  }
  if (!res.ok) throw new Error(payload?.error || `Extraction failed (HTTP ${res.status}).`);
  return parseBookingArray(payload.text);
}

/**
 * Render a PDF File to images, send to the proxy (chunked if large), and return
 * normalized bookings. Throws with a friendly message on any failure.
 */
export async function extractBookingsFromPdf(file) {
  let images;
  try {
    images = await pdfToImages(file);
  } catch (err) {
    throw new Error(`Couldn't read this PDF (${err.message || 'render failed'}).`);
  }
  if (!images.length) throw new Error('This PDF has no readable pages.');

  // Sequential so the passphrase is established on the first batch before the rest.
  const raw = [];
  for (const batch of batchImages(images)) {
    const part = await postBatch(batch);
    raw.push(...part);
  }

  // Stamp a real creation time so freshly extracted bookings win merges over any
  // untouched legacy data (which carries the epoch sentinel).
  const now = new Date().toISOString();
  return raw.map((b) => normalizeBooking({ ...b, updatedAt: now }));
}
