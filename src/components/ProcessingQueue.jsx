import { Spinner, AlertIcon, DocIcon, XIcon } from './icons.jsx';

/**
 * Shows each in-flight / failed PDF extraction job.
 * jobs: [{ id, fileName, status: 'loading' | 'error', error? }]
 */
export default function ProcessingQueue({ jobs, onRetry, onDismiss }) {
  if (!jobs.length) return null;

  return (
    <div className="space-y-2">
      {jobs.map((job) => (
        <div
          key={job.id}
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
            job.status === 'error'
              ? 'border-rose-200 bg-rose-50'
              : 'border-slate-200 bg-white'
          }`}
        >
          {job.status === 'loading' ? (
            <Spinner className="h-5 w-5 text-sky-500" />
          ) : (
            <AlertIcon className="h-5 w-5 shrink-0 text-rose-500" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 font-medium text-ink">
              <DocIcon className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="truncate">{job.fileName}</span>
            </div>
            {job.status === 'loading' && (
              <p className="text-slate-500">Reading and extracting bookings…</p>
            )}
            {job.status === 'error' && (
              <p className="text-rose-600">{job.error}</p>
            )}
          </div>

          {job.status === 'error' && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => onRetry(job.id)}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition-colors"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => onDismiss(job.id)}
                aria-label="Dismiss"
                className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-100 hover:text-rose-600 transition-colors"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
