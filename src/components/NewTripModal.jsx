import { useEffect, useRef, useState } from 'react';
import { XIcon, PlusIcon, PencilIcon } from './icons.jsx';

/**
 * Create or rename a trip. `mode` = 'create' | 'rename'.
 */
export default function NewTripModal({ mode = 'create', initialName = '', onSubmit, onClose }) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const isRename = mode === 'rename';
  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(name.trim());
  };

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-modal-title"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-t-2xl bg-white shadow-lift sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            {isRename ? (
              <PencilIcon className="h-5 w-5 text-sky-600" />
            ) : (
              <PlusIcon className="h-5 w-5 text-sky-600" />
            )}
            <h2 id="trip-modal-title" className="text-base font-bold text-ink">
              {isRename ? 'Rename trip' : 'New trip'}
            </h2>
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

        <div className="px-5 py-4">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Trip name
          </label>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Portugal · Spring 2026"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            aria-label="Trip name"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isRename ? 'Save' : 'Create trip'}
          </button>
        </div>
      </form>
    </div>
  );
}
