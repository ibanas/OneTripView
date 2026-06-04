// Tiny Upstash Redis REST helper, shared by the Vercel function (api/sync.js)
// and the Vite dev middleware (server/syncPlugin.js). No SDK — plain fetch().
//
// Credentials come from the Upstash-on-Vercel integration (KV_REST_API_*) or a
// direct Upstash setup (UPSTASH_REDIS_REST_*). For local dev, pull them into
// .env with `vercel env pull` (or paste them in).

export function kvCreds(env = {}) {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    env.KV_REST_API_URL ||
    env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    env.KV_REST_API_TOKEN ||
    env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token };
}

export function kvConfigured(env) {
  const { url, token } = kvCreds(env);
  return !!(url && token);
}

/** GET a string value, or null if the key is absent. */
export async function kvGet(creds, key) {
  const res = await fetch(`${creds.url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${creds.token}` },
  });
  if (!res.ok) throw new Error(`KV get failed (${res.status})`);
  const data = await res.json();
  return data.result == null ? null : data.result;
}

/** SET a string value (value goes in the body so any JSON/length is safe). */
export async function kvSet(creds, key, value, ttlSeconds) {
  const ttl = ttlSeconds ? `?EX=${ttlSeconds}` : '';
  const res = await fetch(`${creds.url}/set/${encodeURIComponent(key)}${ttl}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'text/plain' },
    body: value,
  });
  if (!res.ok) throw new Error(`KV set failed (${res.status})`);
  const data = await res.json();
  if (data.result !== 'OK') throw new Error('KV set did not return OK');
}
