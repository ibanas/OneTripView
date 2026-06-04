// Booking data model, normalization, and derived-summary helpers.

import { distinctPeople } from './people.js';
import { cleanPlace } from './geocode.js';

export const BOOKING_TYPES = ['flight', 'hotel', 'airbnb', 'other'];

export const TYPE_LABELS = {
  flight: 'Flight',
  hotel: 'Hotel',
  airbnb: 'Rental',
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
  const dated = bookings.filter((b) => b.startDate);
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

  const people = resolver ? distinctPeople(bookings, resolver) : [];

  return {
    tripStart: dates[0] || null,
    tripEnd: dates[dates.length - 1] || null,
    flights,
    stays,
    nights,
    people, // [{ key, name, aliases }]
    total: bookings.length,
  };
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
  const any = bookings.find((b) => b.location);
  return any ? placeParts(any.location).name : null;
}
