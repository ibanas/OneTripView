// Shared passphrase check used by BOTH the Vite dev middleware and the Vercel
// serverless function. Uses only Web Crypto (globalThis.crypto.subtle), so it
// runs identically on Node 18+ and edge runtimes.
//
// Threat model: this is deterrence so random visitors can't spend your Anthropic
// budget — not bank-grade auth. Always serve over HTTPS. When no secret is
// configured, the endpoint is OPEN (handy for local dev).

async function sha256(value) {
  const data = new TextEncoder().encode(String(value));
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data));
}

// Constant-time compare of two equal-length byte arrays (no early return).
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * @param {string|null|undefined} provided  the value of the x-app-passphrase header
 * @param {string|null|undefined} secret     the configured APP_PASSPHRASE (server-only)
 * @returns {Promise<boolean>} true if allowed
 */
export async function isAuthorized(provided, secret) {
  if (!secret) return true; // no gate configured → open
  if (!provided) return false;
  // Hash both to a fixed 32 bytes so the compare is length-leak-free and the
  // primitive is portable across runtimes.
  const [a, b] = await Promise.all([sha256(provided), sha256(secret)]);
  return constantTimeEqual(a, b);
}
