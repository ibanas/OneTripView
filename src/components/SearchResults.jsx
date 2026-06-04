import { TypeIcon, CategoryIcon } from './icons.jsx';
import { typeStyle } from '../lib/typeStyles.js';

const FIELD_LABEL = {
  name: 'name',
  trip: 'trip',
  location: 'location',
  address: 'address',
  category: 'category',
  traveler: 'traveler',
  confirmation: 'confirmation #',
  notes: 'notes',
};

/**
 * Global search results, grouped by trip. `onOpen(tripId, view)` opens a trip
 * on the right tab.
 */
export default function SearchResults({ query, results, onOpen }) {
  if (!query.trim()) return null;
  if (results.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-sm text-slate-400">
        No matches for “{query}”.
      </p>
    );
  }

  // Group by trip, preserving rank order.
  const groups = [];
  const index = new Map();
  for (const r of results) {
    if (!index.has(r.trip.id)) {
      const g = { trip: r.trip, items: [] };
      index.set(r.trip.id, g);
      groups.push(g);
    }
    index.get(r.trip.id).items.push(r);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {results.length} result{results.length === 1 ? '' : 's'} for “{query}”
      </p>
      {groups.map((g) => (
        <div key={g.trip.id} className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-slate-100">
          <div className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-ink">
            {g.trip.name}
          </div>
          <ul className="divide-y divide-slate-100">
            {g.items.map((r) => {
              const b = r.booking;
              const styles = typeStyle(b.type);
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(g.trip.id, r.view)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${styles.badge}`}>
                      {b.type === 'place' ? (
                        <CategoryIcon category={b.category} className={`h-4 w-4 ${styles.icon}`} />
                      ) : (
                        <TypeIcon type={b.type} className={`h-4 w-4 ${styles.icon}`} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{b.title}</span>
                      <span className="block truncate text-xs text-slate-400">
                        {(b.address || b.location) && <>{b.address || b.location} · </>}
                        matched {FIELD_LABEL[r.matchedField] || r.matchedField}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
