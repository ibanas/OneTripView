import { useState, useEffect, useRef } from 'react';
import InlineField from './InlineField.jsx';
import TravelerChips from './TravelerChips.jsx';
import {
  TypeIcon,
  CategoryIcon,
  ExternalLinkIcon,
  TrashIcon,
  PinIcon,
  ClockIcon,
  Spinner,
} from './icons.jsx';
import { fetchPlaceDetails, placesAvailable } from '../lib/googlePlaces.js';
import {
  BOOKING_TYPES,
  TYPE_LABELS,
  PLACE_CATEGORIES,
  CATEGORY_LABELS,
  placeParts,
  dedupeNames,
} from '../lib/bookings.js';
import { typeStyle } from '../lib/typeStyles.js';
import { resolveTravelers } from '../lib/people.js';
import { mapsUrlFor, detectLink } from '../lib/places.js';
import { formatDateLong } from '../lib/format.js';
import { useCityImage, gradientFor } from '../lib/photos.js';

// City photo thumbnail. `override` (e.g. a place's own photo) wins over the city
// photo; both fall back to a deterministic gradient. Only mounted when there's a
// city or an override, so we never fetch images for flight legs. Google photos
// carry a required attribution, shown as a caption.
function MediaThumb({ city, override, overrideAttribution }) {
  const img = useCityImage(city || '');
  const [failed, setFailed] = useState(false);
  const candidate = override || img?.src;
  // Clear a stale error when the source changes, so a fresh valid photo (e.g.
  // loaded on demand, or a new city via inline edit) isn't hidden by an old 404.
  useEffect(() => setFailed(false), [candidate]);
  const usingOverride = Boolean(override);
  const src = !failed ? candidate : null;
  const attribution = usingOverride ? overrideAttribution : img?.attribution;
  return (
    <div className="hidden shrink-0 sm:block">
      <div
        className="h-20 w-28 overflow-hidden rounded-xl ring-1 ring-slate-100"
        style={{ background: gradientFor(city || 'place') }}
        title={city || ''}
      >
        {src && (
          <img
            src={src}
            alt={city || ''}
            loading="lazy"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      {src && attribution && (
        <p className="mt-0.5 w-28 truncate text-[10px] text-slate-400" title={`Photo: ${attribution}`}>
          Photo: {attribution}
        </p>
      )}
    </div>
  );
}

// Compact star rating (e.g. "★ 4.5 / 5").
function Stars({ rating }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-amber-500" aria-hidden="true">
        ★
      </span>
      <span className="font-semibold text-ink">{rating.toFixed(1)}</span>
      <span className="text-xs text-slate-400">/ 5</span>
    </span>
  );
}

// One date+time pair, both inline-editable.
function WhenPart({ label, date, time, onDate, onTime }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      {label && <span className="text-slate-400">{label}</span>}
      <InlineField
        as="date"
        value={date}
        onSave={onDate}
        display={(v) => formatDateLong(v) || v}
        placeholder="date"
        ariaLabel={`${label || 'Start'} date`}
        className="font-medium text-slate-700"
        inputClassName="text-sm"
      />
      <InlineField
        as="time"
        value={time}
        onSave={(v) => onTime(v || null)}
        placeholder="–:–"
        ariaLabel={`${label || 'Start'} time`}
        className="text-slate-500 tabular-nums"
        inputClassName="text-sm"
      />
    </span>
  );
}

export default function BookingCard({ booking, resolver, onChange, onDelete }) {
  const styles = typeStyle(booking.type);
  const isStay = booking.type === 'hotel' || booking.type === 'airbnb';
  const isFlight = booking.type === 'flight';
  const isPlace = booking.type === 'place';

  const set = (patch) => onChange({ ...booking, ...patch });
  const chips = isPlace ? [] : resolveTravelers(booking.travelers, resolver);

  // Lazy, once-ever fetch of Google rating/hours/website/photo (Enterprise tier).
  // Persists via onChange so it syncs to other devices and never re-bills.
  const [loadingDetails, setLoadingDetails] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);
  const hasDetails = booking.rating != null || booking.hours || booking.website;
  const canLoadDetails =
    isPlace && !hasDetails && !booking.detailsFetchedAt && placesAvailable() && booking.placeId;

  const loadDetails = async () => {
    if (loadingDetails || !booking.placeId) return;
    setLoadingDetails(true);
    try {
      const got = await fetchPlaceDetails(booking.placeId);
      // If the card unmounted during the fetch (deleted / regrouped by a date or
      // city edit), don't persist a stale snapshot — it would resurrect a deleted
      // booking or revert the edit and sync that everywhere.
      if (!mountedRef.current) return;
      // Stamp detailsFetchedAt (so an empty result doesn't re-bill) and keep only
      // the fields Google returned, so a null never wipes an existing value.
      const patch = { detailsFetchedAt: new Date().toISOString() };
      for (const [k, v] of Object.entries(got)) if (v != null) patch[k] = v;
      set(patch);
    } catch {
      /* transient failure — leave unstamped so the user can retry */
    } finally {
      if (mountedRef.current) setLoadingDetails(false);
    }
  };

  const addTraveler = (name) => set({ travelers: dedupeNames([...booking.travelers, name]) });
  const removeChip = (chip) =>
    set({ travelers: booking.travelers.filter((t) => !chip.raws.includes(t)) });

  const cityName = booking.location ? placeParts(booking.location).name : null;
  const openHref = isPlace ? booking.url || mapsUrlFor(booking) : null;
  const openLabel =
    booking.url && detectLink(booking.url).kind !== 'gmaps' ? 'Open website' : 'Open in Maps';

  return (
    <div
      className={`animate-in group relative overflow-hidden rounded-2xl bg-white p-4 pl-5 shadow-card ring-1 ${styles.ring} transition-shadow hover:shadow-lift sm:p-5 sm:pl-6`}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${styles.accent}`} aria-hidden="true" />

      <div className="flex gap-3 sm:gap-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${styles.badge}`}
        >
          {isPlace ? (
            <CategoryIcon category={booking.category} className={`h-5 w-5 ${styles.icon}`} />
          ) : (
            <TypeIcon type={booking.type} className={`h-5 w-5 ${styles.icon}`} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                {isPlace ? (
                  <select
                    value={booking.category}
                    onChange={(e) => set({ category: e.target.value })}
                    aria-label="Place category"
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide outline-none ring-1 ring-inset ring-transparent focus:ring-sky-300 ${styles.badge}`}
                  >
                    {PLACE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={booking.type}
                    onChange={(e) => set({ type: e.target.value })}
                    aria-label="Booking type"
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide outline-none ring-1 ring-inset ring-transparent focus:ring-sky-300 ${styles.badge}`}
                  >
                    {BOOKING_TYPES.filter((t) => t !== 'place').map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <InlineField
                value={booking.title}
                onSave={(v) => set({ title: v })}
                placeholder={isPlace ? 'Place name' : 'Untitled booking'}
                ariaLabel="Title"
                className="block w-full text-base font-semibold leading-snug text-ink"
                inputClassName="text-base font-semibold"
              />

              <div className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
                <PinIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <InlineField
                  value={booking.location}
                  onSave={(v) => set({ location: v })}
                  placeholder={isPlace ? 'City' : 'Add location'}
                  ariaLabel={isPlace ? 'City' : 'Location'}
                  className="block w-full"
                  inputClassName="text-sm"
                />
              </div>

              {isPlace && (
                <div className="mt-0.5 pl-[1.125rem] text-xs text-slate-400">
                  <InlineField
                    value={booking.address}
                    onSave={(v) => set({ address: v || null })}
                    placeholder="Add address"
                    ariaLabel="Address"
                    className="block w-full"
                    inputClassName="text-xs"
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onDelete}
              aria-label={isPlace ? 'Delete place' : 'Delete booking'}
              className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition-colors"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>

          {/* When */}
          {isPlace ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <ClockIcon className="h-3.5 w-3.5 text-slate-400" />
              <WhenPart
                label="When"
                date={booking.startDate}
                time={booking.startTime}
                onDate={(v) => set({ startDate: v })}
                onTime={(v) => set({ startTime: v })}
              />
              {!booking.startDate && (
                <span className="text-xs italic text-slate-400">
                  Shortlisted — add a date to put it on your timeline
                </span>
              )}
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <ClockIcon className="h-3.5 w-3.5 text-slate-400" />
              <WhenPart
                label={isFlight ? 'Dep' : isStay ? 'In' : ''}
                date={booking.startDate}
                time={booking.startTime}
                onDate={(v) => set({ startDate: v })}
                onTime={(v) => set({ startTime: v })}
              />
              <span className="text-slate-300">→</span>
              <WhenPart
                label={isFlight ? 'Arr' : isStay ? 'Out' : ''}
                date={booking.endDate}
                time={booking.endTime}
                onDate={(v) => set({ endDate: v })}
                onTime={(v) => set({ endTime: v })}
              />
            </div>
          )}

          {/* Travelers (bookings only) */}
          {!isPlace && (
            <div className="mt-3">
              <TravelerChips chips={chips} onAdd={addTraveler} onRemove={removeChip} />
            </div>
          )}

          {/* Link + notes (place) / Conf# + notes (booking) */}
          <div className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {isPlace ? (
              <div className="flex items-baseline gap-1.5">
                <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Link
                </span>
                <div className="min-w-0 flex-1">
                  {openHref && (
                    <a
                      href={openHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-sky-600 hover:underline"
                    >
                      <ExternalLinkIcon className="h-3.5 w-3.5" />
                      {openLabel}
                    </a>
                  )}
                  <InlineField
                    value={booking.url}
                    onSave={(v) => set({ url: v || null })}
                    placeholder="Paste a link"
                    ariaLabel="Link"
                    className="block w-full truncate text-slate-400"
                    inputClassName="text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-baseline gap-1.5">
                <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Conf #
                </span>
                <InlineField
                  value={booking.confirmationNumber}
                  onSave={(v) => set({ confirmationNumber: v || null })}
                  placeholder="—"
                  ariaLabel="Confirmation number"
                  className="font-mono text-slate-700"
                  inputClassName="font-mono text-sm"
                />
              </div>
            )}
            <div className="flex items-baseline gap-1.5">
              <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">
                Notes
              </span>
              <InlineField
                as="textarea"
                value={booking.notes}
                onSave={(v) => set({ notes: v || null })}
                placeholder="Add notes"
                ariaLabel="Notes"
                className="w-full text-slate-600"
                inputClassName="text-sm"
              />
            </div>
          </div>

          {/* Google place details (lazy, persisted) */}
          {isPlace && hasDetails && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-sm">
              {booking.rating != null && <Stars rating={booking.rating} />}
              {booking.website && (
                <a
                  href={booking.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-sky-600 hover:underline"
                >
                  <ExternalLinkIcon className="h-3.5 w-3.5" /> Website
                </a>
              )}
              {booking.hours && (
                <details className="w-full text-xs text-slate-500">
                  <summary className="cursor-pointer select-none font-medium text-slate-600">
                    Opening hours
                  </summary>
                  <ul className="mt-1 space-y-0.5 pl-1">
                    {booking.hours.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          {canLoadDetails && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={loadDetails}
                disabled={loadingDetails}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-50"
              >
                {loadingDetails && <Spinner className="h-3.5 w-3.5 text-sky-500" />}
                {loadingDetails ? 'Loading…' : 'Load ratings, hours & photo from Google'}
              </button>
            </div>
          )}
        </div>

        {/* Photo */}
        {isPlace
          ? (cityName || booking.image) && (
              <MediaThumb
                city={cityName}
                override={booking.image}
                overrideAttribution={booking.imageAttribution}
              />
            )
          : isStay && cityName && <MediaThumb city={cityName} />}
      </div>
    </div>
  );
}
