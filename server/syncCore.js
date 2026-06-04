// Shared request logic for the encrypted cloud-sync blob store. Used by both
// api/sync.js (Vercel) and server/syncPlugin.js (Vite dev). The server only
// ever stores an opaque ciphertext string, addressed by a 64-hex bucket key.

import { kvGet, kvSet } from './kv.js';
import { isAuthorized } from './auth.js';

const TTL_SECONDS = 60 * 60 * 24 * 180; // 180 days
// Stay under Vercel's hard ~4.5 MB request-body limit so we return our own
// friendly 413 before the platform's opaque one (and dev matches prod).
const MAX_PAYLOAD = 4_000_000;

export async function handleSync({ method, bucket, payload, headerPassphrase, passphrase, creds }) {
  if (!(await isAuthorized(headerPassphrase, passphrase))) {
    return { status: 401, body: { error: 'Unauthorized. Enter the app passphrase.' } };
  }
  if (!creds.url || !creds.token) {
    return {
      status: 503,
      body: { error: 'Cloud sync is not configured on the server (no KV store connected).' },
    };
  }
  if (!bucket || !/^[a-f0-9]{64}$/.test(bucket)) {
    return { status: 400, body: { error: 'Invalid sync bucket.' } };
  }

  const key = `trip:${bucket}`;

  try {
    if (method === 'GET') {
      const result = await kvGet(creds, key);
      return { status: 200, body: { payload: result } }; // payload null if nothing stored yet
    }
    if (method === 'PUT') {
      if (typeof payload !== 'string' || payload.length === 0) {
        return { status: 400, body: { error: 'Missing payload.' } };
      }
      if (payload.length > MAX_PAYLOAD) {
        return { status: 413, body: { error: 'Sync payload too large.' } };
      }
      await kvSet(creds, key, payload, TTL_SECONDS);
      return { status: 200, body: { ok: true } };
    }
    return { status: 405, body: { error: 'Method not allowed.' } };
  } catch (err) {
    return { status: 502, body: { error: `Sync storage error: ${err.message}` } };
  }
}
