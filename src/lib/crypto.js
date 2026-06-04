// End-to-end encryption for cloud sync, using only WebCrypto (secure context:
// HTTPS or localhost). The server never sees the sync code, the derived key, or
// the plaintext — only ciphertext addressed by a non-secret bucket key.

const enc = new TextEncoder();
const dec = new TextDecoder();

// Chunked so large blobs don't blow the call stack via String.fromCharCode(...).
const toB64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
};
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toHex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export function cryptoAvailable() {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

// Deterministic salt so every device with the same code derives the same key.
const SALT_TAG = 'OneTripView.sync.v1|';
const BUCKET_TAG = 'OneTripView.bucket.v1|';
const ITERATIONS = 600_000;

let cache = { code: null, key: null };
let bucketCache = { code: null, bucket: null };

async function pbkdf2Base(code) {
  return crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, [
    'deriveKey',
    'deriveBits',
  ]);
}

/**
 * Public addressing key for the server. Derived from the SAME 600k-iteration
 * PBKDF2 stretch (different salt) so a leaked bucket can't be a cheap
 * brute-force oracle for the code — mapping bucket→code still costs 600k iters,
 * just like the encryption key.
 */
export async function bucketKeyFromCode(code) {
  const c = code.trim();
  if (bucketCache.code === c && bucketCache.bucket) return bucketCache.bucket;
  const baseKey = await pbkdf2Base(c);
  const salt = await crypto.subtle.digest('SHA-256', enc.encode(BUCKET_TAG + c));
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new Uint8Array(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    256
  );
  const bucket = toHex(bits); // 64-char hex, safe in a URL
  bucketCache = { code: c, bucket };
  return bucket;
}

async function deriveAesKey(code) {
  const c = code.trim();
  if (cache.code === c && cache.key) return cache.key;
  const baseKey = await pbkdf2Base(c);
  const salt = await crypto.subtle.digest('SHA-256', enc.encode(SALT_TAG + c));
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  cache = { code: c, key }; // ~100ms derive — do it once per session
  return key;
}

/** encrypt(plaintext, code) -> base64( iv(12) ‖ ciphertext+tag ). */
export async function encrypt(plaintext, code) {
  const key = await deriveAesKey(code);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // fresh per call — never reuse
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return toB64(out);
}

/** decrypt(payload, code) -> plaintext. Throws on wrong code / tampering. */
export async function decrypt(payload, code) {
  const key = await deriveAesKey(code);
  const raw = fromB64(payload);
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return dec.decode(pt);
}

// Friendly, high-entropy sync code (the deterministic salt means a weak code
// would be brute-forceable, so we generate a strong one). ~5 groups of 4 from a
// no-look-alike alphabet ≈ 100 bits.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateSyncCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
    if (i % 4 === 3 && i !== bytes.length - 1) out += '-';
  }
  return out; // e.g. "K7QF-3MNP-9XRT-2WHJ-6BCD"
}
