// Destination photos. When a Google Maps key is configured we use a Google
// Places photo for the city; otherwise (or if Google has none) we fall back to
// the keyless Wikipedia REST "page summary" lead image, then to a deterministic
// gradient when offline / on 404 / when nothing has a photo. Cached in memory +
// localStorage. Google photos carry an attribution string that callers display.

import { useEffect, useState } from 'react';
import { cleanPlace } from './geocode.js';
import { searchCityPhoto } from './googlePlaces.js';
import { placesAvailable } from './googleMaps.js';

const CACHE_PREFIX = 'itinerary.photo.v2:';
const mem = new Map(); // city -> { src, attribution, title } | null

function hashHue(str) {
  let h = 0;
  const s = String(str || 'city');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Stable CSS gradient for a place — used as a fallback background. */
export function gradientFor(place) {
  const h = hashHue(place);
  return `linear-gradient(135deg, hsl(${h} 68% 52%), hsl(${(h + 38) % 360} 64% 42%))`;
}

function readCache(key) {
  if (mem.has(key)) return mem.get(key);
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (raw) {
      const val = JSON.parse(raw);
      mem.set(key, val);
      return val;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function writeCache(key, val) {
  mem.set(key, val);
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(val));
  } catch {
    /* ignore quota */
  }
}

// In-flight requests per city key, so that when many cards for the same city
// mount at once (hero + several stays/places) we make ONE request — not N. This
// matters for the billed Google photo path: without it, a first paint with K
// same-city cards fires K Enterprise searchByText calls before the cache lands.
const inflight = new Map();

async function fetchCityImage(place) {
  const city = cleanPlace(place);
  if (!city) return null;
  const key = city.toLowerCase();

  const cached = readCache(key);
  if (cached !== undefined) return cached;
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    // 1) Google Places photo (when a key is configured). A miss/throw falls
    // through to Wikipedia so we still try for a photo.
    if (placesAvailable()) {
      try {
        const g = await searchCityPhoto(city);
        if (g && g.src) {
          writeCache(key, g);
          return g;
        }
      } catch {
        /* fall through to Wikipedia */
      }
    }

    // 2) Wikipedia lead image (keyless fallback).
    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(city)}`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'Api-User-Agent': 'TravelItinerary/1.0 (local app)' },
      });
      if (!res.ok) {
        // 404 = no such page (permanent miss → cache it). 429/5xx are transient —
        // don't cache, so a later render retries.
        if (res.status === 404) writeCache(key, null);
        return null;
      }
      const data = await res.json();
      const src = data?.originalimage?.source ?? data?.thumbnail?.source ?? null;
      const result = src ? { src, attribution: null, title: data?.title || city } : null;
      writeCache(key, result);
      return result;
    } catch {
      return null; // offline — don't cache, allow retry
    }
  })();

  inflight.set(key, p);
  try {
    return await p;
  } finally {
    // Drop it so transient failures (uncached above) can retry on a later render.
    inflight.delete(key);
  }
}

/**
 * React hook: returns { src, attribution, title } once loaded, or null while
 * loading / when unavailable. `attribution` is a Google photo author display
 * name (a string, or null for Wikipedia/none) — NOT a URL. Callers use
 * gradientFor(place) as the fallback.
 */
export function useCityImage(place) {
  const [img, setImg] = useState(() => {
    const city = cleanPlace(place).toLowerCase();
    const c = city ? mem.get(city) : undefined;
    return c ?? null;
  });

  useEffect(() => {
    let alive = true;
    // Drop the previous place's photo immediately so we never paint the wrong
    // city; show its cached value if we already have one, else the gradient.
    const key = cleanPlace(place).toLowerCase();
    setImg(key ? mem.get(key) ?? null : null);
    fetchCityImage(place)
      .then((r) => alive && setImg(r))
      .catch(() => alive && setImg(null));
    return () => {
      alive = false;
    };
  }, [place]);

  return img;
}
