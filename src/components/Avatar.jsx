import { avatarColor, initials } from '../lib/people.js';

/**
 * Colored initials avatar. Deterministic color per `colorKey` (falls back to
 * the name). Set `onClick` to make it an interactive filter toggle; `active`
 * draws a ring.
 */
export default function Avatar({
  name,
  colorKey,
  size = 32,
  active = false,
  onClick,
  title,
  className = '',
}) {
  const bg = avatarColor(colorKey || name);
  const style = {
    backgroundColor: bg,
    width: size,
    height: size,
    fontSize: Math.round(size * 0.4),
  };

  const content = (
    <span
      className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
      style={style}
    >
      {initials(name)}
    </span>
  );

  if (!onClick) {
    return (
      <span
        title={title || name}
        className={`inline-flex shrink-0 rounded-full ring-2 ring-white ${className}`}
      >
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={title || name}
      aria-pressed={active}
      className={`inline-flex shrink-0 rounded-full transition-transform hover:scale-105 focus:outline-none ${
        active ? 'ring-2 ring-offset-2 ring-white' : 'ring-2 ring-white/40'
      } ${className}`}
    >
      {content}
    </button>
  );
}
