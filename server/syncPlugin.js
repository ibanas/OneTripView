import { handleSync } from './syncCore.js';
import { kvCreds } from './kv.js';

const MAX_BODY = 4_500_000; // mirror the platform/handler ceiling in dev

function readBody(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        req.destroy();
        resolve(''); // oversized → empty body → handler returns 400
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

/** Vite dev counterpart of api/sync.js so cloud sync works under `npm run dev`. */
export function syncPlugin(env = {}) {
  const passphrase = process.env.APP_PASSPHRASE || env.APP_PASSPHRASE;
  const creds = kvCreds(env);

  return {
    name: 'sync-middleware',
    configureServer(server) {
      server.middlewares.use('/api/sync', async (req, res) => {
        const url = new URL(req.originalUrl || req.url, 'http://localhost');
        const bucket = url.searchParams.get('bucket');

        let payload;
        if (req.method === 'PUT') payload = safeParse(await readBody(req))?.payload;

        const out = await handleSync({
          method: req.method,
          bucket,
          payload,
          headerPassphrase: req.headers['x-app-passphrase'],
          passphrase,
          creds,
        });
        res.statusCode = out.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(out.body));
      });
    },
  };
}
