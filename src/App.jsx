import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DropZone from './components/DropZone.jsx';
import EmptyState from './components/EmptyState.jsx';
import ProcessingQueue from './components/ProcessingQueue.jsx';
import Hero from './components/Hero.jsx';
import TripMap from './components/TripMap.jsx';
import Timeline from './components/Timeline.jsx';
import ManagePeople from './components/ManagePeople.jsx';
import SyncModal from './components/SyncModal.jsx';
import PlacesToCheck from './components/PlacesToCheck.jsx';
import AddPlaceModal from './components/AddPlaceModal.jsx';
import {
  PlusIcon,
  PinIcon,
  SheetIcon,
  DocIcon,
  CloudIcon,
  CloudCheckIcon,
  Spinner,
} from './components/icons.jsx';
import {
  loadBookings,
  saveBookings,
  loadPeople,
  savePeople,
  loadPeopleTs,
  savePeopleTs,
} from './lib/storage.js';
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
import { cryptoAvailable } from './lib/crypto.js';
import {
  getSyncCode,
  setSyncCode as persistSyncCode,
  clearSyncCode,
  mergeBookings,
  pickPeople,
  pullRemote,
  pushEnvelope,
  WRONG_CODE,
  PASSPHRASE_REQUIRED,
} from './lib/sync.js';

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `j_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const nowIso = () => new Date().toISOString();

export default function App() {
  const [bookings, setBookings] = useState(loadBookings); // includes delete tombstones
  const [people, setPeople] = useState(loadPeople); // name-alias registry
  const [peopleTs, setPeopleTs] = useState(loadPeopleTs); // registry change time
  const [jobs, setJobs] = useState([]);
  const [activePerson, setActivePerson] = useState(null);
  const [showManage, setShowManage] = useState(false);
  const [addPlace, setAddPlace] = useState(null); // null = closed; { city } = open

  // Sync
  const [syncCode, setSyncCodeState] = useState(getSyncCode);
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | synced | error
  const [syncError, setSyncError] = useState(null);
  const [showSync, setShowSync] = useState(false);

  // Persist.
  useEffect(() => saveBookings(bookings), [bookings]);
  useEffect(() => savePeople(people), [people]);
  useEffect(() => savePeopleTs(peopleTs), [peopleTs]);

  // The UI only ever sees non-deleted bookings; tombstones live in `bookings`
  // for persistence + sync.
  const liveBookings = useMemo(() => bookings.filter((b) => !b.deleted), [bookings]);

  const resolver = useMemo(() => buildResolver(people), [people]);
  const summary = useMemo(() => summarize(liveBookings, resolver), [liveBookings, resolver]);
  const cities = useMemo(() => routeCities(liveBookings), [liveBookings]);
  const destination = useMemo(() => primaryDestination(liveBookings), [liveBookings]);
  const stops = useMemo(() => tripStops(liveBookings), [liveBookings]);

  const visibleBookings = useMemo(() => {
    if (!activePerson) return liveBookings;
    return liveBookings.filter((b) => bookingHasPerson(b, activePerson, resolver));
  }, [liveBookings, activePerson, resolver]);

  // Timeline shows person-filtered real bookings + all SCHEDULED places. Places
  // are person-agnostic, so they bypass the traveler filter (otherwise a
  // scheduled place would silently vanish when you filter by a person).
  const timelineBookings = useMemo(
    () => [
      ...visibleBookings.filter((b) => b.type !== 'place'),
      ...liveBookings.filter((b) => b.type === 'place' && b.startDate),
    ],
    [visibleBookings, liveBookings]
  );
  // Undated places form the shortlist; all places (dated or not) get map pins.
  const shortlistPlaces = useMemo(
    () => liveBookings.filter((b) => b.type === 'place' && !b.startDate),
    [liveBookings]
  );
  const placePins = useMemo(
    () => liveBookings.filter((b) => b.type === 'place'),
    [liveBookings]
  );
  const cityNames = useMemo(() => {
    const set = new Set(cities.map((c) => c.name).filter(Boolean));
    for (const p of placePins) if (p.location) set.add(p.location);
    return [...set];
  }, [cities, placePins]);

  useEffect(() => {
    if (activePerson && !summary.people.some((p) => p.key === activePerson)) {
      setActivePerson(null);
    }
  }, [activePerson, summary.people]);

  // ---- Sync engine ----
  const stateRef = useRef({});
  stateRef.current = { bookings, people, peopleTs };
  const syncingRef = useRef(false);
  const rerunRef = useRef(false);
  const pushTimer = useRef(null);

  const doFullSync = useCallback(async (interactive = false) => {
    const code = getSyncCode();
    if (!code || !cryptoAvailable()) return;
    if (syncingRef.current) {
      rerunRef.current = true; // coalesce — run once more after the current pass
      return;
    }
    syncingRef.current = true;
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const remote = await pullRemote(code, interactive);
      const cur = stateRef.current;
      // Always run the merge (with [] when there's no remote) so tombstone GC
      // and de-duplication apply even on the first push. Re-normalize so a
      // synced record passes the same sanitizers (e.g. url http/https-only) as
      // every other ingress path.
      const mergedBookings = mergeBookings(cur.bookings, remote ? remote.bookings || [] : []).map(
        normalizeBooking
      );
      const picked = remote
        ? pickPeople({ people: cur.people, peopleUpdatedAt: cur.peopleTs }, remote)
        : { people: cur.people, peopleUpdatedAt: cur.peopleTs };

      if (JSON.stringify(mergedBookings) !== JSON.stringify(cur.bookings)) {
        setBookings(mergedBookings);
      }
      if (
        picked.peopleUpdatedAt !== cur.peopleTs ||
        JSON.stringify(picked.people) !== JSON.stringify(cur.people)
      ) {
        setPeople(picked.people);
        setPeopleTs(picked.peopleUpdatedAt);
      }

      await pushEnvelope(
        code,
        {
          v: 1,
          updatedAt: nowIso(),
          bookings: mergedBookings,
          people: picked.people,
          peopleUpdatedAt: picked.peopleUpdatedAt,
        },
        interactive
      );
      setSyncStatus('synced');
    } catch (e) {
      if (e.message === PASSPHRASE_REQUIRED) {
        setSyncError('Passphrase required — open Sync to enter it.');
      } else if (e.message === WRONG_CODE) {
        setSyncError('That sync code doesn’t match the data already in the cloud.');
      } else {
        setSyncError(e.message || 'Sync failed.');
      }
      setSyncStatus('error');
    } finally {
      syncingRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        setTimeout(() => doFullSync(false), 50);
      }
    }
  }, []);

  const schedulePush = useCallback(() => {
    if (!getSyncCode()) return;
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => doFullSync(false), 2500);
  }, [doFullSync]);

  // Pull on mount + when returning to the tab (background — never prompts).
  useEffect(() => {
    if (!syncCode) return;
    doFullSync(false);
    const onFocus = () => doFullSync(false);
    const onVis = () => !document.hidden && doFullSync(false);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [syncCode, doFullSync]);

  const useSyncCode = (code) => {
    persistSyncCode(code);
    setSyncCodeState(code);
    setSyncStatus('syncing');
    setSyncError(null);
    doFullSync(true); // user-initiated → may prompt for the passphrase if gated
  };
  const stopSync = () => {
    clearSyncCode();
    setSyncCodeState('');
    setSyncStatus('idle');
    setSyncError(null);
  };

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
      schedulePush();
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
  const addManual = () => {
    setBookings((prev) => [...prev, emptyBooking()]);
    schedulePush();
  };

  const updateBooking = (id, next) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? normalizeBooking({ ...next, id, updatedAt: nowIso() }) : b))
    );
    schedulePush();
  };

  // Soft delete (tombstone) so the deletion propagates across devices.
  const deleteBooking = (id) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, deleted: true, updatedAt: nowIso() } : b))
    );
    schedulePush();
  };

  const commitPlace = (raw) => {
    setBookings((prev) => [...prev, normalizeBooking(raw)]);
    schedulePush();
  };

  const applyPeople = (next) => {
    setPeople(next);
    setPeopleTs(nowIso());
    schedulePush();
  };

  // ---- Backup (JSON export / import) ----
  const importRef = useRef(null);

  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = await readBackup(file);
      setBookings((prev) => {
        const ids = new Set(prev.map((b) => b.id));
        return [...prev, ...data.bookings.filter((b) => !ids.has(b.id))];
      });
      setPeople((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        return [...prev, ...data.people.filter((p) => !ids.has(p.id))];
      });
      setPeopleTs(nowIso());
      schedulePush();
    } catch (err) {
      alert(err.message || 'Could not import that file.');
    }
  };

  const hasContent = liveBookings.length > 0 || jobs.length > 0;

  // Header sync indicator.
  const syncOn = !!syncCode;
  let SyncGlyph = CloudIcon;
  let syncColor = 'text-slate-400';
  if (syncOn && syncStatus === 'synced') {
    SyncGlyph = CloudCheckIcon;
    syncColor = 'text-emerald-600';
  } else if (syncOn && syncStatus === 'error') {
    syncColor = 'text-rose-500';
  } else if (syncOn) {
    syncColor = 'text-sky-600';
  }

  return (
    <div className="min-h-screen">
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
              onClick={() => setShowSync(true)}
              aria-label="Sync across devices"
              title={syncOn ? 'Cloud sync is on' : 'Sync across devices'}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              {syncOn && syncStatus === 'syncing' ? (
                <Spinner className={`h-4 w-4 ${syncColor}`} />
              ) : (
                <SyncGlyph className={`h-4 w-4 ${syncColor}`} />
              )}
              <span className="hidden sm:inline">Sync</span>
            </button>
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
              onClick={() => setAddPlace({ city: '' })}
              aria-label="Add a place to check"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <PinIcon className="h-4 w-4 text-emerald-600" />
              <span className="hidden sm:inline">Place</span>
            </button>
            <button
              type="button"
              onClick={() => exportToExcel(liveBookings, resolver)}
              disabled={liveBookings.length === 0}
              aria-label="Export to Excel"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              <SheetIcon className="h-4 w-4 text-emerald-600" />
              <span className="hidden sm:inline">Excel</span>
            </button>
            <button
              type="button"
              onClick={() => exportToPdf(liveBookings, resolver)}
              disabled={liveBookings.length === 0}
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
            {liveBookings.length > 0 && (
              <Hero
                summary={summary}
                cities={cities}
                destination={destination}
                activePerson={activePerson}
                onTogglePerson={setActivePerson}
                onManagePeople={() => setShowManage(true)}
              />
            )}

            {(stops.length > 0 || placePins.length > 0) && (
              <TripMap stops={stops} places={placePins} />
            )}

            <DropZone onFiles={handleFiles} compact />

            <ProcessingQueue jobs={jobs} onRetry={retryJob} onDismiss={dismissJob} />

            <PlacesToCheck
              places={shortlistPlaces}
              onChange={updateBooking}
              onDelete={deleteBooking}
              onAddPlace={(city) => setAddPlace({ city })}
            />

            {timelineBookings.length > 0 && (
              <Timeline
                bookings={timelineBookings}
                resolver={resolver}
                onChange={updateBooking}
                onDelete={deleteBooking}
              />
            )}
          </div>
        )}

        <footer className="mt-10 pb-8 text-center text-xs text-slate-400">
          <p>
            {syncOn ? 'Synced across your devices' : 'Saved on this device'} · {liveBookings.length}{' '}
            booking{liveBookings.length === 1 ? '' : 's'}
          </p>
          <div className="mt-2 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => exportBackup(liveBookings, people)}
              disabled={liveBookings.length === 0 && people.length === 0}
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
          onApply={applyPeople}
          onClose={() => setShowManage(false)}
        />
      )}

      {showSync && (
        <SyncModal
          code={syncCode}
          status={syncStatus}
          error={syncError}
          onUseCode={useSyncCode}
          onStop={stopSync}
          onSyncNow={() => doFullSync(true)}
          onClose={() => setShowSync(false)}
        />
      )}

      {addPlace && (
        <AddPlaceModal
          presetCity={addPlace.city}
          cities={cityNames}
          onAdd={commitPlace}
          onClose={() => setAddPlace(null)}
        />
      )}
    </div>
  );
}
