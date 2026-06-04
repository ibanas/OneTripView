import { useEffect, useRef, useState } from 'react';
import { XIcon, CloudIcon, CheckIcon, CopyIcon, Spinner, AlertIcon } from './icons.jsx';
import { generateSyncCode } from '../lib/crypto.js';

/**
 * Cloud-sync setup.
 *  code: current sync code ('' = off)
 *  status: 'idle' | 'syncing' | 'synced' | 'error'
 *  error: string | null
 *  onUseCode(code): turn sync on with this code
 *  onStop(): turn sync off (keeps local data)
 *  onSyncNow(): force a sync
 */
export default function SyncModal({ code, status, error, onUseCode, onStop, onSyncNow, onClose }) {
  const [entry, setEntry] = useState('');
  const [copied, setCopied] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.activeElement;
    panelRef.current?.focus();
    return () => prev && prev.focus && prev.focus();
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  };

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
        aria-labelledby="sync-title"
        className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-lift outline-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <CloudIcon className="h-5 w-5 text-sky-600" />
            <h2 id="sync-title" className="text-base font-bold text-ink">
              Sync across devices
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

        <div className="space-y-4 px-5 py-4">
          {!code ? (
            <>
              <p className="text-sm text-slate-600">
                Create a private <strong>sync code</strong>, then enter the same code on your other
                devices. Your data is <strong>encrypted on your device</strong> with this code — the
                server only ever stores scrambled data it can&apos;t read. Keep the code safe: it
                can&apos;t be recovered, and anyone with it can read your trip.
              </p>
              <button
                type="button"
                onClick={() => onUseCode(generateSyncCode())}
                className="w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
              >
                Generate a sync code &amp; turn on sync
              </button>

              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200" /> or use an existing code{' '}
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = entry.trim().toUpperCase();
                  // Guard against weak, easily-guessed codes (the encryption key
                  // is only as strong as the code).
                  if (v.replace(/[^A-Z0-9]/g, '').length < 12) {
                    alert('That code looks too short. Use the full code from your other device.');
                    return;
                  }
                  onUseCode(v);
                }}
                className="flex gap-2"
              >
                <input
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                  placeholder="PASTE-YOUR-CODE"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase tracking-wide outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  aria-label="Existing sync code"
                />
                <button
                  type="submit"
                  disabled={!entry.trim()}
                  className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-40"
                >
                  Use
                </button>
              </form>
            </>
          ) : (
            <>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Your sync code
                </p>
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
                  <code className="flex-1 select-all px-1 font-mono text-sm font-semibold text-ink">
                    {code}
                  </code>
                  <button
                    type="button"
                    onClick={copy}
                    className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:text-sky-600"
                  >
                    {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Enter this same code on your other devices to see this trip there.
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                {status === 'syncing' && (
                  <>
                    <Spinner className="h-4 w-4 text-sky-500" />
                    <span className="text-slate-600">Syncing…</span>
                  </>
                )}
                {status === 'synced' && (
                  <>
                    <CheckIcon className="h-4 w-4 text-emerald-600" />
                    <span className="text-slate-600">Up to date</span>
                  </>
                )}
                {status === 'error' && (
                  <>
                    <AlertIcon className="h-4 w-4 text-rose-500" />
                    <span className="text-rose-600">{error || 'Sync error'}</span>
                  </>
                )}
                {status === 'idle' && <span className="text-slate-500">Ready to sync.</span>}
                <button
                  type="button"
                  onClick={onSyncNow}
                  className="ml-auto rounded-lg px-2.5 py-1 text-xs font-semibold text-sky-600 hover:bg-sky-50"
                >
                  Sync now
                </button>
              </div>

              <button
                type="button"
                onClick={onStop}
                className="w-full rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
              >
                Stop syncing on this device
              </button>
              <p className="text-center text-xs text-slate-400">
                Stopping keeps your trip on this device; it just won&apos;t send or receive updates.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
