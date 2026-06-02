// Human-friendly date/time formatting. Parses YYYY-MM-DD as a *local* date
// (appending T00:00:00) so a booking never drifts a day from timezone math.

function parseLocal(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const WEEKDAY = { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' };
const SHORT = { day: 'numeric', month: 'short' };
const SHORT_YEAR = { day: 'numeric', month: 'short', year: 'numeric' };

/** "Mon, 12 May 2026" — used for timeline day headings. */
export function formatDateHeading(iso) {
  const d = parseLocal(iso);
  if (!d) return 'No date';
  return d.toLocaleDateString(undefined, WEEKDAY);
}

/** "12 May" */
export function formatDateShort(iso) {
  const d = parseLocal(iso);
  if (!d) return '';
  return d.toLocaleDateString(undefined, SHORT);
}

/** "12 May 2026" */
export function formatDateLong(iso) {
  const d = parseLocal(iso);
  if (!d) return '';
  return d.toLocaleDateString(undefined, SHORT_YEAR);
}

function startOfToday() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/**
 * Friendly countdown relative to today: "in 23 days", "Tomorrow", "Today",
 * "Happening now", "Ended". Returns '' if there's no start date.
 */
export function formatCountdown(startIso, endIso) {
  const start = parseLocal(startIso);
  if (!start) return '';
  const today = startOfToday();
  const end = parseLocal(endIso) || start;

  const dayMs = 86_400_000;
  const daysToStart = Math.round((start - today) / dayMs);
  const daysToEnd = Math.round((end - today) / dayMs);

  if (daysToStart > 1) return `in ${daysToStart} days`;
  if (daysToStart === 1) return 'Tomorrow';
  if (daysToStart === 0) return 'Today';
  // Trip has started.
  if (daysToEnd >= 0) return 'Happening now';
  const ago = -daysToEnd;
  if (ago === 0) return 'Just ended';
  if (ago === 1) return 'Ended yesterday';
  return `Ended ${ago} days ago`;
}

/** Compact trip range: "12 – 22 May 2026" or "28 Apr – 3 May 2026". */
export function formatRange(startIso, endIso) {
  const a = parseLocal(startIso);
  const b = parseLocal(endIso);
  if (!a && !b) return '';
  if (!a) return formatDateLong(endIso);
  if (!b || startIso === endIso) return formatDateLong(startIso);

  const sameMonth =
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  const sameYear = a.getFullYear() === b.getFullYear();

  if (sameMonth) {
    return `${a.getDate()} – ${b.toLocaleDateString(undefined, SHORT_YEAR)}`;
  }
  if (sameYear) {
    return `${a.toLocaleDateString(undefined, SHORT)} – ${b.toLocaleDateString(
      undefined,
      SHORT_YEAR
    )}`;
  }
  return `${formatDateLong(startIso)} – ${formatDateLong(endIso)}`;
}
