// Keyless, browser-callable geocoding via the Open-Meteo Geocoding API
// (CORS-enabled, no key). Results are cached in localStorage so repeated map
// renders are offline and we stay well under rate limits. Falls back to
// Nominatim, then gives up gracefully (caller hides the map / shows a notice).

const CACHE_PREFIX = 'itinerary.geo.v1:';

/** "Toronto (YYZ)" -> "Toronto"; collapse whitespace. */
export function cleanPlace(raw) {
  return String(raw || '')
    .replace(/\s*\([^)]*\)\s*/g, ' ') // drop airport codes etc.
    .replace(/\s+/g, ' ')
    .trim();
}

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function cacheSet(key, value) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

async function fromOpenMeteo(q) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    q
  )}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`geocoding ${res.status}`);
  const data = await res.json();
  const r = data.results && data.results[0];
  if (!r) return null;
  return { lat: r.latitude, lon: r.longitude, name: r.name, country: r.country || null };
}

async function fromNominatim(q) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    q
  )}&format=jsonv2&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const data = await res.json();
  if (!data[0]) return null;
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    name: data[0].display_name,
    country: null,
  };
}

/**
 * Resolve a place string to { lat, lon, name, country } or null.
 * `null` is cached too (so we don't re-query a place that has no match), but a
 * network error is NOT cached (so it retries when back online).
 */
export async function geocode(rawPlace) {
  const q = cleanPlace(rawPlace);
  if (!q) return null;

  const key = q.toLowerCase();
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  let coords = null;
  try {
    coords = await fromOpenMeteo(q);
  } catch {
    try {
      coords = await fromNominatim(q);
    } catch {
      return null; // offline / both failed — don't cache, allow retry later
    }
  }

  cacheSet(key, coords); // cache the result, including a genuine null "no match"
  return coords;
}
