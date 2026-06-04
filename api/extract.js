// Vercel serverless function: production counterpart of the Vite dev middleware
// (server/extractPlugin.js). Vercel auto-discovers files under /api as Node
// functions. The browser sends only page images; this injects the server-held
// ANTHROPIC_API_KEY and forwards to Anthropic, so the key never reaches the
// client. Optionally gated by APP_PASSPHRASE.
//
// Note: Vercel caps the request body at 4.5 MB — the client (src/lib/extract.js)
// chunks large PDFs into batches to stay under it.

import { SYSTEM_PROMPT, MODEL } from '../server/prompt.js';
import { isAuthorized } from '../server/auth.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// Vision calls take ~10-40s; Hobby allows up to 300. Cap so a hung call doesn't
// burn the full window.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  // Passphrase gate (open if APP_PASSPHRASE is unset).
  const ok = await isAuthorized(req.headers['x-app-passphrase'], process.env.APP_PASSPHRASE);
  if (!ok) {
    res.status(401).json({ error: 'Unauthorized. Enter the app passphrase.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the server.' });
    return;
  }

  // Vercel parses application/json bodies into req.body automatically.
  const payload = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  const images = Array.isArray(payload?.images) ? payload.images : [];
  if (images.length === 0) {
    res.status(400).json({ error: 'No page images supplied.' });
    return;
  }

  const content = [
    ...images.map((img) => ({
      type: 'image',
      source: { type: 'base64', media_type: img.media_type || 'image/png', data: img.data },
    })),
    {
      type: 'text',
      text: 'Extract every distinct booking from these page images. Return ONLY the JSON array.',
    },
  ];

  try {
    const anthropicRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
      }),
    });

    const data = await anthropicRes.json();
    if (!anthropicRes.ok) {
      res
        .status(anthropicRes.status)
        .json({ error: data?.error?.message || `Anthropic API returned ${anthropicRes.status}` });
      return;
    }

    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    res.status(200).json({ text });
  } catch (err) {
    res.status(502).json({ error: `Failed to reach Anthropic API: ${err.message}` });
  }
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
