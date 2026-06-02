import BookingCard from './BookingCard.jsx';
import { groupByDate } from '../lib/bookings.js';
import { typeStyle } from '../lib/typeStyles.js';
import { formatDateHeading } from '../lib/format.js';

export default function Timeline({ bookings, resolver, onChange, onDelete }) {
  const groups = groupByDate(bookings);

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-10 text-center text-slate-400">
        No bookings match this filter.
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Continuous rail line behind the day nodes (centered on the dots at x=9) */}
      <span
        className="absolute bottom-3 left-[9px] top-2 w-0.5 -translate-x-1/2 bg-slate-200"
        aria-hidden="true"
      />

      <div className="space-y-7">
        {groups.map((group) => {
          // Node color follows the first booking's type that day.
          const dot = typeStyle(group.items[0]?.type).dot;
          return (
            <div key={group.key} className="relative pl-9">
              <span
                className={`absolute left-[9px] top-1.5 z-10 h-3.5 w-3.5 -translate-x-1/2 rounded-full ring-4 ring-slate-50 ${dot}`}
                aria-hidden="true"
              />

              <div className="mb-3 flex items-baseline gap-2">
                <h3 className="text-sm font-bold text-ink">
                  {group.date ? formatDateHeading(group.date) : 'No date'}
                </h3>
                <span className="text-xs text-slate-400">
                  {group.items.length} item{group.items.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="space-y-3">
                {group.items.map((booking) => (
                  <BookingCard
                    key={booking.id}
                    booking={booking}
                    resolver={resolver}
                    onChange={(next) => onChange(booking.id, next)}
                    onDelete={() => onDelete(booking.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
