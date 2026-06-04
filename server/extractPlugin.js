import { SYSTEM_PROMPT, MODEL } from './prompt.js';
import { isAuthorized } from './auth.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MAX_BODY_BYTES = 64 * 1024 * 1024; // 64 MB — multi-page PDFs as base64 images get large

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Invalid JSON in request body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(body);
}

/**
 * Vite plugin: exposes POST /api/extract during `vite dev`.
 * The browser sends only page images; this middleware injects the
 * ANTHROPIC_API_KEY (read from the environment) and forwards the request to
 * the Anthropic API. The key therefore never reaches client code.
 *
 * Request body:  { "images": [ { "media_type": "image/png", "data": "<base64>" } ] }
 * Response body: { "text": "<model output — a JSON array as a string>" }
 */
export function anthropicExtractPlugin(env = {}) {
  // Accept the key from the real process environment first, then from any
  // Vite-loaded .env value passed in.
  const apiKey = process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY;
  const passphrase = process.env.APP_PASSPHRASE || env.APP_PASSPHRASE;

  return {
    name: 'anthropic-extract-middleware',
    configureServer(server) {
      server.middlewares.use('/api/extract', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
          return;
        }

        // Passphrase gate (open if APP_PASSPHRASE is unset).
        if (!(await isAuthorized(req.headers['x-app-passphrase'], passphrase))) {
          sendJson(res, 401, { error: 'Unauthorized. Enter the app passphrase.' });
          return;
        }

        if (!apiKey) {
          sendJson(res, 500, {
            error:
              'ANTHROPIC_API_KEY is not set on the server. Set it in your environment (or a .env file) and restart the dev server.',
          });
          return;
        }

        let payload;
        try {
          payload = await readJsonBody(req);
        } catch (err) {
          sendJson(res, 400, { error: err.message });
          return;
        }

        const images = Array.isArray(payload?.images) ? payload.images : [];
        if (images.length === 0) {
          sendJson(res, 400, { error: 'No page images supplied.' });
          return;
        }

        const content = [
          ...images.map((img) => ({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.media_type || 'image/png',
              data: img.data,
            },
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
            sendJson(res, anthropicRes.status, {
              error:
                data?.error?.message ||
                `Anthropic API returned ${anthropicRes.status}`,
            });
            return;
          }

          // Concatenate all text blocks from the model's response.
          const text = (data.content || [])
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('')
            .trim();

          sendJson(res, 200, { text });
        } catch (err) {
          sendJson(res, 502, {
            error: `Failed to reach Anthropic API: ${err.message}`,
          });
        }
      });
    },
  };
}
