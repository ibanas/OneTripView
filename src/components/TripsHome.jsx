import { useMemo, useState } from 'react';
import TripCard from './TripCard.jsx';
import SearchResults from './SearchResults.jsx';
import { PlusIcon, SearchIcon, XIcon } from './icons.jsx';
import { searchBookings } from '../lib/search.js';

/**
 * Landing page: global search on top, then Upcoming/Past trip cards.
 *   cards: { upcoming: [...], past: [...] } from sortTrips(tripsWithDerived(...))
 *   onOpenTrip(id, view?) / onNewTrip() / onRenameTrip(id,name) / onDeleteTrip(id)
 */
export default function TripsHome({
  cards,
  liveBookings,
  trips,
  resolver,
  onOpenTrip,
  onNewTrip,
  onRenameTrip,
  onDeleteTrip,
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(
    () => (query.trim() ? searchBookings(query, liveBookings, trips, resolver) : []),
    [query, liveBookings, trips, resolver]
  );

  const total = cards.upcoming.length + cards.past.length;
  const searching = query.trim().length > 0;

  const renderCard = (card) => (
    <TripCard
      key={card.id}
      card={card}
      onOpen={onOpenTrip}
      onRename={onRenameTrip}
      onDelete={onDeleteTrip}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search trips, places, restaurants, people…"
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            aria-label="Search all trips"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onNewTrip}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        >
          <PlusIcon className="h-4 w-4" /> <span className="hidden sm:inline">New trip</span>
        </button>
      </div>

      {searching ? (
        <SearchResults query={query} results={results} onOpen={onOpenTrip} />
      ) : total === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-12 text-center">
          <h2 className="text-lg font-bold text-ink">Start your travel journal</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
            Create a trip, then drop in your booking PDFs and add places to check. Each trip keeps
            its own itinerary and shortlist.
          </p>
          <button
            type="button"
            onClick={onNewTrip}
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
          >
            <PlusIcon className="h-4 w-4" /> Create your first trip
          </button>
        </div>
      ) : (
        <>
          {cards.upcoming.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Upcoming &amp; planning
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">{cards.upcoming.map(renderCard)}</div>
            </section>
          )}
          {cards.past.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Past trips
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">{cards.past.map(renderCard)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
