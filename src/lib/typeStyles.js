// Single source of truth for booking-type color coding, reused across cards,
// the timeline rail, route strip, map pins, and PDF export.

export const TYPE_STYLES = {
  flight: {
    label: 'Flight',
    hex: '#2563eb', // sky-600
    ring: 'ring-sky-100',
    badge: 'bg-sky-50 text-sky-700',
    icon: 'text-sky-600',
    accent: 'bg-sky-500',
    dot: 'bg-sky-500',
    soft: 'bg-sky-50',
    text: 'text-sky-700',
  },
  hotel: {
    label: 'Hotel',
    hex: '#7c3aed', // violet-600
    ring: 'ring-violet-100',
    badge: 'bg-violet-50 text-violet-700',
    icon: 'text-violet-600',
    accent: 'bg-violet-500',
    dot: 'bg-violet-500',
    soft: 'bg-violet-50',
    text: 'text-violet-700',
  },
  airbnb: {
    label: 'Rental',
    hex: '#d97706', // amber-600
    ring: 'ring-amber-100',
    badge: 'bg-amber-50 text-amber-700',
    icon: 'text-amber-600',
    accent: 'bg-amber-500',
    dot: 'bg-amber-500',
    soft: 'bg-amber-50',
    text: 'text-amber-700',
  },
  other: {
    label: 'Other',
    hex: '#475569', // slate-600
    ring: 'ring-slate-200',
    badge: 'bg-slate-100 text-slate-600',
    icon: 'text-slate-500',
    accent: 'bg-slate-400',
    dot: 'bg-slate-400',
    soft: 'bg-slate-50',
    text: 'text-slate-600',
  },
};

export function typeStyle(type) {
  return TYPE_STYLES[type] || TYPE_STYLES.other;
}
