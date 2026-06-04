import { normalizeBooking } from './bookings.js';
import { DEFAULT_PEOPLE } from './people.js';
import { normalizeTrip } from './trips.js';

const KEY = 'itinerary.bookings.v1';
const PEOPLE_KEY = 'itinerary.people.v1';
const PEOPLE_TS_KEY = 'itinerary.people_ts.v1';
const TRIPS_KEY = 'itinerary.trips.v1';
const TRIPS_TS_KEY = 'itinerary.trips_ts.v1';
const ACTIVE_TRIP_KEY = 'itinerary.activeTrip.v1';

export function loadBookings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeBooking);
  } catch {
    return [];
  }
}

export function saveBookings(bookings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(bookings));
  } catch {
    // Quota or serialization error — non-fatal; state still lives in memory.
  }
}

/**
 * People (name-alias) registry. Seeded with DEFAULT_PEOPLE on first run so the
 * user's known aliases merge immediately; afterwards their edits persist.
 */
export function loadPeople() {
  try {
    const raw = localStorage.getItem(PEOPLE_KEY);
    if (raw === null) return DEFAULT_PEOPLE.map((p) => ({ ...p, aliases: [...p.aliases] }));
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Keep only well-formed entries.
    return parsed
      .filter((p) => p && typeof p.id === 'string' && Array.isArray(p.aliases))
      .map((p) => ({ id: p.id, name: String(p.name || '').trim(), aliases: p.aliases.map(String) }));
  } catch {
    return [];
  }
}

export function savePeople(people) {
  try {
    localStorage.setItem(PEOPLE_KEY, JSON.stringify(people));
  } catch {
    /* ignore quota */
  }
}

// Timestamp of the last people-registry change (for cross-device merge).
export function loadPeopleTs() {
  try {
    return localStorage.getItem(PEOPLE_TS_KEY) || '';
  } catch {
    return '';
  }
}

export function savePeopleTs(ts) {
  try {
    localStorage.setItem(PEOPLE_TS_KEY, ts);
  } catch {
    /* ignore */
  }
}

// ---- Trips registry ----
export function loadTrips() {
  try {
    const raw = localStorage.getItem(TRIPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t) => t && t.id).map(normalizeTrip);
  } catch {
    return [];
  }
}

export function saveTrips(trips) {
  try {
    localStorage.setItem(TRIPS_KEY, JSON.stringify(trips));
  } catch {
    /* ignore quota */
  }
}

export function loadTripsTs() {
  try {
    return localStorage.getItem(TRIPS_TS_KEY) || '';
  } catch {
    return '';
  }
}

export function saveTripsTs(ts) {
  try {
    localStorage.setItem(TRIPS_TS_KEY, ts);
  } catch {
    /* ignore */
  }
}

// The active trip is per-DEVICE UI state (which trip you're viewing) — not synced.
export function loadActiveTripId() {
  try {
    return localStorage.getItem(ACTIVE_TRIP_KEY) || null;
  } catch {
    return null;
  }
}

export function saveActiveTripId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_TRIP_KEY, id);
    else localStorage.removeItem(ACTIVE_TRIP_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Ask the browser to mark our storage "persistent" so it isn't evicted under
 * pressure (matters most for installed PWAs on iOS/Android). Best-effort; safe
 * to call on every startup.
 */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      if (!already) return await navigator.storage.persist();
      return true;
    }
  } catch {
    /* not supported — ignore */
  }
  return false;
}
