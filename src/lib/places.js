// Smart-save link parsing for "places to check". Pure + browser-safe; the
// enrich() helper calls the optional /api/unfurl endpoint but fails silently so
// it never blocks adding a place.

import { getStoredPassphrase } from './passphrase.js';

const CATEGORY_KEYWORDS = [
  ['restaurant', /restaurant|trattoria|osteria|bistro|eatery|dining|menu|\bfood\b/i],
  ['cafe', /\b(cafe|caf%C3%A9|coffee|espresso|bar|pub|brewery|wine)\b/i],
  ['sight', /museum|gallery|park|garden|monument|cathedral|castle|tour|viewpoint|mirador|beach|attraction/i],
  ['event', /eventbrite|ticket|concert|festival|show|theatre|theater|event/i],
  ['shop', /\b(shop|store|market|mall|boutique)\b/i],
];

function guessCategory(haystack) {
  const s = String(haystack || '');
  // Skip the over-broad restaurant catch-all unless a real food word matches.
  if (/restaurant|trattoria|osteria|bistro|eatery|dining|menu|\bfood\b/i.test(s)) return 'restaurant';
  for (const [cat, re] of CATEGORY_KEYWORDS) {
    if (cat === 'restaurant') continue;
    if (re.test(s)) return cat;
  }
  return 'other';
}

function titleCase(s) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "https://www.timeoutmarket.com/lisboa" -> "Timeoutmarket". */
function domainName(host) {
  const labels = host.replace(/^www\./, '').split('.');
  const base = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
  return titleCase(base.replace(/[-_]+/g, ' '));
}

/** Pull a place name + coords out of a FULL Google Maps URL (pure). */
export function parseGmapsUrl(rawUrl) {
  const out = { name: null, lat: null, lng: null };
  try {
    const u = new URL(rawUrl);
    const path = decodeURIComponent(u.pathname);
    const m = path.match(/\/place\/([^/@]+)/);
    if (m) out.name = m[1].replace(/\+/g, ' ').trim();
    if (!out.name) {
      const q = u.searchParams.get('q') || u.searchParams.get('query');
      if (q && !/^-?\d+\.\d+,/.test(q)) out.name = q.split(',')[0].trim();
    }
    const at = rawUrl.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    const bang = rawUrl.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    const coords = bang || at;
    if (coords) {
      out.lat = parseFloat(coords[1]);
      out.lng = parseFloat(coords[2]);
    }
  } catch {
    /* malformed — leave nulls */
  }
  return out;
}

function isGmapsHost(host) {
  return /(^|\.)google\.[a-z.]+$/.test(host) || /(^|\.)maps\.google\.[a-z.]+$/.test(host);
}
function isShortMapsHost(host, path) {
  return host === 'maps.app.goo.gl' || (host === 'goo.gl' && path.startsWith('/maps'));
}

/**
 * Detect what a pasted link is, for prefilling the add form (synchronous, no
 * network). Returns { kind:'gmaps'|'web'|null, name?, lat?, lng?, category, short? }.
 */
export function detectLink(rawUrl) {
  const s = String(rawUrl || '').trim();
  if (!s) return { kind: null };
  let u;
  try {
    u = new URL(s);
  } catch {
    return { kind: null };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { kind: null };

  const host = u.hostname.toLowerCase();
  const path = u.pathname.toLowerCase();

  if (isShortMapsHost(host, path)) {
    return { kind: 'gmaps', short: true, category: 'other' };
  }
  if (isGmapsHost(host) && (path.includes('/maps') || u.searchParams.has('q'))) {
    const g = parseGmapsUrl(s);
    return {
      kind: 'gmaps',
      name: g.name || null,
      lat: g.lat,
      lng: g.lng,
      category: guessCategory(`${g.name || ''} ${s}`),
    };
  }
  return { kind: 'web', name: domainName(host), category: guessCategory(`${host}${path}`) };
}

export function isHttpUrl(s) {
  try {
    const u = new URL(String(s));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** A "open in maps" URL for a place — its own link if it's a maps link, else a search. */
export function mapsUrlFor(place) {
  if (place.url && detectLink(place.url).kind === 'gmaps') return place.url;
  if (place.lat != null && place.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  }
  const q = `${place.title || ''} ${place.location || ''}`.trim();
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

/**
 * Optional enrichment via the server unfurl endpoint. Resolves short maps links
 * and grabs a page title/photo. Fails silently (returns null) on 401/timeout/
 * error so it never blocks adding a place.
 */
export async function enrich(rawUrl) {
  if (!isHttpUrl(rawUrl)) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const pass = getStoredPassphrase();
    const res = await fetch('/api/unfurl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(pass ? { 'x-app-passphrase': pass } : {}) },
      body: JSON.stringify({ url: rawUrl }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}
