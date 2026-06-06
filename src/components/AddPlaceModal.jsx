import { useEffect, useRef, useState } from 'react';
import { XIcon, PinIcon, CategoryIcon, Spinner } from './icons.jsx';
import { PLACE_CATEGORIES, CATEGORY_LABELS } from '../lib/bookings.js';
import { detectLink, enrich, isHttpUrl } from '../lib/places.js';
import { placesAvailable } from '../lib/googleMaps.js';
import PlaceAutocomplete from './PlaceAutocomplete.jsx';

/**
 * Add a "place to check". Pasting a link smart-fills name/category/coords
 * (synchronously), then fires the optional enrich() to fill a photo / resolve
 * short maps links — without ever blocking the form.
 *
 *  onAdd(rawPlace): commit a new place (App normalizes + appends + syncs)
 *  presetCity: prefill the destination
 *  cities: string[] of trip cities for the datalist
 */
export default function AddPlaceModal({ onAdd, onClose, presetCity = '', cities = [] }) {
  const [link, setLink] = useState('');
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [category, setCategory] = useState('other');
  const [city, setCity] = useState(presetCity);
  const [cityEdited, setCityEdited] = useState(Boolean(presetCity));
  const [address, setAddress] = useState('');
  const [addressEdited, setAddressEdited] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [coords, setCoords] = useState({ lat: null, lng: null });
  const [image, setImage] = useState(null);
  const [placeId, setPlaceId] = useState(null);
  const [enriching, setEnriching] = useState(false);
  const useGoogle = placesAvailable();

  const panelRef = useRef(null);
  // Live refs so a user edit DURING an in-flight enrich() always wins the race.
  const titleRef = useRef('');
  const titleEditedRef = useRef(false);
  const cityEditedRef = useRef(Boolean(presetCity));
  const addressEditedRef = useRef(false);
  const enrichTimerRef = useRef(null);
  const lastEnrichedRef = useRef('');
  useEffect(() => {
    titleRef.current = title;
    titleEditedRef.current = titleEdited;
    cityEditedRef.current = cityEdited;
    addressEditedRef.current = addressEdited;
  }, [title, titleEdited, cityEdited, addressEdited]);
  useEffect(() => () => clearTimeout(enrichTimerRef.current), []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.activeElement;
    panelRef.current?.focus();
    return () => prev && prev.focus && prev.focus();
  }, []);

  // Best-effort enrichment: resolve short links + fetch name/address/photo.
  // Reads live edit-state from refs so it never overwrites what the user typed.
  const runEnrich = async (url) => {
    if (!isHttpUrl(url) || url === lastEnrichedRef.current) return;
    lastEnrichedRef.current = url;
    setEnriching(true);
    const r = await enrich(url);
    setEnriching(false);
    if (!r) return;
    if (r.name && !titleEditedRef.current && !titleRef.current) setTitle(r.name);
    if (r.address && !addressEditedRef.current) setAddress((a) => a || r.address);
    if (r.city && !cityEditedRef.current) setCity((c) => c || r.city);
    if (r.lat != null && r.lng != null) setCoords((c) => (c.lat == null ? { lat: r.lat, lng: r.lng } : c));
    if (r.image) setImage((img) => img || r.image);
  };

  // Synchronous smart-fill while typing + debounced enrichment so a pasted link
  // auto-fills without needing to blur the field.
  const onLinkChange = (val) => {
    setLink(val);
    const d = detectLink(val);
    if (d.kind) {
      if (d.name && !titleEditedRef.current) setTitle(d.name);
      if (d.category && d.category !== 'other') setCategory(d.category);
      if (d.lat != null && d.lng != null) setCoords({ lat: d.lat, lng: d.lng });
    }
    clearTimeout(enrichTimerRef.current);
    if (isHttpUrl(val)) enrichTimerRef.current = setTimeout(() => runEnrich(val), 600);
  };

  const onLinkBlur = () => {
    clearTimeout(enrichTimerRef.current);
    runEnrich(link);
  };

  // A pick from the Google search box fills everything at once. Mark fields as
  // user-edited so a later paste-enrich can't clobber the picked values. The
  // photo + rating/hours stay unfetched here (Enterprise) — loaded later on the
  // place card, then persisted, so adding stays on the cheap tier.
  const onPick = (p) => {
    setTitle(p.title || '');
    setTitleEdited(true);
    if (p.category) setCategory(p.category);
    if (p.city) {
      setCity(p.city);
      setCityEdited(true);
    }
    if (p.address) {
      setAddress(p.address);
      setAddressEdited(true);
    }
    if (p.lat != null && p.lng != null) setCoords({ lat: p.lat, lng: p.lng });
    setPlaceId(p.placeId || null);
    if (p.url) setLink(p.url);
  };

  const canSave = title.trim() || link.trim();

  const submit = (e) => {
    e.preventDefault();
    if (!canSave) return;
    onAdd({
      type: 'place',
      title: title.trim() || 'Untitled place',
      location: city.trim(),
      address: address.trim() || null,
      category,
      url: link.trim() || null,
      lat: coords.lat,
      lng: coords.lng,
      image,
      placeId,
      startDate: date,
      startTime: date ? time : '',
      notes: notes.trim() || null,
      updatedAt: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <form
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-place-title"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-lift outline-none sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <PinIcon className="h-5 w-5 text-emerald-600" />
            <h2 id="add-place-title" className="text-base font-bold text-ink">
              Add a place to check
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Google search (primary, when a Maps key is configured) */}
          {useGoogle && (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Search Google for a place
              </label>
              <PlaceAutocomplete onPick={onPick} />
              <p className="mt-1 text-xs text-slate-400">
                Pick a result to auto-fill the name, address, and exact map pin.
              </p>
              <div className="mt-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-300">
                <span className="h-px flex-1 bg-slate-100" /> or paste a link{' '}
                <span className="h-px flex-1 bg-slate-100" />
              </div>
            </div>
          )}

          {/* Link */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Paste a link (Google Maps, website, event…)
            </label>
            <div className="relative">
              <input
                value={link}
                onChange={(e) => onLinkChange(e.target.value)}
                onBlur={onLinkBlur}
                placeholder="https://maps.app.goo.gl/…  or  restaurant.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-9 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                aria-label="Link"
              />
              {enriching && (
                <Spinner className="absolute right-2.5 top-2.5 h-4 w-4 text-sky-500" />
              )}
            </div>
            {coords.lat != null && (
              <p className="mt-1 text-xs text-emerald-600">📍 Location found — it&apos;ll show on the map.</p>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Name
            </label>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleEdited(true);
              }}
              placeholder="e.g. Time Out Market"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              aria-label="Name"
            />
          </div>

          {/* Category */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Category
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PLACE_CATEGORIES.map((c) => {
                const active = category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <CategoryIcon category={c} className="h-3.5 w-3.5" />
                    {CATEGORY_LABELS[c]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* City */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Destination / city
            </label>
            <input
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setCityEdited(true);
              }}
              list="place-cities"
              placeholder="e.g. Lisbon"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              aria-label="Destination city"
            />
            <datalist id="place-cities">
              {cities.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          {/* Address */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Address (auto-filled from the link when available)
            </label>
            <input
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setAddressEdited(true);
              }}
              placeholder="Street address"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              aria-label="Address"
            />
          </div>

          {/* Optional schedule */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Schedule it (optional)
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                aria-label="Date"
              />
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={!date}
                className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 disabled:opacity-40"
                aria-label="Time"
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Leave blank to keep it on your shortlist; add a date to put it on the timeline.
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Why you want to go, what to order…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              aria-label="Notes"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add place
          </button>
        </div>
      </form>
    </div>
  );
}
