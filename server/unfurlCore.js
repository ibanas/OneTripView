// Optional "unfurl" enrichment for places: resolve short Google Maps links and
// pull a page title/photo. Server-side (avoids browser CORS) and gated by
// APP_PASSPHRASE. Strictly best-effort — returns {} on any problem so the
// client's smart-save path is never blocked.
//
// SECURITY: this fetches a user-supplied URL, so it is an SSRF surface. We allow
// only http/https, and on EVERY hop we (1) reject private/loopback/link-local/
// ULA/metadata IP literals (IPv4, IPv6, and IPv4-mapped IPv6), (2) reject
// localhost/.local/.internal names, and (3) DNS-resolve hostnames and reject if
// ANY resolved address is private. Redirects are followed manually so each hop
// is re-validated. Residual risk: DNS rebinding (a name that resolves public at
// check time and private at connect time) is not fully closed without pinning
// the socket to the validated IP — acceptable for a personal, passphrase-gated
// tool; flagged for review.

import net from 'node:net';
import { lookup } from 'node:dns/promises';
import { isAuthorized } from './auth.js';

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 5000;
const MAX_BYTES = 262_144; // 256 KB of HTML is plenty for <head> metadata

export function isPrivateIPv4(ip) {
  const m = String(ip).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return true; // malformed → treat as unsafe
  const [a, b] = o;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) || // link-local incl. 169.254.169.254 metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    a >= 224 // multicast / reserved
  );
}

// Expand any IPv6 literal (incl. :: and IPv4-mapped dotted tails) to 16 bytes.
function ipv6ToBytes(str) {
  let s = String(str).toLowerCase();
  const dm = s.match(/:((?:\d{1,3}\.){3}\d{1,3})$/); // IPv4 dotted tail
  if (dm) {
    const v4 = dm[1].split('.').map(Number);
    if (v4.some((n) => n > 255)) return null;
    const hexTail = `${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
    s = s.slice(0, s.length - dm[1].length) + hexTail;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : null;
  let groups;
  if (tail === null) {
    groups = head;
  } else {
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    groups = [...head, ...new Array(fill).fill('0'), ...tail];
  }
  if (groups.length !== 8) return null;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    if (!/^[0-9a-f]{1,4}$/.test(groups[i])) return null;
    const v = parseInt(groups[i], 16);
    bytes[i * 2] = (v >> 8) & 0xff;
    bytes[i * 2 + 1] = v & 0xff;
  }
  return bytes;
}

export function isPrivateIPv6(host) {
  const b = ipv6ToBytes(host);
  if (!b) return true; // unparseable literal → unsafe
  if (b.every((x) => x === 0)) return true; // :: unspecified
  if (b.slice(0, 15).every((x) => x === 0) && b[15] === 1) return true; // ::1 loopback
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7 ULA
  // IPv4-mapped ::ffff:0:0/96 and NAT64 64:ff9b::/96 → check embedded IPv4
  const mapped = b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff;
  const nat64 = b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b;
  if (mapped || nat64) return isPrivateIPv4(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`);
  return false;
}

function isPrivateIp(ip, family) {
  const fam = family || net.isIP(ip);
  if (fam === 4) return isPrivateIPv4(ip);
  if (fam === 6) return isPrivateIPv6(ip);
  return true; // not an IP → caller shouldn't reach here
}

// Validate protocol + literal host. Returns { u, host, isLiteral }. Throws if blocked.
export function assertSafeUrl(raw) {
  const u = new URL(raw);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('blocked protocol');
  const host = u.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '') // strip IPv6 brackets
    .replace(/\.$/, ''); // strip a trailing dot (localhost. etc.)
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error('blocked host');
  }
  const fam = net.isIP(host);
  if (fam !== 0 && isPrivateIp(host, fam)) throw new Error('blocked host');
  return { u, host, isLiteral: fam !== 0 };
}

// Fetch with manual redirect following; every hop is protocol/host/DNS-validated.
async function safeFetch(startUrl) {
  let current = startUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const { u, host, isLiteral } = assertSafeUrl(current);

    if (!isLiteral) {
      // Resolve the name and reject if ANY address is private (blocks a public
      // hostname that points at an internal IP).
      let addrs;
      try {
        addrs = await lookup(host, { all: true });
      } catch {
        throw new Error('dns failed');
      }
      if (!addrs.length) throw new Error('no addresses');
      for (const a of addrs) if (isPrivateIp(a.address, a.family)) throw new Error('blocked resolved ip');
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(u.toString(), {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {
          'user-agent': 'OneTripViewBot/1.0 (+itinerary unfurl)',
          accept: 'text/html,application/xhtml+xml',
        },
      });
    } finally {
      clearTimeout(timer);
    }
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (loc) {
      current = new URL(loc, u).toString();
      continue;
    }
    return { res, finalUrl: u.toString() };
  }
  throw new Error('too many redirects');
}

async function readCapped(res) {
  if (!res.body || !res.body.getReader) {
    const t = await res.text();
    return t.slice(0, MAX_BYTES);
  }
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  while (received < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    chunks.push(value);
  }
  try {
    await reader.cancel();
  } catch {
    /* ignore */
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

const decodeEntities = (s) =>
  String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

function metaContent(html, prop) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    'i'
  );
  const m = html.match(re) || html.match(alt);
  return m ? decodeEntities(m[1]) : null;
}

// Reverse-geocode coords to a street address via a FIXED public host (not user
// input, so no SSRF concern). Best-effort.
async function reverseGeocode(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { address: null, city: null };
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(
      lat
    )}&lon=${encodeURIComponent(lng)}&format=jsonv2&zoom=18&addressdetails=1`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'user-agent': 'OneTripView/1.0 (itinerary app)', accept: 'application/json' },
      });
      if (!res.ok) return { address: null, city: null };
      // Read the body while the abort timer is still armed, so a stalled/
      // trickling response can't hang past the 4s ceiling.
      const d = await res.json();
      const a = d.address || {};
      const city = a.city || a.town || a.village || a.municipality || a.suburb || null;
      return { address: d.display_name || null, city };
    } finally {
      clearTimeout(t);
    }
  } catch {
    return { address: null, city: null };
  }
}

// Pull schema.org structured data (most restaurant/event pages embed it).
export function extractJsonLd(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  let count = 0;
  while ((m = re.exec(html)) && count < 8) {
    count += 1;
    try {
      const data = JSON.parse(m[1].trim());
      if (Array.isArray(data)) out.push(...data);
      else if (data && data['@graph']) out.push(...[].concat(data['@graph']));
      else if (data) out.push(data);
    } catch {
      /* skip malformed block */
    }
  }
  return out;
}

function formatAddress(addr) {
  if (!addr) return { address: null, city: null };
  if (typeof addr === 'string') return { address: addr.trim() || null, city: null };
  const get = (v) => (typeof v === 'string' ? v.trim() : '');
  const parts = [
    get(addr.streetAddress),
    get(addr.addressLocality),
    get(addr.addressRegion),
    get(addr.postalCode),
    get(addr.addressCountry),
  ].filter(Boolean);
  return { address: parts.join(', ') || null, city: get(addr.addressLocality) || null };
}

export function placeInfoFromJsonLd(objs) {
  for (const o of objs) {
    if (!o || typeof o !== 'object') continue;
    if (o.address) {
      const { address, city } = formatAddress(o.address);
      if (address) return { name: typeof o.name === 'string' ? o.name : null, address, city };
    }
    if (o.location && o.location.address) {
      const { address, city } = formatAddress(o.location.address);
      if (address) {
        const name =
          (typeof o.name === 'string' && o.name) ||
          (typeof o.location.name === 'string' && o.location.name) ||
          null;
        return { name, address, city };
      }
    }
  }
  for (const o of objs) if (o && typeof o.name === 'string') return { name: o.name, address: null, city: null };
  return { name: null, address: null, city: null };
}

function parseGmaps(url) {
  const out = { name: null, lat: null, lng: null, address: null };
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname);
    const pm = path.match(/\/place\/([^/@]+)/);
    if (pm) out.name = pm[1].replace(/\+/g, ' ').trim();
    const coords =
      url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) ||
      url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (coords) {
      out.lat = parseFloat(coords[1]);
      out.lng = parseFloat(coords[2]);
    }
    // Short links commonly resolve to /maps?q=Name, full address  (or q=lat,lng).
    const q = u.searchParams.get('q') || u.searchParams.get('query');
    if (q) {
      const cm = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (cm) {
        if (out.lat == null) {
          out.lat = parseFloat(cm[1]);
          out.lng = parseFloat(cm[2]);
        }
      } else {
        const parts = q.split(',').map((s) => s.trim()).filter(Boolean);
        if (!out.name && parts.length) out.name = parts[0];
        if (parts.length > 1) out.address = parts.slice(1).join(', ');
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

// Forward-geocode a place/address string to coords via the FIXED Nominatim host.
async function forwardGeocode(query) {
  const q = String(query || '').trim();
  if (!q) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      q
    )}&format=jsonv2&limit=1&addressdetails=1`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'OneTripView/1.0 (itinerary app)', accept: 'application/json' },
    });
    if (!res.ok) return null;
    const arr = await res.json();
    const d = Array.isArray(arr) ? arr[0] : null;
    if (!d) return null;
    const a = d.address || {};
    const city = a.city || a.town || a.village || a.municipality || a.suburb || null;
    return { lat: parseFloat(d.lat), lng: parseFloat(d.lon), address: d.display_name || null, city };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Resolve a URL into { kind, name?, lat?, lng?, image?, finalUrl } or null. */
export async function unfurl(targetUrl) {
  let res;
  let finalUrl;
  try {
    ({ res, finalUrl } = await safeFetch(targetUrl));
  } catch {
    return null;
  }
  if (!res.ok) return null;

  if (/google\.[a-z.]+\/maps|maps\.google\./i.test(finalUrl)) {
    const g = parseGmaps(finalUrl);
    let { name, lat, lng, address } = g;
    let city = null;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      // Have a pin → fill the address from it if the URL didn't carry one.
      const r = await reverseGeocode(lat, lng);
      if (!address) address = r.address;
      city = r.city;
    } else if (address || name) {
      // No pin in the URL (common for short links) → geocode the address/name.
      const fg = await forwardGeocode(address || name);
      if (fg) {
        lat = fg.lat;
        lng = fg.lng;
        city = fg.city;
        if (!address) address = fg.address;
      }
    }
    return { kind: 'gmaps', name, lat, lng, address, city, finalUrl };
  }

  const ctype = res.headers.get('content-type') || '';
  if (!ctype.includes('text/html')) return { kind: 'web', finalUrl };

  let html = '';
  try {
    html = await readCapped(res);
  } catch {
    return { kind: 'web', finalUrl };
  }

  const ld = placeInfoFromJsonLd(extractJsonLd(html));
  const titleTag = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1];
  const ogStreet = metaContent(html, 'business:contact_data:street_address');
  const ogCity = metaContent(html, 'business:contact_data:locality');
  return {
    kind: 'web',
    name: ld.name || metaContent(html, 'og:title') || (titleTag ? decodeEntities(titleTag) : null),
    image: metaContent(html, 'og:image'),
    address: ld.address || (ogStreet ? [ogStreet, ogCity].filter(Boolean).join(', ') : null),
    city: ld.city || ogCity || null,
    finalUrl,
  };
}

/** Shared request handler for the Vercel function + the Vite dev middleware. */
export async function handleUnfurl({ url, headerPassphrase, passphrase }) {
  if (!(await isAuthorized(headerPassphrase, passphrase))) {
    return { status: 401, body: { error: 'Unauthorized.' } };
  }
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return { status: 400, body: { error: 'Invalid URL.' } };
  }
  const result = await unfurl(url);
  return { status: 200, body: result || {} };
}
