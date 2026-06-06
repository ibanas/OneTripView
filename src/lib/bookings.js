// Booking data model, normalization, and derived-summary helpers.

import { distinctPeople } from './people.js';
import { cleanPlace } from './geocode.js';

export const BOOKING_TYPES = ['flight', 'hotel', 'airbnb', 'place', 'other'];

// Every booking/place belongs to a trip. Legacy data (and anything that arrives
// without a tripId) defaults to this FIXED id so independent devices converge on
// the same migrated trip instead of forking.
export const DEFAULT_TRIP_ID = 'trip-default';

export const TYPE_LABELS = {
  flight: 'Flight',
  hotel: 'Hotel',
  airbnb: 'Rental',
  place: 'Place',
  other: 'Other',
};

// Categories for "places to check" (restaurants, sights, events…).
export const PLACE_CATEGORIES = ['restaurant', 'cafe', 'sight', 'event', 'shop', 'other'];

export const CATEGORY_LABELS = {
  restaurant: 'Restaurant',
  cafe: 'Café / Bar',
  sight: 'Sight',
  event: 'Event',
  shop: 'Shop',
  other: 'Other',
};

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `b_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Coerce anything the model (or a manual add) gives us into a clean booking. */
export function normalizeBooking(raw = {}) {
  const type = BOOKING_TYPES.includes(raw.type) ? raw.type : 'other';
  const travelers = Array.isArray(raw.travelers)
    ? raw.travelers.map((t) => String(t).trim()).filter(Boolean)
    : [];

  return {
    id: raw.id || newId(),
    tripId: str(raw.tripId) || DEFAULT_TRIP_ID,
    type,
    title: str(raw.title) || 'Untitled booking',
    location: str(raw.location) || '',
    startDate: dateStr(raw.startDate),
    startTime: timeStr(raw.startTime),
    endDate: dateStr(raw.endDate),
    endTime: timeStr(raw.endTime),
    travelers: dedupeNames(travelers),
    confirmationNumber: str(raw.confirmationNumber) || null,
    notes: str(raw.notes) || null,
    // "Place" fields (only meaningful for type 'place', harmless otherwise).
    url: urlStr(raw.url),
    category: PLACE_CATEGORIES.includes(raw.category) ? raw.category : 'other',
    lat: numOrNull(raw.lat),
    lng: numOrNull(raw.lng),
    image: urlStr(raw.image),
    address: str(raw.address) || null,
    // Google Places enrichment (populated lazily, then synced so it's fetched
    // at most once per place across all devices).
    placeId: str(raw.placeId) || null,
    rating: numOrNull(raw.rating),
    hours: strArrOrNull(raw.hours),
    website: urlStr(raw.website),
    imageAttribution: str(raw.imageAttribution) || null,
    // Set once Google details have been fetched (even if empty) so we never
    // re-bill the Enterprise tier for the same place.
    detailsFetchedAt: str(raw.detailsFetchedAt) || null,
    // Sync metadata: updatedAt orders per-id merges; deleted is a tombstone so
    // deletions propagate across devices (filtered out of the UI). Data that
    // predates this field gets an epoch sentinel so any real edit/delete (which
    // stamps a current time) always wins the merge — never the load time.
    updatedAt: str(raw.updatedAt) || '1970-01-01T00:00:00.000Z',
    deleted: raw.deleted === true,
  };
}

export function emptyBooking() {
  return normalizeBooking({
    type: 'flight',
    title: '',
    location: '',
    startDate: '',
    travelers: [],
    updatedAt: new Date().toISOString(), // a real creation time, not the epoch sentinel
  });
}

/** A blank "place to check", optionally pre-bound to a destination city. */
export function emptyPlace(city = '') {
  return normalizeBooking({
    type: 'place',
    title: '',
    location: city,
    category: 'other',
    startDate: '',
    updatedAt: new Date().toISOString(),
  });
}

function str(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

// Keep only YYYY-MM-DD; anything else becomes '' (sorts last / shows "No date").
function dateStr(v) {
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

// Keep only HH:MM; otherwise null.
function timeStr(v) {
  const s = str(v);
  return /^\d{2}:\d{2}$/.test(s) ? s : null;
}

// Keep only http/https URLs (blocks javascript:/data: from reaching an href).
function urlStr(v) {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? s : null;
  } catch {
    return null;
  }
}

function numOrNull(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// Keep an array of non-empty strings (e.g. opening-hours lines), else null.
function strArrOrNull(v) {
  if (!Array.isArray(v)) return null;
  const out = v.map((s) => str(s)).filter(Boolean);
  return out.length ? out : null;
}

/** Case-insensitive de-dupe that preserves the first-seen spelling. */
export function dedupeNames(names) {
  const seen = new Map();
  for (const n of names) {
    const key = n.toLowerCase();
    if (!seen.has(key)) seen.set(key, n);
  }
  return [...seen.values()];
}

/** Chronological sort key. Bookings with no date sort to the end. */
function sortKey(b) {
  if (!b.startDate) return '9999-99-99 99:99';
  return `${b.startDate} ${b.startTime || '99:99'}`;
}

export function sortBookings(bookings) {
  return [...bookings].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

/** Group sorted bookings by their start date (ISO string, '' => "No date"). */
export function groupByDate(bookings) {
  const sorted = sortBookings(bookings);
  const groups = [];
  const index = new Map();
  for (const b of sorted) {
    const key = b.startDate || 'nodate';
    if (!index.has(key)) {
      const group = { key, date: b.startDate || '', items: [] };
      index.set(key, group);
      groups.push(group);
    }
    index.get(key).items.push(b);
  }
  return groups;
}

function nightsBetween(start, end) {
  if (!start || !end) return 0;
  const ms = new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`);
  const n = Math.round(ms / 86_400_000);
  return n > 0 ? n : 0;
}

/** Trip-wide summary shown in the header. `resolver` collapses name aliases. */
export function summarize(bookings, resolver) {
  // Places don't define the trip's date span, even when scheduled.
  const dated = bookings.filter((b) => b.startDate && b.type !== 'place');
  const dates = dated
    .flatMap((b) => [b.startDate, b.endDate])
    .filter(Boolean)
    .sort();

  const flights = bookings.filter((b) => b.type === 'flight').length;
  const stays = bookings.filter(
    (b) => b.type === 'hotel' || b.type === 'airbnb'
  ).length;

  const nights = bookings
    .filter((b) => b.type === 'hotel' || b.type === 'airbnb')
    .reduce((sum, b) => sum + nightsBetween(b.startDate, b.endDate), 0);

  const places = bookings.filter((b) => b.type === 'place').length;
  const people = resolver ? distinctPeople(bookings, resolver) : [];

  return {
    tripStart: dates[0] || null,
    tripEnd: dates[dates.length - 1] || null,
    flights,
    stays,
    nights,
    places,
    people, // [{ key, name, aliases }]
    total: bookings.length,
  };
}

/** Group places by their destination city (city-less → "Unsorted"). */
export function groupPlacesByCity(places) {
  const groups = [];
  const index = new Map();
  for (const p of places) {
    const city = placeParts(p.location).name || 'Unsorted';
    const key = city.toLowerCase();
    if (!index.has(key)) {
      const group = { key, city, items: [] };
      index.set(key, group);
      groups.push(group);
    }
    index.get(key).items.push(p);
  }
  for (const g of groups) g.items.sort((a, b) => a.title.localeCompare(b.title));
  groups.sort((a, b) => a.city.localeCompare(b.city));
  return groups;
}

// ---- Location / route parsing (for the route strip and map) ----

const ARROW = /\s*(?:→|->|—>|–>|—|–|>)\s*/;

/** Split a flight location "A → B" into [origin, destination] (best effort). */
export function splitRoute(location) {
  const parts = String(location || '')
    .split(ARROW)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length >= 2 ? [parts[0], parts[parts.length - 1]] : parts;
}

/** "Toronto (YYZ)" -> { name: "Toronto", code: "YYZ" }. */
export function placeParts(raw) {
  const code = (String(raw || '').match(/\(([A-Za-z]{3})\)/) || [])[1] || null;
  return { name: cleanPlace(raw) || String(raw || '').trim(), code: code ? code.toUpperCase() : null };
}

/**
 * Chronological list of trip stops for the map / route strip, with consecutive
 * duplicates collapsed. Returns [{ place, type, date }].
 */
export function tripStops(bookings) {
  const ordered = [];
  for (const b of sortBookings(bookings)) {
    if (b.type === 'place') continue; // places are standalone pins, not route nodes
    if (b.type === 'flight') {
      for (const seg of splitRoute(b.location)) ordered.push({ place: seg, type: 'flight', date: b.startDate });
    } else if (b.location) {
      ordered.push({ place: b.location, type: b.type, date: b.startDate });
    }
  }
  const stops = [];
  for (const s of ordered) {
    const key = cleanPlace(s.place).toLowerCase();
    if (!key) continue;
    const prev = stops[stops.length - 1];
    if (prev && cleanPlace(prev.place).toLowerCase() === key) continue;
    stops.push(s);
  }
  return stops;
}

/** Ordered city sequence for the route strip: [{ name, code, type }]. */
export function routeCities(bookings) {
  return tripStops(bookings).map((s) => ({ ...placeParts(s.place), type: s.type }));
}

/** Best guess at the trip's headline destination (for the hero photo). */
export function primaryDestination(bookings) {
  const stay = sortBookings(bookings).find(
    (b) => (b.type === 'hotel' || b.type === 'airbnb') && b.location
  );
  if (stay) return placeParts(stay.location).name;

  const flights = sortBookings(bookings).filter((b) => b.type === 'flight' && b.location);
  if (flights.length) {
    const segs = splitRoute(flights[flights.length - 1].location);
    if (segs.length) return placeParts(segs[segs.length - 1]).name;
  }
  const any = bookings.find((b) => b.location && b.type !== 'place');
  return any ? placeParts(any.location).name : null;
}
