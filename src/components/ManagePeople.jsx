import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import InlineField from './InlineField.jsx';
import { XIcon, MergeIcon, UsersIcon } from './icons.jsx';
import { mergePeople, renamePerson, detachAlias } from '../lib/people.js';

/**
 * Modal to manage traveler identities.
 *  peopleInTrip: [{ key, name, aliases }] — distinct people across all bookings
 *  registry: the persisted alias registry
 *  onApply(newRegistry): persist a mutated registry
 */
export default function ManagePeople({ peopleInTrip, registry, onApply, onClose }) {
  const [selected, setSelected] = useState(() => new Set());
  const panelRef = useRef(null);

  // Drop selections that no longer exist after a registry change.
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((k) => peopleInTrip.some((p) => p.key === k)));
      return next.size === prev.size ? prev : next;
    });
  }, [peopleInTrip]);

  // Close on Escape (InlineField stops Escape from bubbling, so an inline rename
  // cancel won't reach this).
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Move focus into the dialog on open; restore it to the trigger on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    panelRef.current?.focus();
    return () => {
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, []);

  // Trap Tab within the dialog.
  const onPanelKeyDown = (e) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusables = [
      ...panelRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ),
    ].filter((el) => !el.disabled && el.offsetParent !== null);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const toggle = (key) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selectedPeople = peopleInTrip.filter((p) => selected.has(p.key));

  const doMerge = () => {
    if (selectedPeople.length < 2) return;
    onApply(mergePeople(registry, selectedPeople, selectedPeople[0].name));
    setSelected(new Set());
  };

  const isMerged = (key) => registry.some((r) => r.id === key);
  // Registry-backed people may have alias spellings that aren't in the current
  // trip — show the FULL set so the count and the split buttons are accurate.
  const aliasesOf = (p) => registry.find((r) => r.id === p.key)?.aliases || p.aliases;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-people-title"
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-lift outline-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onPanelKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <UsersIcon className="h-5 w-5 text-sky-600" />
            <div>
              <h2 id="manage-people-title" className="text-base font-bold text-ink">
                Travelers
              </h2>
              <p className="text-xs text-slate-500">
                Merge duplicate names, rename, or split them apart.
              </p>
            </div>
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

        {/* Merge bar */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-sm">
          <span className="text-slate-500">
            {selected.size === 0
              ? 'Select two or more to merge them into one person.'
              : `${selected.size} selected`}
          </span>
          <button
            type="button"
            onClick={doMerge}
            disabled={selected.size < 2}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <MergeIcon className="h-4 w-4" /> Merge
          </button>
        </div>

        {/* People list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {peopleInTrip.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No travelers yet.</p>
          ) : (
            <ul className="space-y-2">
              {peopleInTrip.map((p) => {
                const aliases = aliasesOf(p);
                return (
                  <li
                    key={p.key}
                    className={`rounded-xl border p-3 transition-colors ${
                      selected.has(p.key) ? 'border-sky-300 bg-sky-50/50' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selected.has(p.key)}
                        onChange={() => toggle(p.key)}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        aria-label={`Select ${p.name}`}
                      />
                      <Avatar name={p.name} colorKey={p.key} size={36} className="ring-0" />
                      <div className="min-w-0 flex-1">
                        <InlineField
                          value={p.name}
                          onSave={(v) => v && onApply(renamePerson(registry, p, v))}
                          placeholder="Name"
                          ariaLabel="Canonical name"
                          className="block text-sm font-semibold text-ink"
                          inputClassName="text-sm font-semibold"
                        />
                        <span className="text-xs text-slate-400">
                          {aliases.length} spelling{aliases.length === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>

                    {/* Alias spellings */}
                    {aliases.length > 1 && (
                      <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
                        {aliases.map((a) => (
                          <span
                            key={a}
                            className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2.5 pr-1 text-xs text-slate-600"
                          >
                            {a}
                            {isMerged(p.key) && (
                              <button
                                type="button"
                                onClick={() => onApply(detachAlias(registry, p.key, a))}
                                title="Split this spelling into its own person"
                                aria-label={`Split ${a}`}
                                className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                              >
                                <XIcon className="h-3 w-3" />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
