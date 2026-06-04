// Vercel serverless function: encrypted cloud-sync blob store.
//   GET /api/sync?bucket=<64hex>            -> { payload: <ciphertext|null> }
//   PUT /api/sync?bucket=<64hex> { payload } -> { ok: true }
// Stores only ciphertext (client-side encrypted). Gated by APP_PASSPHRASE.

import { handleSync } from '../server/syncCore.js';
import { kvCreds } from '../server/kv.js';

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  const bucket = req.query?.bucket;
  // Accessing req.body can throw on Vercel if the JSON body is malformed —
  // degrade to an empty body so handleSync returns a clean 400, not a 500.
  let body = null;
  try {
    body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  } catch {
    body = null;
  }
  const out = await handleSync({
    method: req.method,
    bucket,
    payload: body?.payload,
    headerPassphrase: req.headers['x-app-passphrase'],
    passphrase: process.env.APP_PASSPHRASE,
    creds: kvCreds(),
  });
  res.status(out.status).json(out.body);
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
