import BookingCard from './BookingCard.jsx';
import { PlusIcon, PinIcon } from './icons.jsx';
import { groupPlacesByCity } from '../lib/bookings.js';

/**
 * The undated "places to check" shortlist, grouped by destination city.
 *  places: place records with no startDate
 *  onChange(id, next) / onDelete(id): same handlers as the timeline
 *  onAddPlace(city): open the add modal preset to a city
 */
export default function PlacesToCheck({ places, onChange, onDelete, onAddPlace }) {
  if (!places.length) return null;
  const groups = groupPlacesByCity(places);

  return (
    <section className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-slate-100 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <PinIcon className="h-4 w-4 text-emerald-600" />
        <h2 className="text-sm font-bold text-ink">Places to check</h2>
        <span className="text-xs text-slate-400">
          {places.length} idea{places.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="space-y-5">
        {groups.map((group) => (
          <div key={group.key}>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {group.city}
              </h3>
              <span className="h-px flex-1 bg-slate-100" />
              <button
                type="button"
                onClick={() => onAddPlace(group.city === 'Unsorted' ? '' : group.city)}
                className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
              >
                <PlusIcon className="h-3 w-3" /> add a spot
              </button>
            </div>
            <div className="space-y-3">
              {group.items.map((place) => (
                <BookingCard
                  key={place.id}
                  booking={place}
                  onChange={(next) => onChange(place.id, next)}
                  onDelete={() => onDelete(place.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
