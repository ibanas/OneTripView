import { useEffect, useRef, useState } from 'react';
import { formatRange, formatCountdown } from '../lib/format.js';
import { PlaneIcon, BedIcon, PinIcon, PencilIcon, TrashIcon, ChevronDownIcon } from './icons.jsx';

/**
 * A trip on the Trips home. `card` comes from tripsWithDerived().
 */
export default function TripCard({ card, onOpen, onRename, onDelete }) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menu) return undefined;
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menu]);

  const range = formatRange(card.tripStart, card.tripEnd);
  const countdown = formatCountdown(card.tripStart, card.tripEnd);

  return (
    <div className="group relative overflow-hidden rounded-2xl text-white shadow-card transition-shadow hover:shadow-lift">
      {/* Tap target */}
      <button
        type="button"
        onClick={() => onOpen(card.id)}
        className="block w-full text-left"
      >
        <div className="relative h-32 bg-gradient-to-br from-sky-600 via-sky-500 to-violet-600 p-4 sm:h-36 sm:p-5">
          <div className="absolute inset-0 bg-black/5" />
          <div className="relative flex h-full flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-bold drop-shadow-sm">{card.name}</h3>
                {card.destination && (
                  <p className="truncate text-sm text-white/85">{card.destination}</p>
                )}
              </div>
              {countdown && (
                <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold backdrop-blur-sm">
                  {countdown}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-white/90">
                {range || 'Dates to be confirmed'}
              </span>
              <span className="flex items-center gap-2 text-xs text-white/90">
                {card.counts.flights > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <PlaneIcon className="h-3.5 w-3.5" />
                    {card.counts.flights}
                  </span>
                )}
                {card.counts.stays > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <BedIcon className="h-3.5 w-3.5" />
                    {card.counts.stays}
                  </span>
                )}
                {card.counts.places > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <PinIcon className="h-3.5 w-3.5" />
                    {card.counts.places}
                  </span>
                )}
                {card.counts.total === 0 && <span className="italic text-white/70">empty</span>}
              </span>
            </div>
          </div>
        </div>
      </button>

      {/* Overflow menu */}
      <div ref={menuRef} className="absolute right-2 top-2">
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          aria-label="Trip options"
          className="rounded-lg bg-black/15 p-1 text-white/90 hover:bg-black/30"
        >
          <ChevronDownIcon className="h-4 w-4" />
        </button>
        {menu && (
          <div className="absolute right-0 mt-1 w-36 overflow-hidden rounded-lg bg-white text-sm text-ink shadow-lift ring-1 ring-slate-200">
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                onRename(card.id, card.name);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50"
            >
              <PencilIcon className="h-4 w-4 text-slate-500" /> Rename
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                onDelete(card.id);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-rose-600 hover:bg-rose-50"
            >
              <TrashIcon className="h-4 w-4" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
