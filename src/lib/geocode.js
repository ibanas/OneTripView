// Geocoding (place string -> coordinates). When a Google Maps key is configured
// we use the Google Geocoder (client-side, under the same key); otherwise we use
// the keyless Open-Meteo API with a Nominatim fallback. Results are cached in
// localStorage so repeated map renders are offline and we stay under rate limits.
// On total failure we give up gracefully (caller hides the map / shows a notice).

import { googleMapsKey, loadGeocoding } from './googleMaps.js';

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

// Memoized Google Geocoder (only created once a key is present + the lib loads).
let geocoderPromise = null;
function getGoogleGeocoder() {
  if (!geocoderPromise) {
    geocoderPromise = loadGeocoding()
      .then(({ Geocoder }) => new Geocoder())
      .catch((err) => {
        geocoderPromise = null; // allow a later retry
        throw err;
      });
  }
  return geocoderPromise;
}

// Pull the best "city" name out of a Google result's address components.
function localityFrom(result) {
  const comps = result.address_components || [];
  const pick = (type) => comps.find((c) => (c.types || []).includes(type))?.long_name;
  return (
    pick('locality') ||
    pick('postal_town') ||
    pick('administrative_area_level_2') ||
    pick('administrative_area_level_1') ||
    result.formatted_address ||
    null
  );
}

async function fromGoogle(q) {
  if (!googleMapsKey()) return null;
  const geocoder = await getGoogleGeocoder();
  let results;
  try {
    ({ results } = await geocoder.geocode({ address: q }));
  } catch {
    return null; // ZERO_RESULTS / OVER_QUERY_LIMIT etc. — fall through to OSM
  }
  const r = results && results[0];
  if (!r) return null;
  const loc = r.geometry.location;
  const country = (r.address_components || []).find((c) => (c.types || []).includes('country'));
  return {
    lat: loc.lat(),
    lon: loc.lng(),
    name: localityFrom(r) || q,
    country: country?.long_name || null,
  };
}

/** Reverse-geocode coords to a formatted address (Google only; null otherwise). */
export async function reverseGeocode(lat, lng) {
  if (!googleMapsKey() || lat == null || lng == null) return null;
  try {
    const geocoder = await getGoogleGeocoder();
    const { results } = await geocoder.geocode({ location: { lat, lng } });
    return results && results[0] ? results[0].formatted_address || null : null;
  } catch {
    return null;
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

  // Google first (when a key is set), then the keyless services. A Google miss
  // (null) still falls through to Open-Meteo/Nominatim so coverage never drops.
  let coords = null;
  if (googleMapsKey()) {
    try {
      coords = await fromGoogle(q);
    } catch {
      /* fall through to the keyless services */
    }
  }
  if (!coords) {
    try {
      coords = await fromOpenMeteo(q);
    } catch {
      try {
        coords = await fromNominatim(q);
      } catch {
        return null; // offline / all failed — don't cache, allow retry later
      }
    }
  }

  cacheSet(key, coords); // cache the result, including a genuine null "no match"
  return coords;
}
