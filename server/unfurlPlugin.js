import { handleUnfurl } from './unfurlCore.js';

function readBody(req, max = 16_384) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) {
        req.destroy();
        resolve('');
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Vite dev counterpart of api/unfurl.js so enrichment works under `npm run dev`. */
export function unfurlPlugin(env = {}) {
  const passphrase = process.env.APP_PASSPHRASE || env.APP_PASSPHRASE;
  return {
    name: 'unfurl-middleware',
    configureServer(server) {
      server.middlewares.use('/api/unfurl', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
          return;
        }
        const body = safeParse(await readBody(req));
        const out = await handleUnfurl({
          url: body?.url,
          headerPassphrase: req.headers['x-app-passphrase'],
          passphrase,
        });
        res.statusCode = out.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(out.body));
      });
    },
  };
}
