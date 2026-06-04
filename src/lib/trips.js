// Trip registry: a lightweight entity that groups bookings/places into separate
// journeys. Trip metadata is tiny ({id,name,...}); date range / destination /
// counts are derived on the fly from the trip's bookings.

import { DEFAULT_TRIP_ID, summarize, primaryDestination } from './bookings.js';

const EPOCH = '1970-01-01T00:00:00.000Z';

export function newTripId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `t-${crypto.randomUUID()}`;
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newTrip(name) {
  const now = new Date().toISOString();
  return {
    id: newTripId(),
    name: String(name || '').trim() || 'Untitled trip',
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };
}

export function normalizeTrip(raw = {}) {
  return {
    id: String(raw.id || ''),
    name: String(raw.name || '').trim() || 'Untitled trip',
    createdAt: String(raw.createdAt || '') || EPOCH,
    updatedAt: String(raw.updatedAt || '') || EPOCH,
    deleted: raw.deleted === true,
  };
}

const tripIdOf = (b) => b.tripId || DEFAULT_TRIP_ID;

/** A sensible name for the migrated default trip. */
export function deriveTripName(bookings, resolver) {
  return primaryDestination(bookings) || 'My Trip';
}

/**
 * Idempotent + sync-safe: ensure the fixed DEFAULT_TRIP_ID trip exists when (and
 * only when) there are live bookings assigned to it. Uses the epoch sentinel for
 * timestamps so any real rename on any device wins the merge.
 */
export function ensureDefaultTrip(trips, bookings, resolver) {
  if (trips.some((t) => t.id === DEFAULT_TRIP_ID)) return trips; // exists (or tombstoned) — leave it
  const defaultBookings = bookings.filter((b) => !b.deleted && tripIdOf(b) === DEFAULT_TRIP_ID);
  if (defaultBookings.length === 0) return trips;
  return [
    ...trips,
    {
      id: DEFAULT_TRIP_ID,
      name: deriveTripName(defaultBookings, resolver),
      createdAt: EPOCH,
      updatedAt: EPOCH,
      deleted: false,
    },
  ];
}

/**
 * Safety net so a live booking is NEVER stranded under a deleted/missing trip
 * (which would make it invisible everywhere with no recovery). Idempotent:
 *  - Any live booking whose tripId resolves to no LIVE trip is re-homed to the
 *    default trip (stamped now so the move propagates).
 *  - The default trip is (re)created when live default-id bookings exist — using
 *    the epoch sentinel on first migration, or a CURRENT timestamp when reviving
 *    a tombstoned default so the revival wins the cross-device merge.
 * Returns the SAME array refs when nothing changed (so callers can skip setState).
 */
export function reconcileTrips(trips, bookings, resolver) {
  const liveIds = new Set(trips.filter((t) => !t.deleted).map((t) => t.id));

  let rehomed = false;
  const nextBookings = bookings.map((b) => {
    if (b.deleted) return b;
    const tid = b.tripId || DEFAULT_TRIP_ID;
    if (tid === DEFAULT_TRIP_ID || liveIds.has(tid)) return b; // ok, or handled below
    rehomed = true;
    return { ...b, tripId: DEFAULT_TRIP_ID, updatedAt: new Date().toISOString() };
  });
  const bookingsOut = rehomed ? nextBookings : bookings;

  const hasLiveDefaultBookings = bookingsOut.some(
    (b) => !b.deleted && (b.tripId || DEFAULT_TRIP_ID) === DEFAULT_TRIP_ID
  );
  const liveDefault = trips.find((t) => t.id === DEFAULT_TRIP_ID && !t.deleted);

  let tripsOut = trips;
  if (hasLiveDefaultBookings && !liveDefault) {
    const name = deriveTripName(
      bookingsOut.filter((b) => !b.deleted && (b.tripId || DEFAULT_TRIP_ID) === DEFAULT_TRIP_ID),
      resolver
    );
    const hadTombstone = trips.some((t) => t.id === DEFAULT_TRIP_ID);
    if (hadTombstone) {
      // Revive with a current timestamp so it beats the old tombstone in merges.
      const now = new Date().toISOString();
      tripsOut = trips.map((t) =>
        t.id === DEFAULT_TRIP_ID
          ? { id: DEFAULT_TRIP_ID, name, createdAt: t.createdAt || now, updatedAt: now, deleted: false }
          : t
      );
    } else {
      // First migration: epoch sentinel so a future rename always wins.
      tripsOut = [...trips, { id: DEFAULT_TRIP_ID, name, createdAt: EPOCH, updatedAt: EPOCH, deleted: false }];
    }
  }

  return { trips: tripsOut, bookings: bookingsOut };
}

function todayIso() {
  const n = new Date();
  const m = String(n.getMonth() + 1).padStart(2, '0');
  const d = String(n.getDate()).padStart(2, '0');
  return `${n.getFullYear()}-${m}-${d}`;
}

function isPastDate(endIso) {
  return !!endIso && endIso < todayIso();
}

/** One display card per (non-deleted) trip, with derived dates/destination/counts. */
export function tripsWithDerived(trips, bookings, resolver) {
  const live = bookings.filter((b) => !b.deleted);
  return trips
    .filter((t) => !t.deleted)
    .map((t) => {
      const tb = live.filter((b) => tripIdOf(b) === t.id);
      const summary = summarize(tb, resolver);
      return {
        id: t.id,
        name: t.name,
        tripStart: summary.tripStart,
        tripEnd: summary.tripEnd,
        destination: primaryDestination(tb),
        counts: {
          flights: summary.flights,
          stays: summary.stays,
          places: summary.places,
          total: tb.length,
        },
        isPast: isPastDate(summary.tripEnd),
        isEmpty: tb.length === 0,
      };
    });
}

/** Upcoming/planning first (by start date asc, undated last), then past (end desc). */
export function sortTrips(cards) {
  const upcoming = cards.filter((c) => !c.isPast).sort((a, b) => (a.tripStart || '9999-12-31').localeCompare(b.tripStart || '9999-12-31'));
  const past = cards.filter((c) => c.isPast).sort((a, b) => (b.tripEnd || '').localeCompare(a.tripEnd || ''));
  return { upcoming, past };
}
