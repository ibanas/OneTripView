// Global search across ALL trips. Pure + client-side over in-memory data.

import { resolveTravelers, normKey } from './people.js';
import { TYPE_LABELS, CATEGORY_LABELS, DEFAULT_TRIP_ID } from './bookings.js';

/**
 * searchBookings(query, liveBookings, trips, resolver) -> ranked results
 *   [{ booking, trip, matchedField, view }]
 * Matches title (best), trip name, location/address, category/type,
 * confirmation #, canonical traveler names, notes (worst). `view` is 'places'
 * for place records else 'itinerary' so a click can land on the right tab.
 */
export function searchBookings(query, liveBookings, trips, resolver) {
  const q = normKey(query);
  if (!q) return [];

  const tripById = new Map(trips.filter((t) => !t.deleted).map((t) => [t.id, t]));

  const results = [];
  for (const b of liveBookings) {
    const trip = tripById.get(b.tripId || DEFAULT_TRIP_ID);
    if (!trip) continue; // booking in a deleted/missing trip

    // Ranked fields (lower rank index = stronger match).
    const travelerNames = resolver
      ? resolveTravelers(b.travelers, resolver).map((c) => c.name)
      : b.travelers || [];
    const fields = [
      ['name', b.title],
      ['trip', trip.name],
      ['location', b.location],
      ['address', b.address],
      ['category', b.type === 'place' ? CATEGORY_LABELS[b.category] : TYPE_LABELS[b.type]],
      ['traveler', travelerNames.join(' ')],
      ['confirmation', b.confirmationNumber],
      ['notes', b.notes],
    ];

    let bestRank = -1;
    let matchedField = null;
    let prefix = false;
    for (let i = 0; i < fields.length; i++) {
      const val = normKey(fields[i][1]);
      if (val && val.includes(q)) {
        if (bestRank === -1) {
          bestRank = i;
          matchedField = fields[i][0];
          prefix = val.startsWith(q);
        }
      }
    }
    if (bestRank === -1) continue;

    results.push({
      booking: b,
      trip,
      matchedField,
      view: b.type === 'place' ? 'places' : 'itinerary',
      _rank: bestRank - (prefix ? 0.5 : 0), // prefix matches sort a touch higher
    });
  }

  results.sort((a, b) => a._rank - b._rank || a.booking.title.localeCompare(b.booking.title));
  return results.map(({ _rank, ...r }) => r);
}
