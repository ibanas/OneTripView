import { normalizeBooking } from './bookings.js';
import { DEFAULT_PEOPLE } from './people.js';

const KEY = 'itinerary.bookings.v1';
const PEOPLE_KEY = 'itinerary.people.v1';

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
