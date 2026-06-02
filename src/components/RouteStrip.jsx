import { PlaneIcon } from './icons.jsx';

/**
 * Horizontal city sequence for the hero, e.g. TORONTO ✈ LISBON ✈ PORTO.
 * `cities` = [{ name, code, type }] from routeCities(bookings).
 */
export default function RouteStrip({ cities }) {
  if (!cities || cities.length < 2) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-white/90 drop-shadow-sm">
      {cities.map((c, i) => (
        <span key={`${c.name}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && <PlaneIcon className="h-3.5 w-3.5 rotate-90 text-white/50" />}
          <span className="text-sm font-semibold uppercase tracking-wide">
            {c.code || c.name}
          </span>
        </span>
      ))}
    </div>
  );
}
