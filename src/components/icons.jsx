// Lightweight inline SVG icons (no icon-library dependency).
// All accept className and inherit stroke/fill from currentColor.

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
};

export function PlaneIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} {...base}>
      <path d="M10.5 12.5 3 14l-1-2 6-3.5L6 4l2-1 4 4 5-2.5c1-.5 2 .5 1.5 1.5L16 11l4 4-1 2-5-1.5L11.5 21l-2-.5z" />
    </svg>
  );
}

export function BedIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} {...base}>
      <path d="M3 7v11M3 12h18v6M21 18v-4a2 2 0 0 0-2-2H10V8a1 1 0 0 0-1-1H4" />
      <circle cx="7" cy="10" r="1.4" />
    </svg>
  );
}

export function HouseIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} {...base}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9h14v-9" />
      <path d="M10 19v-5h4v5" />
    </svg>
  );
}

export function PinIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} {...base}>
      <path d="M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10z" />
      <circle cx="12" cy="11" r="2.2" />
    </svg>
  );
}

export function ClockIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function TrashIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} {...base}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" />
    </svg>
  );
}

export function PlusIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} {...base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function XIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} {...base}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function UploadIcon({ className = 'w-6 h-6' }) {
  return (
    <svg className={className} {...base}>
      <path d="M12 16V4M8 8l4-4 4 4" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function SheetIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} {...base}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M4 9h16M4 15h16M10 3v18" />
    </svg>
  );
}

export function DocIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} {...base}>
      <path d="M6 3h8l4 4v14a0 0 0 0 1 0 0H6a0 0 0 0 1 0 0V3z" />
      <path d="M14 3v4h4M8 13h8M8 17h8" />
    </svg>
  );
}

export function Spinner({ className = 'w-5 h-5' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AlertIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} {...base}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  );
}

export function ArrowRightIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} {...base}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function UsersIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} {...base}>
      <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
      <circle cx="9" cy="7" r="3" />
      <path d="M22 19v-1a4 4 0 0 0-3-3.87M16 4.13A4 4 0 0 1 16 11.5" />
    </svg>
  );
}

export function PencilIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} {...base}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

export function MapIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} {...base}>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}

export function ChevronDownIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} {...base}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function MergeIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} {...base}>
      <path d="M6 3v6a6 6 0 0 0 6 6h6" />
      <path d="m15 12 3 3-3 3" />
      <path d="M6 3 3 6m3-3 3 3" />
    </svg>
  );
}

export function CloudIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} {...base}>
      <path d="M7 18a4 4 0 0 1-.5-7.97 5.5 5.5 0 0 1 10.6-1.02A4.25 4.25 0 0 1 17 18z" />
    </svg>
  );
}

export function CloudCheckIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} {...base}>
      <path d="M7 18a4 4 0 0 1-.5-7.97 5.5 5.5 0 0 1 10.6-1.02A4.25 4.25 0 0 1 17 18H7z" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  );
}

export function CheckIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} {...base}>
      <path d="m5 12 5 5 9-11" />
    </svg>
  );
}

export function CopyIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} {...base}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

const TYPE_ICONS = {
  flight: PlaneIcon,
  hotel: BedIcon,
  airbnb: HouseIcon,
  other: PinIcon,
};

export function TypeIcon({ type, className }) {
  const Icon = TYPE_ICONS[type] || PinIcon;
  return <Icon className={className} />;
}
