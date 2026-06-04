// Vercel serverless function: best-effort link enrichment for places.
//   POST /api/unfurl { url } -> { kind, name?, lat?, lng?, image?, finalUrl } | {}
// Gated by APP_PASSPHRASE. Never throws to the client (returns {} on failure).

import { handleUnfurl } from '../server/unfurlCore.js';

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }
  let body = null;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    body = null;
  }
  const out = await handleUnfurl({
    url: body?.url,
    headerPassphrase: req.headers['x-app-passphrase'],
    passphrase: process.env.APP_PASSPHRASE,
  });
  res.status(out.status).json(out.body);
}
