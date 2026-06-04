// Export/import the whole trip (bookings + traveler-merge registry) as a JSON
// file, so it can be backed up or moved between devices without cloud sync.

import { normalizeBooking } from './bookings.js';
import { normalizeTrip } from './trips.js';

export function exportBackup(bookings, people, trips = []) {
  const data = {
    app: 'OneTripView',
    version: 2,
    exportedAt: new Date().toISOString(),
    bookings,
    people,
    trips,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `onetripview-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Parse + normalize a backup file. Throws a friendly error on bad input. */
export async function readBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!data || (!Array.isArray(data.bookings) && !Array.isArray(data.people))) {
    throw new Error('That doesn’t look like a OneTripView backup.');
  }

  const bookings = Array.isArray(data.bookings) ? data.bookings.map(normalizeBooking) : [];
  const people = Array.isArray(data.people)
    ? data.people
        .filter((p) => p && typeof p.id === 'string' && Array.isArray(p.aliases))
        .map((p) => ({ id: p.id, name: String(p.name || '').trim(), aliases: p.aliases.map(String) }))
    : [];
  const trips = Array.isArray(data.trips)
    ? data.trips.filter((t) => t && t.id).map(normalizeTrip)
    : [];

  return { bookings, people, trips };
}
