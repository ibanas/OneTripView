import { useEffect, useMemo, useRef, useState } from 'react';
import DropZone from './components/DropZone.jsx';
import EmptyState from './components/EmptyState.jsx';
import ProcessingQueue from './components/ProcessingQueue.jsx';
import Hero from './components/Hero.jsx';
import TripMap from './components/TripMap.jsx';
import Timeline from './components/Timeline.jsx';
import ManagePeople from './components/ManagePeople.jsx';
import { PlusIcon, SheetIcon, DocIcon } from './components/icons.jsx';
import { loadBookings, saveBookings, loadPeople, savePeople } from './lib/storage.js';
import {
  emptyBooking,
  normalizeBooking,
  summarize,
  routeCities,
  primaryDestination,
  tripStops,
} from './lib/bookings.js';
import { buildResolver, bookingHasPerson } from './lib/people.js';
import { extractBookingsFromPdf } from './lib/extract.js';
import { exportToExcel } from './lib/exportExcel.js';
import { exportToPdf } from './lib/exportPdf.js';
import { exportBackup, readBackup } from './lib/backup.js';

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `j_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export default function App() {
  const [bookings, setBookings] = useState(loadBookings);
  const [people, setPeople] = useState(loadPeople); // name-alias registry
  const [jobs, setJobs] = useState([]); // { id, fileName, status, error, file }
  const [activePerson, setActivePerson] = useState(null); // canonical person key
  const [showManage, setShowManage] = useState(false);

  // Persist.
  useEffect(() => saveBookings(bookings), [bookings]);
  useEffect(() => savePeople(people), [people]);

  const resolver = useMemo(() => buildResolver(people), [people]);
  const summary = useMemo(() => summarize(bookings, resolver), [bookings, resolver]);
  const cities = useMemo(() => routeCities(bookings), [bookings]);
  const destination = useMemo(() => primaryDestination(bookings), [bookings]);
  const stops = useMemo(() => tripStops(bookings), [bookings]);

  const visibleBookings = useMemo(() => {
    if (!activePerson) return bookings;
    return bookings.filter((b) => bookingHasPerson(b, activePerson, resolver));
  }, [bookings, activePerson, resolver]);

  // Clear the filter if that person is no longer present.
  useEffect(() => {
    if (activePerson && !summary.people.some((p) => p.key === activePerson)) {
      setActivePerson(null);
    }
  }, [activePerson, summary.people]);

  // ---- Extraction job lifecycle ----
  const runJob = async (jobId, file) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: 'loading', error: null } : j))
    );
    try {
      const extracted = await extractBookingsFromPdf(file);
      if (extracted.length === 0) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  status: 'error',
                  error: 'No bookings found in this PDF. Retry or add one manually.',
                }
              : j
          )
        );
        return;
      }
      setBookings((prev) => [...prev, ...extracted]);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch (err) {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, status: 'error', error: err.message || 'Extraction failed.' }
            : j
        )
      );
    }
  };

  const handleFiles = (files) => {
    const newJobs = files.map((file) => ({
      id: newId(),
      fileName: file.name,
      status: 'loading',
      error: null,
      file,
    }));
    setJobs((prev) => [...prev, ...newJobs]);
    newJobs.forEach((job) => runJob(job.id, job.file));
  };

  const retryJob = (jobId) => {
    const job = jobs.find((j) => j.id === jobId);
    if (job) runJob(jobId, job.file);
  };

  const dismissJob = (jobId) => setJobs((prev) => prev.filter((j) => j.id !== jobId));

  // ---- Booking CRUD ----
  const addManual = () => setBookings((prev) => [...prev, emptyBooking()]);

  const updateBooking = (id, next) =>
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? normalizeBooking({ ...next, id }) : b))
    );

  const deleteBooking = (id) => setBookings((prev) => prev.filter((b) => b.id !== id));

  // ---- Backup (JSON export / import) ----
  const importRef = useRef(null);

  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;
    try {
      const data = await readBackup(file);
      // Merge (additive, id-based) so importing restores on a new device and
      // never clobbers edits on an existing one.
      setBookings((prev) => {
        const ids = new Set(prev.map((b) => b.id));
        return [...prev, ...data.bookings.filter((b) => !ids.has(b.id))];
      });
      setPeople((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        return [...prev, ...data.people.filter((p) => !ids.has(p.id))];
      });
    } catch (err) {
      alert(err.message || 'Could not import that file.');
    }
  };

  const hasContent = bookings.length > 0 || jobs.length > 0;

  return (
    <div className="min-h-screen">
      {/* App bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm">
              ✈
            </span>
            <h1 className="text-lg font-bold tracking-tight text-ink">Itinerary</h1>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={addManual}
              aria-label="Add booking"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <PlusIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Add</span>
            </button>
            <button
              type="button"
              onClick={() => exportToExcel(bookings, resolver)}
              disabled={bookings.length === 0}
              aria-label="Export to Excel"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              <SheetIcon className="h-4 w-4 text-emerald-600" />
              <span className="hidden sm:inline">Excel</span>
            </button>
            <button
              type="button"
              onClick={() => exportToPdf(bookings, resolver)}
              disabled={bookings.length === 0}
              aria-label="Export to PDF"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              <DocIcon className="h-4 w-4 text-rose-600" />
              <span className="hidden sm:inline">PDF</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {!hasContent ? (
          <EmptyState onFiles={handleFiles} onAddManual={addManual} />
        ) : (
          <div className="space-y-5">
            {bookings.length > 0 && (
              <Hero
                summary={summary}
                cities={cities}
                destination={destination}
                activePerson={activePerson}
                onTogglePerson={setActivePerson}
                onManagePeople={() => setShowManage(true)}
              />
            )}

            {bookings.length > 0 && stops.length > 0 && <TripMap stops={stops} />}

            <DropZone onFiles={handleFiles} compact />

            <ProcessingQueue jobs={jobs} onRetry={retryJob} onDismiss={dismissJob} />

            {bookings.length > 0 && (
              <Timeline
                bookings={visibleBookings}
                resolver={resolver}
                onChange={updateBooking}
                onDelete={deleteBooking}
              />
            )}
          </div>
        )}

        <footer className="mt-10 pb-8 text-center text-xs text-slate-400">
          <p>
            Saved locally in your browser · {bookings.length} booking
            {bookings.length === 1 ? '' : 's'}
          </p>
          <div className="mt-2 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => exportBackup(bookings, people)}
              disabled={bookings.length === 0 && people.length === 0}
              className="font-medium text-slate-500 hover:text-sky-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            >
              Export backup
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              className="font-medium text-slate-500 hover:text-sky-600 hover:underline"
            >
              Import backup
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onImportFile}
            />
          </div>
        </footer>
      </main>

      {showManage && (
        <ManagePeople
          peopleInTrip={summary.people}
          registry={people}
          onApply={setPeople}
          onClose={() => setShowManage(false)}
        />
      )}
    </div>
  );
}
