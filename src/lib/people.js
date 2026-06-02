// Traveler identity / name-aliasing.
//
// Bookings store traveler names as plain strings. Several spellings can refer
// to the same person (airline "LASTNAME/FIRSTNAME" formatting, legal vs. short
// names, OCR noise). Rather than rewrite the names inside bookings, we keep a
// separate "people registry" and resolve names to a canonical identity at READ
// time — everywhere names are shown, counted, filtered, or exported.

// Seeded with the groups the user told us about, so merging works out of the box.
export const DEFAULT_PEOPLE = [
  {
    id: 'p-anas',
    name: 'Anas Ibrahim',
    aliases: ['Anas Adel Moustafa Mohamed Ibrahim', 'Anas Ibrahim', 'Ibrahim Anasmr'],
  },
  {
    id: 'p-tamara',
    name: 'Tamara Nasser',
    aliases: ['Nasser Tamaramiss', 'Tamara Nasser'],
  },
];

/** Case/whitespace-insensitive match key for a name. */
export function normKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function newPersonId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `p-${crypto.randomUUID()}`;
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build a fast resolver from a registry. resolve(rawName) -> { key, name }.
 * Registry hits return the canonical id + display name; misses return a stable
 * synthetic key derived from the normalized name (so every distinct unmerged
 * spelling is its own person).
 */
export function buildResolver(registry = []) {
  const index = new Map();
  for (const p of registry) {
    for (const a of p.aliases || []) index.set(normKey(a), { key: p.id, name: p.name });
  }
  return {
    resolve(rawName) {
      const hit = index.get(normKey(rawName));
      if (hit) return hit;
      return { key: `name:${normKey(rawName)}`, name: String(rawName || '').trim() };
    },
  };
}

/**
 * Distinct people across all bookings, deduped by canonical identity.
 * Returns [{ key, name, aliases: [raw spellings seen in the trip] }] sorted by name.
 */
export function distinctPeople(bookings, resolver) {
  const map = new Map();
  for (const b of bookings) {
    for (const raw of b.travelers || []) {
      const { key, name } = resolver.resolve(raw);
      if (!map.has(key)) map.set(key, { key, name, aliases: [] });
      const entry = map.get(key);
      if (!entry.aliases.some((a) => normKey(a) === normKey(raw))) entry.aliases.push(raw);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve one booking's travelers into display chips, deduped by canonical
 * identity. Each chip carries the raw spellings it represents (for removal).
 * Returns [{ key, name, raws: [...] }].
 */
export function resolveTravelers(travelers, resolver) {
  const map = new Map();
  for (const raw of travelers || []) {
    const { key, name } = resolver.resolve(raw);
    if (!map.has(key)) map.set(key, { key, name, raws: [] });
    map.get(key).raws.push(raw);
  }
  return [...map.values()];
}

/** Does a booking include the given canonical person? */
export function bookingHasPerson(booking, personKey, resolver) {
  return (booking.travelers || []).some((t) => resolver.resolve(t).key === personKey);
}

// ---- Registry mutations (return a NEW registry array) ----

/** Merge several display-people into one canonical person. */
export function mergePeople(registry, selectedPeople, canonicalName) {
  if (selectedPeople.length < 2) return registry;

  const selectedIds = new Set(selectedPeople.map((p) => p.key));
  // Union every alias: registry-backed people contribute their full alias set;
  // synthetic people contribute the raw spellings seen in the trip.
  const aliasSet = new Map(); // normKey -> original spelling
  for (const p of selectedPeople) {
    const reg = registry.find((r) => r.id === p.key);
    const aliases = reg ? reg.aliases : p.aliases;
    for (const a of aliases) if (!aliasSet.has(normKey(a))) aliasSet.set(normKey(a), a);
  }

  const merged = {
    id: newPersonId(),
    // Never resolve to a blank name: prefer the given name, else the first
    // non-blank selected name, else a literal fallback.
    name:
      String(canonicalName || '').trim() ||
      selectedPeople.map((p) => p.name).find((n) => n && n.trim()) ||
      'Unnamed',
    aliases: [...aliasSet.values()],
  };

  return [...registry.filter((r) => !selectedIds.has(r.id)), merged];
}

/** Rename a person's canonical display name (creating a registry entry if synthetic). */
export function renamePerson(registry, person, newName) {
  const name = String(newName || '').trim();
  if (!name) return registry;

  const existing = registry.find((r) => r.id === person.key);
  if (existing) {
    return registry.map((r) => (r.id === person.key ? { ...r, name } : r));
  }
  // Synthetic: promote to a registry entry keyed by its raw spellings.
  return [...registry, { id: newPersonId(), name, aliases: person.aliases.slice() }];
}

/** Detach one alias spelling from a registry person (it becomes its own identity). */
export function detachAlias(registry, personId, aliasRaw) {
  return registry
    .map((r) => {
      if (r.id !== personId) return r;
      const aliases = r.aliases.filter((a) => normKey(a) !== normKey(aliasRaw));
      return { ...r, aliases };
    })
    .filter((r) => r.aliases.length > 0);
}

// ---- Avatar helpers ----

const AVATAR_COLORS = [
  '#2563eb', '#7c3aed', '#db2777', '#d97706', '#059669',
  '#0891b2', '#dc2626', '#4f46e5', '#0d9488', '#ca8a04',
  '#9333ea', '#e11d48',
];

/** Deterministic color for a person key. */
export function avatarColor(key) {
  let h = 0;
  const s = String(key || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** First letters of the first two words, e.g. "Anas Ibrahim" -> "AI". */
export function initials(name) {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
