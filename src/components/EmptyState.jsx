import DropZone from './DropZone.jsx';
import { PlusIcon } from './icons.jsx';

export default function EmptyState({ onFiles, onAddManual }) {
  return (
    <div className="mx-auto max-w-xl py-6 text-center">
      <h2 className="text-2xl font-bold text-ink">Plan your trip in one place</h2>
      <p className="mt-2 text-slate-500">
        Drop your flight, hotel, and Airbnb confirmation PDFs below. We&apos;ll read
        each one and lay your whole trip out on a timeline — every detail still yours
        to edit.
      </p>

      <div className="mt-6">
        <DropZone onFiles={onFiles} />
      </div>

      <div className="mt-4 flex items-center justify-center gap-3 text-sm text-slate-400">
        <span className="h-px w-10 bg-slate-200" />
        or
        <span className="h-px w-10 bg-slate-200" />
      </div>

      <button
        type="button"
        onClick={onAddManual}
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-card hover:border-sky-300 hover:text-sky-700 transition-colors"
      >
        <PlusIcon className="h-4 w-4" /> Add a booking manually
      </button>
    </div>
  );
}
