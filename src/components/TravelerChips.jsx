import { useState } from 'react';
import Avatar from './Avatar.jsx';
import { XIcon, PlusIcon } from './icons.jsx';

/**
 * Traveler chips for one booking, shown by canonical identity with an avatar.
 *  chips:   [{ key, name, raws }] — resolved by the parent (BookingCard)
 *  onAdd(name):     add a raw traveler name to the booking
 *  onRemove(chip):  remove all raw spellings this chip represents
 */
export default function TravelerChips({ chips = [], onAdd, onRemove }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const commitAdd = () => {
    const name = draft.trim();
    if (name) onAdd(name);
    setDraft('');
    setAdding(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="group inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-1 text-xs font-medium text-slate-700"
        >
          <Avatar name={chip.name} colorKey={chip.key} size={20} className="ring-0" />
          <span className="pl-0.5">{chip.name}</span>
          <button
            type="button"
            onClick={() => onRemove(chip)}
            aria-label={`Remove ${chip.name}`}
            className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
          >
            <XIcon className="w-3 h-3" />
          </button>
        </span>
      ))}

      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitAdd}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitAdd();
            } else if (e.key === 'Escape') {
              setDraft('');
              setAdding(false);
            }
          }}
          placeholder="Name"
          className="inline-input w-24 text-xs"
          aria-label="Add traveler name"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 hover:border-sky-400 hover:text-sky-600 transition-colors"
        >
          <PlusIcon className="w-3 h-3" /> Traveler
        </button>
      )}
    </div>
  );
}
