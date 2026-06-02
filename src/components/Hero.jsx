import { useEffect, useState } from 'react';
import Avatar from './Avatar.jsx';
import RouteStrip from './RouteStrip.jsx';
import { useCityImage } from '../lib/photos.js';
import { formatRange, formatCountdown } from '../lib/format.js';
import { PencilIcon, UsersIcon, XIcon } from './icons.jsx';

function Stat({ value, label }) {
  return (
    <div className="rounded-xl bg-white/10 px-3 py-2.5 text-center backdrop-blur-sm">
      <div className="text-xl font-bold leading-none sm:text-2xl">{value}</div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-white/70">
        {label}
      </div>
    </div>
  );
}

export default function Hero({
  summary,
  cities,
  destination,
  activePerson,
  onTogglePerson,
  onManagePeople,
}) {
  const img = useCityImage(destination);
  const [imgFailed, setImgFailed] = useState(false);

  // Reset the failure flag whenever the destination/photo changes.
  useEffect(() => setImgFailed(false), [img?.src]);

  const showPhoto = img?.src && !imgFailed;
  const range = formatRange(summary.tripStart, summary.tripEnd);
  const countdown = formatCountdown(summary.tripStart, summary.tripEnd);
  const activeName = summary.people.find((p) => p.key === activePerson)?.name;

  return (
    <section className="relative overflow-hidden rounded-2xl text-white shadow-lift">
      {/* Background layers */}
      <div className="absolute inset-0 bg-gradient-to-br from-sky-600 via-sky-500 to-violet-600" />
      {showPhoto && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${img.src})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/60 to-ink/55" />
        </>
      )}
      {!showPhoto && <div className="absolute inset-0 bg-black/5" />}

      {/* Hidden probe so a broken image URL falls back to the gradient */}
      {img?.src && !imgFailed && (
        <img src={img.src} alt="" className="hidden" onError={() => setImgFailed(true)} />
      )}

      {/* Content */}
      <div className="relative space-y-4 p-5 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80 drop-shadow-sm">
            Your trip
          </p>
          {countdown && (
            <span className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
              {countdown}
            </span>
          )}
        </div>

        <RouteStrip cities={cities} />

        <div>
          <h2 className="text-2xl font-bold leading-tight drop-shadow-sm sm:text-3xl">
            {range || 'Dates to be confirmed'}
          </h2>
          {destination && (
            <p className="mt-0.5 text-sm text-white/80">
              {summary.nights > 0
                ? `${summary.nights} night${summary.nights === 1 ? '' : 's'} · `
                : ''}
              {destination}
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          <Stat value={summary.flights} label="Flights" />
          <Stat value={summary.stays} label="Stays" />
          <Stat value={summary.nights} label="Nights" />
          <Stat value={summary.people.length} label="Travelers" />
        </div>

        {/* Traveler filter */}
        {summary.people.length > 0 && (
          <div className="border-t border-white/15 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-white/70">
                <UsersIcon className="h-3.5 w-3.5" /> Who
              </span>
              {summary.people.map((p) => {
                const active = activePerson === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => onTogglePerson(active ? null : p.key)}
                    className={`flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-sm font-medium transition-colors ${
                      active ? 'bg-white text-ink' : 'bg-white/15 text-white hover:bg-white/25'
                    }`}
                  >
                    <Avatar name={p.name} colorKey={p.key} size={24} className="ring-0" />
                    {p.name}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={onManagePeople}
                title="Manage travelers — merge duplicates, rename"
                className="flex items-center gap-1 rounded-full border border-dashed border-white/40 px-2.5 py-1 text-xs font-medium text-white/80 hover:border-white hover:text-white transition-colors"
              >
                <PencilIcon className="h-3 w-3" /> Manage
              </button>
            </div>

            {activeName && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-white/85">
                Showing bookings with <span className="font-semibold">{activeName}</span>
                <button
                  type="button"
                  onClick={() => onTogglePerson(null)}
                  className="inline-flex items-center gap-0.5 rounded-full bg-white/15 px-2 py-0.5 hover:bg-white/25"
                >
                  Clear <XIcon className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
